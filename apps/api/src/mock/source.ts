import type { CargoId } from '@tse/shared'
import { UFS, cargoByCodigo } from '@tse/shared'
import { config } from '../config'
import { parsePath } from '../tse/paths'
import type { RawAb, RawAbEntry, RawCand, RawEleConfig, RawMunCfg, RawPartido, RawU } from '../tse/raw'
import type { BinaryResult, FetchCond, FetchResult, TseSource } from '../tse/source'
import { MockEngine, rng, type MockCalc } from './engine'

const vir = (n: number, d = 2) => n.toFixed(d).replace('.', ',')
const s = (n: number) => String(Math.round(n))

function agoraBrasilia(now: number) {
  const d = new Date(now - 3 * 3600_000)
  const iso = d.toISOString()
  return { dt: `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`, ht: iso.slice(11, 19) }
}

const MUNS = ['Vila Nova', 'Santa Clara', 'Rio Verde', 'Porto Alegre do Sul', 'Campo Belo', 'São Brás', 'Boa Esperança', 'Monte Alto', 'Nova Aurora', 'Pedra Branca', 'Lagoa Seca', 'Alto Horizonte']
const munCodigo = (ufIdx: number, i: number) => String(ufIdx * 100 + i + 1).padStart(5, '0')

export class MockSource implements TseSource {
  readonly nome = 'mock'
  readonly engine: MockEngine
  constructor(engine?: MockEngine) {
    this.engine = engine ?? new MockEngine({ durationS: config.mockDurationSeg, holdS: config.mockHoldSeg })
  }

  private cdFederal = '21270'
  private cdEstadual = '21272'

  async fetchJson(path: string, cond: FetchCond): Promise<FetchResult> {
    const p = parsePath(path)
    if (!p) return { status: 404 }
    const etag = `"mock-${p.kind === 'config' || p.kind === 'mun' ? 0 : `${this.engine.ciclo()}-${this.engine.tick()}`}"`
    if (cond.etag === etag) return { status: 304 }
    let json: unknown
    switch (p.kind) {
      case 'config': json = this.config(); break
      case 'mun': json = this.munCfg(); break
      case 'ab': json = this.ab(p.cd, p.uf.toUpperCase()); break
      case 'u': {
        const cargo = cargoByCodigo(p.cargoCodigo)
        if (!cargo) return { status: 404 }
        if (cargo.escopo === 'br' && p.uf !== 'br' && cargo.id !== 'presidente') return { status: 404 }
        const uf = p.uf.toUpperCase()
        if (uf === 'BR' && cargo.escopo !== 'br') return { status: 404 }
        if (uf !== 'BR' && !UFS.some((u) => u.sigla === uf)) return { status: 404 }
        if (cargo.id === 'deputado-distrital' && uf !== 'DF') return { status: 404 }
        if (cargo.id === 'deputado-estadual' && uf === 'DF') return { status: 404 }
        // simula arquivo ainda inexistente antes do início da apuração dessa UF
        if (uf !== 'BR' && this.engine.ufEstado(uf).secoes === 0 && this.engine.ciclo() === 0 && this.engine.progresso() === 0) return { status: 404 }
        json = this.u(cargo.id, uf, p.cd)
        break
      }
    }
    return { status: 200, json, etag }
  }

  async fetchBinary(): Promise<BinaryResult> {
    return { status: 404 }
  }

  private config(): RawEleConfig {
    return {
      dg: '01/01/2026', hg: '00:00:00', idg: '1',
      pl: [{
        cd: '17801', c: config.ciclo,
        e: [
          { cd: this.cdFederal, cdt2: '21271', nm: 'Eleição Ordinária Federal (MOCK)', t: '1', abr: [{ cd: 'br', cp: [{ cd: '1', ds: 'Presidente', tp: '1' }] }] },
          {
            cd: this.cdEstadual, cdt2: '21273', nm: 'Eleição Ordinária Estadual (MOCK)', t: '1',
            abr: [{ cd: 'br', cp: [{ cd: '3', ds: 'Governador' }, { cd: '5', ds: 'Senador' }, { cd: '6', ds: 'Deputado Federal' }, { cd: '7', ds: 'Deputado Estadual' }, { cd: '8', ds: 'Deputado Distrital' }] }],
          },
        ],
      }],
    }
  }

  private munCfg(): RawMunCfg {
    return {
      abr: UFS.map((u, ui) => ({
        cd: u.sigla.toLowerCase(), ds: u.nome.toUpperCase(),
        mu: MUNS.map((nm, i) => ({ cd: munCodigo(ui, i), cdi: `${ui}${i}`, nm: `${nm} (${u.sigla})` })),
      })),
    }
  }

  private abEntry(tipo: 'br' | 'uf' | 'mun', cod: string, secoesTotal: number, secoes: number, eleitores: number, comp: number): RawAbEntry {
    const { dt, ht } = agoraBrasilia(Date.now())
    const pst = secoesTotal ? (secoes / secoesTotal) * 100 : 0
    const c = Math.round(eleitores * comp)
    return {
      and: secoes >= secoesTotal ? 'f' : 'e', tpabr: tipo, cdabr: cod, dt, ht,
      s: { ts: s(secoesTotal), st: s(secoes), pst: vir(pst), pstn: String(pst) },
      e: {
        te: s(eleitores), est: s(eleitores), c: s(c), pc: vir(comp * 100), pcn: String(comp * 100),
        a: s(eleitores - c), pa: vir((1 - comp) * 100), pan: String((1 - comp) * 100),
      },
    }
  }

  private ab(cd: string, uf: string): RawAb {
    const { dt, ht } = agoraBrasilia(Date.now())
    const abr: RawAbEntry[] = []
    const ufs = uf === 'BR' ? UFS : UFS.filter((u) => u.sigla === uf)
    let T = 0, S = 0, E = 0, C = 0
    UFS.forEach((u, ui) => {
      const st = this.engine.ufEstado(u.sigla)
      const eleit = Math.round(st.eleitores * (st.secoesTotal ? st.secoes / st.secoesTotal : 0))
      T += st.secoesTotal; S += st.secoes; E += eleit; C += eleit * st.comparecimento
      if (!ufs.includes(u)) return
      abr.push(this.abEntry('uf', u.sigla.toLowerCase(), st.secoesTotal, st.secoes, eleit, st.comparecimento))
      if (uf !== 'BR') {
        MUNS.forEach((_, i) => {
          const r = rng(`mun:${u.sigla}:${i}`)
          const frac = st.p >= 1 ? 1 : Math.min(1, st.p * (0.7 + r() * 0.6))
          const sec = Math.max(1, Math.round(st.secoesTotal / MUNS.length))
          abr.push(this.abEntry('mun', munCodigo(ui, i), sec, Math.round(sec * frac), Math.round((eleit / MUNS.length) * (frac || 0.0001)), st.comparecimento))
        })
      }
    })
    if (uf === 'BR') abr.push(this.abEntry('br', 'br', T, S, E, E ? C / E : 0))
    return { ele: cd, t: '1', f: 'o', dg: dt, hg: ht, idg: `${this.engine.tick()}`, abr }
  }

  private u(cargo: CargoId, uf: string, cd: string): RawU {
    const calc = uf === 'BR' ? this.engine.calcBr() : this.engine.calcUf(cargo, uf)
    const { dt, ht } = agoraBrasilia(Date.now())
    const codigo = { presidente: '1', governador: '3', senador: '5', 'deputado-federal': '6', 'deputado-estadual': '7', 'deputado-distrital': '8' }[cargo]
    const sorted = [...calc.cands].sort((a, b) => b.votos - a.votos)
    const pos = new Map(sorted.map((c, i) => [c.sq, i]))
    const eleito = this.statusFn(cargo, calc, sorted)

    const porPartido = new Map<string, RawPartido>()
    for (const c of calc.cands) {
      const p = c.partido
      const rawC: RawCand = {
        n: c.numero, sqcand: c.sq, nm: c.nome, nmu: c.nome, dvt: 'Válido', seq: String((pos.get(c.sq) ?? 0) + 1), e: eleito(c.sq) === 'Não eleito' ? 'n' : 's',
        st: eleito(c.sq), vap: s(c.votos), pvap: vir(calc.validos ? (c.votos / calc.validos) * 100 : 0),
        pvapn: String(calc.validos ? (c.votos / calc.validos) * 100 : 0).replace('.', ','),
        vs: [
          ...(c.vice ? [{ tp: 'v', nm: c.vice, nmu: c.vice, sgp: p.sg }] : []),
          ...(c.suplentes ?? []).map((nm, i) => ({ tp: `s${i + 1}`, nm, nmu: nm, sgp: p.sg })),
        ],
      }
      const par = porPartido.get(p.sg) ?? { n: p.n, sg: p.sg, nm: p.nm, nfed: '', tvtn: '0', cand: [] }
      par.cand!.push(rawC)
      par.tvtn = s(Number(par.tvtn) + c.votos)
      porPartido.set(p.sg, par)
    }
    const raw: RawU = {
      ele: cd, t: '1', f: 's', tpabr: uf === 'BR' ? 'br' : 'uf', cdabr: uf.toLowerCase(), dt, ht, dg: dt, hg: ht,
      idg: `${this.engine.tick()}`, tf: calc.final ? 's' : 'n', and: calc.final ? 'f' : 'e',
      carg: [{
        cd: codigo, nmn: cargo, nv: s(calc.vagas), fed: [],
        agr: [...porPartido.values()].map((par) => ({ n: `6${par.n}`, nm: par.nm, tp: 'i', com: par.sg, par: [par] })),
      }],
      ...this.totais(calc),
    }
    return raw
  }

  private totais(c: MockCalc) {
    const pst = c.secoesTotal ? (c.secoes / c.secoesTotal) * 100 : 0
    const base = c.compareceram + c.abstencoes
    return {
      s: { ts: s(c.secoesTotal), st: s(c.secoes), pst: vir(pst), pstn: String(pst) },
      e: {
        te: s(c.eleitores), est: s(c.eleitores), c: s(c.compareceram), pcn: String(base ? (c.compareceram / base) * 100 : 0),
        a: s(c.abstencoes), pan: String(base ? (c.abstencoes / base) * 100 : 0),
      },
      v: {
        tv: s(c.compareceram), vvc: s(c.validos), vv: s(c.nominais), vnom: s(c.nominais), vb: s(c.brancos), vn: s(c.nulos), tvn: s(c.nulos),
        pvvcn: String(c.compareceram ? (c.validos / c.compareceram) * 100 : 0), pvbn: String(c.compareceram ? (c.brancos / c.compareceram) * 100 : 0),
        pvnn: String(c.compareceram ? (c.nulos / c.compareceram) * 100 : 0),
      },
    }
  }

  /** Status "oficial" só aparece com 100% das seções (simplificado: sem cálculo de quociente eleitoral). */
  private statusFn(cargo: CargoId, calc: MockCalc, sorted: { sq: string; votos: number }[]) {
    if (!calc.final) return () => 'Não eleito'
    const ranks = new Map(sorted.map((c, i) => [c.sq, i]))
    if (cargo === 'presidente' || cargo === 'governador') {
      const lidera = sorted[0] && calc.validos ? sorted[0].votos / calc.validos > 0.5 : false
      return (sq: string) => (ranks.get(sq) === 0 && lidera ? 'Eleito' : !lidera && (ranks.get(sq) ?? 9) < 2 ? '2º turno' : 'Não eleito')
    }
    if (cargo === 'senador') return (sq: string) => ((ranks.get(sq) ?? 9) < calc.vagas ? 'Eleito' : 'Não eleito')
    return (sq: string) => {
      const r = ranks.get(sq) ?? 999
      return r < calc.vagas ? 'Eleito por QP' : r < calc.vagas * 2 ? 'Suplente' : 'Não eleito'
    }
  }
}
