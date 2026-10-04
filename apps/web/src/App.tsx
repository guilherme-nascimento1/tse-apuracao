import { ExternalLink, Hourglass } from 'lucide-react'
import { useEffect } from 'react'
import type { Resultado } from '@tse/shared'
import { useConfig, useResultado, useAtualizacoesAoVivo, useCargo } from './hooks/queries'
import { useApp } from './lib/app-state'
import { ApiError } from './lib/api'
import { nomeCargo, ufNome } from './lib/filtros'
import { fmtPct } from './lib/format'
import { BrazilMap } from './components/BrazilMap'
import { BarrasTop, Historico, Rosca } from './components/Charts'
import { CandidateDialog } from './components/CandidateDialog'
import { Comparador } from './components/Comparador'
import { FilterBar } from './components/FilterBar'
import { Header } from './components/Header'
import { Panorama } from './components/Panorama'
import { Ranking } from './components/Ranking'
import { TopCards } from './components/TopCards'
import { EmptyState, ErrorState, Skeleton, Toasts } from './components/ui'

/** Nomes dos mais votados em destaque, ex.: "Lula, Renan Santos, Flávio Bolsonaro". */
function MaisVotados({ r }: { r: Resultado }) {
  const { f, set } = useApp()
  const iniciada = r.estado !== "nao-iniciada"
  const nomes = iniciada ? r.candidatos.slice(0, 3).map((c) => c.nome).join(", ") : ""
  useEffect(() => {
    document.title = nomes ? `${nomeCargo(f)}: ${nomes} · Apuração 2026` : `${nomeCargo(f)} · Apuração 2026`
  }, [nomes, f])
  const proporcional = r.cargo.startsWith("deputado")
  const lista = proporcional ? r.candidatos.slice(0, 10) : r.candidatos
  if (!lista.length) return null
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="Candidatos">
      <span className="text-xs font-semibold uppercase tracking-wide text-mute">{iniciada ? (proporcional ? "Mais votados" : "Candidatos por votos") : "Candidatos"}</span>
      {lista.map((c, i) => (
        <button key={c.sq} onClick={() => set({ cand: c.sq })} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold transition-colors hover:border-mute">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.cor }} aria-hidden />
          {iniciada && <span className="num text-mute">{i + 1}º</span>}
          {c.nome}
          {iniciada && <span className="num font-normal text-soft">{fmtPct(c.pct, 1)}</span>}
        </button>
      ))}
    </div>
  )
}

function Carregando() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando resultados">
      <div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-36" /><Skeleton className="h-36" /><Skeleton className="h-36" /></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[480px] lg:col-span-2" />
        <div className="space-y-4"><Skeleton className="h-72" /><Skeleton className="h-60" /></div>
      </div>
    </div>
  )
}

function Conteudo() {
  const { f, set } = useApp()
  const { data: cfg } = useConfig()
  const { data: r, isLoading, isError, error, refetch } = useResultado()
  useCargo()

  if (cfg && !cfg.eleicao.disponivel) {
    return <EmptyState icon={<Hourglass className="h-6 w-6" />} titulo="Eleição ainda não publicada" texto={cfg.eleicao.mensagem ?? 'O TSE ainda não divulgou os dados desta eleição.'} acao={<button className="btn" onClick={() => void refetch()}>Verificar novamente</button>} />
  }
  if (isLoading) return <Carregando />
  if (isError && !r) {
    const e = error as ApiError
    return <ErrorState titulo={e.status === 0 ? 'Sem conexão com o servidor' : 'Falha ao buscar os dados'} texto={e.status === 0 ? 'O navegador não conseguiu falar com a API (/api). Se estiver rodando localmente, confirme que a API está no ar (npm run dev, porta 3001). A tela tenta de novo sozinha.' : (e.detalhe ?? e.message)} onRetry={() => void refetch()} />
  }
  if (!r) return null

  const escopo = r.abrangencia.tipo === 'br' ? 'Brasil' : ufNome(r.abrangencia.codigo)
  const titulo = `${nomeCargo(f)} · ${escopo}`
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{titulo}</h1>
          <p className="mt-1 text-sm text-soft">
            {r.estado === 'nao-iniciada' && 'Aguardando os primeiros resultados do TSE.'}
            {r.estado === 'em-apuracao' && `Apuração em andamento · ${fmtPct(r.secoes.pct, 1)} das seções totalizadas.`}
            {r.estado === 'encerrada' && 'Totalização concluída para esta abrangência.'}
            {r.vagas > 1 && ` ${r.vagas} vagas.`}
          </p>
        </div>
        {f.mun && <button className="chip" onClick={() => set({ mun: '' })}>Município selecionado ✕</button>}
      </div>

      <MaisVotados r={r} />

      {r.estado === 'nao-iniciada' && (
        <div className="card flex items-start gap-3 p-4 text-sm text-soft" role="status">
          <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden />
          <div><strong className="text-ink">Apuração ainda não iniciada{r.candidatos.length ? '.' : ' neste recorte.'}</strong> {r.candidatos.length ? 'Os candidatos já aparecem com zero votos e os números começam a se mover assim que o TSE publicar.' : 'Quando o arquivo existir no TSE, ele aparece aqui automaticamente, sem recarregar a página.'}</div>
        </div>
      )}

      {r.candidatos.length > 0 && <TopCards r={r} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {r.candidatos.length > 0 ? <Ranking r={r} titulo="Ranking completo" /> : <div className="card"><EmptyState titulo="Sem candidatos para exibir" texto="O TSE ainda não publicou a lista deste cargo nesta abrangência." /></div>}
          <Comparador r={r} />
        </div>
        <div className="min-w-0 space-y-4">
          <BrazilMap />
          <Panorama r={r} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarrasTop r={r} />
        <Rosca r={r} />
      </div>
      <Historico />
      <CandidateDialog r={r} />
    </div>
  )
}

export default function App() {
  useAtualizacoesAoVivo()
  return (
    <div className="min-h-screen">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-ink focus:px-3 focus:py-2 focus:text-bg">Ir para o conteúdo</a>
      <Header />
      <FilterBar />
      <main id="conteudo" className="mx-auto max-w-7xl px-4 pb-32 pt-5 sm:px-6">
        <Conteudo />
      </main>
      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <p className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 px-4 py-2 text-center text-[11px] text-mute sm:text-xs">
          Dados parciais, fonte: TSE. Resultado oficial somente após a totalização final.
          <a href="https://resultados.tse.jus.br" target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-soft underline-offset-2 hover:text-ink hover:underline">
            resultados.tse.jus.br<ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </p>
      </footer>
      <Toasts />
    </div>
  )
}
