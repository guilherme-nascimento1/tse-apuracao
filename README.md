# Apuração 2026 · painel ao vivo

Painel web de apuração das Eleições 2026 que consome os JSONs públicos de divulgação do TSE.
React + Vite + Tailwind no front; Fastify como proxy/cache/normalizador no back.

## Rodar

```bash
npm install
cp .env.example .env      # TSE_MODE=mock por padrão
npm run dev               # API em :3001, web em http://localhost:5173
npm test                  # parser, normalizador, cache/retry e mock ponta a ponta
npm run typecheck
```

Com Docker (API + front buildado na mesma porta): `docker compose up --build` → http://localhost:3001

## Mock, simulado, oficial

| `TSE_MODE` | Fonte | Para quê |
|---|---|---|
| `mock` | gerador local, apuração de 0 a 100% em `MOCK_DURATION_S` (reinicia após `MOCK_HOLD_S`) | desenvolver/demonstrar a qualquer hora |
| `simulado` | `https://resultados-sim.tse.jus.br/simulado/simulado2026` | testar com o formato real |
| `oficial` | `https://resultados.tse.jus.br/oficial` | noite da eleição |

`TSE_BASE_URL` sobrescreve a base. Os códigos de eleição (ex.: `21270`/`21272` no simulado, `6257`/`6259` no oficial) **nunca são fixos**: saem de `comum/config/ele-c.json` filtrado por `TSE_CICLO` e `TSE_TURNO` (2º turno usa o `cdt2`).
O mock gera JSONs no mesmo formato do TSE, então passa pelo mesmo parser. Os candidatos e partidos do mock são fictícios e a tela exibe o selo MOCK.

## Mapeamento dos campos do TSE (inspecionados no simulado)

Todos os números chegam como string e os decimais usam vírgula.

| Arquivo | Campos usados |
|---|---|
| `ele-c.json` | `pl[].c` (ciclo), `pl[].e[].cd`/`cdt2`/`t`, `abr[].cp[].cd` (cargo: 1,3,5,6,7,8) |
| `{uf}-e{cd}-ab.json` | `abr[]` com `tpabr` = `br`/`uf`/`mun`; `s.ts`/`s.st` (seções), `e.est`/`c`/`a` (eleitorado, comparecimento, abstenção), `and` |
| `{uf}-c{cargo}-e{cd}-u.json` | `carg[].nv` (vagas), `carg[].agr[].par[].cand[]`: `sqcand`, `n`, `nmu`, `vap` (votos), `pvapn` (% válidos), `st` (status), `dvt` (situação), `vs[]` (vice `v`, suplentes `s1/s2`); totais em `s`, `e`, `v` (`tv`, `vvc`, `vb`, `vn`); `dt`/`ht` (hora em Brasília), `idg` (versão), `tf` |
| `config/mun-e{cd}-cm.json` | `abr[].mu[]` (`cd`, `nm`) para o seletor de município |
| `fotos/{uf}/{sqcand}.jpeg` | servido via `/api/foto/...` (cacheado) |

Regras de normalização: "Eleito*" e "2º turno" só aparecem quando o TSE informa; antes da totalização final "Não eleito" vira **Em apuração**. Arquivo 404 = apuração não iniciada (estado vazio, não erro).

## Backend

- Polling a cada `POLL_INTERVAL_S` (15–300 s; padrão 45) **apenas** dos arquivos consultados nos últimos `ACTIVE_WINDOW_S`.
- Requisições condicionais (`If-None-Match`/`If-Modified-Since`); 304 não reprocessa. User-Agent identificado (`TSE_USER_AGENT`: coloque um contato seu), no máx. 6 requisições simultâneas, respeito a `Retry-After`.
- Retry com backoff exponencial + jitter; em falha serve o último dado válido com `defasagemSeg` (a UI mostra "Dados de há X min").
- Deltas (votos, p.p., posição) vs. versão anterior e histórico da noite em memória; SSE em `/api/events` avisa o front, que ainda faz polling como fallback. ETag + gzip/brotli nas respostas.

Endpoints: `/api/config`, `/api/resultado?cargo=&uf=`, `/api/resumo?cargo=`, `/api/ranking?cargo=&escopo=brasil|regiao|uf&regiao=|uf=`, `/api/historico`, `/api/candidato?cargo=&sq=&uf=`, `/api/municipios?uf=`, `/api/municipio?uf=&codigo=`, `/api/foto/:cd/:uf/:sq`, `/api/events`, `/api/health`.

## Frontend

Filtros na URL (`?cargo=senador&uf=SP&q=...&cmp=sq1,sq2&cand=sq`). Presidente só no Brasil; os demais exigem UF; trocas inválidas são corrigidas com toast. Dark por padrão, light no toggle. Ranking com reordenação animada, count-up e flash; virtualizado acima de 60 candidatos. Mapa SVG (malha IBGE simplificada, regenerável com `npm run map`), comparador (até 3), detalhe do candidato, histórico, estados vazio/erro/skeleton, `prefers-reduced-motion` respeitado e tabela alternativa para os gráficos.

## Limitações

- O TSE divulga resultado por candidato só para Brasil e UF; o seletor de município mostra apenas seções/comparecimento/abstenção.
- Presidente por UF só aparece se o TSE publicar `{uf}-c0001-...`; no simulado existe.
- O histórico vive na memória do servidor: reiniciar zera (começa na próxima atualização). Votos do exterior (`ZZ`) não entram no mapa.
- Deputados: o status "Eleito/Suplente" vem do TSE; o mock simplifica (sem quociente eleitoral).
- Sem Redis; com várias instâncias cada uma mantém seu cache (basta uma para a CDN).
- A API roda com `tsx` (sem etapa de build própria) por simplicidade.

## Deploy na Vercel

O repositório já está pronto: `vercel.json` roda `npm run build:vercel`, que builda o front e empacota a API Fastify como uma função serverless (Build Output API, `scripts/build-vercel.mjs`).

1. Em vercel.com → *Add New Project* → importe este repositório (sem alterar framework/diretórios).
2. Em *Environment Variables* defina `TSE_MODE` (`mock`, `simulado` ou `oficial`; o padrão é `mock`), `TSE_USER_AGENT` com um contato seu e, se quiser, `TSE_TURNO`/`TSE_CICLO`.
3. Deploy. Pela CLI: `npx vercel login` e `npx vercel --prod`.

Diferenças em serverless: não há polling em background nem SSE (o front usa só polling a cada `POLL_INTERVAL_S`); o dado velho é revalidado com ETag na própria requisição; cache e histórico da noite ficam na memória de cada instância (podem reiniciar ou divergir entre instâncias); o mock usa relógio fixo para todas as instâncias mostrarem a mesma apuração.
