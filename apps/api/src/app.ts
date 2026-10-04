import { existsSync } from 'node:fs'
import compress from '@fastify/compress'
import cors from '@fastify/cors'
import etag from '@fastify/etag'
import fstatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'
import type { CargoId } from '@tse/shared'
import { cargoById } from '@tse/shared'
import { config } from './config'
import { AppError, type Service } from './service'
import { SourceError } from './tse/source'

type Q = Record<string, string | undefined>

function cargoDe(q: Q): CargoId {
  const c = cargoById(q.cargo ?? 'presidente')
  if (!c) throw new AppError(400, `Cargo inválido: ${q.cargo}`)
  return c.id
}

export async function buildApp(service: Service, opts: { logger?: boolean | object } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? { level: config.logLevel } })

  await app.register(cors, { origin: true })
  await app.register(compress, { global: true, encodings: ['br', 'gzip'] })
  await app.register(etag)

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) return reply.code(err.status).send({ erro: err.message, detalhe: err.detalhe })
    if (err instanceof SourceError) {
      req.log.warn({ err: err.message }, 'fonte indisponível')
      return reply.code(502).send({ erro: 'Fonte de dados do TSE indisponível no momento', detalhe: err.message })
    }
    req.log.error(err)
    return reply.code(500).send({ erro: 'Erro interno' })
  })

  // Dados mudam a cada atualização: o navegador sempre revalida (ETag -> 304 barato).
  app.addHook('onSend', async (req, reply) => {
    if (req.url.startsWith('/api/') && !req.url.startsWith('/api/foto')) reply.header('Cache-Control', 'no-cache')
  })

  app.get('/api/health', async () => ({ ok: true, modo: config.modo, ciclo: config.ciclo, turno: config.turno }))
  app.get('/api/config', async () => service.getConfig())
  app.get<{ Querystring: Q }>('/api/resultado', async (req) => service.getRecorte(cargoDe(req.query), req.query.uf, req.query.regiao))
  app.get<{ Querystring: Q }>('/api/resumo', async (req) => service.getResumo(cargoDe(req.query)))
  app.get<{ Querystring: Q }>('/api/historico', async (req) => service.getHistorico(cargoDe(req.query), req.query.uf, req.query.regiao))

  app.get<{ Querystring: Q }>('/api/ranking', async (req) => {
    const escopo = (req.query.escopo ?? 'brasil') as 'brasil' | 'regiao' | 'uf'
    if (!['brasil', 'regiao', 'uf'].includes(escopo)) throw new AppError(400, 'escopo deve ser brasil, regiao ou uf')
    return service.getRanking(cargoDe(req.query), escopo, escopo === 'regiao' ? req.query.regiao : req.query.uf)
  })

  app.get<{ Querystring: Q }>('/api/candidato', async (req) => {
    const sq = req.query.sq
    if (!sq || !/^\d+$/.test(sq)) throw new AppError(400, 'Parâmetro sq inválido')
    return service.getDetalhe(cargoDe(req.query), sq, req.query.uf, req.query.regiao)
  })

  app.get<{ Querystring: Q }>('/api/municipios', async (req) => service.getMunicipios(req.query.uf ?? ''))
  app.get<{ Querystring: Q }>('/api/municipio', async (req) => service.getMunicipio(req.query.uf ?? '', req.query.codigo ?? ''))

  app.get<{ Params: { cd: string; uf: string; sq: string } }>('/api/foto/:cd/:uf/:sq', async (req, reply) => {
    const { cd, uf, sq } = req.params
    if (!/^\d+$/.test(cd) || !/^[a-z]{2}$/i.test(uf) || !/^\d+$/.test(sq)) throw new AppError(400, 'Parâmetros inválidos')
    const foto = await service.getFoto(cd, uf, sq)
    if (!foto) return reply.code(404).header('Cache-Control', 'public, max-age=300').send({ erro: 'Sem foto' })
    return reply.header('Cache-Control', 'public, max-age=86400').type(foto.contentType).send(foto.body)
  })

  // Push de atualizações (SSE): o front invalida as queries e o polling serve de fallback.
  app.get('/api/events', (req, reply) => {
    if (config.serverless) return reply.code(204).send()
    reply.hijack()
    const res = reply.raw
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    })
    res.write('retry: 5000\n\n')
    const onUpdate = (e: unknown) => res.write(`event: update\ndata: ${JSON.stringify(e)}\n\n`)
    service.events.on('update', onUpdate)
    const hb = setInterval(() => res.write(': hb\n\n'), 25_000)
    req.raw.on('close', () => {
      clearInterval(hb)
      service.events.off('update', onUpdate)
    })
  })

  // Produção: serve o build do frontend
  const dist = config.webDist
  if (dist && existsSync(dist)) {
    await app.register(fstatic, { root: dist, wildcard: false })
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ erro: 'Rota não encontrada' })
      return reply.sendFile('index.html')
    })
  }
  return app
}
