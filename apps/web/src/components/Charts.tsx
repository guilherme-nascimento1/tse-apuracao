import { CartesianGrid, Cell, LabelList, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from 'recharts'
import { useMemo } from 'react'
import type { Resultado } from '@tse/shared'
import { useHistorico } from '../hooks/queries'
import { fmtInt, fmtPct, horaLocal } from '../lib/format'
import { Card, CountUp, EmptyState, Skeleton } from './ui'
import { LineChart as LineIcon } from 'lucide-react'

const TIP = 'rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-xl'
const AXIS = { fill: 'rgb(var(--mute))', fontSize: 11 }

/** Tabela equivalente ao gráfico (acessibilidade e leitura precisa). */
function TabelaAlternativa({ cabecalho, linhas }: { cabecalho: string[]; linhas: (string | number)[][] }) {
  return (
    <details className="mt-3 text-xs text-mute">
      <summary className="cursor-pointer select-none hover:text-ink">Ver como tabela</summary>
      <div className="scroll-thin mt-2 overflow-x-auto">
        <table className="w-full num">
          <thead><tr>{cabecalho.map((h) => <th key={h} className="px-2 py-1 text-left font-semibold">{h}</th>)}</tr></thead>
          <tbody>{linhas.map((l, i) => <tr key={i} className="border-t border-line">{l.map((c, j) => <td key={j} className="px-2 py-1">{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  )
}

export function BarrasTop({ r }: { r: Resultado }) {
  const dados = useMemo(() => r.candidatos.slice(0, 8).map((c) => ({ nome: c.nome, partido: c.partido, pct: c.pct, votos: c.votos, cor: c.cor })), [r])
  if (!dados.length) return null
  return (
    <Card titulo="Mais votados">
      <div role="img" aria-label={`Gráfico de barras: ${dados.map((d) => `${d.nome} ${fmtPct(d.pct)}`).join('; ')}`} style={{ height: 34 * dados.length + 16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} layout="vertical" margin={{ left: 0, right: 56, top: 4, bottom: 4 }} barCategoryGap={8}>
            <XAxis type="number" hide domain={[0, 'dataMax']} />
            <YAxis type="category" dataKey="nome" width={118} tick={{ ...AXIS, fill: 'rgb(var(--soft))' }} tickLine={false} axisLine={false} tickFormatter={(v: string) => (v.length > 17 ? `${v.slice(0, 16)}…` : v)} />
            <Tooltip
              cursor={{ fill: 'rgb(var(--raised))', opacity: 0.5 }} isAnimationActive={false}
              content={({ payload }) => {
                const d = payload?.[0]?.payload as (typeof dados)[number] | undefined
                if (!d) return null
                return <div className={TIP}><div className="font-semibold">{d.nome} · {d.partido}</div><div className="num mt-0.5 text-soft">{fmtPct(d.pct)} · {fmtInt(d.votos)} votos</div></div>
              }}
            />
            <Bar dataKey="pct" radius={[0, 4, 4, 0]} barSize={16} animationDuration={600}>
              {dados.map((d, i) => <Cell key={i} fill={d.cor} />)}
              <LabelList dataKey="pct" position="right" formatter={(v: number) => fmtPct(v)} style={{ fill: 'rgb(var(--ink))', fontSize: 12, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TabelaAlternativa cabecalho={['Candidato', 'Partido', '%', 'Votos']} linhas={dados.map((d) => [d.nome, d.partido, fmtPct(d.pct), fmtInt(d.votos)])} />
    </Card>
  )
}

export function Rosca({ r }: { r: Resultado }) {
  const { votos: v, comparecimento: c } = r
  const base = c.compareceram + c.abstencoes
  const partes = [
    { nome: 'Votos válidos', valor: v.validos, cor: '#4ade80' },
    { nome: 'Brancos', valor: v.brancos, cor: '#cbd5e1' },
    { nome: 'Nulos', valor: v.nulos, cor: '#fbbf24' },
    { nome: 'Abstenção', valor: c.abstencoes, cor: '#64748b' },
  ]
  const vazio = base <= 0
  return (
    <Card titulo="Composição do eleitorado">
      {vazio ? (
        <p className="py-8 text-center text-sm text-mute">Sem votos apurados ainda.</p>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="relative h-40 w-40 shrink-0" role="img" aria-label={`Rosca: ${partes.map((p) => `${p.nome} ${fmtPct((p.valor / base) * 100)}`).join('; ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={partes} dataKey="valor" nameKey="nome" innerRadius={52} outerRadius={74} paddingAngle={2} stroke="rgb(var(--surface))" strokeWidth={2} animationDuration={600} startAngle={90} endAngle={-270}>
                  {partes.map((p) => <Cell key={p.nome} fill={p.cor} />)}
                </Pie>
                <Tooltip isAnimationActive={false} content={({ payload }) => {
                  const d = payload?.[0]?.payload as (typeof partes)[number] | undefined
                  return d ? <div className={TIP}><div className="font-semibold">{d.nome}</div><div className="num text-soft">{fmtInt(d.valor)} · {fmtPct((d.valor / base) * 100)}</div></div> : null
                }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div><div className="font-display text-lg font-bold"><CountUp value={c.pctComparecimento} format={(n) => fmtPct(n, 1)} /></div><div className="text-[10px] uppercase tracking-wide text-mute">compareceram</div></div>
            </div>
          </div>
          <ul className="w-full space-y-1.5 text-sm">
            {partes.map((p) => (
              <li key={p.nome} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.cor }} aria-hidden />
                <span className="flex-1 text-soft">{p.nome}</span>
                <span className="num font-semibold">{fmtPct((p.valor / base) * 100)}</span>
                <span className="num hidden w-24 text-right text-xs text-mute sm:block">{fmtInt(p.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

export function Historico() {
  const { data, isLoading } = useHistorico()
  const { linhas, series } = useMemo(() => {
    if (!data) return { linhas: [] as Record<string, number | string>[], series: [] as { sq: string; nome: string; cor: string }[] }
    const linhas = data.pontos.map((p) => {
      const row: Record<string, number | string> = { x: p.pctSecoes, t: p.t }
      p.c.forEach((c) => { row[c.sq] = c.pct })
      return row
    })
    return { linhas, series: data.candidatos.slice(0, 5).map((c) => ({ sq: c.sq, nome: c.nome, cor: c.cor })) }
  }, [data])

  return (
    <Card titulo="Evolução durante a apuração" direita={<span className="text-xs text-mute">% dos válidos × % das seções</span>}>
      {isLoading ? <Skeleton className="h-56" /> : linhas.length < 2 ? (
        <EmptyState icon={<LineIcon className="h-6 w-6" />} titulo="Histórico em construção" texto="Cada atualização do TSE vira um ponto aqui. O gráfico aparece a partir da segunda atualização." />
      ) : (
        <>
          <div className="h-56" role="img" aria-label={`Evolução do percentual de ${series.map((s) => s.nome).join(', ')} conforme as seções são totalizadas`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={linhas} margin={{ left: -12, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v: number) => `${Math.round(v)}%`} tick={AXIS} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v: number) => `${v}%`} tick={AXIS} tickLine={false} axisLine={false} width={44} />
                <Tooltip isAnimationActive={false} content={({ payload }) => {
                  const row = payload?.[0]?.payload as Record<string, number | string> | undefined
                  if (!row) return null
                  return (
                    <div className={TIP}>
                      <div className="mb-1 text-mute">{fmtPct(row.x as number, 1)} das seções · {horaLocal(row.t as string)}</div>
                      {series.filter((s) => row[s.sq] != null).sort((a, b) => (row[b.sq] as number) - (row[a.sq] as number)).map((s) => (
                        <div key={s.sq} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: s.cor }} /><span className="flex-1">{s.nome}</span><span className="num font-semibold">{fmtPct(row[s.sq] as number)}</span></div>
                      ))}
                    </div>
                  )
                }} />
                {series.map((s) => <Line key={s.sq} dataKey={s.sq} stroke={s.cor} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'rgb(var(--surface))', strokeWidth: 2 }} isAnimationActive={false} connectNulls />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-soft">
            {series.map((s) => <li key={s.sq} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: s.cor }} aria-hidden />{s.nome}</li>)}
          </ul>
          <TabelaAlternativa cabecalho={['% seções', 'Hora', ...series.map((s) => s.nome)]} linhas={linhas.slice(-12).map((l) => [fmtPct(l.x as number, 1), horaLocal(l.t as string), ...series.map((s) => (l[s.sq] != null ? fmtPct(l[s.sq] as number) : '—'))])} />
        </>
      )}
    </Card>
  )
}
