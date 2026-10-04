import * as Dialog from '@radix-ui/react-dialog'
import { GitCompareArrows, X } from 'lucide-react'
import type { Resultado } from '@tse/shared'
import { useDetalhe } from '../hooks/queries'
import { useApp } from '../lib/app-state'
import { fmtInt, fmtPct } from '../lib/format'
import { ufNome } from '../lib/filtros'
import { Avatar, ErrorState, Skeleton, StatusBadge } from './ui'

export function CandidateDialog({ r }: { r?: Resultado }) {
  const { f, set, alternaComparar } = useApp()
  const aberto = !!f.cand
  const c = r?.candidatos.find((x) => x.sq === f.cand)
  const pos = r ? r.candidatos.findIndex((x) => x.sq === f.cand) + 1 : 0
  const { data, isLoading, isError, refetch } = useDetalhe(aberto && c ? f.cand : '')
  const comp = f.cmp.includes(f.cand)
  const maxPct = Math.max(1, ...(data?.porUf.map((u) => u.pct) ?? [1]))

  return (
    <Dialog.Root open={aberto} onOpenChange={(o) => !o && set({ cand: '' })}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 data-[state=open]:animate-in" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-[61] max-h-[90vh] overflow-auto rounded-t-3xl border border-line bg-surface p-5 shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[640px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:p-6">
          <Dialog.Close className="btn absolute right-4 top-4 !px-2" aria-label="Fechar"><X className="h-4 w-4" /></Dialog.Close>
          {!c ? (
            <>
              <Dialog.Title className="font-display text-lg font-semibold">Candidato não encontrado</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-soft">Ele não está no cargo/estado selecionado.</Dialog.Description>
            </>
          ) : (
            <>
              <div className="flex items-center gap-4 pr-12">
                <Avatar c={c} size={72} />
                <div className="min-w-0">
                  <Dialog.Title className="font-display text-xl font-bold leading-tight">{c.nome}</Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-soft">
                    Nº <span className="num">{c.numero}</span> · {c.partidoNome}{c.federacao ? ` (${c.federacao})` : ''}
                  </Dialog.Description>
                  <div className="mt-2 flex items-center gap-2"><StatusBadge s={c.status} />{c.situacao !== 'Válido' && <span className="text-xs text-warn">{c.situacao}</span>}</div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                <Stat t="Posição" v={`${pos}º`} />
                <Stat t="% válidos" v={fmtPct(c.pct)} />
                <Stat t="Votos" v={fmtInt(c.votos)} />
              </div>
              {(c.vice || c.suplentes) && (
                <p className="mt-3 text-sm text-soft">{c.vice ? `Vice: ${c.vice}` : `Suplentes: ${c.suplentes!.join(' e ')}`}</p>
              )}

              <h3 className="mb-2 mt-6 text-sm font-semibold">{r?.cargo === 'presidente' ? 'Votos por estado' : `Resultado em ${ufNome(r?.abrangencia.codigo ?? '')}`}</h3>
              {isLoading ? <Skeleton className="h-40" /> : isError ? <ErrorState titulo="Detalhe indisponível" onRetry={() => void refetch()} /> : data ? (
                <>
                  {data.observacao && <p className="mb-2 text-sm text-mute">{data.observacao}</p>}
                  <ul className="scroll-thin max-h-64 space-y-1.5 overflow-auto pr-1">
                    {data.porUf.map((u) => (
                      <li key={u.uf} className="flex items-center gap-2 text-sm">
                        <span className="w-8 font-semibold">{u.uf}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised" aria-hidden><span className="block h-full rounded-full" style={{ width: `${(u.pct / maxPct) * 100}%`, background: c.cor }} /></span>
                        <span className="num w-14 text-right font-semibold">{fmtPct(u.pct, 1)}</span>
                        <span className="num hidden w-24 text-right text-xs text-mute sm:block">{fmtInt(u.votos)}</span>
                        <span className="num w-8 text-right text-xs text-mute" title="Posição no estado">{u.posicao ? `${u.posicao}º` : '—'}</span>
                      </li>
                    ))}
                  </ul>
                  {r?.cargo !== 'presidente' && <p className="mt-3 text-xs text-mute">Para este cargo o TSE divulga o resultado apenas por UF; não há abertura por município nos arquivos de resultado.</p>}
                </>
              ) : null}

              <button className="btn mt-5 w-full" onClick={() => alternaComparar(c.sq)} aria-pressed={comp}>
                <GitCompareArrows className="h-4 w-4" aria-hidden />{comp ? 'Remover da comparação' : 'Adicionar à comparação'}
              </button>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const Stat = ({ t, v }: { t: string; v: string }) => (
  <div className="rounded-xl bg-raised p-3"><div className="text-[11px] uppercase tracking-wide text-mute">{t}</div><div className="num mt-1 font-display text-xl font-bold">{v}</div></div>
)
