import type { FastifyInstance } from 'fastify'
import { buildApp } from './app'
import { config } from './config'
import { MockSource } from './mock/source'
import { Service } from './service'
import { TseClient, type Logger } from './tse/client'
import { HttpSource, type TseSource } from './tse/source'

const source: TseSource = config.modo === 'mock' ? new MockSource() : new HttpSource()

// O client só loga depois de iniciado (client.start), quando `app` já existe.
let app!: FastifyInstance
const log: Logger = {
  info: (o, m) => app.log.info(o, m),
  warn: (o, m) => app.log.warn(o, m),
  error: (o, m) => app.log.error(o, m),
}

const client = new TseClient(source, log, {
  pollIntervalMs: config.pollIntervalSeg * 1000,
  activeWindowMs: config.activeWindowSeg * 1000,
})
const service = new Service(client, source)
app = await buildApp(service)

client.start()
await app.listen({ port: config.port, host: config.host })
app.log.info(
  { modo: config.modo, base: config.baseUrl, ciclo: config.ciclo, turno: config.turno, pollSeg: config.pollIntervalSeg },
  'tse-apuracao API no ar',
)

const stop = async () => {
  client.stop()
  await app.close()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
