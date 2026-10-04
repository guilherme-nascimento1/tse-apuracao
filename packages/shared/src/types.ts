export type CargoId = 'presidente' | 'governador' | 'senador' | 'deputado-federal' | 'deputado-estadual' | 'deputado-distrital'
export type Regiao = 'norte' | 'nordeste' | 'centro-oeste' | 'sudeste' | 'sul'
export type Modo = 'mock' | 'simulado' | 'oficial'

/** nao-iniciada: arquivo inexistente ou 0% das seções; em-apuracao; encerrada: totalização final */
export type EstadoApuracao = 'nao-iniciada' | 'em-apuracao' | 'encerrada'
export type StatusCandidato = 'eleito' | 'segundo-turno' | 'em-apuracao' | 'nao-eleito' | 'suplente'

export interface Candidato {
  sq: string
  numero: string
  nome: string
  partido: string
  partidoNome: string
  federacao?: string
  votos: number
  /** % dos votos válidos (0-100) */
  pct: number
  status: StatusCandidato
  /** situação informada pelo TSE (Válido, Anulado, ...) */
  situacao: string
  vice?: string
  suplentes?: string[]
  foto?: string
  cor: string
  /** variação desde a última atualização */
  deltaPct?: number
  deltaVotos?: number
  deltaPos?: number
}

export interface Secoes { total: number; totalizadas: number; pct: number }
export interface Comparecimento { eleitores: number; compareceram: number; pctComparecimento: number; abstencoes: number; pctAbstencao: number }
export interface Votos { total: number; validos: number; nominais: number; legenda: number; brancos: number; nulos: number; pctValidos: number; pctBrancos: number; pctNulos: number }

export interface Resultado {
  cargo: CargoId
  abrangencia: { tipo: 'br' | 'uf'; codigo: string }
  eleicao: string
  turno: number
  estado: EstadoApuracao
  vagas: number
  secoes: Secoes
  comparecimento: Comparecimento
  votos: Votos
  candidatos: Candidato[]
  /** ISO do arquivo do TSE (dt+ht) */
  atualizadoTse: string | null
  /** ISO de quando o backend coletou */
  coletadoEm: string
  /** presente se estamos servindo dado antigo por falha na fonte */
  defasagemSeg?: number
  versao: string
}

export interface ResumoUf { uf: string; estado: EstadoApuracao; secoes: Secoes; comparecimento: Comparecimento }
export interface Resumo {
  cargo: CargoId
  eleicao: string
  turno: number
  estado: EstadoApuracao
  secoes: Secoes
  comparecimento: Comparecimento
  ufs: ResumoUf[]
  atualizadoTse: string | null
  coletadoEm: string
  defasagemSeg?: number
}

export interface LiderUf {
  uf: string
  estado: EstadoApuracao
  pctSecoes: number
  lider?: { sq: string; nome: string; partido: string; cor: string; pct: number; votos: number; status: StatusCandidato }
  segundo?: { nome: string; pct: number }
}
export interface Ranking {
  cargo: CargoId
  escopo: 'brasil' | 'regiao' | 'uf'
  ufs: LiderUf[]
  coletadoEm: string
}

export interface PontoHistorico { t: string; pctSecoes: number; c: { sq: string; pct: number; votos: number }[] }
export interface Historico {
  cargo: CargoId
  abrangencia: string
  candidatos: { sq: string; nome: string; partido: string; cor: string }[]
  pontos: PontoHistorico[]
}

export interface VotosPorUf { uf: string; votos: number; pct: number; posicao: number; estado: EstadoApuracao }
export interface DetalheCandidato {
  cargo: CargoId
  candidato: Candidato
  posicao: number
  porUf: VotosPorUf[]
  observacao?: string
}

export interface MunicipioInfo { codigo: string; nome: string }
export interface MunicipioPanorama {
  codigo: string
  nome: string
  uf: string
  estado: EstadoApuracao
  secoes: Secoes
  comparecimento: Comparecimento
  atualizadoTse: string | null
}

export interface ConfigApi {
  modo: Modo
  eleicao: { ciclo: string; turno: number; disponivel: boolean; mensagem?: string; porCargo: Partial<Record<CargoId, string>> }
  cargos: { id: CargoId; nome: string; escopo: 'br' | 'uf'; proporcional: boolean; disponivel: boolean }[]
  regioes: { id: Regiao; nome: string }[]
  ufs: { sigla: string; nome: string; regiao: Regiao }[]
  pollIntervalSeg: number
  /** push por SSE disponível (false em serverless) */
  sse: boolean
  geradoEm: string
}

export interface ApiErro { erro: string; detalhe?: string }
