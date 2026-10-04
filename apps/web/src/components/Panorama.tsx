import type { Resultado, Resumo } from '@tse/shared'
import { useMunicipio, useResumo } from '../hooks/queries'
import { useApp } from '../lib/app-state'
import { fmtInt, fmtPct, horaLocal } from '../lib/format'
import { ufNome } from '../lib/filtros'
import { Card, CountUp, Skeleton } from './ui'

function Tile({ rotulo, valor, sub, fmt = fmtInt }: { rotulo: string; valor: number; sub?: string; fmt?: (n: number) => string }) {
  return (
    <div className="rounded-xl bg-raised p-3">
      <div className="text-[11px] uppercase tracking-wide text-mute">{rotulo}</div>
      <div className="mt-1 font-display text-xl font-bold leading-none"><CountUp value={valor} format={fmt} /></div>
      {sub && <div className="num mt-1 text-xs text-soft">{sub}</div>}
    </div>
  )
}

function Bloco({ titulo, secoes, comp, brancos, nulos, base }: {
  titulo: string; secoes: Resultado['secoes']; comp: Resultado['comparecimento']; brancos?: number; nulos?: number; base?: number
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{titulo}</h3>
      <div className="grid grid-cols-2 gap-2">
        <Tile rotulo="Seções totalizadas" valor={secoes.pct} fmt={(n) => fmtPct(n, 1)} sub={`${fmtInt(secoes.totalizadas)} de ${fmtInt(secoes.total)}`} />
        <Tile rotulo="Comparecimento" valor={comp.pctComparecimento} fmt={(n) => fmtPct(n, 1)} sub={`${fmtInt(comp.compareceram)} eleitores`} />
        <Tile rotulo="Abstenção" valor={comp.pctAbstencao} fmt={(n) => fmtPct(n, 1)} sub={`${fmtInt(comp.abstencoes)} eleitores`} />
        {brancos !== undefined && base ? <Tile rotulo="Brancos" valor={base ? (brancos / base) * 100 : 0} fmt={(n) => fmtPct(n, 2)} sub={`${fmtInt(brancos)} votos`} /> : null}
        {nulos !== undefined && base ? <Tile rotulo="Nulos" valor={base ? (nulos / base) * 100 : 0} fmt={(n) => fmtPct(n, 2)} sub={`${fmtInt(nulos)} votos`} /> : null}
      </div>
    </div>
  )
}

export function Panorama({ r }: { r: Resultado }) {
  const { f } = useApp()
  const { data: resumo } = useResumo()
  const titulo = r.abrangencia.tipo === 'br' ? 'Brasil' : ufNome(r.abrangencia.codigo)
  return (
    <Card titulo="Panorama" direita={<span className="text-xs text-mute">TSE às {horaLocal(r.atualizadoTse)}</span>}>
      <div className="space-y-5">
        <Bloco titulo={titulo} secoes={r.secoes} comp={r.comparecimento} brancos={r.votos.brancos} nulos={r.votos.nulos} base={r.votos.total} />
        {r.abrangencia.tipo === 'uf' && <Nacional resumo={resumo} />}
        {f.mun && f.cargo !== 'presidente' && <Municipio uf={f.uf} codigo={f.mun} />}
      </div>
    </Card>
  )
}

function Nacional({ resumo }: { resumo?: Resumo }) {
  if (!resumo) return <Skeleton className="h-28" />
  if (resumo.estado === 'nao-iniciada' && !resumo.ufs.length) return null
  return (
    <div className="border-t border-line pt-4">
      <Bloco titulo="Brasil (mesma eleição)" secoes={resumo.secoes} comp={resumo.comparecimento} />
    </div>
  )
}

function Municipio({ uf, codigo }: { uf: string; codigo: string }) {
  const { data, isLoading } = useMunicipio(uf, codigo)
  if (isLoading) return <Skeleton className="h-28" />
  if (!data) return null
  return (
    <div className="border-t border-line pt-4">
      <Bloco titulo={`${data.nome} (município)`} secoes={data.secoes} comp={data.comparecimento} />
      <p className="mt-2 text-xs text-mute">O TSE divulga o resultado por candidato apenas por UF; para o município estão disponíveis seções totalizadas, comparecimento e abstenção.</p>
    </div>
  )
}
