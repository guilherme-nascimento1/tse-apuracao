import type { CargoId, Regiao } from './types'

export const REGIOES: { id: Regiao; nome: string }[] = [
  { id: 'norte', nome: 'Norte' },
  { id: 'nordeste', nome: 'Nordeste' },
  { id: 'centro-oeste', nome: 'Centro-Oeste' },
  { id: 'sudeste', nome: 'Sudeste' },
  { id: 'sul', nome: 'Sul' },
]

const r = (regiao: Regiao, ...ufs: [string, string][]) => ufs.map(([sigla, nome]) => ({ sigla, nome, regiao }))

export const UFS: { sigla: string; nome: string; regiao: Regiao }[] = [
  ...r('norte', ['AC', 'Acre'], ['AP', 'Amapá'], ['AM', 'Amazonas'], ['PA', 'Pará'], ['RO', 'Rondônia'], ['RR', 'Roraima'], ['TO', 'Tocantins']),
  ...r('nordeste', ['AL', 'Alagoas'], ['BA', 'Bahia'], ['CE', 'Ceará'], ['MA', 'Maranhão'], ['PB', 'Paraíba'], ['PE', 'Pernambuco'], ['PI', 'Piauí'], ['RN', 'Rio Grande do Norte'], ['SE', 'Sergipe']),
  ...r('centro-oeste', ['DF', 'Distrito Federal'], ['GO', 'Goiás'], ['MT', 'Mato Grosso'], ['MS', 'Mato Grosso do Sul']),
  ...r('sudeste', ['ES', 'Espírito Santo'], ['MG', 'Minas Gerais'], ['RJ', 'Rio de Janeiro'], ['SP', 'São Paulo']),
  ...r('sul', ['PR', 'Paraná'], ['RS', 'Rio Grande do Sul'], ['SC', 'Santa Catarina']),
]

export const CARGOS: { id: CargoId; codigo: string; nome: string; escopo: 'br' | 'uf'; proporcional: boolean }[] = [
  { id: 'presidente', codigo: '1', nome: 'Presidente', escopo: 'br', proporcional: false },
  { id: 'governador', codigo: '3', nome: 'Governador', escopo: 'uf', proporcional: false },
  { id: 'senador', codigo: '5', nome: 'Senador', escopo: 'uf', proporcional: false },
  { id: 'deputado-federal', codigo: '6', nome: 'Deputado Federal', escopo: 'uf', proporcional: true },
  { id: 'deputado-estadual', codigo: '7', nome: 'Deputado Estadual', escopo: 'uf', proporcional: true },
  { id: 'deputado-distrital', codigo: '8', nome: 'Deputado Distrital', escopo: 'uf', proporcional: true },
]

export const cargoById = (id: string) => CARGOS.find((c) => c.id === id)
export const cargoByCodigo = (cd: string) => CARGOS.find((c) => c.codigo === String(Number(cd)))
export const ufBySigla = (s: string) => UFS.find((u) => u.sigla === s.toUpperCase())
export const ufsDaRegiao = (reg: Regiao) => UFS.filter((u) => u.regiao === reg)

/** Deputado Distrital só existe no DF; Deputado Estadual não existe no DF. */
export function cargoValidoParaUf(cargo: CargoId, uf: string | undefined): boolean {
  if (!uf) return true
  if (cargo === 'deputado-distrital') return uf === 'DF'
  if (cargo === 'deputado-estadual') return uf !== 'DF'
  return true
}
