import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { CheckCircle2, Moon, Pause, Play, RefreshCw, Sun, TimerReset, WifiOff } from 'lucide-react'
import { useConfig, useResultado } from '../hooks/queries'
import { useApp } from '../lib/app-state'
import { fmtPct, horaLocal, tempoRelativo } from '../lib/format'

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill="rgb(var(--raised))" />
        <rect x="6" y="17" width="4.5" height="9" rx="1.5" fill="#4ade80" />
        <rect x="13.75" y="10" width="4.5" height="16" rx="1.5" fill="#facc15" />
        <rect x="21.5" y="13" width="4.5" height="13" rx="1.5" fill="#60a5fa" />
      </svg>
      <div className="hidden leading-tight sm:block">
        <div className="font-display text-[15px] font-bold tracking-tight">Apuração 2026</div>
        <div className="hidden text-[11px] text-mute sm:block">Painel de resultados · fonte TSE</div>
      </div>
    </div>
  )
}

export function Header() {
  const { pausado, setPausado, tema, alternaTema, agora } = useApp()
  const { data: cfg } = useConfig()
  const { data: r, isError, error } = useResultado()
  const qc = useQueryClient()
  const buscando = useIsFetching() > 0

  const estado = r?.estado
  const defasado = (r?.defasagemSeg ?? 0) > 0
  const pct = r?.secoes.pct ?? 0

  let badge: JSX.Element
  if (isError && !r) badge = <Pill cor="bad" icon={<WifiOff className="h-3.5 w-3.5" />}>Sem conexão</Pill>
  else if (defasado) badge = <Pill cor="warn" icon={<TimerReset className="h-3.5 w-3.5" />}>Dados de há {Math.max(1, Math.round((r!.defasagemSeg ?? 0) / 60))} min</Pill>
  else if (pausado) badge = <Pill cor="mute" icon={<Pause className="h-3.5 w-3.5" />}>Pausado</Pill>
  else if (estado === 'em-apuracao') badge = <Pill cor="bad" live>AO VIVO</Pill>
  else if (estado === 'encerrada') badge = <Pill cor="ok" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>Apuração encerrada</Pill>
  else badge = <Pill cor="mute" icon={<TimerReset className="h-3.5 w-3.5" />}>Aguardando apuração</Pill>

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur" style={{ ['--header-h' as string]: '56px' }}>
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-5 sm:px-6">
        <Logo />
        <div className="ml-1 flex items-center gap-2">
          {badge}
          {cfg && cfg.modo !== 'oficial' && (
            <span className="rounded-md border border-warn/50 bg-warn/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn" title={cfg.modo === 'mock' ? 'Dados fictícios gerados localmente' : 'Ambiente simulado do TSE'}>
              {cfg.modo}
            </span>
          )}
        </div>

        <div className="mx-2 hidden min-w-0 flex-1 md:block">
          <div className="mb-1 flex justify-between text-[11px] text-mute">
            <span>Seções totalizadas</span>
            <span className="num font-semibold text-soft">{fmtPct(pct, pct >= 99.995 || pct === 0 ? 0 : 2)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Seções totalizadas">
            <div className="h-full rounded-full bg-gradient-to-r from-ok via-warn to-info transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <div className="hidden text-right text-[11px] leading-tight text-mute lg:block">
            <div>Atualizado no TSE às <span className="num text-soft">{horaLocal(r?.atualizadoTse)}</span></div>
            <div>Coletado <span className="num">{tempoRelativo(r?.coletadoEm, agora)}</span></div>
          </div>
          <button className="btn !px-2.5" onClick={() => setPausado(!pausado)} aria-pressed={pausado} aria-label={pausado ? 'Retomar atualização automática' : 'Pausar atualização automática'} title={pausado ? 'Retomar' : 'Pausar'}>
            {pausado ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <button className="btn !px-2.5" onClick={() => void qc.invalidateQueries()} aria-label="Atualizar agora" title="Atualizar agora">
            <RefreshCw className={clsx('h-4 w-4', buscando && 'animate-spin')} />
          </button>
          <button className="btn !px-2.5" onClick={alternaTema} aria-label={tema === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'} title="Alternar tema">
            {tema === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="md:hidden" aria-hidden>
        <div className="h-1 bg-raised"><div className="h-full bg-gradient-to-r from-ok via-warn to-info transition-[width] duration-700" style={{ width: `${pct}%` }} /></div>
      </div>
      {isError && r && <div className="bg-warn/10 px-4 py-1 text-center text-xs text-warn">Falha ao atualizar: {(error as Error).message}. Mostrando o último dado válido.</div>}
    </header>
  )
}

function Pill({ cor, live, icon, children }: { cor: 'bad' | 'ok' | 'warn' | 'mute'; live?: boolean; icon?: React.ReactNode; children: React.ReactNode }) {
  const c = { bad: 'border-bad/50 bg-bad/10 text-bad', ok: 'border-ok/50 bg-ok/10 text-ok', warn: 'border-warn/50 bg-warn/10 text-warn', mute: 'border-line text-soft' }[cor]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wide', c)} role="status">
      {live && <span className="h-2 w-2 animate-pulseDot rounded-full bg-bad" aria-hidden />}
      {icon}
      {children}
    </span>
  )
}
