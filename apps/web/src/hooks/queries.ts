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
  return { cargo: cargoEfetivo(f), uf: f.cargo === 'presidente' ? undefined : f.uf }
}

export function useResultado() {
  const { cargo, uf } = useCargo()
  const refetchInterval = usePoll()
  return useQuery({ queryKey: ['resultado', cargo, uf], queryFn: () => api.resultado(cargo, uf), refetchInterval, placeholderData: keepPreviousData })
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
  const { cargo, uf } = useCargo()
  const refetchInterval = usePoll()
  return useQuery({ queryKey: ['historico', cargo, uf], queryFn: () => api.historico(cargo, uf), refetchInterval, placeholderData: keepPreviousData })
}

export function useMunicipios(uf: string) {
  return useQuery({ queryKey: ['municipios', uf], queryFn: () => api.municipios(uf), enabled: !!uf, staleTime: 3600_000 })
}

export function useMunicipio(uf: string, codigo: string) {
  const refetchInterval = usePoll()
  return useQuery({ queryKey: ['municipio', uf, codigo], queryFn: () => api.municipio(uf, codigo), enabled: !!uf && !!codigo, refetchInterval })
}

export function useDetalhe(sq: string) {
  const { cargo, uf } = useCargo()
  return useQuery({ queryKey: ['detalhe', cargo, uf, sq], queryFn: () => api.candidato(cargo, sq, uf), enabled: !!sq })
}

/** SSE: o backend avisa quando um arquivo muda; o polling continua como fallback. */
export function useAtualizacoesAoVivo() {
  const qc = useQueryClient()
  const { pausado } = useApp()
  useEffect(() => {
    if (pausado || typeof EventSource === 'undefined') return
    const es = new EventSource('/api/events')
    let t: ReturnType<typeof setTimeout> | undefined
    es.addEventListener('update', () => {
      clearTimeout(t) // agrupa rajadas de eventos
      t = setTimeout(() => {
        for (const k of ['resultado', 'resumo', 'ranking', 'historico', 'municipio']) void qc.invalidateQueries({ queryKey: [k] })
      }, 400)
    })
    return () => { clearTimeout(t); es.close() }
  }, [pausado, qc])
}
