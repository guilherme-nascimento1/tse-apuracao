import { EventEmitter } from 'node:events'
import type {
  CargoId, Candidato, ConfigApi, Regiao, DetalheCandidato, Historico, LiderUf, MunicipioInfo, MunicipioPanorama, Ranking, Resultado, Resumo,
  ResumoUf, VotosPorUf, PontoHistorico,
} from '@tse/shared'
import { CARGOS, REGIOES, UFS, cargoById, cargoValidoParaUf, ufBySigla, ufsDaRegiao } from '@tse/shared'
import { config } from './config'
import type { TseClient } from './tse/client'
import {
  estadoDe, parseAcompanhamento, parseEleicoes, parseMunicipios, parseResultado, resultadoVazio, somaUfs,
  type AbParsed, type EleicoesParsed, type ParseCtx,
} from './tse/parse'
import { paths } from './tse/paths'
import type { RawAb, RawEleConfig, RawMunCfg, RawU } from './tse/raw'
import type { TseSource } from './tse/source'

export class AppError extends Error {
  constructor(readonly status: number, message: string, readonly detalhe?: string) {
    super(message)
  }
}

interface Cached { version: number; resultado: Resultado }
const MAX_PONTOS = 720

export class Service {
  readonly events = new EventEmitter()
  private resultados = new Map<string, Cached>()
  private regionais = new Map<string, Cached>()
  private tracked = new Map<string, { cargo: CargoId; uf: string }>()
  private historicos = new Map<string, PontoHistorico[]>()
  private memo = new Map<string, { version: number; value: unknown }>()
  private fotos = new Map<string, { body: Buffer; contentType: string } | null>()

  constructor(private client: TseClient, private source: TseSource, private mock = config.modo === 'mock') {
    client.on('change', (path: string) => void this.onChange(path))
  }

  // ---------- configuração ----------

  private async memoGet<T>(path: string, fn: (json: unknown) => T): Promise<{ value: T | null; missing: boolean; snap: Awaited<ReturnType<TseClient['get']>> }> {
    const snap = await this.client.get(path)
    if (snap.json == null) return { value: null, missing: snap.missing, snap }
    const hit = this.memo.get(path)
    if (hit && hit.version === snap.version) return { value: hit.value as T, missing: false, snap }
    const value = fn(snap.json)
    this.memo.set(path, { version: snap.version, value })
    return { value, missing: false, snap }
  }

  async eleicoes(): Promise<EleicoesParsed> {
    try {
      const { value, missing } = await this.memoGet(paths.config(), (j) => parseEleicoes(j as RawEleConfig, config.ciclo, config.turno))
      if (value) return value
      return { disponivel: false, porCargo: {}, atualizadoTse: null, mensagem: missing ? 'O TSE ainda não publicou o arquivo de configuração das eleições.' : 'Configuração indisponível.' }
    } catch (e) {
      return { disponivel: false, porCargo: {}, atualizadoTse: null, mensagem: `Não foi possível ler a configuração do TSE (${(e as Error).message}).` }
    }
  }

  async getConfig(): Promise<ConfigApi> {
    const el = await this.eleicoes()
    return {
      modo: config.modo,
      eleicao: { ciclo: config.ciclo, turno: config.turno, disponivel: el.disponivel, mensagem: el.mensagem, porCargo: el.porCargo },
      cargos: CARGOS.map((c) => ({ id: c.id, nome: c.nome, escopo: c.escopo, proporcional: c.proporcional, disponivel: !!el.porCargo[c.id] })),
      regioes: REGIOES,
      ufs: UFS,
      pollIntervalSeg: config.pollIntervalSeg,
      sse: !config.serverless,
      geradoEm: new Date().toISOString(),
    }
  }

  private async cdDe(cargo: CargoId): Promise<string> {
    const el = await this.eleicoes()
    if (!el.disponivel) throw new AppError(503, 'Eleição indisponível', el.mensagem)
    const cd = el.porCargo[cargo]
    if (!cd) throw new AppError(404, `Cargo "${cargo}" não está configurado no ${config.turno}º turno`)
    return cd
  }

  // ---------- resultados ----------

  private normalizaUf(cargo: CargoId, uf?: string): string {
    const c = cargoById(cargo)
    if (!c) throw new AppError(400, `Cargo inválido: ${cargo}`)
    if (c.escopo === 'br' && !uf) return 'br'
    if (!uf) throw new AppError(400, `O cargo ${c.nome} exige o parâmetro uf`)
    const u = ufBySigla(uf)
    if (!u) throw new AppError(400, `UF inválida: ${uf}`)
    if (!cargoValidoParaUf(cargo, u.sigla)) throw new AppError(404, `${c.nome} não existe em ${u.sigla}`)
    return u.sigla
  }

  async getResultado(cargo: CargoId, ufIn?: string): Promise<Resultado> {
    const uf = this.normalizaUf(cargo, ufIn)
    const cd = await this.cdDe(cargo)
    const path = paths.resultado(config.ciclo, cd, cargo, uf)
    this.tracked.set(path, { cargo, uf })
    const snap = await this.client.get(path)
    const ctx = this.ctx(cargo, uf, cd)
    const key = `${cargo}:${uf}`
    let cached = this.resultados.get(key)
    if (!cached || cached.version !== snap.version) cached = this.atualiza(key, snap.version, snap.json as RawU | null, ctx)
    return snap.defasagemSeg ? { ...cached.resultado, defasagemSeg: snap.defasagemSeg } : cached.resultado
  }

  private ctx(cargo: CargoId, uf: string, cd: string): ParseCtx {
    return { cargo, uf, cd, ciclo: config.ciclo, turno: config.turno, coletadoEm: new Date().toISOString(), semFotos: this.mock }
  }

  private atualiza(key: string, version: number, raw: RawU | null, ctx: ParseCtx): Cached {
    const prev = this.resultados.get(key)?.resultado
    const novo = raw ? parseResultado(raw, ctx) : resultadoVazio(ctx)
    if (prev) aplicaDeltas(novo, prev)
    const cached = { version, resultado: novo }
    this.resultados.set(key, cached)
    if (novo.estado !== 'nao-iniciada') this.registraHistorico(key, novo, prev)
    if (!prev || prev.versao !== novo.versao) this.events.emit('update', { cargo: ctx.cargo, uf: ctx.uf.toUpperCase(), versao: novo.versao })
    return cached
  }

  private async onChange(path: string) {
    const t = this.tracked.get(path)
    if (!t) return
    try {
      await this.getResultado(t.cargo, t.uf === 'br' ? undefined : t.uf)
    } catch {
      /* erro já logado pelo client */
    }
  }

  // ---------- região (agregação de UFs) ----------

  /**
   * Presidente: soma os votos de cada candidato nas UFs da região.
   * Demais cargos: os candidatos são por UF, então junta todos (com a UF de cada um) ordenados por votos;
   * o % de cada candidato continua sendo o % dos válidos no próprio estado.
   */
  async getResultadoRegiao(cargo: CargoId, regiaoId: string): Promise<Resultado> {
    const reg = REGIOES.find((r) => r.id === regiaoId)
    if (!reg) throw new AppError(400, `Região inválida: ${regiaoId}`)
    const c = cargoById(cargo)
    if (!c) throw new AppError(400, `Cargo inválido: ${cargo}`)
    const ufs = ufsDaRegiao(reg.id).map((u) => u.sigla).filter((uf) => cargoValidoParaUf(cargo, uf))
    if (!ufs.length) throw new AppError(404, `${c.nome} não existe na região ${reg.nome}`)
    const partes = await mapLimit(ufs, 6, (uf) => this.getResultado(cargo, uf))

    const versao = partes.map((p) => p.versao).join('.')
    const key = `${cargo}:regiao:${reg.id}`
    const defasagemSeg = Math.max(0, ...partes.map((p) => p.defasagemSeg ?? 0)) || undefined
    const antigo = this.regionais.get(key)
    if (antigo && antigo.resultado.versao === versao) return defasagemSeg ? { ...antigo.resultado, defasagemSeg } : antigo.resultado

    const soma = (f: (r: Resultado) => number) => partes.reduce((a, r) => a + f(r), 0)
    const secoes = { total: soma((r) => r.secoes.total), totalizadas: soma((r) => r.secoes.totalizadas), pct: 0 }
    secoes.pct = secoes.total ? (secoes.totalizadas / secoes.total) * 100 : 0
    const comp = {
      eleitores: soma((r) => r.comparecimento.eleitores), compareceram: soma((r) => r.comparecimento.compareceram),
      abstencoes: soma((r) => r.comparecimento.abstencoes), pctComparecimento: 0, pctAbstencao: 0,
    }
    const baseComp = comp.compareceram + comp.abstencoes
    comp.pctComparecimento = baseComp ? (comp.compareceram / baseComp) * 100 : 0
    comp.pctAbstencao = baseComp ? (comp.abstencoes / baseComp) * 100 : 0
    const v = {
      total: soma((r) => r.votos.total), validos: soma((r) => r.votos.validos), nominais: soma((r) => r.votos.nominais),
      legenda: soma((r) => r.votos.legenda), brancos: soma((r) => r.votos.brancos), nulos: soma((r) => r.votos.nulos),
      pctValidos: 0, pctBrancos: 0, pctNulos: 0,
    }
    v.pctValidos = v.total ? (v.validos / v.total) * 100 : 0
    v.pctBrancos = v.total ? (v.brancos / v.total) * 100 : 0
    v.pctNulos = v.total ? (v.nulos / v.total) * 100 : 0

    let candidatos: Candidato[]
    if (cargo === 'presidente') {
      const m = new Map<string, Candidato>()
      for (const p of partes) {
        for (const x of p.candidatos) {
          const e = m.get(x.sq)
          if (e) e.votos += x.votos
          else {
            // as fotos de presidente ficam na pasta nacional (br), não na de cada UF
            const foto = x.foto?.replace(/\/[a-z]{2}\/(\d+)$/, '/br/$1')
            m.set(x.sq, { ...x, foto, uf: undefined, deltaPct: undefined, deltaVotos: undefined, deltaPos: undefined })
          }
        }
      }
      candidatos = [...m.values()]
      for (const x of candidatos) {
        x.pct = v.validos ? (x.votos / v.validos) * 100 : 0
        x.status = 'em-apuracao' // não existe "eleito" por região
      }
      candidatos.sort((a, b) => b.votos - a.votos || a.nome.localeCompare(b.nome, 'pt-BR'))
    } else {
      candidatos = partes.flatMap((p) => p.candidatos.map((x) => ({ ...x, deltaPct: undefined, deltaVotos: undefined, deltaPos: undefined })))
      candidatos.sort((a, b) => b.votos - a.votos || a.nome.localeCompare(b.nome, 'pt-BR'))
      if (c.proporcional) candidatos = candidatos.slice(0, 300)
    }

    const todas = (e: Resultado['estado']) => partes.every((p) => p.estado === e)
    const datas = partes.map((p) => p.atualizadoTse).filter((d): d is string => !!d).sort()
    const resultado: Resultado = {
      cargo, abrangencia: { tipo: 'regiao', codigo: reg.id }, eleicao: partes[0]!.eleicao, turno: config.turno,
      estado: todas('nao-iniciada') ? 'nao-iniciada' : todas('encerrada') ? 'encerrada' : 'em-apuracao',
      vagas: cargo === 'presidente' ? 1 : soma((r) => r.vagas),
      secoes, comparecimento: comp, votos: v, candidatos,
      atualizadoTse: datas[datas.length - 1] ?? null, coletadoEm: new Date().toISOString(), versao,
    }
    if (antigo) aplicaDeltas(resultado, antigo.resultado)
    this.regionais.set(key, { version: 0, resultado })
    if (resultado.estado !== 'nao-iniciada') this.registraHistorico(`${cargo}:${reg.id}`, resultado, antigo?.resultado)
    return defasagemSeg ? { ...resultado, defasagemSeg } : resultado
  }

  /** Resultado do recorte pedido: UF, região (somando as UFs) ou nacional. */
  async getRecorte(cargo: CargoId, uf?: string, regiao?: string): Promise<Resultado> {
    if (!uf && regiao) return this.getResultadoRegiao(cargo, regiao)
    return this.getResultado(cargo, uf)
  }

  // ---------- histórico ----------

  private registraHistorico(key: string, r: Resultado, prev?: Resultado) {
    const lista = this.historicos.get(key) ?? []
    const total = r.candidatos.reduce((a, c) => a + c.votos, 0)
    const ultimo = lista[lista.length - 1]
    const prevTotal = prev ? prev.candidatos.reduce((a, c) => a + c.votos, 0) : -1
    if (ultimo && prevTotal === total && ultimo.pctSecoes === r.secoes.pct) return
    lista.push({
      t: r.atualizadoTse ?? r.coletadoEm,
      pctSecoes: r.secoes.pct,
      c: r.candidatos.slice(0, 12).map((c) => ({ sq: c.sq, pct: c.pct, votos: c.votos })),
    })
    if (lista.length > MAX_PONTOS) lista.splice(0, lista.length - MAX_PONTOS)
    this.historicos.set(key, lista)
  }

  async getHistorico(cargo: CargoId, ufIn?: string, regiao?: string): Promise<Historico> {
    const r = await this.getRecorte(cargo, ufIn, regiao)
    const key = `${cargo}:${r.abrangencia.codigo.toLowerCase() === 'br' ? 'br' : r.abrangencia.codigo}`
    const top = r.candidatos.slice(0, 8)
    const sqs = new Set(top.map((c) => c.sq))
    const pontos = (this.historicos.get(key) ?? []).map((p) => ({ ...p, c: p.c.filter((x) => sqs.has(x.sq)) }))
    return {
      cargo, abrangencia: r.abrangencia.codigo,
      candidatos: top.map((c) => ({ sq: c.sq, nome: c.nome, partido: c.partido, cor: c.cor })),
      pontos,
    }
  }

  // ---------- resumo (acompanhamento) ----------

  private async ab(cargo: CargoId, uf: string): Promise<{ parsed: AbParsed | null; cd: string; defasagemSeg?: number }> {
    const cd = await this.cdDe(cargo)
    const { value, snap } = await this.memoGet(paths.acompanhamento(config.ciclo, cd, uf), (j) => parseAcompanhamento(j as RawAb))
    return { parsed: value, cd, defasagemSeg: snap.defasagemSeg }
  }

  async getResumo(cargo: CargoId): Promise<Resumo> {
    const { parsed, cd, defasagemSeg } = await this.ab(cargo, 'br')
    const coletadoEm = new Date().toISOString()
    const vazio = { secoes: { total: 0, totalizadas: 0, pct: 0 }, comparecimento: { eleitores: 0, compareceram: 0, abstencoes: 0, pctComparecimento: 0, pctAbstencao: 0 } }
    if (!parsed) return { cargo, eleicao: cd, turno: config.turno, estado: 'nao-iniciada', ...vazio, ufs: [], atualizadoTse: null, coletadoEm }
    const ufs: ResumoUf[] = [...parsed.ufs.entries()]
      .filter(([sigla]) => ufBySigla(sigla) && cargoValidoParaUf(cargo, sigla))
      .map(([uf, i]) => ({ uf, estado: i.estado, secoes: i.secoes, comparecimento: i.comparecimento }))
    const total = parsed.br ?? somaUfs(parsed.ufs.values())
    return { cargo, eleicao: cd, turno: config.turno, estado: total.estado, secoes: total.secoes, comparecimento: total.comparecimento, ufs, atualizadoTse: total.atualizadoTse ?? parsed.atualizadoTse, coletadoEm, defasagemSeg }
  }

  // ---------- ranking / mapa ----------

  async getRanking(cargo: CargoId, escopo: 'brasil' | 'regiao' | 'uf', filtro?: string): Promise<Ranking> {
    let lista = UFS.map((u) => u.sigla)
    if (escopo === 'regiao') {
      const reg = REGIOES.find((r) => r.id === filtro)
      if (!reg) throw new AppError(400, `Região inválida: ${filtro}`)
      lista = ufsDaRegiao(reg.id).map((u) => u.sigla)
    } else if (escopo === 'uf') {
      lista = [this.normalizaUf(cargo, filtro)]
    }
    lista = lista.filter((uf) => cargoValidoParaUf(cargo, uf))
    const ufs = await mapLimit(lista, 6, async (uf): Promise<LiderUf> => {
      try {
        const r = await this.getResultado(cargo, uf)
        const [a, b] = r.candidatos
        return {
          uf, estado: r.estado, pctSecoes: r.secoes.pct,
          lider: a && r.estado !== 'nao-iniciada' ? { sq: a.sq, nome: a.nome, partido: a.partido, cor: a.cor, pct: a.pct, votos: a.votos, status: a.status } : undefined,
          segundo: b && r.estado !== 'nao-iniciada' ? { nome: b.nome, pct: b.pct } : undefined,
        }
      } catch {
        return { uf, estado: 'nao-iniciada', pctSecoes: 0 }
      }
    })
    return { cargo, escopo, ufs, coletadoEm: new Date().toISOString() }
  }

  // ---------- candidato ----------

  async getDetalhe(cargo: CargoId, sq: string, ufIn?: string, regiao?: string): Promise<DetalheCandidato> {
    const base = await this.getRecorte(cargo, ufIn, regiao)
    const idx = base.candidatos.findIndex((c) => c.sq === sq)
    if (idx < 0) throw new AppError(404, 'Candidato não encontrado nessa abrangência')
    const candidato = base.candidatos[idx]!
    const posicao = idx + 1
    const regional = base.abrangencia.tipo === 'regiao'
    if (cargo !== 'presidente') {
      const uf = candidato.uf ?? base.abrangencia.codigo
      const own = regional ? await this.getResultado(cargo, uf) : base
      const i = own.candidatos.findIndex((c) => c.sq === sq)
      return { cargo, candidato, posicao: regional ? posicao : i + 1, porUf: [{ uf, votos: candidato.votos, pct: i >= 0 ? own.candidatos[i]!.pct : candidato.pct, posicao: i + 1, estado: own.estado }] }
    }
    const ufsDoRecorte = regional ? ufsDaRegiao(base.abrangencia.codigo as Regiao).map((u) => u.sigla) : UFS.map((u) => u.sigla)
    const porUf = (
      await mapLimit(ufsDoRecorte, 6, async (uf): Promise<VotosPorUf | null> => {
        try {
          const r = await this.getResultado(cargo, uf)
          const i = r.candidatos.findIndex((c) => c.sq === sq)
          return i < 0 ? { uf, votos: 0, pct: 0, posicao: 0, estado: r.estado } : { uf, votos: r.candidatos[i]!.votos, pct: r.candidatos[i]!.pct, posicao: i + 1, estado: r.estado }
        } catch {
          return null
        }
      })
    ).filter((x): x is VotosPorUf => !!x)
    const observacao = porUf.every((u) => u.estado === 'nao-iniciada') ? 'O TSE ainda não publicou o resultado do Presidente por UF.' : undefined
    return { cargo, candidato, posicao, porUf: porUf.sort((a, b) => b.votos - a.votos), observacao }
  }

  // ---------- municípios ----------

  private async cdParaMunicipios(): Promise<string> {
    const el = await this.eleicoes()
    const cd = el.porCargo.governador ?? el.porCargo.senador ?? Object.values(el.porCargo)[0]
    if (!el.disponivel || !cd) throw new AppError(503, 'Eleição indisponível', el.mensagem)
    return cd
  }

  async getMunicipios(ufIn: string): Promise<MunicipioInfo[]> {
    const uf = ufBySigla(ufIn)
    if (!uf) throw new AppError(400, `UF inválida: ${ufIn}`)
    const cd = await this.cdParaMunicipios()
    const { value } = await this.memoGet(paths.municipios(config.ciclo, cd), (j) => parseMunicipios(j as RawMunCfg))
    return value?.get(uf.sigla) ?? []
  }

  async getMunicipio(ufIn: string, codigo: string): Promise<MunicipioPanorama> {
    const uf = ufBySigla(ufIn)
    if (!uf) throw new AppError(400, `UF inválida: ${ufIn}`)
    const nome = (await this.getMunicipios(uf.sigla)).find((m) => m.codigo === codigo)?.nome
    if (!nome) throw new AppError(404, 'Município não encontrado')
    const cd = await this.cdParaMunicipios()
    const { value } = await this.memoGet(paths.acompanhamento(config.ciclo, cd, uf.sigla), (j) => parseAcompanhamento(j as RawAb))
    const info = value?.muns.get(codigo)
    const vazio = { total: 0, totalizadas: 0, pct: 0 }
    return {
      codigo, nome, uf: uf.sigla,
      estado: info?.estado ?? estadoDe(vazio),
      secoes: info?.secoes ?? vazio,
      comparecimento: info?.comparecimento ?? { eleitores: 0, compareceram: 0, abstencoes: 0, pctComparecimento: 0, pctAbstencao: 0 },
      atualizadoTse: info?.atualizadoTse ?? null,
    }
  }

  // ---------- fotos ----------

  async getFoto(cd: string, uf: string, sq: string) {
    const key = `${cd}/${uf}/${sq}`
    if (this.fotos.has(key)) {
      const v = this.fotos.get(key)!
      this.fotos.delete(key)
      this.fotos.set(key, v) // LRU
      return v
    }
    const res = await this.source.fetchBinary(paths.foto(config.ciclo, cd, uf, sq))
    const v = res.status === 200 && res.body ? { body: res.body, contentType: res.contentType ?? 'image/jpeg' } : null
    this.fotos.set(key, v)
    if (this.fotos.size > 600) this.fotos.delete(this.fotos.keys().next().value!)
    return v
  }
}

/** Marca variação (votos, %, posição) em relação à versão anterior; se nada mudou, preserva as variações já exibidas. */
export function aplicaDeltas(novo: Resultado, prev: Resultado) {
  const soma = (r: Resultado) => r.candidatos.reduce((a, c) => a + c.votos, 0)
  const mudou = soma(novo) !== soma(prev)
  const antes = new Map(prev.candidatos.map((c, i) => [c.sq, { c, i }]))
  novo.candidatos.forEach((c: Candidato, i) => {
    const p = antes.get(c.sq)
    if (!p) return
    if (mudou) {
      c.deltaVotos = c.votos - p.c.votos
      c.deltaPct = c.pct - p.c.pct
      c.deltaPos = p.i - i
    } else {
      c.deltaVotos = p.c.deltaVotos
      c.deltaPct = p.c.deltaPct
      c.deltaPos = p.c.deltaPos
    }
  })
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const n = i++
        out[n] = await fn(items[n]!)
      }
    }),
  )
  return out
}
