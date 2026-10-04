import { EventEmitter } from 'node:events'
import { SourceError, type TseSource } from './source'

export interface Logger {
  info(o: unknown, msg?: string): void
  warn(o: unknown, msg?: string): void
  error(o: unknown, msg?: string): void
}

interface Entry {
  path: string
  json: unknown | null
  missing: boolean
  etag?: string
  lastModified?: string
  /** última verificação bem-sucedida (200/304/404) */
  checkedAt: number
  /** última vez que o conteúdo mudou */
  changedAt: number
  lastAccess: number
  version: number
  failures: number
  nextTryAt: number
  lastError?: string
  inflight?: Promise<void>
}

export interface Snapshot {
  json: unknown | null
  missing: boolean
  version: number
  checkedAt: number
  changedAt: number
  /** segundos de defasagem quando a fonte está falhando e servimos o último dado válido */
  defasagemSeg?: number
}

export interface ClientOpts {
  pollIntervalMs: number
  activeWindowMs: number
  /** TTL para reconsultar um arquivo ainda inexistente (404) sob demanda */
  negativeTtlMs?: number
  maxConcurrency?: number
  retries?: number
  baseBackoffMs?: number
}

/**
 * Cache em memória dos JSONs do TSE com:
 *  - requisição condicional (ETag/If-Modified-Since): 304 não reprocessa nada;
 *  - polling só dos arquivos recentemente consultados;
 *  - retry com backoff exponencial + jitter e serve-stale em falhas;
 *  - 404 tratado como "ainda não existe" (não é erro).
 * Emite `change` (path) quando o conteúdo de um arquivo muda.
 */
export class TseClient extends EventEmitter {
  private entries = new Map<string, Entry>()
  private timer?: NodeJS.Timeout
  private running = 0
  private waiters: (() => void)[] = []
  private o: Required<ClientOpts>

  constructor(private source: TseSource, private log: Logger, opts: ClientOpts) {
    super()
    this.o = { negativeTtlMs: 10_000, maxConcurrency: 6, retries: 2, baseBackoffMs: 400, ...opts }
  }

  start() {
    this.timer = setInterval(() => void this.poll(), this.o.pollIntervalMs)
    this.timer.unref()
  }
  stop() {
    if (this.timer) clearInterval(this.timer)
  }

  get stats() {
    return { arquivos: this.entries.size }
  }

  /** Lê um JSON (cacheado). Primeira leitura espera a rede; depois é stale-while-revalidate. */
  async get(path: string): Promise<Snapshot> {
    const now = Date.now()
    let e = this.entries.get(path)
    if (!e) {
      e = { path, json: null, missing: false, checkedAt: 0, changedAt: 0, lastAccess: now, version: 0, failures: 0, nextTryAt: 0 }
      this.entries.set(path, e)
    }
    e.lastAccess = now
    const age = now - e.checkedAt
    if (e.checkedAt === 0 || (e.missing && age > this.o.negativeTtlMs)) {
      await this.refresh(e)
      if (e.checkedAt === 0) {
        this.entries.delete(path)
        throw new SourceError(e.lastError ?? 'fonte indisponível')
      }
    } else if (age > this.o.pollIntervalMs * 1.5 && now >= e.nextTryAt) {
      void this.refresh(e)
    }
    return this.snapshot(e)
  }

  private snapshot(e: Entry): Snapshot {
    const falhando = e.failures > 0 && Date.now() - e.checkedAt > this.o.pollIntervalMs * 2
    return {
      json: e.json, missing: e.missing, version: e.version, checkedAt: e.checkedAt, changedAt: e.changedAt,
      defasagemSeg: falhando ? Math.round((Date.now() - e.checkedAt) / 1000) : undefined,
    }
  }

  async poll() {
    const now = Date.now()
    const ativos = [...this.entries.values()].filter((e) => now - e.lastAccess < this.o.activeWindowMs && now >= e.nextTryAt)
    for (const e of this.entries.values()) {
      if (now - e.lastAccess >= this.o.activeWindowMs * 6) this.entries.delete(e.path) // descarta o que ninguém usa
    }
    await Promise.allSettled(ativos.map((e) => this.refresh(e)))
  }

  private refresh(e: Entry): Promise<void> {
    if (!e.inflight) e.inflight = this.doRefresh(e).finally(() => (e.inflight = undefined))
    return e.inflight
  }

  private async slot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.o.maxConcurrency) await new Promise<void>((r) => this.waiters.push(r))
    this.running++
    try {
      return await fn()
    } finally {
      this.running--
      this.waiters.shift()?.()
    }
  }

  private async doRefresh(e: Entry) {
    let lastErr: SourceError | undefined
    for (let attempt = 0; attempt <= this.o.retries; attempt++) {
      try {
        const res = await this.slot(() => this.source.fetchJson(e.path, { etag: e.etag, lastModified: e.lastModified }))
        const now = Date.now()
        e.checkedAt = now
        e.failures = 0
        e.lastError = undefined
        e.nextTryAt = 0
        if (res.status === 304) return
        if (res.status === 404) {
          if (!e.missing || e.json !== null) {
            e.missing = true; e.json = null; e.etag = undefined; e.lastModified = undefined
            e.version++; e.changedAt = now
            this.emit('change', e.path)
          }
          return
        }
        e.missing = false
        e.etag = res.etag
        e.lastModified = res.lastModified
        e.json = res.json
        e.version++
        e.changedAt = now
        this.emit('change', e.path)
        return
      } catch (err) {
        lastErr = err instanceof SourceError ? err : new SourceError((err as Error).message)
        if (!lastErr.retriable || attempt === this.o.retries) break
        const espera = lastErr.retryAfterMs ?? this.o.baseBackoffMs * 2 ** attempt * (1 + Math.random() * 0.5)
        await new Promise((r) => setTimeout(r, Math.min(espera, 10_000)))
      }
    }
    e.failures++
    e.lastError = lastErr?.message
    // backoff entre ciclos de polling: 15s, 30s, 60s... até 5min
    e.nextTryAt = Date.now() + Math.min(300_000, 15_000 * 2 ** Math.min(e.failures - 1, 5))
    this.log.warn({ path: e.path, falhas: e.failures, erro: lastErr?.message }, 'falha ao atualizar arquivo do TSE; servindo último dado válido')
  }
}
