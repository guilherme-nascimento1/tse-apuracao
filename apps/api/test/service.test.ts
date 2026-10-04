import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { MockEngine } from '../src/mock/engine'
import { MockSource } from '../src/mock/source'
import { Service } from '../src/service'
import { TseClient } from '../src/tse/client'
import { SourceError, type FetchResult, type TseSource } from '../src/tse/source'

const quiet = { info() {}, warn() {}, error() {} }

function setup() {
  let t = 0
  const engine = new MockEngine({ durationS: 100, holdS: 20, tickS: 5, now: () => t })
  const source = new MockSource(engine)
  const client = new TseClient(source, quiet, { pollIntervalMs: 1000, activeWindowMs: 60_000, retries: 0 })
  const service = new Service(client, source, true)
  return { service, client, source, at: (s: number) => (t = s * 1000) }
}

describe('modo mock ponta a ponta', () => {
  it('apuração evolui de 0% a 100% e fica coerente', async () => {
    const { service, client, at } = setup()
    at(0)
    const r0 = await service.getResultado('governador', 'SP')
    expect(r0.estado).toBe('nao-iniciada')
    at(50)
    await client.poll()
    const r50 = await service.getResultado('governador', 'SP')
    expect(r50.estado).toBe('em-apuracao')
    expect(r50.secoes.pct).toBeGreaterThan(5)
    expect(r50.secoes.pct).toBeLessThan(100)
    expect(r50.candidatos.every((c) => c.status === 'em-apuracao')).toBe(true)
    at(100)
    await client.poll()
    const r100 = await service.getResultado('governador', 'SP')
    expect(r100.estado).toBe('encerrada')
    expect(r100.votos.validos).toBeGreaterThan(r50.votos.validos)
    const soma = r100.candidatos.reduce((a, c) => a + c.votos, 0)
    expect(soma).toBeLessThanOrEqual(r100.votos.validos)
    expect(r100.candidatos.filter((c) => c.status === 'eleito' || c.status === 'segundo-turno').length).toBeGreaterThan(0)
    expect(r100.votos.total).toBe(r100.comparecimento.compareceram)
  })

  it('calcula variação desde a última atualização e guarda histórico', async () => {
    const { service, client, at } = setup()
    at(40); await service.getResultado('senador', 'MG')
    at(60); await client.poll()
    const r = await service.getResultado('senador', 'MG')
    expect(r.candidatos.some((c) => (c.deltaVotos ?? 0) > 0)).toBe(true)
    const h = await service.getHistorico('senador', 'MG')
    expect(h.pontos.length).toBeGreaterThanOrEqual(2)
    expect(h.candidatos.length).toBeLessThanOrEqual(8)
  })

  it('presidente BR = soma das UFs; ranking por UF; detalhe por UF', async () => {
    const { service, at } = setup()
    at(100)
    const br = await service.getResultado('presidente')
    const rj = await service.getResultado('presidente', 'RJ')
    expect(br.abrangencia.tipo).toBe('br')
    expect(br.votos.validos).toBeGreaterThan(rj.votos.validos)
    const rank = await service.getRanking('presidente', 'brasil')
    expect(rank.ufs).toHaveLength(27)
    expect(rank.ufs.every((u) => u.lider)).toBe(true)
    const det = await service.getDetalhe('presidente', br.candidatos[0]!.sq)
    expect(det.porUf).toHaveLength(27)
    expect(det.porUf.reduce((a, u) => a + u.votos, 0)).toBe(br.candidatos[0]!.votos)
  })

  it('regras de cargo x UF', async () => {
    const { service } = setup()
    await expect(service.getResultado('governador')).rejects.toThrow(/exige/)
    await expect(service.getResultado('deputado-estadual', 'DF')).rejects.toThrow(/não existe/)
    await expect(service.getResultado('deputado-distrital', 'DF')).resolves.toBeTruthy()
    await expect(service.getResultado('senador', 'XX')).rejects.toThrow(/inválida/)
  })

  it('HTTP: /api/resultado e 400 em cargo inválido', async () => {
    const { service, at } = setup()
    at(100)
    const app = await buildApp(service, { logger: false })
    const ok = await app.inject('/api/resultado?cargo=senador&uf=SP')
    expect(ok.statusCode).toBe(200)
    expect(ok.json().candidatos.length).toBeGreaterThan(0)
    expect((await app.inject('/api/resultado?cargo=xyz')).statusCode).toBe(400)
    expect((await app.inject('/api/resultado?cargo=governador')).statusCode).toBe(400)
    const cfg = (await app.inject('/api/config')).json()
    expect(cfg.modo).toBe('mock')
    expect(cfg.cargos.find((c: { id: string }) => c.id === 'presidente').disponivel).toBe(true)
    await app.close()
  })
})

describe('TseClient: condicional, 404, retry e serve-stale', () => {
  function fake(script: (n: number, c: { etag?: string }) => FetchResult | Error) {
    let n = 0
    const calls: { etag?: string }[] = []
    const source: TseSource = {
      nome: 'fake',
      async fetchJson(_p, cond) {
        calls.push(cond)
        const r = script(n++, cond)
        if (r instanceof Error) throw r
        return r
      },
      async fetchBinary() { return { status: 404 } },
    }
    return { source, calls }
  }
  const mk = (source: TseSource) => new TseClient(source, quiet, { pollIntervalMs: 50, activeWindowMs: 60_000, retries: 2, baseBackoffMs: 1 })

  it('envia If-None-Match e não reprocessa em 304', async () => {
    const { source, calls } = fake((n) => (n === 0 ? { status: 200, json: { a: 1 }, etag: '"x"' } : { status: 304 }))
    const c = mk(source)
    let changes = 0
    c.on('change', () => changes++)
    const a = await c.get('p')
    await new Promise((r) => setTimeout(r, 90))
    await c.get('p') // dispara refresh em background
    await new Promise((r) => setTimeout(r, 20))
    expect(calls[1]?.etag).toBe('"x"')
    expect(changes).toBe(1)
    expect(a.version).toBe(1)
  })

  it('404 é "ainda não existe", não erro', async () => {
    const { source } = fake(() => ({ status: 404 }))
    const s = await mk(source).get('p')
    expect(s.missing).toBe(true)
    expect(s.json).toBeNull()
  })

  it('retry com backoff em 5xx e sucesso depois', async () => {
    const { source, calls } = fake((n) => (n < 2 ? new SourceError('boom', 503) : { status: 200, json: { ok: 1 } }))
    const s = await mk(source).get('p')
    expect(calls).toHaveLength(3)
    expect(s.json).toEqual({ ok: 1 })
  })

  it('serve último dado válido quando a fonte cai (com defasagem)', async () => {
    const { source } = fake((n) => (n === 0 ? { status: 200, json: { v: 1 } } : new SourceError('fora', 503)))
    const c = mk(source)
    await c.get('p')
    await new Promise((r) => setTimeout(r, 160))
    await c.get('p') // refresh falha em background
    await new Promise((r) => setTimeout(r, 40))
    const s = await c.get('p')
    expect(s.json).toEqual({ v: 1 })
    expect(s.defasagemSeg).toBeGreaterThanOrEqual(0)
  })

  it('primeira leitura sem dado e com falha propaga erro', async () => {
    const { source } = fake(() => new SourceError('fora', 503))
    await expect(mk(source).get('p')).rejects.toThrow()
  })
})

describe('mock: todos os cargos x UFs geram sem travar', () => {
  it('universos terminam e têm números únicos', () => {
    const engine = new MockEngine({ durationS: 100, holdS: 0, now: () => 100_000 })
    for (const cargo of ['presidente', 'governador', 'senador', 'deputado-federal', 'deputado-estadual', 'deputado-distrital'] as const) {
      for (const uf of ['AC', 'SP', 'DF', 'RR']) {
        const c = engine.calcUf(cargo, uf)
        expect(new Set(c.cands.map((x) => x.numero)).size).toBe(c.cands.length)
      }
    }
  })
})

describe('agregação por região', () => {
  it('presidente: soma dos votos das UFs da região', async () => {
    const { service, at } = setup()
    at(100)
    const ne = await service.getRecorte('presidente', undefined, 'nordeste')
    const ufs = ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE']
    const partes = await Promise.all(ufs.map((u) => service.getResultado('presidente', u)))
    const c0 = ne.candidatos[0]!
    expect(ne.abrangencia).toEqual({ tipo: 'regiao', codigo: 'nordeste' })
    expect(c0.votos).toBe(partes.reduce((a, p) => a + (p.candidatos.find((c) => c.sq === c0.sq)?.votos ?? 0), 0))
    expect(ne.secoes.total).toBe(partes.reduce((a, p) => a + p.secoes.total, 0))
    expect(ne.votos.validos).toBe(partes.reduce((a, p) => a + p.votos.validos, 0))
    expect(ne.candidatos.reduce((a, c) => a + c.pct, 0)).toBeLessThanOrEqual(100.001)
    expect(ne.estado).toBe('encerrada')
  })

  it('governador: junta candidatos de todos os estados, com a UF de cada um', async () => {
    const { service, at } = setup()
    at(100)
    const ne = await service.getRecorte('governador', undefined, 'nordeste')
    expect(new Set(ne.candidatos.map((c) => c.uf))).toEqual(new Set(['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE']))
    const votos = ne.candidatos.map((c) => c.votos)
    expect(votos).toEqual([...votos].sort((a, b) => b - a))
    expect(ne.candidatos.filter((c) => c.status === 'eleito' || c.status === 'segundo-turno').length).toBeGreaterThan(0)
  })

  it('região inválida e UF explícita têm prioridade', async () => {
    const { service } = setup()
    await expect(service.getRecorte('presidente', undefined, 'marte')).rejects.toThrow(/inválida/)
    const r = await service.getRecorte('governador', 'SP', 'nordeste')
    expect(r.abrangencia).toEqual({ tipo: 'uf', codigo: 'SP' })
  })
})
