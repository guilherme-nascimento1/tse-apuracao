import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  estadoDe, normalizaStatus, num, parseAcompanhamento, parseEleicoes, parseResultado, parseSecoes, resultadoVazio, somaUfs, tseDataHora,
} from '../src/tse/parse'
import { parsePath, paths } from '../src/tse/paths'

const fx = <T>(f: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', f), 'utf8')) as T
const base = { cd: '21272', ciclo: 'ele2026', turno: 1, coletadoEm: '2026-10-04T00:00:00.000Z' }

describe('helpers', () => {
  it('num entende vírgula decimal e vazios', () => {
    expect(num('7,527528669')).toBeCloseTo(7.5275, 3)
    expect(num('9075260')).toBe(9075260)
    expect(num('')).toBe(0)
    expect(num(undefined)).toBe(0)
    expect(num('abc')).toBe(0)
  })
  it('tseDataHora converte horário de Brasília para UTC', () => {
    expect(tseDataHora('29/09/2026', '16:28:52')).toBe('2026-09-29T19:28:52.000Z')
    expect(tseDataHora('lixo', '16:28:52')).toBeNull()
    expect(tseDataHora('29/09/2026', undefined)).toBe('2026-09-29T03:00:00.000Z')
  })
  it('status: só mostra eleito/2º turno quando o TSE diz; senão "em apuração"', () => {
    expect(normalizaStatus('Eleito', 'em-apuracao')).toBe('eleito')
    expect(normalizaStatus('Eleito por QP', 'encerrada')).toBe('eleito')
    expect(normalizaStatus('2º turno', 'em-apuracao')).toBe('segundo-turno')
    expect(normalizaStatus('Não eleito', 'em-apuracao')).toBe('em-apuracao')
    expect(normalizaStatus('Não eleito', 'encerrada')).toBe('nao-eleito')
    expect(normalizaStatus('Suplente', 'encerrada')).toBe('suplente')
  })
  it('estado da apuração', () => {
    expect(estadoDe(parseSecoes({ ts: '100', st: '0' }))).toBe('nao-iniciada')
    expect(estadoDe(parseSecoes({ ts: '100', st: '40' }))).toBe('em-apuracao')
    expect(estadoDe(parseSecoes({ ts: '100', st: '100' }))).toBe('encerrada')
    expect(estadoDe(parseSecoes({ ts: '100', st: '100' }), false)).toBe('em-apuracao')
  })
})

describe('paths', () => {
  it('monta e interpreta caminhos do TSE', () => {
    const p = paths.resultado('ele2026', '21272', 'governador', 'AC')
    expect(p).toBe('ele2026/21272/dados/ac/ac-c0003-e021272-u.json')
    expect(parsePath(p)).toEqual({ kind: 'u', cd: '21272', uf: 'ac', cargoCodigo: '3' })
    expect(paths.resultado('ele2026', '21270', 'presidente', 'br')).toBe('ele2026/21270/dados/br/br-c0001-e021270-u.json')
    expect(parsePath(paths.acompanhamento('ele2026', '21270', 'br'))).toEqual({ kind: 'ab', cd: '21270', uf: 'br' })
    expect(parsePath(paths.config())).toEqual({ kind: 'config' })
  })
})

describe('parseResultado (presidente BR, JSON real do simulado)', () => {
  const r = parseResultado(fx('presidente-br-u.json'), { ...base, cargo: 'presidente', uf: 'br', cd: '21270' })
  it('metadados e totais', () => {
    expect(r.abrangencia).toEqual({ tipo: 'br', codigo: 'BR' })
    expect(r.estado).toBe('encerrada')
    expect(r.secoes).toMatchObject({ total: 528951, totalizadas: 528951 })
    expect(r.secoes.pct).toBe(100)
    expect(r.votos.total).toBe(138863131)
    expect(r.votos.brancos).toBe(9118018)
    expect(r.votos.nulos).toBe(9040537)
    expect(r.comparecimento.compareceram).toBe(138863131)
    expect(r.comparecimento.pctAbstencao).toBeCloseTo(14.849, 2)
    expect(r.atualizadoTse).toBe('2026-09-29T19:28:52.000Z')
  })
  it('candidatos ordenados por votos, com vice, % e status', () => {
    expect(r.candidatos).toHaveLength(13)
    const votos = r.candidatos.map((c) => c.votos)
    expect(votos).toEqual([...votos].sort((a, b) => b - a))
    const c = r.candidatos[0]!
    expect(c.pct).toBeGreaterThan(7)
    expect(c.vice).toMatch(/CANDIDATO/)
    expect(c.foto).toMatch(/^\/api\/foto\/21270\/br\/\d+$/)
    expect(new Set(r.candidatos.map((x) => x.status))).toEqual(new Set(['segundo-turno', 'nao-eleito']))
  })
  it('candidatos anulados ficam sinalizados', () => {
    expect(r.candidatos.some((c) => c.situacao !== 'Válido')).toBe(true)
  })
})

describe('parseResultado (senador SP)', () => {
  const r = parseResultado(fx('senador-sp-u.json'), { ...base, cargo: 'senador', uf: 'SP' })
  it('2 vagas, eleitos e suplentes', () => {
    expect(r.vagas).toBe(2)
    expect(r.candidatos.filter((c) => c.status === 'eleito').length).toBeGreaterThanOrEqual(1)
    expect(r.candidatos[0]!.suplentes).toHaveLength(2)
    expect(r.abrangencia.codigo).toBe('SP')
  })
})

describe('estado vazio e dados parciais', () => {
  it('404 vira resultado vazio amigável', () => {
    const v = resultadoVazio({ ...base, cargo: 'governador', uf: 'AC' })
    expect(v.estado).toBe('nao-iniciada')
    expect(v.candidatos).toEqual([])
  })
  it('parcial: "Não eleito" do TSE vira "em apuração"', () => {
    const raw = fx<{ s: { ts: string; st: string } }>('senador-sp-u.json')
    raw.s.st = String(Math.floor(Number(raw.s.ts) / 2))
    ;(raw as { tf?: string }).tf = 'n'
    const r = parseResultado(raw as never, { ...base, cargo: 'senador', uf: 'SP' })
    expect(r.estado).toBe('em-apuracao')
    expect(r.candidatos.every((c) => c.status === 'em-apuracao' || c.status === 'eleito')).toBe(true)
  })
  it('tolera JSON sem carg', () => {
    const r = parseResultado({ s: { ts: '10', st: '0' } }, { ...base, cargo: 'governador', uf: 'AC' })
    expect(r.candidatos).toEqual([])
    expect(r.estado).toBe('nao-iniciada')
  })
})

describe('acompanhamento (ab)', () => {
  it('Brasil: linha br + UFs', () => {
    const ab = parseAcompanhamento(fx('br-ab.json'))
    expect(ab.br?.secoes.totalizadas).toBe(528951)
    expect(ab.ufs.size).toBe(28) // 27 UFs + ZZ (exterior)
    expect(ab.ufs.get('PI')?.secoes.pct).toBe(100)
  })
  it('UF: municípios', () => {
    const ab = parseAcompanhamento(fx('ac-ab.json'))
    expect(ab.muns.size).toBe(22)
    expect(ab.muns.get('01007')?.comparecimento.compareceram).toBe(21887)
  })
  it('soma das UFs', () => {
    const ab = parseAcompanhamento(fx('br-ab.json'))
    const s = somaUfs(ab.ufs.values())
    expect(s.secoes.total).toBe(ab.br?.secoes.total)
  })
})

describe('config das eleições (ele-c.json)', () => {
  it('descobre o código de cada cargo sem fixar nada', () => {
    const e = parseEleicoes(fx('ele-c.json'), 'ele2026', 1)
    expect(e.disponivel).toBe(true)
    expect(e.porCargo.presidente).toBe('21270')
    expect(e.porCargo.governador).toBe('21272')
    expect(e.porCargo['deputado-distrital']).toBe('21272')
  })
  it('2º turno usa cdt2', () => {
    const e = parseEleicoes(fx('ele-c.json'), 'ele2026', 2)
    expect(e.porCargo.presidente).toBe('21271')
    expect(e.porCargo.senador).toBe('21273')
  })
  it('ciclo ainda não publicado vira estado explicativo, não erro', () => {
    const e = parseEleicoes(fx('ele-c.json'), 'ele2030', 1)
    expect(e.disponivel).toBe(false)
    expect(e.mensagem).toMatch(/ele2030/)
  })
})
