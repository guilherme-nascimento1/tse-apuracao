// Gera apps/web/src/data/br-ufs.json (paths SVG simplificados) a partir da malha do IBGE.
import fs from 'node:fs'
const geo = await (await fetch('https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF')).json()
const est = await (await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados')).json()
const byId = Object.fromEntries(est.map(e => [String(e.id), e]))
const LAT0 = -14, K = Math.cos((LAT0 * Math.PI) / 180)
const proj = ([lon, lat]) => [lon * K, -lat]
const rings = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flat()
let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9
const feats = geo.features.map(f => {
  const rs = rings(f.geometry).map(r => r.map(proj))
  rs.flat().forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) })
  return { f, rs }
})
const S = 600 / (maxX - minX), W = Math.round((maxX - minX) * S), H = Math.round((maxY - minY) * S)
const out = {}
for (const { f, rs } of feats) {
  const e = byId[f.properties.codarea]; if (!e) continue
  let d = '', cx = 0, cy = 0, n = 0, best = 0, bx = 0, by = 0
  for (const r of rs) {
    const pts = r.map(([x, y]) => [+((x - minX) * S).toFixed(1), +((y - minY) * S).toFixed(1)])
    d += 'M' + pts.map(p => p.join(' ')).join('L') + 'Z'
    let a = 0, sx = 0, sy = 0
    for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; const c = x1 * y2 - x2 * y1; a += c; sx += (x1 + x2) * c; sy += (y1 + y2) * c }
    a /= 2; if (Math.abs(a) > best && a) { best = Math.abs(a); bx = sx / (6 * a); by = sy / (6 * a) }
  }
  out[e.sigla] = { nome: e.nome, regiao: e.regiao.nome, path: d, cx: +bx.toFixed(1), cy: +by.toFixed(1) }
}
fs.writeFileSync('apps/web/src/data/br-ufs.json', JSON.stringify({ width: W, height: H, ufs: out }))
console.log(Object.keys(out).length, 'UFs', W, H)
