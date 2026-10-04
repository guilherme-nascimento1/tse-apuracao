import type { IncomingMessage, ServerResponse } from 'node:http'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app'
import { config } from './config'
import { MockSource } from './mock/source'
import { Service } from './service'
import { TseClient } from './tse/client'
import { HttpSource, type TseSource } from './tse/source'

/**
 * Entrada serverless (Vercel). Sem processo longo: o cache vive na instância "quente" e o dado velho
 * é revalidado (ETag/If-Modified-Since) na própria requisição. Sem SSE: o front usa só polling.
 */
let pronto: Promise<FastifyInstance> | undefined

function iniciar() {
  const source: TseSource = config.modo === 'mock' ? new MockSource() : new HttpSource()
  let app!: FastifyInstance
  const log = { info: (o: unknown, m?: string) => app.log.info(o, m), warn: (o: unknown, m?: string) => app.log.warn(o, m), error: (o: unknown, m?: string) => app.log.error(o, m) }
  const client = new TseClient(source, log, {
    pollIntervalMs: config.pollIntervalSeg * 1000,
    activeWindowMs: config.activeWindowSeg * 1000,
    awaitStale: true,
  })
  const service = new Service(client, source)
  return buildApp(service).then(async (a) => {
    app = a
    await app.ready()
    return app
  })
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await (pronto ??= iniciar())
  app.server.emit('request', req, res)
}
