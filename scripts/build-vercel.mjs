// Gera a saída no formato "Build Output API v3" da Vercel:
//   .vercel/output/static            -> build do frontend
//   .vercel/output/functions/api/index.func -> API Fastify empacotada (esbuild)
import { build } from 'esbuild'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'

const out = '.vercel/output'
rmSync(out, { recursive: true, force: true })
mkdirSync(`${out}/functions/api/index.func`, { recursive: true })

cpSync('apps/web/dist', `${out}/static`, { recursive: true })

await build({
  entryPoints: ['apps/api/src/vercel.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: `${out}/functions/api/index.func/index.js`,
  logLevel: 'info',
})

writeFileSync(
  `${out}/functions/api/index.func/.vc-config.json`,
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.js', launcherType: 'Nodejs', maxDuration: 30 }),
)
writeFileSync(
  `${out}/config.json`,
  JSON.stringify({
    version: 3,
    routes: [
      { handle: 'filesystem' },
      { src: '^/api(?:/.*)?$', dest: '/api/index' },
      { src: '/(.*)', dest: '/index.html' },
    ],
  }),
)
console.log('Vercel output pronto em', out)
