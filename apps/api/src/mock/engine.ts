import type { CargoId } from '@tse/shared'
import { UFS } from '@tse/shared'

/** PRNG determinístico (mulberry32) semeado por string: o mesmo cargo/UF gera sempre os mesmos candidatos. */
export function rng(seed: string) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())

export const MOCK_PARTIDOS = [
  { sg: 'PAC', nm: 'Partido Aurora Cívica', n: '11' },
  { sg: 'UNB', nm: 'União Brasil Nova', n: '22' },
  { sg: 'RPD', nm: 'Renovação e Desenvolvimento', n: '33' },
  { sg: 'MVB', nm: 'Movimento Vida Brasil', n: '44' },
  { sg: 'FRN', nm: 'Frente Nacional', n: '55' },
  { sg: 'DPL', nm: 'Democracia Popular', n: '66' },
  { sg: 'PTR', nm: 'Partido Trabalho e Raízes', n: '77' },
  { sg: 'ADS', nm: 'Ação Democrática Social', n: '88' },
  { sg: 'LBR', nm: 'Liberdade Brasil', n: '12' },
  { sg: 'PNV', nm: 'Partido Novo Verde', n: '23' },
  { sg: 'SOC', nm: 'Solidariedade Cidadã', n: '34' },
  { sg: 'CNT', nm: 'Centro Nacional', n: '45' },
]

const NOMES = ['Ana', 'Bruno', 'Carla', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Hugo', 'Isabel', 'João', 'Karina', 'Lucas', 'Marina', 'Nelson', 'Olívia', 'Paulo', 'Rafaela', 'Sérgio', 'Tereza', 'Vítor', 'Wagner', 'Yara', 'Zeca', 'Marcos', 'Letícia', 'Renato', 'Camila', 'Otávio']
const SOBRENOMES = ['Albuquerque', 'Barros', 'Cardoso', 'Dantas', 'Esteves', 'Farias', 'Guedes', 'Holanda', 'Ibiapina', 'Junqueira', 'Lacerda', 'Moraes', 'Nogueira', 'Oliveira', 'Pacheco', 'Queiroz', 'Rangel', 'Siqueira', 'Teixeira', 'Uchoa', 'Vasconcelos', 'Xavier', 'Zanetti', 'Amaral', 'Bastos', 'Campos', 'Duarte', 'Fontes']

/** Eleitorado aproximado por UF (modo mock). */
const ELEITORES: Record<string, number> = {
  SP: 35.0e6, MG: 16.2e6, RJ: 13.0e6, BA: 11.6e6, PR: 8.9e6, RS: 8.6e6, PE: 7.1e6, CE: 6.8e6, PA: 6.2e6, SC: 5.6e6,
  MA: 5.1e6, GO: 5.1e6, PB: 3.2e6, AM: 2.9e6, ES: 2.9e6, RN: 2.5e6, MT: 2.5e6, PI: 2.5e6, AL: 2.3e6, DF: 2.2e6,
  MS: 2.0e6, SE: 1.6e6, RO: 1.2e6, TO: 1.1e6, AC: 0.6e6, AP: 0.55e6, RR: 0.4e6,
}
const FEDERAIS: Record<string, number> = {
  SP: 70, MG: 53, RJ: 46, BA: 39, RS: 31, PR: 30, PE: 25, CE: 22, PA: 17, MA: 18, SC: 16, GO: 17, PB: 12, ES: 10,
  AM: 8, RN: 8, AL: 9, PI: 10, MT: 8, DF: 8, MS: 8, SE: 8, RO: 8, TO: 8, AC: 8, AP: 8, RR: 8,
}

export function vagasMock(cargo: CargoId, uf: string): number {
  const f = FEDERAIS[uf] ?? 8
  switch (cargo) {
    case 'presidente': case 'governador': return 1
    case 'senador': return 2
    case 'deputado-federal': return f
    case 'deputado-estadual': return f <= 12 ? f * 3 : 36 + (f - 12)
    case 'deputado-distrital': return 24
  }
}

export interface MockCand {
  sq: string; numero: string; nome: string; vice?: string; suplentes?: string[]
  partido: (typeof MOCK_PARTIDOS)[number]
  /** participação final no total nominal */
  peso: number
  /** viés temporal: candidato forte no início/fim da apuração */
  vies: number
}

export interface UfEstado { uf: string; p: number; secoesTotal: number; secoes: number; eleitores: number; comparecimento: number }

export interface MockCalc {
  secoesTotal: number; secoes: number; eleitores: number
  compareceram: number; abstencoes: number; brancos: number; nulos: number; validos: number; legenda: number; nominais: number
  cands: (MockCand & { votos: number })[]
  vagas: number
  final: boolean
}

export class MockEngine {
  private start: number
  private univ = new Map<string, MockCand[]>()
  constructor(readonly opts: { durationS: number; holdS: number; tickS?: number; now?: () => number; epoch?: number }) {
    this.start = this.opts.epoch ?? this.now()
  }

  private now() { return this.opts.now ? this.opts.now() : Date.now() }
  get tickS() { return this.opts.tickS ?? 5 }
  /** índice do "tick" atual: muda a cada tickS e serve de ETag */
  tick() { return Math.floor((this.now() - this.start) / 1000 / this.tickS) }

  /** progresso global 0..1; após 100% fica em hold e reinicia */
  progresso(): number {
    const t = ((this.now() - this.start) / 1000) % (this.opts.durationS + this.opts.holdS)
    // discretiza no tick para que o conteúdo só mude quando o ETag mudar
    const tq = Math.floor(t / this.tickS) * this.tickS
    return Math.min(1, tq / this.opts.durationS)
  }
  ciclo(): number { return Math.floor((this.now() - this.start) / 1000 / (this.opts.durationS + this.opts.holdS)) }

  ufEstado(uf: string): UfEstado {
    const r = rng(`atraso:${uf}`)
    const atraso = r() * 0.35
    const p = this.progresso() >= 1 ? 1 : Math.max(0, Math.min(1, (this.progresso() - atraso) / (1 - atraso)))
    const eleitores = ELEITORES[uf] ?? 1e6
    const secoesTotal = Math.round(eleitores / 290)
    return { uf, p, secoesTotal, secoes: Math.round(p * secoesTotal), eleitores, comparecimento: 0.74 + r() * 0.1 }
  }

  private universo(cargo: CargoId, uf: string): MockCand[] {
    const key = `${cargo}:${uf}`
    const hit = this.univ.get(key)
    if (hit) return hit
    const proporcional = cargo.startsWith('deputado')
    const base = cargo === 'presidente' ? 'presidente' : `${cargo}:${uf}`
    const r = rng(`univ:${base}`)
    const vagas = vagasMock(cargo, uf)
    const n = proporcional ? Math.min(vagas * 8, 900) : cargo === 'senador' ? 6 : cargo === 'presidente' ? 7 : 5 + Math.floor(r() * 3)
    const digitos = { presidente: 2, governador: 2, senador: 3, 'deputado-federal': 4, 'deputado-estadual': 5, 'deputado-distrital': 5 }[cargo]
    const usados = new Set<string>()
    const pesos: number[] = []
    const cands: MockCand[] = []
    for (let i = 0; i < n; i++) {
      let partido = MOCK_PARTIDOS[Math.floor(r() * MOCK_PARTIDOS.length)]!
      // cargos de 2 dígitos: número = número do partido, então cada candidato precisa de um partido distinto
      while (digitos === 2 && usados.has(partido.n)) partido = MOCK_PARTIDOS[Math.floor(r() * MOCK_PARTIDOS.length)]!
      let numero: string
      do {
        numero = partido.n + String(Math.floor(r() * 10 ** (digitos - 2))).padStart(Math.max(0, digitos - 2), '0')
        numero = numero.slice(0, digitos)
      } while (usados.has(numero))
      usados.add(numero)
      const nome = () => `${NOMES[Math.floor(r() * NOMES.length)]} ${SOBRENOMES[Math.floor(r() * SOBRENOMES.length)]}`
      const peso = proporcional ? 1 / (i + 1) ** 0.95 * Math.exp(gauss(r) * 0.25) : Math.exp(gauss(r) * 0.75)
      pesos.push(peso)
      cands.push({
        sq: `9${String(Math.floor(r() * 1e10)).padStart(10, '0')}`.slice(0, 11),
        numero, nome: nome(), partido, peso, vies: (r() - 0.5) * 0.7,
        vice: cargo === 'presidente' || cargo === 'governador' ? nome() : undefined,
        suplentes: cargo === 'senador' ? [nome(), nome()] : undefined,
      })
    }
    const soma = pesos.reduce((a, b) => a + b, 0)
    cands.forEach((c) => (c.peso /= soma))
    this.univ.set(key, cands)
    return cands
  }

  /** Cálculo da apuração de uma UF para um cargo, no instante atual. */
  calcUf(cargo: CargoId, uf: string): MockCalc {
    const st = this.ufEstado(uf)
    const proporcional = cargo.startsWith('deputado')
    const univ = this.universo(cargo, uf)
    const rr = rng(`reg:${cargo}:${uf}`)
    // presidente: cada UF puxa os pesos nacionais para um lado
    const pesos = univ.map((c) => (cargo === 'presidente' ? c.peso * Math.exp(gauss(rng(`pres:${uf}:${c.sq}`)) * 0.55) : c.peso))
    const frac = st.secoesTotal ? st.secoes / st.secoesTotal : 0
    const adj = univ.map((c, i) => Math.max(0.0001, pesos[i]! * (1 + c.vies * (1 - st.p))))
    const soma = adj.reduce((a, b) => a + b, 0)

    const compareceram = Math.round(st.eleitores * frac * st.comparecimento)
    const brancos = Math.round(compareceram * (0.025 + rr() * 0.015))
    const nulos = Math.round(compareceram * (0.04 + rr() * 0.02))
    const validos = compareceram - brancos - nulos
    const legenda = proporcional ? Math.round(validos * 0.06) : 0
    const nominais = validos - legenda
    const cands = univ.map((c, i) => ({ ...c, votos: Math.floor((nominais * adj[i]!) / soma) }))
    return {
      secoesTotal: st.secoesTotal, secoes: st.secoes, eleitores: Math.round(st.eleitores * frac),
      compareceram, abstencoes: Math.round(st.eleitores * frac) - compareceram, brancos, nulos, validos, legenda, nominais,
      cands, vagas: vagasMock(cargo, uf), final: st.secoes >= st.secoesTotal,
    }
  }

  calcBr(): MockCalc {
    const parts = UFS.map((u) => this.calcUf('presidente', u.sigla))
    const first = parts[0]!
    const mapa = new Map(first.cands.map((c) => [c.sq, { ...c, votos: 0 }]))
    const t: MockCalc = {
      secoesTotal: 0, secoes: 0, eleitores: 0, compareceram: 0, abstencoes: 0, brancos: 0, nulos: 0, validos: 0, legenda: 0, nominais: 0,
      cands: [], vagas: 1, final: true,
    }
    for (const p of parts) {
      t.secoesTotal += p.secoesTotal; t.secoes += p.secoes; t.eleitores += p.eleitores; t.compareceram += p.compareceram
      t.abstencoes += p.abstencoes; t.brancos += p.brancos; t.nulos += p.nulos; t.validos += p.validos; t.nominais += p.nominais
      t.final &&= p.final
      for (const c of p.cands) mapa.get(c.sq)!.votos += c.votos
    }
    t.cands = [...mapa.values()]
    return t
  }
}
