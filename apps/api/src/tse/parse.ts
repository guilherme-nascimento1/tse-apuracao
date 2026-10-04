import type {
  CargoId, Candidato, Comparecimento, EstadoApuracao, MunicipioInfo, Resultado, Secoes, StatusCandidato, Votos,
} from '@tse/shared'
import { cargoByCodigo, cargoById } from '@tse/shared'
import { corPartido } from './colors'
import type {
  RawAb, RawAbEntry, RawCand, RawCargo, RawEleConfig, RawEleitorado, RawMunCfg, RawSecoes, RawU, RawVotos,
} from './raw'

/** Números do TSE chegam como string, com vírgula decimal. */
export function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v !== 'string' || v.trim() === '') return 0
  const n = Number(v.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** "29/09/2026" + "16:28:52" (horário de Brasília, UTC-3) -> ISO UTC. */
export function tseDataHora(dt?: string, ht?: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dt ?? '')
  if (!m) return null
  const hora = /^\d{2}:\d{2}:\d{2}$/.test(ht ?? '') ? ht! : '00:00:00'
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T${hora}-03:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function normalizaStatus(st: string | undefined, estado: EstadoApuracao): StatusCandidato {
  const s = semAcento(st ?? '')
  if (s.startsWith('eleito')) return 'eleito'
  if (s.includes('turno')) return 'segundo-turno'
  if (estado !== 'encerrada') return 'em-apuracao'
  if (s.startsWith('suplente')) return 'suplente'
  return 'nao-eleito'
}

export function parseSecoes(s?: RawSecoes): Secoes {
  const total = num(s?.ts)
  const totalizadas = num(s?.st)
  const pct = total > 0 ? Math.min(100, (totalizadas / total) * 100) : num(s?.pstn)
  return { total, totalizadas, pct }
}

export function estadoDe(secoes: Secoes, finalizado?: boolean): EstadoApuracao {
  if (secoes.totalizadas <= 0) return 'nao-iniciada'
  if (secoes.total > 0 && secoes.totalizadas >= secoes.total && finalizado !== false) return 'encerrada'
  return 'em-apuracao'
}

export function parseComparecimento(e?: RawEleitorado): Comparecimento {
  const eleitores = num(e?.est) || num(e?.te)
  const compareceram = num(e?.c)
  const abstencoes = num(e?.a)
  const base = compareceram + abstencoes || eleitores
  return {
    eleitores,
    compareceram,
    abstencoes,
    pctComparecimento: num(e?.pcn) || (base ? (compareceram / base) * 100 : 0),
    pctAbstencao: num(e?.pan) || (base ? (abstencoes / base) * 100 : 0),
  }
}

export function parseVotos(v: RawVotos | undefined, legenda = 0): Votos {
  const total = num(v?.tv)
  const validos = num(v?.vvc) || num(v?.vv)
  const brancos = num(v?.vb)
  const nulos = num(v?.vn) || num(v?.tvn)
  const pc = (x: number, tv: number, given?: string) => num(given) || (tv ? (x / tv) * 100 : 0)
  return {
    total, validos, nominais: num(v?.vnom) || num(v?.vv), legenda, brancos, nulos,
    pctValidos: pc(validos, total, v?.pvvcn), pctBrancos: pc(brancos, total, v?.pvbn), pctNulos: pc(nulos, total, v?.pvnn ?? v?.ptvnn),
  }
}

export interface ParseCtx {
  cargo: CargoId
  /** "br" ou sigla da UF em qualquer caixa */
  uf: string
  cd: string
  ciclo: string
  turno: number
  coletadoEm: string
  /** modo mock não possui fotos */
  semFotos?: boolean
}

const VAZIO_SECOES: Secoes = { total: 0, totalizadas: 0, pct: 0 }
const VAZIO_COMP: Comparecimento = { eleitores: 0, compareceram: 0, abstencoes: 0, pctComparecimento: 0, pctAbstencao: 0 }
const VAZIO_VOTOS: Votos = { total: 0, validos: 0, nominais: 0, legenda: 0, brancos: 0, nulos: 0, pctValidos: 0, pctBrancos: 0, pctNulos: 0 }

/** Resultado de uma abrangência ainda sem arquivo (404): estado vazio amigável, não erro. */
export function resultadoVazio(ctx: ParseCtx): Resultado {
  return {
    cargo: ctx.cargo,
    abrangencia: { tipo: ctx.uf.toLowerCase() === 'br' ? 'br' : 'uf', codigo: ctx.uf.toUpperCase() },
    eleicao: ctx.cd, turno: ctx.turno, estado: 'nao-iniciada', vagas: 0,
    secoes: VAZIO_SECOES, comparecimento: VAZIO_COMP, votos: VAZIO_VOTOS, candidatos: [],
    atualizadoTse: null, coletadoEm: ctx.coletadoEm, versao: 'vazio',
  }
}

function achaCargo(raw: RawU, ctx: ParseCtx): RawCargo | undefined {
  const codigo = cargoById(ctx.cargo)!.codigo
  return raw.carg?.find((c) => String(Number(c.cd)) === codigo) ?? raw.carg?.[0]
}

export function parseResultado(raw: RawU, ctx: ParseCtx): Resultado {
  const secoes = parseSecoes(raw.s)
  const estado = estadoDe(secoes, raw.tf ? raw.tf === 's' : undefined)
  const carg = achaCargo(raw, ctx)
  const ufLower = ctx.uf.toLowerCase()

  const federacoes = new Map((carg?.fed ?? []).map((f) => [f.n, f.sg]))
  const candidatos: Candidato[] = []
  let legenda = 0

  for (const agr of carg?.agr ?? []) {
    for (const par of agr.par ?? []) {
      legenda += num(par.tvtl)
      for (const c of par.cand ?? []) {
        candidatos.push(parseCandidato(c, par.sg, par.nm ?? par.sg, par.nfed ? federacoes.get(par.nfed) : undefined, estado, ctx, ufLower))
      }
    }
  }
  candidatos.sort((a, b) => b.votos - a.votos || a.nome.localeCompare(b.nome, 'pt-BR'))

  return {
    cargo: ctx.cargo,
    abrangencia: { tipo: ufLower === 'br' ? 'br' : 'uf', codigo: ctx.uf.toUpperCase() },
    eleicao: ctx.cd,
    turno: ctx.turno,
    estado,
    vagas: num(carg?.nv) || 1,
    secoes,
    comparecimento: parseComparecimento(raw.e),
    votos: parseVotos(raw.v, legenda),
    candidatos,
    atualizadoTse: tseDataHora(raw.dt, raw.ht) ?? tseDataHora(raw.dg, raw.hg),
    coletadoEm: ctx.coletadoEm,
    versao: raw.idg ?? `${secoes.totalizadas}`,
  }
}

function parseCandidato(
  c: RawCand, sg: string, partidoNome: string, federacao: string | undefined,
  estado: EstadoApuracao, ctx: ParseCtx, ufLower: string,
): Candidato {
  const vice = c.vs?.find((v) => v.tp === 'v')
  const suplentes = c.vs?.filter((v) => v.tp.startsWith('s')).map((v) => v.nmu || v.nm || '').filter(Boolean)
  return {
    sq: c.sqcand,
    numero: c.n,
    nome: c.nmu || c.nm || `Candidato ${c.n}`,
    uf: ufLower === 'br' ? undefined : ufLower.toUpperCase(),
    partido: sg,
    partidoNome,
    federacao,
    votos: num(c.vap),
    pct: num(c.pvapn) || num(c.pvap),
    status: normalizaStatus(c.st, estado),
    situacao: c.dvt || 'Válido',
    vice: vice ? vice.nmu || vice.nm : undefined,
    suplentes: suplentes && suplentes.length ? suplentes : undefined,
    foto: ctx.semFotos ? undefined : `/api/foto/${ctx.cd}/${ufLower}/${c.sqcand}`,
    cor: corPartido(sg),
  }
}

// ---------- Acompanhamento (-ab.json) ----------

export interface AbInfo {
  tipo: 'br' | 'uf' | 'mun'
  codigo: string
  estado: EstadoApuracao
  secoes: Secoes
  comparecimento: Comparecimento
  atualizadoTse: string | null
}

const parseAbEntry = (e: RawAbEntry): AbInfo => {
  const secoes = parseSecoes(e.s)
  return {
    tipo: e.tpabr as AbInfo['tipo'],
    codigo: e.cdabr,
    estado: estadoDe(secoes, e.and ? e.and === 'f' : undefined),
    secoes,
    comparecimento: parseComparecimento(e.e),
    atualizadoTse: tseDataHora(e.dt, e.ht),
  }
}

export interface AbParsed { br?: AbInfo; ufs: Map<string, AbInfo>; muns: Map<string, AbInfo>; atualizadoTse: string | null }

export function parseAcompanhamento(raw: RawAb): AbParsed {
  const out: AbParsed = { ufs: new Map(), muns: new Map(), atualizadoTse: tseDataHora(raw.dg, raw.hg) }
  for (const e of raw.abr ?? []) {
    const info = parseAbEntry(e)
    if (e.tpabr === 'br') out.br = info
    else if (e.tpabr === 'uf') out.ufs.set(e.cdabr.toUpperCase(), info)
    else if (e.tpabr === 'mun') out.muns.set(e.cdabr, info)
  }
  return out
}

/** Soma as UFs quando o arquivo não traz a linha "br". */
export function somaUfs(ufs: Iterable<AbInfo>): AbInfo {
  const s = { total: 0, totalizadas: 0, pct: 0 }
  const c = { eleitores: 0, compareceram: 0, abstencoes: 0, pctComparecimento: 0, pctAbstencao: 0 }
  for (const u of ufs) {
    s.total += u.secoes.total; s.totalizadas += u.secoes.totalizadas
    c.eleitores += u.comparecimento.eleitores; c.compareceram += u.comparecimento.compareceram; c.abstencoes += u.comparecimento.abstencoes
  }
  s.pct = s.total ? (s.totalizadas / s.total) * 100 : 0
  const base = c.compareceram + c.abstencoes
  c.pctComparecimento = base ? (c.compareceram / base) * 100 : 0
  c.pctAbstencao = base ? (c.abstencoes / base) * 100 : 0
  return { tipo: 'br', codigo: 'br', estado: estadoDe(s), secoes: s, comparecimento: c, atualizadoTse: null }
}

// ---------- Configuração das eleições (ele-c.json) ----------

export interface EleicoesParsed {
  disponivel: boolean
  mensagem?: string
  porCargo: Partial<Record<CargoId, string>>
  atualizadoTse: string | null
}

/**
 * Descobre, a partir do ele-c.json, qual código de eleição (cd) responde por cada cargo no ciclo/turno
 * pedido. Nada de códigos fixos: o 2º turno usa o `cdt2` informado pelo TSE.
 */
export function parseEleicoes(raw: RawEleConfig, ciclo: string, turno: number): EleicoesParsed {
  const atualizadoTse = tseDataHora(raw.dg, raw.hg)
  const pleitos = (raw.pl ?? []).filter((p) => p.c === ciclo)
  if (!pleitos.length) {
    const ciclos = [...new Set((raw.pl ?? []).map((p) => p.c))].join(', ') || 'nenhum'
    return { disponivel: false, porCargo: {}, atualizadoTse, mensagem: `O TSE ainda não publicou o ciclo ${ciclo} (ciclos disponíveis: ${ciclos}).` }
  }
  const porCargo: Partial<Record<CargoId, string>> = {}
  for (const p of pleitos) {
    for (const e of p.e ?? []) {
      if (e.t && e.t !== '1') continue
      const cd = turno === 2 ? e.cdt2 : e.cd
      if (!cd) continue
      for (const abr of e.abr ?? []) {
        for (const cp of abr.cp ?? []) {
          const cargo = cargoByCodigo(cp.cd)
          if (cargo && !porCargo[cargo.id]) porCargo[cargo.id] = cd
        }
      }
    }
  }
  const disponivel = Object.keys(porCargo).length > 0
  return { disponivel, porCargo, atualizadoTse, mensagem: disponivel ? undefined : `Nenhum cargo federal/estadual configurado para o ${turno}º turno de ${ciclo}.` }
}

// ---------- Municípios (mun-eXXXXXX-cm.json) ----------

export function parseMunicipios(raw: RawMunCfg): Map<string, MunicipioInfo[]> {
  const out = new Map<string, MunicipioInfo[]>()
  for (const a of raw.abr ?? []) {
    const lista = (a.mu ?? []).map((m) => ({ codigo: m.cd, nome: m.nm })).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))
    out.set(a.cd.toUpperCase(), lista)
  }
  return out
}
