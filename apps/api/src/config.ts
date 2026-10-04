import type { Modo } from '@tse/shared'

const env = process.env
const modo = (env.TSE_MODE ?? 'oficial') as Modo
if (!['mock', 'simulado', 'oficial'].includes(modo)) {
  throw new Error(`TSE_MODE inválido: "${modo}" (use mock, simulado ou oficial)`)
}

const BASES: Record<Modo, string> = {
  mock: 'mock://local',
  simulado: 'https://resultados-sim.tse.jus.br/simulado/simulado2026',
  oficial: 'https://resultados.tse.jus.br/oficial',
}

const int = (v: string | undefined, d: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : d
}

export const config = {
  modo,
  baseUrl: (env.TSE_BASE_URL || BASES[modo]).replace(/\/+$/, ''),
  ciclo: env.TSE_CICLO || 'ele2026',
  turno: int(env.TSE_TURNO, 1) === 2 ? 2 : 1,
  userAgent: env.TSE_USER_AGENT || 'tse-apuracao/1.0 (painel de apuracao; +https://github.com/)',
  /** intervalo de polling do backend, limitado a 15–300s para não agredir a CDN */
  pollIntervalSeg: Math.min(300, Math.max(15, int(env.POLL_INTERVAL_S, modo === 'mock' ? 15 : 45))),
  activeWindowSeg: int(env.ACTIVE_WINDOW_S, 600),
  mockDurationSeg: int(env.MOCK_DURATION_S, 300),
  mockHoldSeg: int(env.MOCK_HOLD_S, 60),
  port: int(env.PORT, 3001),
  host: env.HOST || '0.0.0.0',
  logLevel: env.LOG_LEVEL || 'info',
  webDist: env.WEB_DIST || '',
  /** Vercel: sem processo longo (sem polling em background, sem SSE) */
  serverless: !!env.VERCEL,
}
export type Config = typeof config
