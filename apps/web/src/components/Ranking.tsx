import { useVirtualizer } from '@tanstack/react-virtual'
import clsx from 'clsx'
import { motion, useReducedMotion } from 'framer-motion'
import { GitCompareArrows, SearchX } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { Candidato, Resultado } from '@tse/shared'
import { useApp } from '../lib/app-state'
import { fmtInt, fmtPct, semAcento } from '../lib/format'
import { Avatar, Card, CountUp, Delta, EmptyState, StatusBadge } from './ui'

const VIRTUAL_A_PARTIR_DE = 60
const ALTURA = 76

/** Pisca a linha quando os votos mudam. */
function useFlash(votos: number) {
  const prev = useRef(votos)
  const [n, setN] = useState(0)
  useEffect(() => {
    if (prev.current !== votos) { prev.current = votos; setN((x) => x + 1) }
  }, [votos])
  return n
}

interface LinhaProps { c: Candidato; pos: number; max: number; comparando: boolean; vagas: number; naoIniciada: boolean; onAbrir: (sq: string) => void; onComparar: (sq: string) => void; animar: boolean; estilo?: React.CSSProperties }

const Linha = memo(function Linha({ c, pos, max, comparando, vagas, naoIniciada, onAbrir, onComparar, animar, estilo }: LinhaProps) {
  const flash = useFlash(c.votos)
  const reduce = useReducedMotion()
  const largura = max > 0 ? Math.max(c.pct > 0 ? 1.5 : 0, (c.pct / max) * 100) : 0
  const Wrapper = animar ? motion.li : 'li'
  const extra = animar ? { layout: reduce ? false : ('position' as const), transition: { type: 'spring', stiffness: 380, damping: 34 } } : {}
  return (
    <Wrapper
      {...(extra as object)}
      style={estilo}
      className={clsx('group relative list-none border-b border-line/70 px-1 last:border-0', flash > 0 && (flash % 2 ? 'flash' : 'flash2'))}
    >
      <div className="flex items-center gap-3 py-2.5 sm:gap-4">
        <span className={clsx('num w-7 shrink-0 text-center font-display text-base font-bold', pos <= vagas && !naoIniciada ? 'text-ink' : 'text-mute')} aria-label={`Posição ${pos}`}>{pos}</span>
        <button onClick={() => onAbrir(c.sq)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left" aria-label={`Ver detalhes de ${c.nome}`}>
          <Avatar c={c} size={42} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="truncate font-semibold">{c.nome}</span>
              {c.situacao !== 'Válido' && <span className="rounded border border-warn/40 px-1 text-[10px] font-semibold text-warn" title="Situação informada pelo TSE">{c.situacao}</span>}
            </span>
            <span className="block truncate text-xs text-mute">
              <span className="num">{c.numero}</span> · <span title={c.partidoNome}>{c.partido}</span>{c.federacao ? ` · ${c.federacao}` : ''}{c.vice ? ` · vice ${c.vice}` : ''}
            </span>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden>
              <span className="block h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${largura}%`, background: c.cor }} />
            </span>
          </span>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
          <span className="font-display text-lg font-bold leading-none sm:text-xl"><CountUp value={c.pct} format={(n) => fmtPct(n)} /></span>
          <span className="text-xs text-soft"><CountUp value={c.votos} /> votos</span>
          <span className="flex items-center gap-1.5">
            <Delta pct={c.deltaPct} votos={c.deltaVotos} pos={c.deltaPos} compact />
            {!naoIniciada && <StatusBadge s={c.status} />}
          </span>
        </div>
        <button
          onClick={() => onComparar(c.sq)} aria-pressed={comparando} aria-label={comparando ? `Remover ${c.nome} da comparação` : `Comparar ${c.nome}`} title="Comparar"
          className={clsx('hidden rounded-lg border p-1.5 transition-colors sm:block', comparando ? 'border-info bg-info/15 text-info' : 'border-line text-mute opacity-0 hover:text-ink focus:opacity-100 group-hover:opacity-100')}
        >
          <GitCompareArrows className="h-4 w-4" />
        </button>
      </div>
    </Wrapper>
  )
})

export function filtraCandidatos(r: Resultado | undefined, q: string, partido: string) {
  if (!r) return []
  const n = semAcento(q.trim())
  return r.candidatos
    .map((c, i) => ({ c, pos: i + 1 }))
    .filter(({ c }) => (!partido || c.partido === partido) && (!n || semAcento(`${c.nome} ${c.numero} ${c.partido} ${c.partidoNome} ${c.federacao ?? ''}`).includes(n)))
}

export function Ranking({ r, titulo }: { r: Resultado; titulo: string }) {
  const { f, set, alternaComparar } = useApp()
  const lista = useMemo(() => filtraCandidatos(r, f.q, f.partido), [r, f.q, f.partido])
  const max = r.candidatos[0]?.pct ?? 0
  const virtual = lista.length > VIRTUAL_A_PARTIR_DE
  const naoIniciada = r.estado === 'nao-iniciada'
  const abrir = (sq: string) => set({ cand: sq })

  return (
    <Card
      titulo={titulo}
      direita={<span className="text-xs text-mute">{lista.length === r.candidatos.length ? `${fmtInt(r.candidatos.length)} candidatos` : `${fmtInt(lista.length)} de ${fmtInt(r.candidatos.length)}`}{r.vagas > 1 ? ` · ${r.vagas} vagas` : ''}</span>}
    >
      {lista.length === 0 ? (
        <EmptyState
          icon={<SearchX className="h-6 w-6" />} titulo="Nenhum candidato encontrado" texto="Ajuste a busca ou o filtro de partido."
          acao={<button className="btn" onClick={() => set({ q: '', partido: '' })}>Limpar busca e partido</button>}
        />
      ) : virtual ? (
        <ListaVirtual lista={lista} max={max} r={r} naoIniciada={naoIniciada} abrir={abrir} />
      ) : (
        <ul aria-label={titulo}>
          {lista.map(({ c, pos }) => (
            <Linha key={c.sq} c={c} pos={pos} max={max} vagas={r.vagas} naoIniciada={naoIniciada} comparando={f.cmp.includes(c.sq)} onAbrir={abrir} onComparar={alternaComparar} animar />
          ))}
        </ul>
      )}
    </Card>
  )
}

function ListaVirtual({ lista, max, r, naoIniciada, abrir }: { lista: { c: Candidato; pos: number }[]; max: number; r: Resultado; naoIniciada: boolean; abrir: (sq: string) => void }) {
  const { f, alternaComparar } = useApp()
  const ref = useRef<HTMLDivElement>(null)
  const v = useVirtualizer({ count: lista.length, getScrollElement: () => ref.current, estimateSize: () => ALTURA, overscan: 8, getItemKey: (i) => lista[i]!.c.sq })
  return (
    <div ref={ref} className="scroll-thin max-h-[70vh] overflow-auto" role="list" aria-label="Ranking de candidatos (lista virtualizada)">
      <div style={{ height: v.getTotalSize(), position: 'relative' }}>
        {v.getVirtualItems().map((vi) => {
          const { c, pos } = lista[vi.index]!
          return (
            <Linha
              key={c.sq} c={c} pos={pos} max={max} vagas={r.vagas} naoIniciada={naoIniciada} comparando={f.cmp.includes(c.sq)} onAbrir={abrir} onComparar={alternaComparar} animar={false}
              estilo={{ position: 'absolute', top: 0, left: 0, right: 0, height: vi.size, transform: `translateY(${vi.start}px)` }}
            />
          )
        })}
      </div>
    </div>
  )
}
