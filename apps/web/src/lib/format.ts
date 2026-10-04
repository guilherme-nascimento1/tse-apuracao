const int = new Intl.NumberFormat('pt-BR')
export const fmtInt = (n: number) => int.format(Math.round(n))
export const fmtPct = (n: number, d = 2) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`
export const fmtCompact = (n: number) => new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
export const fmtSigned = (n: number, d = 2) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}`

export const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/).filter((x) => x.length > 2 || /^\d/.test(x))
  return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[p.length - 1]![0]! : '')).toUpperCase()
}

export function horaLocal(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function tempoRelativo(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return '—'
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 5) return 'agora'
  if (s < 60) return `há ${s} s`
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`
  return `há ${Math.floor(s / 86400)} d`
}

export const STATUS_LABEL = {
  eleito: 'Eleito', 'segundo-turno': '2º turno', 'em-apuracao': 'Em apuração', 'nao-eleito': 'Não eleito', suplente: 'Suplente',
} as const
