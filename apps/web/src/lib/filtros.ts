import type { CargoId, Regiao } from '@tse/shared'
import { REGIOES, UFS, cargoById, ufBySigla, ufsDaRegiao } from '@tse/shared'

/** Na UI "Deputado Estadual/Distrital" é um único item; no DF vira Distrital. */
export type CargoUi = Exclude<CargoId, 'deputado-distrital'>

export interface Filtros {
  cargo: CargoUi
  regiao: Regiao | ''
  uf: string
  mun: string
  q: string
  partido: string
  cmp: string[]
  cand: string
}

export const CARGOS_UI: { id: CargoUi; nome: string; curto: string }[] = [
  { id: 'presidente', nome: 'Presidente', curto: 'Presidente' },
  { id: 'governador', nome: 'Governador', curto: 'Governador' },
  { id: 'senador', nome: 'Senador', curto: 'Senador' },
  { id: 'deputado-federal', nome: 'Deputado Federal', curto: 'Dep. Federal' },
  { id: 'deputado-estadual', nome: 'Deputado Estadual/Distrital', curto: 'Dep. Estadual' },
]

export const FILTROS_PADRAO: Filtros = { cargo: 'presidente', regiao: '', uf: '', mun: '', q: '', partido: '', cmp: [], cand: '' }

export function cargoEfetivo(f: Pick<Filtros, 'cargo' | 'uf'>): CargoId {
  return f.cargo === 'deputado-estadual' && f.uf === 'DF' ? 'deputado-distrital' : f.cargo
}

export const nomeCargo = (f: Pick<Filtros, 'cargo' | 'uf'>) => cargoById(cargoEfetivo(f))?.nome ?? ''

export function lerUrl(search = location.search): Filtros {
  const p = new URLSearchParams(search)
  const cargoRaw = p.get('cargo') === 'deputado-distrital' ? 'deputado-estadual' : p.get('cargo')
  const cargo = CARGOS_UI.find((c) => c.id === cargoRaw)?.id ?? 'presidente'
  const uf = (p.get('uf') ?? '').toUpperCase()
  const regiao = REGIOES.find((r) => r.id === p.get('regiao'))?.id ?? ''
  const base: Filtros = {
    cargo, regiao, uf: ufBySigla(uf) ? uf : '', mun: p.get('mun') ?? '', q: p.get('q') ?? '', partido: p.get('partido') ?? '',
    cmp: (p.get('cmp') ?? '').split(',').filter(Boolean).slice(0, 3), cand: p.get('cand') ?? '',
  }
  return ajustar(base, {}).next
}

export function paraUrl(f: Filtros): string {
  const p = new URLSearchParams()
  p.set('cargo', f.cargo)
  if (f.regiao) p.set('regiao', f.regiao)
  if (f.uf) p.set('uf', f.uf)
  if (f.mun) p.set('mun', f.mun)
  if (f.q) p.set('q', f.q)
  if (f.partido) p.set('partido', f.partido)
  if (f.cmp.length) p.set('cmp', f.cmp.join(','))
  if (f.cand) p.set('cand', f.cand)
  return `?${p.toString()}`
}

/**
 * Aplica a mudança e corrige combinações inválidas.
 * Presidente: só Brasil. Demais cargos: exigem UF. Região e UF andam juntas.
 */
export function ajustar(prev: Filtros, patch: Partial<Filtros>): { next: Filtros; avisos: string[] } {
  const avisos: string[] = []
  const next: Filtros = { ...prev, ...patch }
  const cargoMudou = patch.cargo !== undefined && patch.cargo !== prev.cargo
  const nome = CARGOS_UI.find((c) => c.id === next.cargo)!.nome

  if (patch.uf !== undefined && patch.uf !== prev.uf) next.mun = ''

  if (next.cargo === 'presidente') {
    if (next.uf || next.mun) {
      if (cargoMudou) avisos.push('Presidente tem escopo nacional: removemos o filtro de estado.')
      next.uf = ''
      next.mun = ''
    }
    if (next.regiao && cargoMudou) next.regiao = ''
    return { next, avisos }
  }

  if (!next.uf) {
    const uf = (next.regiao ? ufsDaRegiao(next.regiao)[0]?.sigla : undefined) ?? 'SP'
    next.uf = uf
    next.mun = ''
    if (cargoMudou || patch.uf === '') avisos.push(`${nome} exige um estado: selecionamos ${ufBySigla(uf)!.nome}.`)
  }
  const regiaoDaUf = ufBySigla(next.uf)!.regiao
  if (next.regiao && next.regiao !== regiaoDaUf) {
    if (patch.regiao !== undefined && patch.regiao !== prev.regiao) {
      const uf = ufsDaRegiao(next.regiao)[0]!.sigla
      avisos.push(`${ufBySigla(next.uf)!.nome} não fica nessa região: mudamos para ${ufBySigla(uf)!.nome}.`)
      next.uf = uf
      next.mun = ''
    } else {
      next.regiao = regiaoDaUf
    }
  }
  if (next.cargo === 'deputado-estadual' && next.uf === 'DF' && (cargoMudou || patch.uf === 'DF')) {
    avisos.push('No Distrito Federal o cargo é Deputado Distrital.')
  }
  return { next, avisos }
}

export const ufNome = (s: string) => UFS.find((u) => u.sigla === s)?.nome ?? s
