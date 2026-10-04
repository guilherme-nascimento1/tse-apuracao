import { GitCompareArrows, X } from 'lucide-react'
import type { Resultado } from '@tse/shared'
import { useApp } from '../lib/app-state'
import { fmtInt, fmtPct, fmtSigned } from '../lib/format'
import { Avatar, Card, CountUp, StatusBadge } from './ui'

export function Comparador({ r }: { r: Resultado }) {
  const { f, set, alternaComparar } = useApp()
  const lider = r.candidatos[0]
  return (
    <div id="comparador" className="scroll-mt-32">
      <Card titulo="Comparador" direita={f.cmp.length > 0 ? <button className="text-xs text-mute hover:text-ink" onClick={() => set({ cmp: [] })}>Limpar</button> : undefined}>
        {f.cmp.length === 0 ? (
          <div className="flex items-center gap-3 text-sm text-soft">
            <GitCompareArrows className="h-5 w-5 shrink-0 text-mute" aria-hidden />
            Use o ícone de comparação em cada candidato do ranking para colocar até 3 lado a lado.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {f.cmp.map((sq) => {
              const i = r.candidatos.findIndex((c) => c.sq === sq)
              const c = r.candidatos[i]
              if (!c || !lider) {
                return (
                  <div key={sq} className="rounded-xl border border-dashed border-line p-4 text-sm text-mute">
                    Candidato fora deste recorte (cargo/estado).
                    <button className="mt-2 block text-info hover:underline" onClick={() => alternaComparar(sq)}>Remover</button>
                  </div>
                )
              }
              const atras = lider.votos - c.votos
              return (
                <div key={sq} className="relative rounded-xl bg-raised p-4">
                  <button aria-label={`Remover ${c.nome} da comparação`} className="absolute right-2 top-2 text-mute hover:text-ink" onClick={() => alternaComparar(sq)}><X className="h-4 w-4" /></button>
                  <div className="flex items-center gap-3">
                    <Avatar c={c} size={44} />
                    <div className="min-w-0"><div className="truncate font-semibold">{c.nome}</div><div className="truncate text-xs text-mute">{c.numero} · {c.partido}</div></div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
                    <Item t="Posição" v={`${i + 1}º`} />
                    <Item t="% válidos" v={<CountUp value={c.pct} format={(n) => fmtPct(n)} />} />
                    <Item t="Votos" v={<CountUp value={c.votos} />} />
                    <Item t="Status" v={<StatusBadge s={c.status} />} />
                    <Item t="Diferença p/ líder" v={i === 0 ? 'Líder' : `−${fmtInt(atras)} votos`} />
                    <Item t="Diferença em p.p." v={i === 0 ? '—' : `${fmtSigned(c.pct - lider.pct)} p.p.`} />
                  </dl>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden>
                    <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${lider.pct ? (c.pct / lider.pct) * 100 : 0}%`, background: c.cor }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

const Item = ({ t, v }: { t: string; v: React.ReactNode }) => (
  <div><dt className="text-[11px] uppercase tracking-wide text-mute">{t}</dt><dd className="num mt-0.5 font-semibold">{v}</dd></div>
)
