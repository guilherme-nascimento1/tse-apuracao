import type { CargoId } from '@tse/shared'
import { cargoById } from '@tse/shared'

const pad = (v: string | number, n: number) => String(v).padStart(n, '0')

/**
 * Caminhos relativos à URL base (TSE_BASE_URL). Padrão dos arquivos:
 *   {ciclo}/{cd_eleicao}/dados/{uf}/{uf}-c{cargo}-e{eleicao}-u.json
 * O arquivo de configuração fica fora do ciclo: comum/config/ele-c.json
 */
export const paths = {
  config: () => 'comum/config/ele-c.json',
  resultado: (ciclo: string, cd: string, cargo: CargoId, uf: string) => {
    const u = uf.toLowerCase()
    const c = cargoById(cargo)!
    return `${ciclo}/${cd}/dados/${u}/${u}-c${pad(c.codigo, 4)}-e${pad(cd, 6)}-u.json`
  },
  acompanhamento: (ciclo: string, cd: string, uf: string) => {
    const u = uf.toLowerCase()
    return `${ciclo}/${cd}/dados/${u}/${u}-e${pad(cd, 6)}-ab.json`
  },
  municipios: (ciclo: string, cd: string) => `${ciclo}/${cd}/config/mun-e${pad(cd, 6)}-cm.json`,
  foto: (ciclo: string, cd: string, uf: string, sq: string) => `${ciclo}/${cd}/fotos/${uf.toLowerCase()}/${sq}.jpeg`,
}

export type ParsedPath =
  | { kind: 'config' }
  | { kind: 'u'; cd: string; uf: string; cargoCodigo: string }
  | { kind: 'ab'; cd: string; uf: string }
  | { kind: 'mun'; cd: string }

export function parsePath(p: string): ParsedPath | null {
  if (p === 'comum/config/ele-c.json') return { kind: 'config' }
  let m = /^[^/]+\/(\d+)\/dados\/([a-z]{2})\/\2-c(\d{4})-e\d{6}-u\.json$/.exec(p)
  if (m) return { kind: 'u', cd: m[1]!, uf: m[2]!, cargoCodigo: String(Number(m[3])) }
  m = /^[^/]+\/(\d+)\/dados\/([a-z]{2})\/\2-e\d{6}-ab\.json$/.exec(p)
  if (m) return { kind: 'ab', cd: m[1]!, uf: m[2]! }
  m = /^[^/]+\/(\d+)\/config\/mun-e\d{6}-cm\.json$/.exec(p)
  if (m) return { kind: 'mun', cd: m[1]! }
  return null
}
