import * as Popover from '@radix-ui/react-popover'
import clsx from 'clsx'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronDown, CircleDashed, Clock, Inbox, Minus, RefreshCw, Search, Trophy, X, Flag } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Candidato, StatusCandidato } from '@tse/shared'
import { useApp } from '../lib/app-state'
import { fmtInt, fmtSigned, iniciais, semAcento, STATUS_LABEL } from '../lib/format'

// ---------- números ----------

/** Conta de forma suave até o novo valor (respeita prefers-reduced-motion). */
export function CountUp({ value, format = fmtInt, ms = 700 }: { value: number; format?: (n: number) => string; ms?: number }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (reduce || from.current === value) { setShown(value); from.current = value; return }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms)
      const e = 1 - (1 - p) ** 3
      const cur = a + (value - a) * e
      setShown(cur)
      from.current = cur
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms, reduce])
  return <span className="num">{format(shown)}</span>
}

/** Variação desde a última atualização: seta + sinal + texto (não depende só de cor). */
export function Delta({ pct, votos, pos, compact }: { pct?: number; votos?: number; pos?: number; compact?: boolean }) {
  const reduce = useReducedMotion()
  const v = pct ?? 0
  if (!pct && !pos && !votos) return null
  const up = v > 0.0049 || (pos ?? 0) > 0
  const down = v < -0.0049 || (pos ?? 0) < 0
  if (!up && !down) return null
  const Icon = up && !down ? ArrowUp : ArrowDown
  return (
    <motion.span
      key={`${pct}-${votos}-${pos}`}
      initial={reduce ? false : { opacity: 0, y: up ? 6 : -6 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx('num inline-flex items-center gap-0.5 text-xs font-semibold', up && !down ? 'text-ok' : 'text-bad')}
      title={`${fmtSigned(v)} p.p. e ${fmtSigned(votos ?? 0, 0)} votos desde a última atualização${pos ? `; ${pos > 0 ? 'subiu' : 'caiu'} ${Math.abs(pos)} posição(ões)` : ''}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {compact ? fmtSigned(v) : `${fmtSigned(v)} p.p.`}
      <span className="sr-only"> desde a última atualização</span>
    </motion.span>
  )
}

// ---------- identidade ----------

export function Avatar({ c, size = 44, ring = true }: { c: Pick<Candidato, 'foto' | 'nome' | 'cor'>; size?: number; ring?: boolean }) {
  const [erro, setErro] = useState(false)
  useEffect(() => setErro(false), [c.foto])
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-raised font-display text-xs font-bold text-soft"
      style={{ width: size, height: size, boxShadow: ring ? `0 0 0 2px rgb(var(--surface)), 0 0 0 4px ${c.cor}` : undefined, fontSize: size * 0.3 }}
      aria-hidden
    >
      {c.foto && !erro ? (
        <img src={c.foto} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setErro(true)} />
      ) : (
        iniciais(c.nome)
      )}
    </span>
  )
}

const STATUS_ICON: Record<StatusCandidato, typeof Check> = { eleito: Trophy, 'segundo-turno': Flag, 'em-apuracao': Clock, 'nao-eleito': Minus, suplente: CircleDashed }
const STATUS_COR: Record<StatusCandidato, string> = {
  eleito: 'border-ok/50 bg-ok/10 text-ok', 'segundo-turno': 'border-info/50 bg-info/10 text-info', 'em-apuracao': 'border-line text-mute',
  'nao-eleito': 'border-line text-mute', suplente: 'border-warn/40 bg-warn/10 text-warn',
}
export function StatusBadge({ s, titulo }: { s: StatusCandidato; titulo?: string }) {
  const Icon = STATUS_ICON[s]
  return (
    <span title={titulo} className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold', STATUS_COR[s])}>
      <Icon className="h-3 w-3" aria-hidden />
      {STATUS_LABEL[s]}
    </span>
  )
}

// ---------- estados ----------

export const Skeleton = ({ className }: { className?: string }) => <div className={clsx('skel', className)} aria-hidden />

export function EmptyState({ icon, titulo, texto, acao }: { icon?: ReactNode; titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center" role="status">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-raised text-mute">{icon ?? <Inbox className="h-6 w-6" aria-hidden />}</div>
      <h3 className="font-display text-lg font-semibold">{titulo}</h3>
      {texto && <p className="max-w-md text-sm text-soft">{texto}</p>}
      {acao}
    </div>
  )
}

export function ErrorState({ titulo = 'Não foi possível carregar', texto, onRetry }: { titulo?: string; texto?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center" role="alert">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-bad/10 text-bad"><AlertTriangle className="h-6 w-6" aria-hidden /></div>
      <h3 className="font-display text-lg font-semibold">{titulo}</h3>
      {texto && <p className="max-w-md text-sm text-soft">{texto}</p>}
      {onRetry && <button className="btn" onClick={onRetry}><RefreshCw className="h-4 w-4" aria-hidden />Tentar novamente</button>}
    </div>
  )
}

// ---------- toasts ----------

export function Toasts() {
  const { toasts, fechaToast } = useApp()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite" role="status">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border border-line bg-raised px-4 py-2.5 text-sm shadow-xl"
          >
            <span>{t.msg}</span>
            {t.acao && (
              <button className="whitespace-nowrap font-semibold text-info underline-offset-2 hover:underline" onClick={() => { t.acao!.fn(); fechaToast(t.id) }}>
                {t.acao.rotulo}
              </button>
            )}
            <button aria-label="Fechar aviso" className="text-mute hover:text-ink" onClick={() => fechaToast(t.id)}><X className="h-4 w-4" /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// ---------- combobox com busca ----------

export interface Opcao { valor: string; rotulo: string; sub?: string }

export function Combobox({
  rotulo, valor, opcoes, onChange, placeholder, vazio, disabled, permiteLimpar, className,
}: {
  rotulo: string; valor: string; opcoes: Opcao[]; onChange: (v: string) => void
  placeholder: string; vazio?: string; disabled?: boolean; permiteLimpar?: boolean; className?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [q, setQ] = useState('')
  const [ativo, setAtivo] = useState(0)
  const lista = useMemo(() => {
    const n = semAcento(q)
    return opcoes.filter((o) => !n || semAcento(`${o.rotulo} ${o.sub ?? ''} ${o.valor}`).includes(n))
  }, [opcoes, q])
  const atual = opcoes.find((o) => o.valor === valor)
  useEffect(() => setAtivo(0), [q, aberto])

  const escolhe = (v: string) => { onChange(v); setAberto(false); setQ('') }
  return (
    <Popover.Root open={aberto} onOpenChange={(o) => { setAberto(o); if (!o) setQ('') }}>
      <Popover.Trigger asChild disabled={disabled}>
        <button className={clsx('btn min-w-0 justify-between gap-2 disabled:opacity-50', className)} aria-label={`${rotulo}: ${atual?.rotulo ?? placeholder}`}>
          <span className="truncate text-left"><span className="mr-1.5 text-mute">{rotulo}</span>{atual?.rotulo ?? placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-mute" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} align="start" className="z-[80] w-72 rounded-xl border border-line bg-surface p-2 shadow-2xl" onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).querySelector('input')?.focus() }}>
          <label className="relative block">
            <span className="sr-only">Buscar {rotulo}</span>
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-mute" aria-hidden />
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" role="combobox" aria-expanded aria-controls="lista-opcoes"
              className="w-full rounded-lg border border-line bg-raised py-2 pl-8 pr-2 text-sm outline-none focus:border-info"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => Math.min(lista.length - 1, a + 1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(0, a - 1)) }
                else if (e.key === 'Enter' && lista[ativo]) { e.preventDefault(); escolhe(lista[ativo]!.valor) }
              }}
            />
          </label>
          <ul id="lista-opcoes" role="listbox" aria-label={rotulo} className="scroll-thin mt-2 max-h-64 overflow-auto">
            {permiteLimpar && valor && (
              <li><button className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-mute hover:bg-raised" onClick={() => escolhe('')}>Limpar seleção</button></li>
            )}
            {lista.length === 0 && <li className="px-2.5 py-3 text-sm text-mute">{vazio ?? 'Nada encontrado'}</li>}
            {lista.map((o, i) => (
              <li key={o.valor} role="option" aria-selected={o.valor === valor}>
                <button
                  onClick={() => escolhe(o.valor)} onMouseEnter={() => setAtivo(i)}
                  className={clsx('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm', i === ativo && 'bg-raised')}
                >
                  <span className="truncate">{o.rotulo}{o.sub && <span className="ml-2 text-xs text-mute">{o.sub}</span>}</span>
                  {o.valor === valor && <Check className="h-4 w-4 text-ok" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function Card({ titulo, direita, children, className }: { titulo?: string; direita?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('card p-4 sm:p-5', className)}>
      {(titulo || direita) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {titulo && <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-soft">{titulo}</h2>}
          {direita}
        </header>
      )}
      {children}
    </section>
  )
}
