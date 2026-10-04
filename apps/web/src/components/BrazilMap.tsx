import clsx from 'clsx'
import { useMemo, useRef, useState } from 'react'
import type { LiderUf } from '@tse/shared'
import { ufBySigla } from '@tse/shared'
import geo from '../data/br-ufs.json'
import { useRanking } from '../hooks/queries'
import { useApp } from '../lib/app-state'
import { fmtPct, STATUS_LABEL } from '../lib/format'
import { nomeCargo } from '../lib/filtros'
import { Card, EmptyState, ErrorState, Skeleton } from './ui'

type GeoUf = { nome: string; regiao: string; path: string; cx: number; cy: number }
const UFS_GEO = geo.ufs as Record<string, GeoUf>

export function BrazilMap() {
  const { f, set, toast } = useApp()
  const { data, isLoading, isError, refetch } = useRanking()
  const [hover, setHover] = useState<{ uf: string; x: number; y: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const porUf = useMemo(() => new Map((data?.ufs ?? []).map((u) => [u.uf, u])), [data])

  const lideres = useMemo(() => {
    const m = new Map<string, { sq: string; nome: string; partido: string; cor: string; n: number }>()
    for (const u of data?.ufs ?? []) if (u.lider) {
      const k = u.lider.sq
      const e = m.get(k) ?? { sq: k, nome: u.lider.nome, partido: u.lider.partido, cor: u.lider.cor, n: 0 }
      e.n++
      m.set(k, e)
    }
    return [...m.values()].sort((a, b) => b.n - a.n)
  }, [data])

  const clica = (uf: string) => {
    if (f.cargo === 'presidente') {
      toast('Presidente só tem escopo Brasil. Quer ver outro cargo neste estado?', {
        rotulo: `Governador · ${uf}`, fn: () => set({ cargo: 'governador', uf }),
      })
      return
    }
    set({ uf })
  }

  const tip = hover ? porUf.get(hover.uf) : undefined
  const titulo = `Líder por estado · ${nomeCargo(f)}`
  const totalNaoIni = data?.ufs.filter((u) => u.estado === 'nao-iniciada').length ?? 0

  return (
    <Card titulo={titulo}>
      {isLoading ? <Skeleton className="aspect-square w-full" /> : isError ? (
        <ErrorState texto="Não foi possível montar o mapa agora." onRetry={() => void refetch()} />
      ) : !data || data.ufs.every((u) => !u.lider) ? (
        <EmptyState titulo="Mapa aguardando a apuração" texto="Assim que o TSE publicar os primeiros resultados por estado, o líder de cada UF aparece aqui." />
      ) : (
        <>
          <div ref={box} className="relative mx-auto max-w-[440px]">
            <svg viewBox={`0 0 ${geo.width} ${geo.height}`} className="h-auto w-full" role="group" aria-label={titulo}>
              {Object.entries(UFS_GEO).map(([uf, g]) => {
                const d = porUf.get(uf)
                const fora = !!f.regiao && f.regiao !== 'brasil' && g.regiao.toLowerCase() !== f.regiao
                const sel = f.uf === uf && f.cargo !== 'presidente'
                const desc = d?.lider ? `${d.lider.nome}, ${d.lider.partido}, ${fmtPct(d.lider.pct, 1)}` : 'sem resultado'
                return (
                  <g
                    key={uf} tabIndex={0} role="button" aria-label={`${g.nome}: ${desc}${sel ? ' (selecionado)' : ''}`} className="cursor-pointer outline-none"
                    style={{ opacity: fora ? 0.3 : 1, transition: 'opacity .2s' }}
                    onClick={() => clica(uf)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clica(uf) } }}
                    onMouseMove={(e) => { const r = box.current!.getBoundingClientRect(); setHover({ uf, x: e.clientX - r.left, y: e.clientY - r.top }) }}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover({ uf, x: (g.cx / geo.width) * (box.current?.clientWidth ?? 0), y: (g.cy / geo.height) * (box.current?.clientHeight ?? 0) })}
                    onBlur={() => setHover(null)}
                  >
                    <path
                      d={g.path} fill={d?.lider ? d.lider.cor : 'rgb(var(--raised))'}
                      stroke={sel ? 'rgb(var(--ink))' : 'rgb(var(--surface))'} strokeWidth={sel ? 3 : 1.2} strokeLinejoin="round"
                      strokeDasharray={d?.lider ? undefined : '3 3'} className="transition-[fill] duration-500 hover:brightness-110"
                    />
                    <text x={g.cx} y={g.cy} textAnchor="middle" dominantBaseline="central" className="pointer-events-none select-none" fontSize={uf === 'DF' || uf === 'SE' || uf === 'AL' || uf === 'RN' || uf === 'PB' ? 0 : 13} fontWeight={700}
                      fill={d?.lider ? '#0b0f14' : 'rgb(var(--mute))'} style={{ paintOrder: 'stroke', stroke: d?.lider ? 'rgba(255,255,255,.35)' : 'none', strokeWidth: 2 }}>
                      {uf}
                    </text>
                  </g>
                )
              })}
            </svg>
            {hover && <MapTip x={hover.x} y={hover.y} uf={hover.uf} d={tip} />}
          </div>

          <ul className="mt-4 space-y-1.5 text-sm" aria-label="Legenda: líderes e número de estados">
            {lideres.slice(0, 6).map((l) => (
              <li key={l.sq} className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded" style={{ background: l.cor }} aria-hidden />
                <span className="flex-1 truncate">{l.nome} <span className="text-xs text-mute">{l.partido}</span></span>
                <span className="num font-semibold">{l.n} {l.n === 1 ? 'UF' : 'UFs'}</span>
              </li>
            ))}
            {lideres.length > 6 && <li className="text-xs text-mute">+ {lideres.length - 6} outros</li>}
          </ul>
          {totalNaoIni > 0 && <p className="mt-2 text-xs text-mute">{totalNaoIni} UF(s) ainda sem resultado (tracejadas).</p>}
        </>
      )}
    </Card>
  )
}

function MapTip({ x, y, uf, d }: { x: number; y: number; uf: string; d?: LiderUf }) {
  const g = UFS_GEO[uf]!
  return (
    <div className={clsx('pointer-events-none absolute z-10 w-52 rounded-lg border border-line bg-raised p-2.5 text-xs shadow-xl')} style={{ left: Math.min(x + 12, 230), top: Math.max(0, y - 8) }} role="tooltip">
      <div className="font-display text-sm font-bold">{g.nome} <span className="text-mute">{uf}</span></div>
      {d?.lider ? (
        <>
          <div className="mt-1 flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded" style={{ background: d.lider.cor }} /><span className="truncate font-semibold">{d.lider.nome}</span></div>
          <div className="num mt-0.5 text-soft">{fmtPct(d.lider.pct)} · {d.lider.partido}{d.lider.status !== 'em-apuracao' && d.lider.status !== 'nao-eleito' ? ` · ${STATUS_LABEL[d.lider.status]}` : ''}</div>
          {d.segundo && <div className="num text-mute">2º: {d.segundo.nome} ({fmtPct(d.segundo.pct, 1)})</div>}
          <div className="num mt-1 text-mute">{fmtPct(d.pctSecoes, 1)} das seções</div>
        </>
      ) : <div className="mt-1 text-mute">Sem resultado ainda</div>}
    </div>
  )
}
