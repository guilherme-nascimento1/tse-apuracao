/** Cores de partido: usadas apenas como acento visual. */
const PARTIDOS: Record<string, string> = {
  PT: '#e11d48', PL: '#2563eb', UNIÃO: '#0ea5e9', UNIAO: '#0ea5e9', PP: '#0284c7', MDB: '#16a34a', PSD: '#f59e0b',
  PSDB: '#3b82f6', PDT: '#dc2626', PSB: '#f97316', REPUBLICANOS: '#0891b2', PODE: '#84cc16', PSOL: '#eab308',
  NOVO: '#ea580c', PCDOB: '#b91c1c', 'PC DO B': '#b91c1c', PV: '#22c55e', CIDADANIA: '#a855f7', AVANTE: '#fb923c',
  SOLIDARIEDADE: '#f97316', PRD: '#14b8a6', DC: '#65a30d', AGIR: '#06b6d4', MOBILIZA: '#d946ef', PMB: '#0d9488',
  PCO: '#991b1b', PSTU: '#7f1d1d', UP: '#be123c', PRTB: '#4d7c0f', REDE: '#10b981',
  // Partidos fictícios do modo mock
  PAC: '#38bdf8', UNB: '#f472b6', RPD: '#a3e635', MVB: '#fbbf24', FRN: '#fb7185', DPL: '#2dd4bf',
  PTR: '#818cf8', ADS: '#f97316', LBR: '#c084fc', PNV: '#4ade80', SOC: '#e879f9', CNT: '#94a3b8',
}

const PALETA = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#fb7185', '#2dd4bf', '#818cf8', '#f97316', '#c084fc', '#4ade80', '#e879f9', '#94a3b8']

export function corPartido(sigla: string): string {
  const k = sigla.trim().toUpperCase()
  const hit = PARTIDOS[k]
  if (hit) return hit
  let h = 0
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0
  return PALETA[h % PALETA.length]!
}
