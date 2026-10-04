import clsx from 'clsx'
import { motion, useReducedMotion } from 'framer-motion'
import type { Resultado } from '@tse/shared'
import { useApp } from '../lib/app-state'
import { fmtPct } from '../lib/format'
import { Avatar, CountUp, Delta, StatusBadge } from './ui'

const MEDALHA = ['1º', '2º', '3º']

export function TopCards({ r }: { r: Resultado }) {
  const { set } = useApp()
  const reduce = useReducedMotion()
  const top = r.candidatos.slice(0, 3)
  const regional = r.abrangencia.tipo === 'regiao'
  const naoIniciada = r.estado === 'nao-iniciada' || (regional && r.cargo === 'presidente')
  if (!top.length) return null
  return (
    <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Três mais votados">
      {top.map((c, i) => (
        <motion.li
          key={c.sq} layout={!reduce} transition={{ type: 'spring', stiffness: 360, damping: 32 }}
          className={clsx('card relative overflow-hidden', i === 0 && 'sm:scale-[1.02]')}
        >
          <button onClick={() => set({ cand: c.sq })} className="block w-full p-4 text-left sm:p-5" aria-label={`${MEDALHA[i]} colocado: ${c.nome}. Ver detalhes`}>
            <span className="absolute inset-x-0 top-0 h-1" style={{ background: c.cor }} aria-hidden />
            <div className="flex items-center gap-3">
              <Avatar c={c} size={i === 0 ? 60 : 52} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-display text-xs font-bold text-mute">{MEDALHA[i]}</span>
                  {!naoIniciada && <StatusBadge s={c.status} />}
                </div>
                <div className="truncate font-display text-base font-bold leading-tight">{c.nome}</div>
                <div className="truncate text-xs text-mute"><span className="num">{c.numero}</span> · {c.partido}{regional && c.uf ? ` · ${c.uf}` : ''}</div>
              </div>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div className="font-display text-4xl font-extrabold leading-none tracking-tight"><CountUp value={c.pct} format={(n) => fmtPct(n)} /></div>
              <div className="text-right">
                <div className="num text-sm font-semibold text-soft"><CountUp value={c.votos} /></div>
                <div className="text-[11px] text-mute">votos</div>
              </div>
            </div>
            <div className="mt-2 h-4"><Delta pct={c.deltaPct} votos={c.deltaVotos} pos={c.deltaPos} /></div>
          </button>
        </motion.li>
      ))}
    </ol>
  )
}
