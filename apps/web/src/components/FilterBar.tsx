import * as Dialog from '@radix-ui/react-dialog'
import clsx from 'clsx'
import { GitCompareArrows, Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { REGIOES, UFS, ufsDaRegiao } from '@tse/shared'
import { useConfig, useMunicipios, useResultado } from '../hooks/queries'
import { useApp } from '../lib/app-state'
import { CARGOS_UI, type Filtros } from '../lib/filtros'
import { Combobox } from './ui'

function Busca({ className }: { className?: string }) {
  const { f, set } = useApp()
  const [v, setV] = useState(f.q)
  useEffect(() => setV(f.q), [f.q])
  useEffect(() => {
    if (v === f.q) return
    const t = setTimeout(() => set({ q: v }), 200)
    return () => clearTimeout(t)
  }, [v, f.q, set])
  return (
    <label className={clsx('relative block', className)}>
      <span className="sr-only">Buscar candidato, número ou partido</span>
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-mute" aria-hidden />
      <input
        type="search" value={v} onChange={(e) => setV(e.target.value)} placeholder="Candidato, número ou partido"
        className="w-full rounded-lg border border-line bg-raised py-2 pl-9 pr-8 text-sm outline-none transition-colors focus:border-info"
      />
      {v && (
        <button type="button" aria-label="Limpar busca" className="absolute right-2 top-2.5 text-mute hover:text-ink" onClick={() => setV('')}>
          <X className="h-4 w-4" />
        </button>
      )}
    </label>
  )
}

function Regioes() {
  const { f, set } = useApp()
  const itens = [{ id: '' as const, nome: 'Brasil' }, ...REGIOES]
  const bloqueado = f.cargo === 'presidente'
  return (
    <div role="group" aria-label="Região" className="flex flex-wrap gap-1.5">
      {itens.map((r) => (
        <button
          key={r.id || 'br'} className="chip" aria-pressed={f.regiao === r.id} disabled={bloqueado && r.id !== ''}
          title={bloqueado && r.id ? 'Presidente só tem escopo Brasil' : undefined}
          style={bloqueado && r.id ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
          onClick={() => set({ regiao: r.id })}
        >
          {r.nome}
        </button>
      ))}
    </div>
  )
}

function Seletores() {
  const { f, set } = useApp()
  const { data: res } = useResultado()
  const ufs = useMemo(() => (f.regiao ? ufsDaRegiao(f.regiao) : UFS).map((u) => ({ valor: u.sigla, rotulo: u.nome, sub: u.sigla })), [f.regiao])
  const { data: muns } = useMunicipios(f.cargo === 'presidente' ? '' : f.uf)
  const partidos = useMemo(() => {
    const m = new Map<string, number>()
    res?.candidatos.forEach((c) => m.set(c.partido, (m.get(c.partido) ?? 0) + 1))
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([p, n]) => ({ valor: p, rotulo: p, sub: `${n} cand.` }))
  }, [res])
  const semUf = f.cargo === 'presidente'
  return (
    <>
      <Combobox rotulo="Estado" valor={f.uf} opcoes={ufs} placeholder={semUf ? 'Todo o Brasil' : 'Escolha'} disabled={semUf} onChange={(uf) => set({ uf })} className="w-full sm:w-52" />
      <Combobox
        rotulo="Município" valor={f.mun} opcoes={(muns ?? []).map((m) => ({ valor: m.codigo, rotulo: m.nome }))} placeholder={semUf || !f.uf ? '—' : 'Todos'}
        disabled={semUf || !f.uf} permiteLimpar vazio="Município não encontrado" onChange={(mun) => set({ mun })} className="w-full sm:w-56"
      />
      <Combobox rotulo="Partido" valor={f.partido} opcoes={partidos} placeholder="Todos" permiteLimpar disabled={!partidos.length} onChange={(partido) => set({ partido })} className="w-full sm:w-44" />
    </>
  )
}

function contaFiltros(f: Filtros) {
  return [f.regiao, f.uf && f.cargo !== 'presidente' ? f.uf : '', f.mun, f.q, f.partido].filter(Boolean).length
}

export function FilterBar() {
  const { f, set } = useApp()
  const { data: cfg } = useConfig()
  const [aberto, setAberto] = useState(false)
  const n = contaFiltros(f)
  return (
    <div className="sticky top-[var(--header-h,56px)] z-30 border-b border-line bg-bg/90 backdrop-blur" style={{ paddingTop: 0 }}>
      <div className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="Cargo" className="scroll-thin -mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 pb-0.5">
            {CARGOS_UI.map((c) => {
              const off = cfg && !cfg.cargos.find((x) => x.id === c.id)?.disponivel
              return (
                <button
                  key={c.id} role="tab" aria-selected={f.cargo === c.id} disabled={off} title={off ? 'Cargo não disponível nesta eleição' : undefined}
                  onClick={() => set({ cargo: c.id })}
                  className={clsx(
                    'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 disabled:opacity-40',
                    f.cargo === c.id ? 'bg-ink text-bg' : 'text-soft hover:bg-raised hover:text-ink',
                  )}
                >
                  <span className="sm:hidden">{c.curto}</span>
                  <span className="hidden sm:inline">{c.nome}</span>
                </button>
              )
            })}
          </div>
          <button className="btn lg:hidden" onClick={() => setAberto(true)} aria-label={`Filtros (${n} ativos)`}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filtros{n > 0 && <span className="ml-0.5 rounded-full bg-info px-1.5 text-[11px] font-bold text-bg">{n}</span>}
          </button>
          {f.cmp.length > 0 && (
            <a href="#comparador" className="btn hidden sm:inline-flex"><GitCompareArrows className="h-4 w-4" aria-hidden />Comparar ({f.cmp.length})</a>
          )}
        </div>

        <div className="mt-2.5 hidden flex-wrap items-center gap-2 lg:flex">
          <Regioes />
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          <Seletores />
          <Busca className="ml-auto w-72" />
        </div>
      </div>

      <Dialog.Root open={aberto} onOpenChange={setAberto}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-[61] max-h-[85vh] overflow-auto rounded-t-3xl border-t border-line bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" aria-hidden />
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="font-display text-lg font-semibold">Filtros</Dialog.Title>
              <Dialog.Close className="btn" aria-label="Fechar filtros"><X className="h-4 w-4" /></Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">Refine região, estado, município, partido e busca</Dialog.Description>
            <div className="flex flex-col gap-4">
              <div><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-mute">Região</div><Regioes /></div>
              <div className="flex flex-col gap-2"><Seletores /></div>
              <Busca />
              <div className="flex gap-2 pt-1">
                <button className="btn flex-1" onClick={() => set({ regiao: '', mun: '', q: '', partido: '' })}>Limpar</button>
                <Dialog.Close className="btn flex-1 !border-ink !bg-ink !text-bg">Ver resultados</Dialog.Close>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
