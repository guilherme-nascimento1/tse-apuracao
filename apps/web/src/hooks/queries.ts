import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/app-state'
import { cargoEfetivo } from '../lib/filtros'

/** Config é estável; o resto faz polling enquanto não estiver pausado. */
export function useConfig() {
  return useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: 60_000, refetchInterval: 120_000 })
}

function usePoll() {
  const { pausado } = useApp()
  const { data } = useConfig()
  return pausado ? false : (data?.pollIntervalSeg ?? 30) * 1000
}

export function useCargo() {
  const { f } = useApp()
  const uf = f.cargo === 'presidente' ? undefined : f.uf || undefined
  // região sem estado = soma dos estados da região
  return { cargo: cargoEfetivo(f), uf, regiao: uf ? undefined : f.regiao || undefined }
}

export function useResultado() {
  const { cargo, uf, regiao } = useCargo()
  const refetchInterval = usePoll()
  return useQuery({ queryKey: ['resultado', cargo, uf, regiao], queryFn: () => api.resultado(cargo, uf, regiao), refetchInterval, placeholderData: keepPreviousData })
}

export function useResumo() {
  const { cargo } = useCargo()
  const refetchInterval = usePoll()
  return useQuery({ queryKey: ['resumo', cargo], queryFn: () => api.resumo(cargo), refetchInterval, placeholderData: keepPreviousData })
}

export function useRanking() {
  const { f } = useApp()
  const { cargo } = useCargo()
  const refetchInterval = usePoll()
  return useQuery({
    queryKey: ['ranking', f.cargo],
    queryFn: () => api.ranking(f.cargo, 'brasil'),
    refetchInterval: refetchInterval ? refetchInterval * 2 : false,
    placeholderData: keepPreviousData,
    enabled: !!f,
  })
}

export function useHistorico() {
  const { cargo, uf, regiao } = useCargo()
  const refetchInterval = usePoll()
  return useQuery({ queryKey: ['historico', cargo, uf, regiao], queryFn: () => api.historico(cargo, uf, regiao), refetchInterval, placeholderData: keepPreviousData })
}

export function useMunicipios(uf: string) {
  return useQuery({ queryKey: ['municipios', uf], queryFn: () => api.municipios(uf), enabled: !!uf, staleTime: 3600_000 })
}

export function useMunicipio(uf: string, codigo: string) {
  const refetchInterval = usePoll()
  return useQuery({ queryKey: ['municipio', uf, codigo], queryFn: () => api.municipio(uf, codigo), enabled: !!uf && !!codigo, refetchInterval })
}

export function useDetalhe(sq: string) {
  const { cargo, uf, regiao } = useCargo()
  return useQuery({ queryKey: ['detalhe', cargo, uf, regiao, sq], queryFn: () => api.candidato(cargo, sq, uf, regiao), enabled: !!sq })
}

/** SSE: o backend avisa quando um arquivo muda; o polling continua como fallback. */
export function useAtualizacoesAoVivo() {
  const qc = useQueryClient()
  const { pausado } = useApp()
  const { data: cfg } = useConfig()
  const sse = cfg?.sse === true
  useEffect(() => {
    if (!sse || pausado || typeof EventSource === 'undefined') return
    const es = new EventSource('/api/events')
    let t: ReturnType<typeof setTimeout> | undefined
    es.addEventListener('update', () => {
      clearTimeout(t) // agrupa rajadas de eventos
      t = setTimeout(() => {
        for (const k of ['resultado', 'resumo', 'ranking', 'historico', 'municipio']) void qc.invalidateQueries({ queryKey: [k] })
      }, 400)
    })
    return () => { clearTimeout(t); es.close() }
  }, [sse, pausado, qc])
}
