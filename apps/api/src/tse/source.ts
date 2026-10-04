import { config } from '../config'

export interface FetchCond { etag?: string; lastModified?: string }
export type FetchResult =
  | { status: 200; json: unknown; etag?: string; lastModified?: string }
  | { status: 304 }
  | { status: 404 }

export interface BinaryResult { status: 200 | 404; body?: Buffer; contentType?: string }

export class SourceError extends Error {
  constructor(message: string, readonly status?: number, readonly retryAfterMs?: number) {
    super(message)
  }
  get retriable() {
    return this.status === undefined || this.status === 429 || this.status >= 500
  }
}

export interface TseSource {
  readonly nome: string
  fetchJson(path: string, cond: FetchCond): Promise<FetchResult>
  fetchBinary(path: string): Promise<BinaryResult>
}

/** Fonte HTTP (CDN do TSE): User-Agent identificado + requisições condicionais (ETag / If-Modified-Since). */
export class HttpSource implements TseSource {
  readonly nome = 'http'
  constructor(private base = config.baseUrl, private userAgent = config.userAgent, private timeoutMs = 15_000) {}

  private async request(path: string, headers: Record<string, string>) {
    try {
      return await fetch(`${this.base}/${path}`, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json, */*', 'Accept-Encoding': 'gzip, br', ...headers },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (e) {
      throw new SourceError(`rede: ${(e as Error).message}`)
    }
  }

  private check(res: Response, path: string) {
    if (res.status === 429 || res.status >= 500) {
      const ra = Number(res.headers.get('retry-after'))
      throw new SourceError(`HTTP ${res.status} em ${path}`, res.status, Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined)
    }
    if (!res.ok && res.status !== 404) throw new SourceError(`HTTP ${res.status} em ${path}`, res.status)
  }

  async fetchJson(path: string, cond: FetchCond): Promise<FetchResult> {
    const headers: Record<string, string> = {}
    if (cond.etag) headers['If-None-Match'] = cond.etag
    if (cond.lastModified) headers['If-Modified-Since'] = cond.lastModified
    const res = await this.request(path, headers)
    if (res.status === 304) return { status: 304 }
    this.check(res, path)
    if (res.status === 404) return { status: 404 }
    try {
      const json = await res.json()
      return { status: 200, json, etag: res.headers.get('etag') ?? undefined, lastModified: res.headers.get('last-modified') ?? undefined }
    } catch {
      // arquivo sendo escrito na CDN: trata como falha transitória
      throw new SourceError(`JSON inválido em ${path}`, 502)
    }
  }

  async fetchBinary(path: string): Promise<BinaryResult> {
    const res = await this.request(path, {})
    this.check(res, path)
    if (res.status === 404) return { status: 404 }
    return { status: 200, body: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? 'image/jpeg' }
  }
}
