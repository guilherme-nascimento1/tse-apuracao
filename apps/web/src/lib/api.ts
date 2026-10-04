import type {
  CargoId, ConfigApi, DetalheCandidato, Historico, MunicipioInfo, MunicipioPanorama, Ranking, Resultado, Resumo,
} from '@tse/shared'

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly detalhe?: string) {
    super(message)
  }
}

async function getJson<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor')
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { erro?: string; detalhe?: string }
    throw new ApiError(res.status, body.erro ?? `Erro ${res.status}`, body.detalhe)
  }
  return res.json() as Promise<T>
}

const qs = (o: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]).toString()

export const api = {
  config: () => getJson<ConfigApi>('/api/config'),
  resultado: (cargo: CargoId, uf?: string) => getJson<Resultado>(`/api/resultado?${qs({ cargo, uf })}`),
  resumo: (cargo: CargoId) => getJson<Resumo>(`/api/resumo?${qs({ cargo })}`),
  ranking: (cargo: CargoId, escopo: 'brasil' | 'regiao' | 'uf', extra?: { regiao?: string; uf?: string }) =>
    getJson<Ranking>(`/api/ranking?${qs({ cargo, escopo, ...extra })}`),
  historico: (cargo: CargoId, uf?: string) => getJson<Historico>(`/api/historico?${qs({ cargo, uf })}`),
  candidato: (cargo: CargoId, sq: string, uf?: string) => getJson<DetalheCandidato>(`/api/candidato?${qs({ cargo, sq, uf })}`),
  municipios: (uf: string) => getJson<MunicipioInfo[]>(`/api/municipios?${qs({ uf })}`),
  municipio: (uf: string, codigo: string) => getJson<MunicipioPanorama>(`/api/municipio?${qs({ uf, codigo })}`),
}
