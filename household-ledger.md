# Household Ledger · v1.44.7

Aplicativo mobile-first de controle financeiro doméstico. Registra
transações da casa (despesas e receitas) por categoria e conta, com
dashboard, análise (gráficos + tendências + orçamentos), e importação de CSV
(Credit Karma ou planilha genérica) com deduplicação.

Construído a partir do mesmo scaffold do **aa-findocs**: React 18 + Vite no
front-end, funções serverless na Vercel e Redis (ioredis) como armazenamento
persistente por usuário.

---

## Versionamento

A versão do app é exibida no header ao lado de "Household" (`src/App.jsx`) e no título deste documento.

Regra de bump:
- **Patch** (`x.x.+1`) — qualquer alteração pequena: bugfix, ajuste de UI, texto, estilo
- **Minor** (`x.+1.0`) — feature nova ou mudança de comportamento relevante
- **Major** (`+1.0.0`) — redesign, mudança de arquitetura, breaking change

**OBRIGATÓRIO em TODO PR, sem exceção** — mesmo mudanças pequenas (1 linha,
CSS, texto) exigem bump de **patch** no mínimo. Nenhum PR deve ser
aprovado/mergeado sem o bump. A cada PR, atualize a versão em **dois
lugares**:
1. `src/App.jsx` — a string `v1.x.x` no span ao lado de "Household"
2. `household-ledger.md` — o `· v1.x.x` no título `# Household Ledger`

O `feature-auditor` deve conferir, como parte da checklist de auditoria, que
o diff inclui o bump nos dois arquivos antes de aprovar — se faltar, isso é
motivo de reprovação (devolver ao coder), não um detalhe opcional.

Versão atual: **v1.44.7** — **ui: LM/LY ao lado do NET no card hero da
Home** (PR #208, branch `claude/household-hero-net-lmly`, squash-merge SHA
`c059fb5a36d1f6b726248b8602276a72d77708fc`). No hero da Home, o valor NET
ganhou um bloco LM (Last Month) / LY (Last Year) posicionado à direita do
número (mesmo padrão visual — tag, valor formatado, % colorido — já usado
para Income/Expenses, porém em linha ao lado do NET em vez de abaixo dele).
`heroComparisons` (`useMemo`, `src/App.jsx`) ganhou `mmPctNet`/`yyPctNet`,
calculados com a mesma função `pct(cur, base)` usada para Income (net mais
alto = melhor = verde), aplicada a `mm.net`/`yy.net`. O bloco do valor NET
foi envolvido em um container flex-row (número + bloco LM/LY como irmãos
lado a lado). Guard `heroComparisons &&` (não renderiza quando ano/mês =
"All") e mascaramento via `hideValues` (`•••••`/`•••`) seguem o mesmo padrão
do bloco já existente. Sem mudança de API/Redis/modelo de transação/regra
de exclusão de `Transfer`.

Versão anterior: **v1.44.6** — **ui: data labels no Year in Review + fix de
formatação de valores < $1K** (PR #207, merge squash `968995a`). Duas
mudanças em `src/App.jsx`: (1) `YearInReviewCard` ganhou `<LabelList>` no
`Bar dataKey="value"` do waterfall, mesmo padrão visual do `MonthlyBarCard`
(texto cinza, `fontSize: 10`, posição "top", respeita `hideValues`) — antes
era o único gráfico de barras "principal" da tab Charts sem rótulo de valor
sobre a barra; (2) as 4 funções de formatação compacta "K" usadas pelos
cards de gráfico (`Charts.fmtK`/`Charts.fmtKFull` — `MonthlyBarCard`,
`CategoryStackedBarCard`, `MonthlyAvgByCategoryCard`, agora também
`YearInReviewCard`; `Dashboard.fmtK` — `DailyPaceCard`; e
`Transactions.moneyShortK` — pills de resumo da barra de auditoria) passam
a exibir valores com `|valor| < 1000` como inteiro em dólar sem casas
decimais e sem sufixo "K" (ex.: `$123` em vez de `$0.1K`); valores ≥ $1000
continuam no formato `$X.XK`. `DailyHeatmapCard` não foi tocado (usa dólar
cheio via `usd0`, fora do bug). Só `src/App.jsx` alterado; sem mudança de
API/Redis/modelo de transação.

Versão anterior: **v1.44.5** — **ui: Daily Spend Pattern (desktop) ganha eixo Y
e rótulo em todos os 31 dias**. Como as barras do bar-sparkline (v1.44.3)
têm espaço de sobra, a coluna de rótulos abaixo das barras passou a mostrar
o número de todos os dias (não mais só a cada 5), e uma coluna de eixo Y à
esquerda mostra o valor de referência (topo/meio/zero, formato compacto sem
centavos via `usd0`, respeitando `hideValues`) com linhas-guia horizontais
sutis atrás das barras. Sem mudança de lógica de agregação.

Versão anterior: **v1.44.4** — **fix: Daily Spend Pattern (desktop) ganha
rótulos de dia no eixo X**. O bar-sparkline de 31 barras introduzido na
v1.44.3 não tinha nenhuma referência visual de qual dia cada barra
representava; agora uma linha de rótulos abaixo das barras mostra o número
do dia a cada 5 dias (1, 5, 10, 15, 20, 25, 30), destacando o dia ativo
(clicado) em negrito. Sem mudança de lógica de agregação.

Versão anterior: **v1.44.3** — **ui: Daily Spend Pattern ganha breakdown por
categoria e vira responsivo de verdade**. `DailyHeatmapCard` (`src/App.jsx`)
agora agrega, além da média diária total, o top-3 de categorias por gasto
médio de cada dia-do-mês (mesmo divisor `monthDayCounts`, sem alterar a
lógica de exclusão de `Transfer`/income). No desktop (`isWide`) o grid
calendário 7 colunas deu lugar a um bar-sparkline de até 31 barras finas
ocupando 100% da largura do card (removido o `maxWidth: 380` que sobrava
espaço lateral); mobile mantém o grid de calendário inalterado. O `title`
nativo (não funcionava em touch) foi substituído por um painel de tooltip
controlado por estado (`activeDay`), acionado por `onClick` em vez de
hover — clicar num dia/barra abre um painel fixo abaixo do gráfico (estilo
`ChartTooltip`: fundo `#1e2329`, borda sutil, `borderRadius:14`) com o dia,
o valor médio total e até 3 linhas de categoria, todos respeitando
`hideValues`; clicar de novo no mesmo dia fecha. `activeDay` reseta para
`null` sempre que `scoped` muda, evitando popover com dado obsoleto ao
trocar filtro/range.

Versão anterior: **v1.44.2** — **ui: Year in Review reorganiza toggle e
seletor de ano**. O toggle Expense/Income moveu para a mesma linha do
título "Year in Review" (à direita, seguindo o padrão do card Trends); o
`<select>` de ano passou a ocupar a linha logo acima do gráfico, alinhado
à direita, onde antes ficava o toggle. Nenhuma mudança de lógica, apenas
reordenação de JSX/CSS no `YearInReviewCard` (`src/App.jsx`).

Versão anterior: **v1.44.1** — **fix: causa raiz do crash da tab Settings
encontrada e corrigida**. O `TabErrorBoundary` da v1.44.0 capturou o erro
real na primeira vez que o usuário reabriu a Settings: `descWords is not
defined`. Causa: na extração do núcleo puro para `src/ledger.js` (v1.39.0,
PR #195), `descWords` (tokenizador usado tanto por `descOverlap`/dedup
quanto por `descFragment`, no App.jsx, para a seção "Manual category
corrections" do painel Suggested Rules) virou uma função **não exportada**
de `ledger.js` — `descFragment` no App.jsx continuou chamando `descWords`
diretamente, sem import, gerando `ReferenceError` em runtime. O bug só
disparava quando `detectManualCategoryCorrections` encontrava ao menos uma
transação com `categoryManual: true` (correção manual de categoria) — daí
não ter sido pego nem pelos testes do `ledger.test.js` (que não tocam
App.jsx) nem pela tentativa de reprodução da v1.44.0 (dataset sintético
sem nenhuma transação com esse campo). Fix: `descWords` agora é `export
function` em `ledger.js` e importado no App.jsx. Para fechar a lacuna de
cobertura, `descFragment`/`detectManualCategoryCorrections` passaram a ser
exportados também do próprio `App.jsx` (nomeado, ao lado do default
`App`) e ganharam `src/App.integration.test.js` (3 testes) exercitando
exatamente esse caminho com uma transação `categoryManual: true` — esse
teste falha imediatamente (`descWords is not a function`) se a mesma
classe de regressão voltar a acontecer, verificado manualmente revertendo
o export durante o desenvolvimento desta correção. `ledger.test.js` ganhou
também um teste direto de `descWords`. Uma varredura de todos os
identificadores não-exportados de `ledger.js` contra o texto de `App.jsx`
confirmou que esse era o único caso pendente (o único outro identificador
privado, `DEDUP_STOP_WORDS`, não é referenciado fora de `ledger.js`).
Testes 28/28, build OK. (PR #201, branch `claude/fix-descwords-export`.)

Versão anterior: **v1.44.0** — **ajustes de feedback pós-v1.43 (4 itens)**:
(1) **ErrorBoundary global por tab** (`TabErrorBoundary`, class component,
única forma de capturar erro de render em React): envolve o conteúdo de
`<main>`, resetado via `key={tab}` a cada troca de aba. Antes, qualquer
exceção de render em qualquer lugar da árvore desmontava o app inteiro sem
feedback (tela preta, sem header/tab bar) — reportado pelo usuário como
"tela fica preta ao clicar em Settings", mas **não reproduzido** apesar de
tentativa extensiva (jsdom com dataset sintético de 6 anos, bundle de
produção real, Chromium headless real com os headers de CSP do
`vercel.json` aplicados, todas as seções da Settings expandidas — todos os
cenários renderizaram corretamente). Como não foi possível reproduzir a
causa raiz, a correção aplicada é a rede de segurança que faltava:
qualquer erro futuro (nesta tab ou outra) agora aparece como uma mensagem
com a causa + botão "Reload app", em vez de tela preta — se recorrer,
a mensagem exibida já é o diagnóstico. (2) **Daily Heatmap movido do Home
para o fim da tab Trends** e **transformado em padrão médio por dia do
mês**: em vez do calendário de um mês específico, `DailyHeatmapCard` agora
lê o mesmo `scoped` (categoria + range de anos do masthead da Trends) que
`MonthlyBarCard`/`CategoryStackedBarCard` usam — para cada dia 1–31,
calcula a média do gasto líquido daquele dia através de todos os meses no
escopo que de fato têm aquele dia (dividindo só pelos meses que têm dia 31,
por exemplo, em vez de todos, o que sub-estimaria dias altos); grid 7
colunas sem cabeçalho de dia-da-semana (não é mais um mês específico) nem
offset de calendário. Card com `maxWidth: 380` no desktop (`isWide`) —
antes ocupava a largura cheia do card, ficando desproporcionalmente grande;
mobile inalterado (full width). (3) **Year in Review: dropdown de ano** em
vez de chips separados (`<select>`, `S.select`). (4) **Year in Review: fix
do bug visual do waterfall + redesign**: o gráfico antigo (barras
flutuantes via `Bar` "base" invisível + `Bar` "value" empilhados) fazia a
primeira categoria de despesa (maior gasto) ocupar visualmente a MESMA
altura total do Income, porque a altura empilhada (base+value) de cada
barra é sempre igual ao total corrente ANTES daquela despesa ser
subtraída — correto matematicamente para uma waterfall clássica, mas lido
como "Income e Mortgage do mesmo tamanho" pelo usuário. Substituído por um
**bar chart simples por categoria** com toggle **Expense | Income**
(`S.togglePill`, mesmo padrão do `MonthlyBarCard`), separando as duas
listas em vez de misturá-las numa cascata; cada barra agora reflete
diretamente sua própria magnitude (sem artefato de altura acumulada).
Coluna **Net removida** do gráfico (já aparece nos KPIs no topo do card).
**Comparação vs. ano anterior alinhada por YTD** quando o ano selecionado é
o ano corrente: `cutoffMD` (mês-dia de hoje) filtra tanto o ano atual
quanto o anterior para a mesma janela antes de calcular o %; um ano
passado completo continua comparando ano cheio vs. ano cheio (ex.: 2025 vs.
2024). O KPI numérico exibido continua sendo o total real do ano (já
naturalmente "YTD" para o ano corrente, por não haver dados futuros) — só
o **percentual de comparação** usa o corte. Sem mudança de API/Redis/
modelo de transação em nenhum dos 4 itens. Testes 24/24 e build OK. (PR
#200, branch `claude/user-feedback-fixes-1`.)

Versão anterior: **v1.43.0** — **UI de snapshots diários** (item "UI de
snapshots" da Fase 6): novo endpoint **read-only** `api/snapshots.js` — GET
lista as datas disponíveis (`redis.keys` no prefixo exato
`<transactionsKey>:snapshot:*`, ≤ ~30 chaves pelo TTL; newest first) e GET
`?date=YYYY-MM-DD` retorna `{ date, transactions, savedAt, count }` daquele
snapshot (404 se expirou, validação de formato da data). Nova seção
**"Daily snapshots"** (`SnapshotsSection`, `CollapsibleCard`) na tab
Settings, abaixo do backup: lista as datas com botão **Restore** em
confirmação de 2 cliques (auto-reset 2,5 s, mesmo padrão dos delete chips);
o restore baixa o snapshot e passa por `onRestoreTransactions` → o fluxo
normal de restore (PUT `/api/transactions`), então **concorrência otimista,
validação server-side e o espelho offline continuam valendo** — e o estado
atual segue recuperável pelo snapshot de hoje (SET NX preserva o primeiro
estado do dia). Snapshot vazio não restaura (guarda no client). Roadmap
atualizado: fecham os itens "UI de snapshots" (Fase 6), "Alertas de
anomalia", "Year in Review" e "Suite de testes + CI" (Fase 7);
"Code-splitting" marcado como parcial (vendor chunks, lazy-load real
adiado). (PR #199, branch `claude/snapshots-ui`.)

Versão anterior: **v1.42.0** — **Year in Review + waterfall** (item "Year in
Review" da Fase 7): novo `YearInReviewCard` no fim da tab **Trends**, com
**seletor de ano próprio** (`S.togglePill`, até 6 anos, default = ano mais
recente com dados; ignora deliberadamente o range/granularity do masthead).
Conteúdo: (1) linha de **KPIs** Income / Expenses / Net do ano com % vs ano
anterior (quando existe), cor por direção (mais despesa = vermelho, mais
income/net = verde), valores em `usd0` e ocultos com `hideValues`; (2)
**waterfall "para onde foi o dinheiro"**: Income como primeira barra, cada
categoria de despesa descendo em degraus (top 9 por magnitude + "Other
cats" agrupando a cauda), barra final **Net** (verde ≥ 0 / vermelha < 0).
Implementado com o padrão de barra flutuante do recharts: `Bar` invisível
`base` + `Bar` `value` empilhados (`stackId`), `Cell` por barra usando
`getCategoryColor`; categorias com refund líquido positivo sobem (delta
sinalizado, nunca `Math.abs` na agregação — invariante preservada via
`computeTotals`). Labels do eixo X inclinados (-38°) para caberem. Desde a
v1.44.6 (PR #207) o `Bar dataKey="value"` também exibe rótulo de valor
sobre cada barra via `<LabelList>` (mesmo padrão do `MonthlyBarCard`,
respeita `hideValues`), igualando-o aos demais gráficos de barra principais
da tab. Sem mudança de API/Redis/modelo. Testes 24/24 e build OK. (PR #198,
branch `claude/year-in-review`.)

Versão anterior: **v1.41.0** — **fila offline persistente** (item 11 da análise
técnica, Fase 6): um ledger sujo vivia só em memória — fechar o PWA offline
(ou depois de um save falho) perdia as edições. Agora todo `scheduleSave`
espelha o array pendente em `localStorage`
(`household_pending_save`, `{ transactions, baseSavedAt, at }`, try/catch
para quota/private mode) e o save bem-sucedido limpa o espelho
(`clearPendingSave` também no caminho 409, onde o pendente é sabidamente
stale). No boot, `load()` compara o `baseSavedAt` gravado com o `savedAt`
do server: **iguais** → o pendente é restaurado (`setTransactions` +
re-agendamento do save via `pendingRestoreRef` + efeito, já que `load` é
declarado antes de `scheduleSave`) com aviso "Unsaved changes from your
previous session were restored and will be saved"; **diferentes** → outro
device salvou no meio, o pendente é descartado com aviso explícito (mesma
regra do 409 — aplicar o espelho stale sobrescreveria as mudanças do outro
device). Sem mudança de API/Redis/modelo. Testes 24/24 e build OK. (PR
#197, branch `claude/offline-pending-queue`.)

Versão anterior: **v1.40.0** — **vendor chunk splitting** (item "Code-splitting"
da Fase 7, fatia 1): `vite.config.js` ganhou `build.rollupOptions.output.manualChunks`
separando o stack de gráficos (`recharts` + internos `victory-vendor`/`d3-*`/
`internmap` etc.) num chunk **`charts`** (~427 KB / 117 KB gzip) e o runtime
React (`react`/`react-dom`/`scheduler`) num chunk **`react`** (~142 KB); o
chunk da aplicação caiu de ~744 KB (bundle único) para ~189 KB. Benefício
principal no PWA: mudanças de código do app invalidam só o chunk pequeno no
precache do Workbox (recharts/React ficam cacheados entre versões), e os 3
chunks baixam em paralelo no primeiro load. **Limitação documentada**:
lazy-loading de verdade (só baixar recharts ao abrir um gráfico) exigiria
extrair os cards de gráfico do monolito `App.jsx` — os componentes recharts
não toleram proxies `React.lazy` (o `BarChart` inspeciona os `children` por
tipo), então essa fatia fica adiada. Sem mudança de código de app — só
build config. Testes 24/24 e build OK. (PR #196, branch
`claude/recharts-chunk-split`.)

Versão anterior: **v1.39.0** — **núcleo financeiro extraído + suite de testes +
CI** (item "Suite de testes + CI" da Fase 7 do Roadmap): novo
**`src/ledger.js`** com os helpers **puros e stateless** movidos (não
copiados) do `App.jsx`: `TRANSFER_CATEGORY`, `computeTotalsCore` (núcleo do
`computeTotals`; o wrapper no App injeta o `INCOME_CATEGORIES` runtime),
`matchPeriod`, `availableYears`, `bucketKey`/`bucketLabel`,
`ckCategoryToken`/`mapCkCategory`, `descriptionRuleMatches`/
`findMatchingDescriptionRule`/`matchDescriptionCategoryRule`/
`computeDescriptionRuleConflicts`, `normAccount`/`matchAccountWithAliases`
(agora recebe `accounts` como parâmetro — os 3 call sites passam o
`ACCOUNTS` runtime), e o pipeline de dedup completo
(`txnFingerprint`/`descOverlap`/`dateToDayInt`/`markDuplicates`). O estado
de módulo runtime-configurável (listas, aliases, CK map, rules, `buildRow`)
**permanece no App.jsx** — só a parte pura saiu. Novo
**`src/ledger.test.js`** (Vitest, 24 testes) cobrindo os invariantes que já
quebraram na v1.5.10: soma sinalizada com `net = income + expenses`,
bucket de despesa dominado por refund fica positivo, Transfer excluído de
todos os totais, precedência Transfer/Payment no `mapCkCategory`,
"primeira regra vence" nas Description rules com `providerPattern` AND,
match exato > alias > vazio nas contas, e o dedup híbrido
(sourceId/fingerprint/fuzzy ±2 dias). **`vitest` adicionado como
devDependency** (sancionado pelo item do Roadmap; `npm test` = `vitest
run`) e novo workflow **`.github/workflows/ci.yml`** (push/PR → `npm ci`,
`npm test`, `npm run build`). `package.json.version` sincronizado (estava
parado em 1.30.0). Comportamento do app inalterado — refactor + testes.
(PR #195, branch `claude/ledger-helpers-tests`.)

Versão anterior: **v1.38.0** — **Daily Heatmap na Home** (item 15 da análise de
produto de 2026-07-18): novo card `DailyHeatmapCard` entre o Daily Spending
Pace e o "by Category", visível só com ano+mês selecionados e quando o mês
tem algum gasto. Grade-calendário estilo GitHub (7 colunas, semana começa no
domingo, header S/M/T/W/T/F/S), uma célula por dia do mês com intensidade de
fundo ∝ gasto líquido do dia (laranja `#F97316` com alpha `0.15 + 0.75·√(v/max)`
— a raiz quadrada suaviza o skew de um dia outlier; dias sem gasto ou
netados a ≥ 0 por refund ficam em `rgba(255,255,255,0.05)`). Implementado em
divs puras (CSS grid, `aspectRatio: 1`), sem lib de gráfico. Segue o
`catFilter` do período (usa `periodTxns`, excluindo Transfer e income, com
sinal invertido para série positiva). Tooltip nativo (`title`) com o valor
do dia via `usd.format`, suprimido com `hideValues`. Sem mudança de API/
Redis/modelo de transação. (PR #194, branch `claude/daily-spend-heatmap`.)

Versão anterior: **v1.37.0** — **pacote de dataviz** (itens 16 e 17 da análise
de produto de 2026-07-18; o item 7 — cores de categoria consistentes — já
estava implementado desde antes via `CATEGORY_COLOR_MAP` curado +
`catDotColor` hash-based, nenhuma mudança necessária): (1) **Médias móveis
3M/12M no `MonthlyBarCard`** (Trends): o card agora recebe `granularity` do
pai e, quando `granularity === "M"`, calcula médias móveis *trailing* de 3
e 12 meses da série ativa (Expense/Income/Net) — `null` até a janela
completar, para as linhas começarem no 3º/12º bucket em vez de mostrar
médias parciais enganosas. `BarChart` virou `ComposedChart` (import novo,
junto com `Line` e `Treemap`) com duas `Line`s: 3M sólida branca
(`#e5e7eb`), 12M tracejada roxa (`#a78bfa`), + mini-legenda no padrão do
`DailyPaceCard`; em Q/H/Y nada muda (sem linhas). (2) **Treemap na Home**:
a seção "by Category" ganhou um toggle **List | Map** (`S.togglePill`,
estado local `catView`, default List): no modo Map, novo
`CategoryTreemapCard` renderiza um `Treemap` do recharts com área ∝
magnitude do gasto líquido da categoria no período (categorias netadas a
≥ 0 por refunds ficam de fora), células coloridas com o mesmo
`getCategoryColor` de todos os gráficos, labels de nome/valor (`usd0`)
desenhados só quando a célula comporta, tooltip padrão e respeito total a
`hideValues` (labels de valor e tooltip somem). Sem mudança de API/Redis/
modelo de transação. (PR #193, branch `claude/dataviz-ma-treemap`.)

Versão anterior: **v1.36.0** — **pacote de features do Dashboard** (itens 4, 5 e
8 da análise de produto de 2026-07-18): (1) **Projeção de fim de mês no
Daily Pace**: `dashboardPaceData` agora retorna `projectedTotal`
(extrapolação linear `curRunning / todayDay × daysInCur`, só quando o mês
selecionado é o corrente) e `prevTotal` (total fechado do mês anterior); o
`DailyPaceCard` exibe uma linha "Projected {mês}: $X.XK · {mês anterior}:
$Y.YK" abaixo da legenda, com cor por direção (despesa acima do mês
anterior = vermelho; income acima = verde), oculta com `hideValues`. (2)
**Budgets reintroduzidos como bullet bars**: o endpoint `api/budgets.js`
(órfão desde o PR #8) volta a ter UI — novo estado `budgets` no App
(load/save no padrão `loadAccountMap`), seção **"Monthly budgets"**
(`BudgetsSection`, `CollapsibleCard`) na tab Settings com um input numérico
por categoria de despesa e botão "Save budgets" (persiste só valores > 0), e
novo card **Budgets** (`BudgetsCard`) na Home entre "by Category" e "All
Time": para cada categoria com orçamento, barra bullet com preenchimento
`spent/budget`, **marcador de pace** (linha branca em
`cutoffDay/daysInMonth` — onde o gasto "deveria" estar no dia atual; mês
passado = fim da barra) e cor por estado (verde no pace, âmbar >10 pts à
frente do pace, vermelho estourado); refunds que zeram o balde contam como
0 gasto; respeita `hideValues` via `money`. (3) **Badge de anomalia** no "by
Category" (`AnomalyBadge`): quando o gasto MTD da categoria já atinge
≥1.5× a média `avg12m` (média de mês cheio — comparação deliberadamente
conservadora, sem prorata), badge âmbar "⚠ N.N× avg" ao lado dos M/M-Y/Y.
Sem mudança de API/Redis/modelo de transação. (PR #192, branch
`claude/dashboard-pace-budgets-anomalies`.)

Versão anterior: **v1.35.0** — **pacote de confiabilidade e segurança, fatia 2**
(itens 1, 2, 3, 9 e 12 da análise técnica de 2026-07-18): (1) **fix de perda
de dado silenciosa no save**: `save()` fazia `setDirty(false)` antes do
fetch e o `catch` não restaurava — um PUT que falhasse (500, queda de rede
com `navigator.onLine` ainda true) deixava a mudança órfã, invisível para o
retry-on-online e para o flush de `pagehide`; agora o `catch` faz
`setDirty(true)`. (2) **CAS atômico no PUT de `/api/transactions`**: a
checagem otimista "GET savedAt → compara → SET" virou um script Lua único
(`CAS_PUT_SCRIPT`, `redis.eval`) — elimina a janela em que dois devices
passavam na checagem e o segundo sobrescrevia sem 409; clients sem
`expectedSavedAt` mantêm last-write-wins (back-compat); `''` representa
savedAt nulo/legado no script. (3) **validação server-side do ledger**
(`findInvalidRow`): todo item do PUT precisa de `date` `YYYY-MM-DD` e
`amount` numérico finito, senão 400 — defesa em profundidade contra um
client bugado regravar o blob inteiro com lixo. (4) **rate-limit de senha**
em `lib/auth.js`: >20 falhas/IP/60s → 429 (contador `household:authfail:<ip>`
via INCR+EX no Redis, fail-open se o Redis cair). (5) **headers de
segurança** no `vercel.json`: HSTS, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer`, `Permissions-Policy` e CSP (`script-src
'self'`; `style-src 'unsafe-inline'` necessário para os estilos inline do
objeto `S`; `frame-ancestors 'none'`) — build verificado sem scripts
inline. (6) **enforcement server-side** do débito do PR #135:
`sanitize()` em `api/category-description-rules.js` agora só persiste
`allowTransferOverride: true` acompanhado de `providerPattern` não-vazio.
Sem mudança de contrato/formato Redis; 409/400/429 são as únicas respostas
novas. (PR #191, branch `claude/reliability-security-pack`.)

Versão anterior: **v1.34.0** — o card **`MonthlyBarCard`** (tab Trends) ganhou um
terceiro toggle **Net**, ao lado de Expense/Income (`S.togglePill`, mesmo
padrão). No modo Net, `dataKey` vira `"net"` (`income - expenses` calculado
por bucket a partir do `byBucket` já recebido do pai, que já exclui
`Transfer`); cada barra é colorida por sinal (verde `#34d399` ≥ 0, vermelho
`#f87171` < 0) via `<Cell>` por barra em vez de `fill` estático (import de
`Cell` adicionado aos imports do `recharts`). Eixo Y e labels de topo de
barra usam `fmtKTooltip` (formatter com sinal) em vez de `fmtK` (que usa
`Math.abs`) quando `view === "net"`; Expense/Income continuam usando `fmtK`
sem mudança. Limitação conhecida: `radius={[4,4,0,0]}` continua fixo
arredondando o topo mesmo em barras negativas (fica visualmente invertido);
não foi tratado por ser puramente cosmético e fora do escopo definido. (PR
#190, branch `claude/household-monthlybar-net-toggle`, merge commit
`9413494`.)

Versão anterior: **v1.33.0** — o card **"Daily Spending Pace"** (Home) ganhou um
toggle **Income | Expense** (`S.togglePill`, mesmo padrão já usado no
`MonthlyBarCard`/`CategoryStackedBarCard`), default **Expense** (preserva o
comportamento original ao carregar a Home). Novo estado `paceView`
(`"expense" | "income"`), com `setPaceView` controlado no componente pai da
Home e passado como prop ao `DailyPaceCard`. O `useMemo`
`dashboardPaceData` passou a aceitar o modo: no modo Expense, comportamento
idêntico ao anterior (exclui Transfer e income, inverte o sinal para série
positiva); no modo Income, exclui Transfer e expense e soma o sinal direto
sem `Math.abs` (estornos/reversões de income netam naturalmente). A regra
fixa de excluir `Transfer` de todos os totais/gráficos foi preservada em
ambos os modos. Cor da série "current" no gráfico: laranja `#F97316` no modo
Expense (como já era), ciano `#06B6D4` no modo Income (mesmo tom já
convencionado para Income no `MonthlyBarCard`). Sem mudança de API/Redis/
modelo de transação. (PR #188, branch `claude/household-daily-pace-toggle`.)

Versão anterior: **v1.32.0** (PR #187, commit b84b494) — os KPIs M/M ("LM") e
Y/Y ("LY") do card principal (hero) da Home passam a considerar MTD
(month-to-date) em vez do mês/ano de referência inteiro, seguindo o mesmo
padrão de corte por dia já usado nos badges de categoria da lista "by
Category" (`catChanges`/`sumCat`). `heroComparisons` (`useMemo`) agora filtra
`mmTxns`/`yyTxns` pelo mesmo `cutoffDay` já calculado no componente:
`(cutoffDay === null || (t.date || "").slice(8, 10) <= cutoffDay)`. Quando o
período selecionado é o mês corrente, `cutoffDay` é o dia de hoje; quando é
um mês passado, é o último dia daquele mês (efetivamente mês cheio, sem
regressão nesse caso); quando é "All", `heroComparisons` já retorna `null`
antes do filtro. Casos de borda (mês anterior mais curto, ano bissexto) são
cobertos automaticamente pela comparação de string de 2 dígitos, sem
tratamento especial. Sem mudança de layout, labels ("LM"/"LY" continuam) ou
estilo — só o cálculo dos valores. Sem mudança de API/Redis/modelo de
transação; `Transfer` continua excluído via `computeTotals`. *(nota: o
header do App.jsx havia avançado até v1.31.5 em PRs anteriores #182-#186 sem
atualização correspondente deste changelog; este PR sincroniza a numeração a
partir de v1.32.0.)*

Versão anterior: **v1.31.0** — novo card "Composition Evolution" na tab Trends:
stacked area (100%) / streamgraph de composição por categoria ao longo do
tempo, com toggle Expense/Income, toggle Area/River e seletor de período
local (1Y/2Y/5Y/All) intersectado com o escopo do masthead.

Versão anterior: **v1.30.0** — pacote de confiabilidade de dados + remoção do
login Google (ver item "Fase 6 — Confiabilidade de dados, fatia 1" no
Roadmap): concorrência otimista no PUT de transactions (409 em conflito
entre dispositivos + reload com aviso), flush de save confiável
(`pagehide`/`visibilitychange` + `keepalive`), retry automático ao voltar
online, snapshot diário automático no Redis (TTL 30 dias), autenticação
somente por senha (timing-safe; Google JWT removido do client e do server),
`todayISO()` em data local (fim do desvio de fuso à noite), cascatas
completas de rename/delete de conta/categoria (rules, CK map, aliases,
reatribuição de transações), validação do restore de backup, e limpezas
(CORS wildcard removido dos endpoints, regra morta de cache `/api` do
service worker removida, `package.json.version` sincronizado). *(v1.29.0
foi pulada: usada e revertida no PR #178.)*

Versão anterior: **v1.28.2** — fix: dismiss dos cards do painel "Suggested
rules" (Settings) agora persiste via API/Redis (`household:*:dismissedsuggestions`,
novo endpoint `api/dismissed-suggestions.js` clonado de `api/account-aliases.js`),
em vez de `useState` local em `SuggestedRulesSection`. Antes, como o app troca
de tab desmontando/remontando `SettingsTab`, qualquer sugestão dispensada
(ex. "amazon retail", "amazon marketplace") reaparecia ao voltar pra aba —
dismiss não sobrevivia nem à navegação, muito menos a um reload ou outro
dispositivo. Agora o estado de dismissal é household-scoped e cross-device,
igual account aliases/CK category map/description rules. `App` carrega
`dismissedSuggestions` num `useEffect` gated por `authed` (mesmo padrão de
`loadAccountAliases`) e propaga junto com um callback `onDismissSuggestion`
via `SettingsTab` até `SuggestedRulesSection`, que faz update otimista do
state local + `PUT` da lista completa. Nenhuma mudança na lógica de detecção
das sugestões (`detectSuggestedAliasFragments`/`detectSuggestedCategoryTokens`/
`detectManualCategoryCorrections`) nem no formato `household:*:transactions`.

Versão anterior: **v1.28.1** — fix de estilo: o `<input type="month">`
(`SinglePeriodFilter`) e o `<select>` (`SingleCategoryFilter`, desktop,
`S.chipSelect`) passam a declarar `colorScheme: "dark"` (CSS `color-scheme:
dark`), fazendo o popup nativo do calendário e a lista de `<option>` abrirem
com o chrome escuro do SO/browser em vez do tema claro padrão. Sem mudança de
comportamento/lógica — apenas 2 linhas de CSS. Limitação conhecida e aceita:
suporte parcial no Safari, e as cores exatas do popup nativo (controladas
pelo SO, não pelo CSS do app) não ficam 100% idênticas à paleta do projeto.

Versão anterior: **v1.28.0** — no desktop, o chip de filtro de categoria
(`SingleCategoryFilter`, tab Home/Dashboard) passa a usar um `<select>` HTML5
nativo em vez do botão-chip + `Popover` customizado, deixando o filtro mais
rápido de operar com teclado/mouse e mais consistente com o padrão nativo já
usado pelo `SinglePeriodFilter` no desktop (`input type="month"`). O
`<select>` é estilizado com `appearance: "none"` reaproveitando as cores/
bordas/fonte do `S.chipBtn` (novo token `S.chipSelect`), com uma seta `▼`
sobreposta via `span` `pointerEvents: "none"` (`S.chipSelectArrow`) para não
interceptar cliques. No mobile (`isWide === false`), o comportamento não
muda: chip + `Popover` customizado, igual antes. `isWide` (já calculado na
raiz do `App` via `useMediaWide(900)`) passou a ser propagado para
`Dashboard` e, de lá, para `SingleCategoryFilter`. Nenhuma mudança no branch
iOS/mobile do `SinglePeriodFilter` nem no contrato de dados
(`year`/`month`/`catFilter` continuam string única). Só `src/App.jsx`
alterado; sem mudança de API/Redis/modelo de transação.

Versão anterior: **v1.27.0** — substitui o fallback iOS de dois `<select>`
(Mês/Ano) do `SinglePeriodFilter` (Home) por um wheel picker estilo iOS
nativo, em React puro + CSS scroll-snap (sem libs novas). No branch
`isIOSDevice`, o chip agora abre um `Popover` (mesmo componente já usado nos
demais filtros) contendo duas colunas `WheelColumn` (Mês | Ano) com scroll
vertical `scroll-snap-type: y mandatory`; a linha centralizada é o valor
selecionado, destacada por peso/tamanho de fonte (`S.wheelItem(dist)`, onde
`dist` é a distância até o centro). Ao parar o scroll (debounce de 120ms),
calcula o item mais próximo do centro, aplica snap suave e chama
`setMonth`/`setYear`; ao montar ou quando o valor muda externamente (ex.
"reset to today"), a coluna re-centraliza via `scrollTop` direto. O branch
desktop (`input type="month"` + `showPicker()`) permanece inalterado. Essa
mesma abordagem já tinha sido implementada para ambas as plataformas em
v1.24.1 e revertida em v1.25.0 por não funcionar bem com mouse/scroll no
desktop — desta vez fica restrita ao branch iOS/iPadOS, onde não há esse
problema. Estilos novos: `S.wheelCol`, `S.wheelItem`; `S.periodSelect` (dos
dois `<select>` antigos) foi removido por ficar sem uso.

Versão anterior: **v1.26.0** — fix de compatibilidade iOS no `SinglePeriodFilter`
(Home): Safari (iOS/iPadOS) não suporta `<input type="month">` nativamente
(cai para texto simples, sem picker, e `showPicker()` não abre nada útil lá).
Detectamos iOS/iPadOS (`/iPad|iPhone|iPod/` no `userAgent`, com fallback para
`navigator.platform === "MacIntel" && maxTouchPoints > 1` cobrindo iPadOS 13+)
e, quando é iOS, renderizamos dois `<select>` nativos (Mês/Ano, novo estilo
`S.periodSelect`) no lugar do input de mês; nos demais navegadores o
comportamento existente (`input type="month"` + `showPicker()`) é mantido
inalterado. O range de anos do select vem do mesmo `minMonth`/`maxMonth`
(`monthRange`) já calculado no `Dashboard`. O botão de reset (`resetToToday`)
funciona igual em ambos os casos.

Versão anterior: **v1.25.2** — corrigido bug no `SinglePeriodFilter` em que o
`<input type="month">` transparente sobreposto ao chip interceptava o clique
(o clique focava o input mas não abria o picker nativo no Chrome/Edge, que só
abre via `.showPicker()` ou clique no ícone de calendário). Fix: o input
agora tem `pointerEvents: "none"`, então o clique chega ao `<button>` e
`openPicker()` chama `el.showPicker()` normalmente; o `onChange` do input
continua funcionando via interação com o picker nativo aberto por JS. Também
foram adicionados `min`/`max` ao input (formato `"YYYY-MM"`), calculados no
`Dashboard` a partir do menor/maior `date.slice(0,7)` em `transactions`, para
restringir a seleção ao intervalo de meses com dados reais.

Versão anterior: **v1.25.1** — o filtro de período da Home
(`SinglePeriodFilter`) não abre mais um `Popover` intermediário: o clique no
chip aciona diretamente o picker nativo do `<input type="month">` (via
`showPicker()`, com fallback para `.focus()`), que fica posicionado
transparente sobre o próprio chip. Os chips extras "All months"/"All years"
foram removidos — a Home sempre opera sobre um mês/ano concreto (nunca
"All"). Um botão de reset (⟲) aparece ao lado do chip quando o período
selecionado difere do mês atual, voltando direto pro mês/ano de hoje.
`setYear`/`setMonth` continuam recebendo strings ("YYYY"/"MM"), como o resto
do app. O suporte a `"All"` em `matchPeriod`/`periodLabel` foi mantido, pois
ainda é usado pelo filtro de período do Ledger.

Versão anterior: **v1.24.1** — o filtro de período da Home (`SinglePeriodFilter`)
trocou o popover em árvore Excel-style por um seletor "wheel picker" estilo
iOS: duas colunas roláveis (Mês / Ano) com `scroll-snap`, linha central em
destaque (fonte maior/negrito) e linhas adjacentes esmaecidas por distância.
"All" virou uma linha normal no topo de cada coluna (em vez de um item
separado "All years"), permitindo combinações independentes de mês/ano (ex:
"todo julho, todos os anos"), já suportadas por `matchPeriod`. O botão-chip
gatilho e o `Popover` continuam os mesmos; só o conteúdo interno mudou. Novos
tokens de estilo: `S.wheelCol`/`S.wheelItem`.

Versão anterior: **v1.24.0** — o card "Monthly Avg by Category" (Charts) ganhou
uma barra extra ao final, `L12M`, com a média mensal dos últimos 12 meses
fechados (excluindo o mês corrente parcial). Divisor fixo em 12, igual às
barras de anos passados — não usa o divisor variável (`currentMonth`) da
barra do ano corrente/YTD. A janela é calculada dinamicamente a partir da
data atual (hoje 2026-07-05 → 2025-07 a 2026-06) e a barra é anexada
explicitamente após o sort das demais, para sempre ficar por último
independente da ordenação lexicográfica das chaves de bucket. O rótulo
"L12M" é tratado localmente no `tickFormatter`/`labelFormatter` do card,
sem alterar a função global `bucketLabel`.

Versão anterior: **v1.23.3** — a detecção de overflow por `ResizeObserver`
(v1.23.1/v1.23.2) continuava falhando em dispositivos reais (testado em
iPhone 16 Pro), então foi substituída por uma regra fixa e determinística:
`useShortFormat` agora é `true` sempre que `|income|`, `|expenses|` ou
`|net|` atingir 8 dígitos (>= $100.000,00 contando os 2 decimais) — sem
medição de layout, sem `ResizeObserver`, sem clone invisível. O
`summaryBarRef`/`summaryMeasureRef`/`S.summaryBarProbe` foram removidos por
não serem mais necessários.

Versão anterior: **v1.23.2** — fix de dois bugs introduzidos na v1.23.1: (1) o
estilo visual do container (background/border/blur do pill) tinha sido
atribuído por engano ao clone invisível de medição em vez do container
visível, fazendo a barra "flutuar" sem fundo; (2) a detecção de overflow
nunca disparava no mobile porque o container, sendo filho de um flex-column
sem `minWidth: 0`, tinha `min-width: auto` por padrão e crescia para caber o
conteúdo em vez de ser restringido pela largura do pai — adicionado
`minWidth: 0` em `S.summaryBar` resolve.

Versão anterior: **v1.23.1** (PR #165, squash `3539731`) — **Transactions:
audit summary bar abrevia valores quando não cabem em 1 linha**. A barra de resumo (`{n} txns` / `↑`
income / expenses / `= net`) agora mede se os 4 pills cabem na largura
disponível (via `ResizeObserver` comparando um clone invisível sempre em
formato completo contra a largura do container visível — evita oscilação
entre os dois formatos). Quando não cabem, os 3 valores monetários passam a
usar o novo helper `moneyShortK` (ex.: `$1.23K` / `-$1.23K`, 2 casas
decimais, sinal antes do `$`), que respeita o toggle do olho (`hideValues`)
igual ao `money`. A contagem de transações nunca abrevia. `S.summaryBar`
passou de `flexWrap: "wrap"` para `"nowrap"` (a abreviação evita a quebra de
linha agora). Só `src/App.jsx` alterado; sem mudança de API/Redis/modelo de
transação, e sem tocar em `fmtK`/`moneyShort`/Dashboard.

Versão anterior: **v1.23.0** — **Home: chip de data em árvore Excel-style
(single-select) + alinhamento do chip de categoria**. O chip de período do
Dashboard (`SinglePeriodFilter`) trocou o layout de duas seções separadas
("Year" / "Month") por uma árvore única ano → mês (mesmo padrão visual do
`DateHeaderFilter` da Transactions): cada ano tem um botão "+" que expande
para mostrar os meses; clicar no ano seleciona o ano inteiro ("All months"),
clicar num mês dentro do ano expandido seleciona aquele mês — sempre
single-select (não vira multi-select como na Transactions) e fecha o
popover ao escolher. O chip de categoria (`SingleCategoryFilter`) passou a
ficar alinhado à esquerda ao lado do chip de data (antes ficava empurrado
para a direita via `justifyContent: space-between`). Só `src/App.jsx`
alterado; sem mudança de API/Redis/modelo de transação.

Versão anterior: **v1.22.1** — **Desktop: switch M/Q/H/Y da tab Trends
alinhado à direita da linha** (`marginLeft: "auto"` no wrapper do
`granularitySwitch`), separando-o visualmente do bloco
category/presets/slider à esquerda. Só afeta o layout desktop (`isWide`);
mobile inalterado. Só `src/App.jsx` alterado; sem mudança de
API/Redis/modelo de transação.

Versão anterior: **v1.22.0** — **Reorganização dos controles da tab Trends**:
removido o header com o rótulo do range de anos (`h2` com `{rangeLabel}`,
`rangeLabel` continua existindo só para a mensagem de estado vazio "No data
for..."); no desktop (`isWide`), category chip, presets All/L3Y/YTD,
`YearRangeSlider` e o switch de granularidade M/Q/H/Y agora ficam todos na
mesma linha, economizando espaço vertical; no mobile, a linha 1 tem o
category chip + switch M/Q/H/Y, e a linha 2 (abaixo) tem os presets +
`YearRangeSlider`. Os 4 controles (`categoryChip`, `granularitySwitch`,
`rangePresetsSwitch`, `yearRangeSlider`) foram extraídos como variáveis JSX
locais dentro de `Charts` para serem reaproveitados nos dois layouts sem
duplicar JSX. Só `src/App.jsx` alterado; sem mudança de API/Redis/modelo de
transação.

Versão anterior: **v1.21.10** — **Fix: labels do `YearRangeSlider` sobrepostos
quando o range é 1 ano só**: quando `fromYear === toYear`, os dois handles
ficam lado a lado (mesmo comportamento de antes) mas antes cada um
renderizava seu próprio label com o mesmo ano, sobrepondo o texto tanto no
mobile quanto no desktop; agora o label do handle "from" é omitido nesse
caso, deixando só o label do handle "to" visível (single source of truth
visual do ano selecionado). Só `src/App.jsx` alterado; sem mudança de
API/Redis/modelo de transação.

Versão anterior: **v1.21.9** — **Filtro de categoria da tab Trends movido para
o lado esquerdo do switch All/L3Y/YTD no desktop** (`isWide`): antes ficava
sempre numa linha própria abaixo do range de anos; agora, no desktop, o chip
`HeaderFilter` de Category entra na mesma row do segmented All/L3Y/YTD +
`YearRangeSlider`, posicionado antes deles (mais à esquerda). No mobile o
comportamento não muda — o chip continua numa linha própria abaixo. Só
`src/App.jsx` alterado; sem mudança de API/Redis/modelo de transação.

Versão anterior: **v1.21.8** — **Ajustes finos no `YearRangeSlider` da tab
Trends** (PR #154, mergeado em `main`): no mobile, a trilha do slider ganhou
um wrapper com padding lateral de 12px para os handles não ficarem
colados/quase saindo da borda direita da tela; no desktop, o slider deixou
de ficar centralizado na row e passou a ficar alinhado à esquerda, colado
ao segmented All/L3Y/YTD, via novo prop `isWide` (reaproveita
`useMediaWide(900)`); e quando o range volta a cobrir só 1 ano
(`fromYear === toYear`), a granularidade dos gráficos volta automaticamente
para "M" (meses), espelhando a lógica inversa já existente. Só `src/App.jsx`
alterado; sem mudança de API/Redis/modelo de transação.

Versão anterior: **v1.21.7** — **Ícones de categoria na Home trocados de emoji
para line-art (lucide-react)** (ajuste pontual de UI, pedido direto do
usuário, `src/App.jsx` único arquivo alterado). O tile de vidro introduzido
na v1.21.6 mostrava o emoji da categoria (`catEmoji`); agora mostra um ícone
de traço branco (`color="#fff"`, `size={16}`) do `lucide-react`, na mesma
linguagem visual do ícone `Wallet` do header. Novo mapa `CAT_ICON` (categoria
→ componente de ícone) e função `catIcon(cat)` com fallback `Tag` para
categorias não mapeadas: Car, Dog, Clapperboard (Entertainment), Fuel,
ShoppingCart (Groceries), Home, Pill (Medical), Smartphone (Mobile Phone),
Landmark (Mortgage), Package (Other), UtensilsCrossed (Restaurant), Wrench
(Services), ShoppingBag (Shopping), Bus (Transport), Plane (Travel),
Lightbulb (Utilities), Banknote (Salary), Gift (Bonus), Coins (Bela Income /
Other Income). `catEmoji`/`CAT_EMOJI` ficaram sem nenhum uso (era o único
lugar que os chamava) e foram removidos do código. Nenhuma mudança em API,
Redis, modelo de transação, ou dependências (lucide-react já era
dependência existente).

Versão anterior: **v1.21.6** — **Ícones de categoria na Home com o mesmo tile
de vidro do header** (ajuste pontual de UI, pedido direto do usuário,
`src/App.jsx` único arquivo alterado). O avatar de categoria na seção
"[Mês] — by Category" do Home passou do círculo flat (`${dotColor}1a` de
fundo, borda `${dotColor}35`) para o mesmo padrão de tile usado no ícone do
header desde a Fase A do overhaul Liquid Glass: gradiente diagonal com sheen
branco translúcido (`rgba(255,255,255,0.25)→0`) sobre um gradiente da cor da
categoria (`${dotColor}` → `${dotColor}99`), com `boxShadow` externo colorido
(`${dotColor}59`) e realce interno de luz (`inset 0 1px 1px
rgba(255,255,255,0.3)`) — mesma fórmula do header, trocando o azul fixo pela
cor de cada categoria. Nenhuma mudança em API, Redis, modelo de transação,
ou dependências.

Versão anterior: **v1.21.5** — **Overhaul visual "Liquid Glass" (fases A–F),
Fase F: Gráficos e Tooltips do Recharts** (feature de UI em fases, decidida
com o usuário, `src/App.jsx` único arquivo alterado). Última fase do
overhaul visual em múltiplas fases (A a F) inspirado no "Liquid Glass" da
Apple, fechando a iniciativa iniciada na Fase A (header/tab bar, v1.21.1),
seguida da Fase B (modais/popovers, v1.21.2), Fase C (cards de conteúdo,
v1.21.3), Fase D (linhas de transação, sem código) e Fase E (inputs/botões/
chips, v1.21.4). Escopo desta fase: gráficos e tooltips do Recharts. Os 5
blocos `Tooltip.contentStyle` (nos componentes `MonthlyBarCard`,
`DailyPaceCard`, `CategoryStackedBarCard`, `MonthlyAvgByCategoryCard`,
`Charts`) tiveram a borda trocada para `rgba(255,255,255,0.12)`,
`borderRadius` uniformizado para 14 (mesma escala consolidada nas fases
anteriores) e ganharam `boxShadow: "0 8px 24px rgba(0,0,0,0.4)"` para efeito
de profundidade "flutuando" sobre o gráfico. O fundo do tooltip permanece
**opaco** — exceção deliberada, já que o tooltip precisa de legibilidade
instantânea de dados financeiros mesmo com o card ao redor translúcido
desde a Fase C. `CartesianGrid` já estava consistente em todos os gráficos,
nenhuma mudança necessária. Nenhuma mudança em API, Redis, modelo de
transação, ou dependências. **Com esta fase, o overhaul visual "Liquid
Glass" (fases A–F) está completo** — ver Roadmap. — PR #148, branch
`feature/liquid-glass-phase-f-charts-tooltips`, squash-merged em `main`.

Versão anterior: **v1.21.4** — **Overhaul visual "Liquid Glass" (fases A–F),
Fase E: Inputs, Botões e Chips/Pills** (feature de UI em fases, decidida com
o usuário, `src/App.jsx` único arquivo alterado). Continuação do overhaul
visual em múltiplas fases (A a F) inspirado no "Liquid Glass" da Apple,
seguindo a Fase A (header/tab bar, v1.21.1), a Fase B (modais/popovers,
v1.21.2) e a Fase C (cards de conteúdo, v1.21.3); a Fase D (linhas de
transação) não gerou código, ver abaixo. Escopo desta fase: inputs, botões,
chips/pills. (1) `S.input`, `S.select`, `S.searchWrap`, `S.cellSelect`,
`S.importCatSelect`: fundo deixou de ser opaco e passou a
`rgba(15,18,22,0.92)` + borda `rgba(255,255,255,0.08)` + `boxShadow` inset
simulando campo "escavado" — **sem blur**, inputs continuam sem
`backdropFilter` por serem pequenos e precisarem de máxima legibilidade
(mesma lógica de exceção já aplicada às listas de transação na Fase A/D).
(2) `S.primaryBtn`: gradiente duplo (sheen branco translúcido + azul
`#0A84FF→#0055cc`, reaproveitando os mesmos stops do ícone do header) +
`boxShadow` com realce de luz no topo. (3) `S.secondaryBtn`: borda mais
visível (`rgba(255,255,255,0.14)`), fundo continua transparente. (4)
`S.chipBtn`, `S.togglePill`, `S.segmentedBtn`, `S.segmented`: fundos sólidos
por estado convertidos para `rgba` translúcido, mantendo bordas de acento
como indicador de estado. Auditoria confirmou contraste de texto ≥5:1 nos
novos fundos (na prática levemente melhor que as versões opacas anteriores).
Nenhuma mudança em API, Redis, modelo de transação, ou dependências. Falta
só a **Fase F** (gráficos/tooltips Recharts) para fechar o overhaul. — PR
#147, branch `feature/liquid-glass-phase-e-inputs-buttons`, squash-merged em
`main`.

Versão anterior: **v1.21.3** — **Overhaul visual "Liquid Glass" (fases A–F),
Fase C: Cards de Conteúdo** (feature de UI em fases, decidida com o usuário,
`src/App.jsx` único arquivo alterado). Continuação do overhaul visual em
múltiplas fases (A a F) inspirado no "Liquid Glass" da Apple, seguindo a
Fase A (header/tab bar, v1.21.1) e a Fase B (modais/popovers, v1.21.2,
abaixo). Escopo desta fase: cards de conteúdo. (1) `S.card` (base de
`StatCard` e vários blocos): fundo deixou de ser opaco e passou a
`rgba(22,26,32,0.7)` + `backdropFilter: blur(16px) saturate(160%)` + borda
`rgba(255,255,255,0.08)`, `borderRadius` 16→14. (2) Hero card do Home:
gradiente convertido para translúcido, com realce de luz diagonal +
`boxShadow` inset simulando reflexo de vidro. (3) `CollapsibleCard`,
`S.summaryBar`, `S.bulkBar`: mesmo tratamento de translucidez/blur,
`borderRadius` uniformizado para 14px (hero card ficou em 20px, igual ao
`modalCard` da Fase B). (4) `StatCard` herdou a translucidez
automaticamente, sem edição direta, por herdar de `S.card` via spread.
Nenhuma mudança em API, Redis, modelo de transação ou dependências. — PR
#146, branch `feature/liquid-glass-phase-c-content-cards`, squash-merged em
`main`.

Versão anterior: **v1.21.2** — **Overhaul visual "Liquid Glass" (fases A–F),
Fase B: Modais, Popovers e Overlay** (feature de UI em fases, decidida com o
usuário, `src/App.jsx` único arquivo alterado). Continuação do overhaul
visual em múltiplas fases (A a F) inspirado no "Liquid Glass" da Apple,
seguindo a Fase A (header/tab bar, v1.21.1, abaixo). Escopo desta fase:
modais, popovers e o overlay de fundo. (1) `S.modalOverlay`: adicionado
`backdropFilter`/`WebkitBackdropFilter: blur(4px)` leve, mantendo o fundo
`rgba(0,0,0,0.6)` já existente. (2) `S.modalCard`: fundo deixou de ser opaco
e passou a `rgba(22,26,32,0.82)` + `backdropFilter: blur(20px)
saturate(180%)` + borda `rgba(255,255,255,0.08)` + novo `boxShadow` de
profundidade (esse objeto não tinha sombra antes). (3) `S.loginCard`: mesmo
tratamento do `modalCard`. (4) `S.headerPop` (popover de filtro): fundo
translúcido + blur igual aos demais, `boxShadow` já existente mantido.
Nenhuma mudança em API, Redis, modelo de transação ou dependências. — PR
#145, branch `feature/liquid-glass-phase-b-modals-popovers`, squash-merged
em `main`.

Versão anterior: **v1.21.1** — **Overhaul visual "Liquid Glass" (fases A–F),
Fase A: Header e Tab Bar** (feature de UI em fases, decidida com o usuário,
`src/App.jsx` único arquivo alterado). Início de um overhaul visual em
múltiplas fases (A a F) inspirado no "Liquid Glass" da Apple, evoluindo o
Redesign iOS 26 "Liquid Glass" original (PR #23, Fase 4 do Roadmap) para
além de header/tab bar. Nesta **Fase A**: (1) ícone do header trocado de
`LayoutDashboard` (genérico) para **`Wallet`** (`lucide-react`) — mais
condizente com o tema de finanças domésticas do app; (2) tile do ícone do
header: `borderRadius` 8→9, adicionado gradiente de realce translúcido
neutro ("glass highlight") + `boxShadow` inset simulando reflexo de vidro;
(3) `S.tabBar` deixou de ter fundo opaco sólido e passou a ser
**translúcido** (`rgba(11,13,16,0.85)`) com `backdropFilter`/
`WebkitBackdropFilter: blur(20px) saturate(180%)`, espelhando o padrão já
existente em `S.header` — agora topo e rodapé do app compartilham o mesmo
efeito "glass". Nenhuma mudança em API, Redis, modelo de transação, ou
dependências. **Decisões de estilo fixadas para todo o overhaul** (valem
para as fases seguintes): ícone do header = `Wallet`; realces de luz =
branco neutro, sem tingimento de marca; listas de transação (tab
Transactions) permanecem **opacas**, sem glass, por
legibilidade/performance. **Fases seguintes planejadas, ainda não
implementadas**, como PRs subsequentes: **B** (modais/popovers/overlay),
**C** (cards de conteúdo — StatCard, hero card, CollapsibleCard), **D**
(linhas de transação — decisão já tomada: permanecem opacas, sem glass),
**E** (inputs/botões/chips), **F** (gráficos/tooltips Recharts). — PR #144,
branch `feature/liquid-glass-phase-a-header-tabbar`, squash-merged em
`main`.

Versão anterior: **v1.21.0** — **Rename "Analyze" → "Trends" + novo card "Monthly
Avg by Category"** (feature de UI, item avulso pedido pelo usuário fora do
roadmap formal, `src/App.jsx` único arquivo alterado). (1) A tab de gráficos
deixou de se chamar **"Analyze"** e passou a se chamar **"Trends"** na tab
bar — apenas o **label** mudou; o ícone (`TrendingUp`) e o `id` interno da
tab (`"analyze"`) foram **mantidos** intactos (usado internamente para
comparação de render, deep-links, etc). (2) Novo card **"Monthly Avg by
Category"** adicionado logo abaixo do card existente **"By Category"** na
tab Trends: visualmente idêntico a ele (mesmo `BarChart` empilhado, mesmas
cores por categoria via `getCategoryColor`, mesma legenda, mesmo toggle
Expense/Income), com três diferenças de comportamento — granularidade
**travada em anual** (sem seletor de período, ao contrário do card "By
Category"); **sempre mostra todos os anos disponíveis** nos dados, ignorando
deliberadamente o filtro de range de anos (From/To) do topo da tab Trends
(respeita só o filtro de categoria); e cada barra de ano representa a
**média mensal de gastos** daquele ano — anos passados/completos dividem o
total do ano por 12, o ano corrente divide pelo mês atual (ex.: em julho de
2026, o ano 2026 divide por 7) — permitindo comparar de forma justa a média
mensal de um ano completo com a de um ano ainda em andamento. `Transfer`
continua excluído de todos os totais (regra fixa preservada, sem exceção
nova). Mudança 100% front-end — nenhuma alteração em `api/`, formato Redis
ou modelo de transação. — PR #143, commit
29f7e3de9e2390cf6f6c318cf6c2824fb99e4b7b, merged em `main`.

Versão anterior: **v1.20.4** — **Restore de transactions a partir do backup local**
(patch/manutenção, mesmo item avulso do backup, `src/App.jsx` único arquivo
alterado). Adicionado botão **"Restore from backup"** ao lado do "Backup
transactions" no card **"Data & Backup"**: abre um seletor de arquivo, lê o
JSON (aceita tanto o envelope `{ transactions, exportedAt }` do backup
quanto um array puro de transactions), pede confirmação (`window.confirm`)
informando quantas transactions serão restauradas e quantas serão
substituídas, e então **substitui integralmente** o array de transactions em
memória e salva imediatamente via `PUT /api/transactions` (sem debounce,
por ser ação explícita já confirmada). Novo callback `restoreTransactions`
no componente raiz `App`, passado como prop `onRestoreTransactions` até
`DataBackupSection`. Nenhuma mudança de contrato de API, formato Redis ou
modelo de transação — é o mesmo endpoint/shape já usados pelo save normal.
**Fora de escopo (ainda não implementado)**: backup/restore de outros
namespaces Redis (account-map, config, budgets, aliases,
description-rules), merge/dedup entre o backup e os dados atuais (a
restauração é substituição total, não soma).

Versão anterior: **v1.20.3** — **Backup local de transactions na tab Settings**
(patch/manutenção, item avulso pedido pelo usuário fora do roadmap de fases,
`src/App.jsx` único arquivo alterado). Novo botão **"Backup transactions"**
dentro de um novo `CollapsibleCard` **"Data & Backup"** na tab **Settings**
(`SettingsTab`): ao clicar, baixa localmente um arquivo JSON
`household-transactions-backup-YYYY-MM-DD.json` com
`{ transactions: [...], exportedAt: ISOString }` — export puro do array de
transactions já carregado em memória no client (mesmo dado retornado por
`GET /api/transactions`), 100% client-side, **sem nenhuma mudança de
contrato de API, formato Redis ou modelo de transação**. Feedback de UI:
mensagem "Downloaded N transactions." por ~2s após o clique. A função
`triggerDownload(blob, filename)`, antes local ao componente `Transactions`
(usada só pelo export CSV), foi elevada a escopo de módulo e passou a ser
reaproveitada também por este novo backup. **Fora de escopo (não
implementado)**: import/restore do JSON, backup automático/agendado, e
backup de outros namespaces Redis (account-map, config, budgets, aliases,
description-rules) — cobre só `transactions`. Motivação: manutenção/
segurança pedida pelo usuário antes de mudanças estruturais no app, para
mitigar risco de perda de dados; não é item de nenhuma fase do Roadmap. —
PR #140 (draft), branch `claude/transaction-backup-settings-d5e86h`.

Versão anterior: **v1.20.2** — **Rename da tab "Dashboard" para "Home" +
padronização de cores dos ícones de categoria** (patch, `src/App.jsx` único
arquivo alterado). (1) A primeira tab da tab bar deixou de se chamar
"Dashboard" e passou a se chamar **"Home"** — label, ícone (`LayoutDashboard`
→ `Home`, ambos de `lucide-react`), id interno da tab (`"dashboard"` →
`"home"`) e a comparação de render correspondente foram todos atualizados
juntos; o ícone `LayoutDashboard` do logo/header do app foi **mantido**
(elemento visual separado, fora de escopo). Puramente cosmético — nenhuma
mudança de layout, dados ou comportamento da tela em si (hero card,
DailyPaceCard, bloco "by Category", "All Time", ver "UI" abaixo). (2)
Padronização das cores dos ícones de categoria: nova função central
`getCategoryColor(cat)` (= `CATEGORY_COLOR_MAP[cat] || catDotColor(cat)`)
agora usada tanto nos avatares de categoria da tab **Home** quanto no card
**"By Category"** da tab **Analyze** — antes a Home usava só `catDotColor`
sem checar o mapa curado `CATEGORY_COLOR_MAP`, causando divergência de cor
para a mesma categoria entre as duas telas. Nenhuma mudança de contrato de
API, formato Redis ou modelo de transação. — PR #138, branch
`claude/dashboard-category-colors-ytmb16`, squash merge.

Versão anterior: **v1.20.1** — **Fix: migração da Apple Daily Cash rule não
rodava para households que nunca haviam salvo a regra manualmente** (patch,
`src/App.jsx` único arquivo alterado). A regra tinha um **default hardcoded**
(`Apple Card` / `Deposit`,`Adjustment` / `Other Income`) que funcionava
sozinho sem o usuário nunca precisar abrir a antiga seção e clicar "Save" —
ou seja, para quem nunca customizou, **nada estava persistido no Redis**. A
migração automática (PR #135, v1.20.0) só lia do Redis via
`GET /api/apple-daily-cash-rule` e, ao não encontrar nada salvo, tratava como
"nunca configurado" e não migrava — mas o default hardcoded que ela deveria
ter herdado foi removido junto com o resto do código antigo, então o
comportamento simplesmente desapareceu silenciosamente para esses households
(sem nenhum erro, sem transações quebradas — só a promoção automática de
cashback do Apple Card parou de acontecer em novos imports). Fix em
`migrateAppleDailyCashRule` (`src/App.jsx`): usa o campo `savedAt` da
resposta do endpoint como discriminador — `savedAt` só existe depois de
algum `PUT` (seja do usuário editando a seção antiga, seja da própria
migração ao "zerar" a regra legada como marcador de já-migrado). Se
`savedAt` for `null` (nunca houve PUT), a regra assume que o default
hardcoded estava implicitamente ativo e usa `Apple Card` /
`["Deposit", "Adjustment"]` / `Other Income` como valores de migração, em
vez de pular. Households que já tinham customizado a regra (ou que já
passaram pela migração antes) continuam com o comportamento inalterado —
`savedAt` não-nulo com campos vazios permanece o marcador de "já migrado",
e não-nulo com campos preenchidos usa os valores persistidos normalmente.
Nenhuma mudança de contrato de API, formato Redis, ou do pipeline `buildRow`
em si (só a lógica de migração one-shot).

Versão anterior: **v1.20.0** — **Unificação da Apple Daily Cash rule dentro do
sistema de Description rules** (feature de core de classificação,
`src/App.jsx` único arquivo alterado; auditada com rigor extra por mexer no
pipeline central de `buildRow`). A heurística Apple Daily Cash deixou de
existir como mecanismo dedicado (seed `DEFAULT_APPLE_DAILY_CASH_RULE`,
module state `APPLE_DAILY_CASH_RULE`, `applyAppleDailyCashRuleConfig`/
`currentAppleDailyCashRuleConfig`, `appleDailyCashRuleMatches`/
`applyAppleDailyCashRule`, componente `AppleDailyCashRuleSection` e sua
seção na tab Settings — todos **removidos**) e foi absorvida pelo sistema
geral de **Description rules**, que ganhou um mecanismo genérico opt-in de
"permissão de de-transferir": cada regra em `categoryDescriptionRules` pode
agora ter dois campos novos, opcionais e aditivos — `providerPattern`
(string, condição AND extra contra `srcAccount || account`, independente do
`matchField` da regra) e `allowTransferOverride` (boolean, default
ausente/`false`). Novo helper `findMatchingDescriptionRule(row, rules)`
retorna a regra inteira (não só a categoria) — `matchDescriptionCategoryRule`
virou um wrapper fino sobre ele, contrato/comportamento inalterado para quem
já o usava (`detectManualCategoryCorrections`, fix v1.16.3).
**Nova ordem no pipeline `buildRow`**: CK map → passada única que encontra a
**primeira** Description rule que casa (`findMatchingDescriptionRule`) → se
essa regra vencedora tiver `allowTransferOverride: true`, ela aplica direto
sua `destinationCategory`, **pulando** a rede de segurança de Transfer; caso
contrário (regra sem o flag, ou nenhuma regra casou), a rede de segurança do
PR #111 continua valendo como sempre (nunca de-transfere). A garantia "nenhuma
regra tira uma transação de `Transfer`" **continua existindo por padrão** —
agora é **opt-in por regra**, não mais uma exceção hard-coded exclusiva do
Apple Daily Cash. Como a ordem do array de regras continua semântica
("primeira que casa vence", já era assim antes), uma regra com
`allowTransferOverride` só ganha se nenhuma regra anterior no array já tiver
casado primeiro — relevante para a migração automática abaixo e para
qualquer regra nova que o usuário crie com o flag.
**Migração automática (one-shot, idempotente).** Ao carregar
`categoryDescriptionRules`, se a config legacy do endpoint
`api/apple-daily-cash-rule.js` (que **continua existindo no código**, mas
sem UI dedicada — hoje só serve de fonte para esta migração) ainda estiver
ativa (campos não vazios), o app cria automaticamente uma Description rule
por keyword (ex.: uma para "Deposit", outra para "Adjustment", ambas com o
mesmo `providerPattern: "Apple Card"` e `allowTransferOverride: true`, mesma
`destinationCategory`), insere essas regras no **início** do array (prepend
— crítico para preservar a precedência absoluta que a regra Apple tinha no
pipeline antigo), salva via `PUT /api/category-description-rules` e esvazia
a config legacy (marcador de "já migrado" — rodar de novo não duplica).
**UI em Description rules.** Cada regra ganhou um checkbox **"Allow removing
from Transfer"** (default desmarcado); quando marcado, revela um campo
condicional **"Provider/account pattern"** — a UI **bloqueia salvar**
(client-side) se o checkbox estiver marcado com esse campo vazio, para evitar
uma regra "de-transfer" baseada só num pattern de descrição livre amplo
demais. O card da regra fica com borda âmbar + nota explicativa enquanto o
flag estiver ligado. O aviso de conflito pré-save
(`computeDescriptionRuleConflicts`, PR #133) ganhou uma mensagem mais séria
especificamente para regras com o flag ligado, já que para elas o aviso
deixa de ser "só informativo" — a regra realmente pode de-transferir.
**Endpoint** `api/category-description-rules.js`: `sanitize()` estendido
para preservar os 2 campos novos (`providerPattern` string trim,
`allowTransferOverride` boolean coerce), mantendo intacto o bloqueio de
`destinationCategory === "Transfer"`.
**Débito técnico conhecido (identificado na auditoria, não bloqueou o
merge)**: `sanitize()` no servidor não impede salvar `allowTransferOverride:
true` com `providerPattern` vazio via chamada direta à API — só o client
bloqueia isso hoje (mesma postura que a regra Apple antiga tinha, sem
enforcement server-side). Registrado como possível follow-up de segurança em
profundidade — ver Roadmap. — PR #135, branch
`claude/settings-tab-consolidation-ec2ds1`, squash merge, SHA
dd7c95ccf04f481181638eb096956308eee88f27.

Versão anterior: **v1.19.0** — **Aviso de conflito pré-save em Description
rules** (feature de UX, `src/App.jsx` único arquivo alterado). Dentro da
seção **Description rules** (tab **Settings**, `DescriptionRulesSection`),
clicar "Save rules" deixou de salvar direto quando alguma regra do draft
(com `pattern` não vazio) bateria em transações **já existentes** na base
que são `category === "Transfer"` ou têm `categoryManual === true` (já
corrigidas manualmente pelo usuário antes). Nesses casos, um aviso inline
âmbar (mesmo estilo já usado em "Account aliases" > Preview impact) lista,
por regra individual, quantas transações de cada tipo bateriam + até 5
exemplos curtos (descrição truncada a 40 caracteres + data); o botão vira
**"Save anyway"**, exigindo um segundo clique para confirmar. Regras sem
conflito continuam salvando no primeiro clique. Qualquer edição subsequente
no draft (update/add/delete/reorder de regra) reseta o aviso. Nova função
pura `computeDescriptionRuleConflicts(transactions, rule)` reaproveita
`descriptionRuleMatches` já existente (sem duplicar lógica de matching);
`DescriptionRulesSection` ganhou a prop nova `transactions`. **Puramente
client-side e não-bloqueante**: não reprocessa nada retroativamente, não
muda `onSave`, o formato persistido em `api/category-description-rules.js`,
`matchDescriptionCategoryRule`, nem o pipeline de import (`buildRow`) — o
aviso serve só para tornar visível, no momento de criar a regra, que um
pattern amplo (ex. `"chase"`) pode acidentalmente bater em pagamentos de
fatura (Transfer) além das compras que a regra pretendia corrigir. A rede
de segurança real que impede Description rules de "tirar" uma transação de
Transfer em **novos imports** (o safety-net do PR #111, ver "Regras de
categoria por descrição/provider" no Modelo de dados) já existia antes e
**continua intocada** — este aviso é sobre visibilidade de transações já
existentes na base, não sobre a lógica do pipeline. — PR #133, branch
`claude/settings-tab-consolidation-ec2ds1`, squash merge, SHA
12d4c0901303e8223e759815ef34c37dab2eb030.

Versão anterior: **v1.18.0** — **Reordenar `ManagedList` por drag-and-drop em
vez de setas ↑/↓** (feature de UI, `src/App.jsx` único arquivo alterado).
Nas listas **Accounts**, **Expense categories** e **Income categories** (tab
**Settings**), o par de botões ↑/↓ foi substituído por uma **alça de
arrastar** (`GripVertical`) por item — arrastar pela alça (não a linha
inteira) para não conflitar com o swipe horizontal de Edit/Delete já
existente. Implementado com **Pointer Events** nativos (mouse + touch, sem
lib de terceiros): o item arrastado segue o pointer 1:1 via `translateY`,
os itens entre a posição original e a posição-alvo se deslocam por uma
altura de linha (só visual), e a nova ordem só é persistida uma vez, no
`pointerup`, via o `onReorder` já existente (assinatura inalterada). O
wrapper de cada linha passa a `overflow: visible` durante qualquer drag da
lista (evita clipar o item deslocado). Nenhuma mudança de contrato de API,
formato Redis, modelo de transação, ou das setas ↑/↓ do painel **Description
rules** (fora do escopo). **Amendments no mesmo PR** (feedback de teste no
preview): (1) o swipe Edit/Delete de `ManagedRow` usava só eventos
`onTouchStart`/`onTouchMove`/`onTouchEnd` e nunca funcionava com mouse no
desktop — convertido para **Pointer Events** (mesmo padrão da alça de
drag), com `touchAction: "pan-y"` e `stopPropagation` na alça para não
conflitar; (2) o card **Accounts** foi unificado ao card de categorias —
agora um único card **"Accounts & Categories"** com as três listas
(Accounts, Expense categories, Income categories) empilhadas e separadas
por divisor; (3) causa raiz real do "Edit/Delete aparecendo durante o
drag": o rail de Edit/Delete é irmão do foreground da linha (não filho) e
nunca recebia o `translateY` do drag — só o foreground se movia, expondo o
rail parado por baixo em **qualquer** linha deslocada (não só a
arrastada). Fix definitivo: o rail simplesmente não é renderizado enquanto
`dragActive` for true, em vez de tentar sincronizar seu transform com o do
foreground. — PR #132, branch `claude/settings-tab-consolidation-ec2ds1`.

Versão anterior: **v1.17.1** — **Unificar Expense/Income categories num único
card** (patch, `src/App.jsx` único arquivo alterado). Na tab **Settings**,
`Expense categories` e `Income categories` deixaram de ser dois
`CollapsibleCard` separados e passaram a viver dentro de um único card
**"Categories"**, um logo abaixo do outro, separados por um divisor
horizontal (`borderTop`). `ManagedList` ganhou um prop `bare` (default
`false`) que, quando `true`, pula o chrome do `CollapsibleCard` e renderiza
só um subtítulo (nome + contagem) + a lista + a caixa de adicionar — usado
para nidificar as duas listas dentro do card compartilhado. `Accounts`
continua com seu próprio card, sem alteração. Nenhuma mudança de lógica
(add/rename/delete/reorder, `api/config.js`, `Transfer`) — puramente
reorganização visual. — PR #131, branch
`claude/settings-tab-consolidation-ec2ds1`.

Versão anterior: **v1.17.0** — **Consolidação da tab Audit + modal Settings numa
única tab "Settings"** (feature de UI, `src/App.jsx` único arquivo alterado).
A tab bar deixou de ter 5 abas `dashboard, analyze, transactions, import,
audit` (ícone `ShieldCheck`) e passou a ter `dashboard, analyze,
transactions, import, settings` (ícone `Settings`, cog) — última posição. A
antiga `AuditTab` foi renomeada para `SettingsTab` e passou a incluir também
todo o conteúdo que antes vivia no `SettingsModal` (aberto pela engrenagem no
header): **Card mapping** (Credit Karma) e as três `ManagedList` (Accounts /
Expense categories / Income categories). A **engrenagem no header e o
`SettingsModal` foram removidos por completo** — não há mais atalho
separado; tudo vive na tab **Settings**. Nova ordem das seções dentro da tab:
(1) Suggested rules, (2) Account aliases, (3) Card mapping, (4) Managed list
Accounts, (5) Managed list Expense categories, (6) Managed list Income
categories, (7) Apple Daily Cash rule, (8) Description rules, (9) Category
mapping — esta última **movida para o final da tab**, com menos destaque
(continua colapsável, fechada por padrão; antes vinha logo após Account
aliases). Nenhuma mudança de contrato de `/api/*`, formato Redis ou modelo de
transação — puramente reorganização de composição de UI React. — PR #128,
branch `claude/settings-tab-consolidation-ec2ds1`, squash merge, SHA
86ddbc1d3bd081d065f3edac43ca5ea9be829ff4.

Versão anterior: **v1.16.3** — **Fix: sugestão do Grupo C ("Manual category
corrections") continuava reaparecendo mesmo depois de o usuário criar a
Description rule sugerida e clicar "Dismiss"** (patch, frontend puro).
Causa raiz: ao contrário do Grupo A (`detectSuggestedAliasFragments`, pula
se `matchAccountWithAliases` já cobre) e do Grupo B
(`detectSuggestedCategoryTokens`, pula se o token já está mapeado para algo
≠ "Other"), o Grupo C (`detectManualCategoryCorrections`) nunca verificava
se a transação já estava coberta por uma Description rule existente. Como
`categoryManual === true` é uma flag permanente gravada na transação
histórica (forward-only, PR #119) e nunca reescrita, o grupo continuava
reaparecendo para sempre — nada marcava aquele grupo como "resolvido" depois
de o usuário criar exatamente a regra sugerida. (O "Dismiss" é, à parte,
deliberadamente só de sessão — reseta ao recarregar o app; isso não mudou e
não era o bug.) Fix em `src/App.jsx`:
`detectManualCategoryCorrections(transactions, descriptionRules)` ganhou um
segundo parâmetro `descriptionRules` e um novo skip — `if
(matchDescriptionCategoryRule(t, descriptionRules) === t.category) continue;`
— reusando a função já existente `matchDescriptionCategoryRule` (a mesma do
pipeline de import) para pular transações cuja categoria já é produzida por
uma Description rule vigente, no mesmo espírito dos Grupos A/B. O callsite
em `AuditTab` passou a fornecer `categoryDescriptionRules` (prop já
existente) e essa dependência foi adicionada ao `useMemo`. Nenhuma mudança
em `api/`, formato Redis, modelo de transação, Grupos A/B, pipeline de
import ou UI de criar/editar Description rules. — PR #127, branch
`claude/import-tab-ux-improvements-i1b7az` (pendente de merge).

Versão anterior: **v1.16.2** — **Ajustes visuais na tab Import: segmented
controls no lugar de cards/checkboxes** (patch, frontend puro). Dois
ajustes de UI sobre a tab Import, sem tocar em `api/`, dedup
(`markDuplicates`), column mapping CSV, `displayRows`/overrides de categoria
(v1.16.0), `confirm()`, formato Redis ou modelo de transação:
1. **Method picker (Credit Karma/CSV)** — os 2 cards grandes com
   title+descrição viraram um **segmented control (toggle) de 2 opções**,
   com uma legenda curta abaixo exibindo dinamicamente a descrição do
   método selecionado (preserva a informação funcional — auto-mapeado vs.
   manual/backfill — sem os cards grandes); padding maior que o do filtro de
   duplicatas, por ser a primeira decisão do fluxo.
2. **Filtro de duplicatas** — os 2 checkboxes mutuamente exclusivos "Only
   duplicates"/"Only non-duplicates" (v1.15.2, PR #123) foram substituídos
   por um **segmented control de 3 opções**: "All" / "New Only" / "Dup
   Only". Estado interno simplificado: de 2 booleans
   (`onlyDups`/`onlyNonDups` + toggle de exclusão mútua manual) para um
   único enum `dupFilter` (`"all"|"new"|"dup"`). Continua só aparecendo
   quando há duplicatas detectadas (`dupCount > 0`) — mesma guarda de antes;
   o Set `selected` (o que é de fato importado) permanece independente do
   filtro de visualização.

Novos tokens de estilo reutilizáveis `S.segmented` (container) e
`S.segmentedBtn(active)` (função), ao lado de `S.togglePill` (inalterado,
continua em uso em Charts/MonthlyBarCard/CategoryStackedBarCard); replicam o
padrão visual já usado no segmented control de granularidade do Analyze
(fundo `#0f1216`, borda `#232a33`, opção ativa `#0A84FF`/branco) — padrão
pronto para reuso em futuros segmented controls do app. — PR #126, branch
`claude/import-tab-ux-improvements-i1b7az`.

Versão anterior: **v1.16.1** — **Fix: agrupamento errado no grupo "Manual
category corrections" do painel Suggested rules** (patch, frontend puro).
`detectManualCategoryCorrections` agrupava as correções pelo token da
categoria CK de origem (`ckCategoryToken(t.ckCategory)`), o que juntava num
grupo só comerciantes sem relação que compartilhavam a mesma categoria de
origem (ex.: todas as linhas de income corrigidas num mesmo import — Tundra,
Dell, YMCA e Venmo viravam "4 corrected → Entertainment", herdando o destino
da primeira correção da lista). Agora o agrupamento é por comerciante — o
fragmento normalizado da descrição (`descFragment`), exatamente o que a
regra criada por "Create rule from this" vai casar —, com fallback para o
token CK só quando a descrição não gera fragmento; `patternCounts` foi
removido (o pattern é o próprio key). Cada exemplo passou a carregar a sua
própria categoria corrigida, e a linha "was X → you: Y" mostra o que o
usuário escolheu naquela transação, não mais o destino mais frequente do
grupo. Threshold ≥2 inalterado — correções avulsas de comerciantes distintos
não geram mais sugestão (antes geravam uma sugestão errada). — PR #125,
branch `claude/import-tab-ux-improvements-i1b7az`.

Versão anterior: **v1.16.0** — **Edição de categoria na preview da tab Import**
(feature nova, frontend puro). Cada linha da prévia do Import ganhou um
`<select>` compacto com a lista completa `CATEGORIES` (incl. Transfer) no
lugar do texto estático da categoria — clique no select não dispara o
toggle de seleção da linha. Os overrides ficam num estado local
(`categoryOverrides` Map), resetado ao trocar de arquivo/mapping (junto com
`selected`/filtros). Mesma semântica do `EditModal`: só conta como override
se a categoria escolhida difere da `autoCategory`; `categoryManual =
categoria !== Transfer` (virar Transfer nunca conta como correção manual).
`displayRows` aplica os overrides e é o que a lista e o `confirm()`
enxergam — a transação importada carrega a `category` corrigida,
`categoryManual` correto e `autoCategory` original intactos, alimentando
`detectManualCategoryCorrections` e o grupo "Manual category corrections"
do painel **Suggested rules** (tab Audit) exatamente pelo mesmo mecanismo já
existente — sem escrita automática nem endpoint novo (passthrough normal via
`PUT /api/transactions`). Badge azul "EDITED" (`#60a5fa`) quando a categoria
difere da auto-detectada, com `title` mostrando a original. Nada mudou em
`api/`, `buildRow`, `markDuplicates`, formato Redis ou modelo de transação
além dos campos já existentes (`categoryManual`/`autoCategory`, PR #119). —
PR #124, branch `claude/import-tab-ux-improvements-i1b7az`.

Versão anterior: **v1.15.2** — **UX improvements on Import tab: non-duplicates
filter, sticky import button, condensed mapping/summary** (frontend puro,
refinamento de UX sobre a tab Import já entregue na Fase 4). Novo checkbox
"Only non-duplicates" ao lado do "Only duplicates" existente, mutuamente
exclusivos entre si (marcar um desmarca o outro) e ambos só aparecem quando
há duplicatas detectadas — é só um filtro de **visualização** da prévia; o
Set `selected` que decide o que é importado permanece independente. O botão
"Import N transactions" passou a ficar em uma **barra sticky** (`bottom: 0`,
gradiente para o fundo do app), visível sem precisar rolar até o fim depois
de carregar o arquivo; `maxHeight` da lista de preview reduzido de 360 para
300 para abrir espaço. Textos condensados: descrições dos method cards
(Credit Karma / CSV) encurtadas, e a linha de resumo omite "N parsed" quando
é igual a "N valid". A seção **Column mapping** (fluxo CSV) virou
colapsável via `CollapsibleCard`, aberta por padrão só quando falta campo
obrigatório mapeado; o aviso de campo obrigatório faltando continua sempre
visível fora do card, independente do estado colapsado. — PR #123, branch
`claude/import-tab-ux-improvements-i1b7az`, squash merge, SHA 4819642.

Versão anterior: **v1.15.1** — **Fix: painel "Suggested rules" invisível quando
vazio** (a seção na tab Audit tinha um `return null` quando os 3 grupos
— Unassigned fragments, Category tokens/Other, Manual category corrections —
estavam vazios, o que a tornava praticamente indescobrível; removido o
`return null`, o painel agora é **sempre visível**, com estado vazio
explicativo — inclusive nota de que o grupo de correções manuais é
forward-only e pode aparecer vazio logo após a atualização; badge do card só
aparece quando há itens) — PR #121, branch
`fix/suggested-rules-always-visible`, squash merge, SHA
19fa8aabd7001d3dd3ec73f2e9a48f876459a034.

Versão anterior: **v1.15.0** — **Painel de regras de categoria, Fatia 2**
(detecção de "correções manuais" de categoria: novos campos opcionais
`categoryManual`/`autoCategory` na transação, função pura
`detectManualCategoryCorrections` agrupando correções recorrentes por token
CK/fragmento de descrição, e terceiro grupo "Manual category corrections" no
painel **Suggested rules** com ação para pré-preencher uma regra de
descrição — o "double check", **forward-only**, sem retroatividade sobre
correções feitas antes desta versão) — PR #119, branch
`feature/manual-correction-detection`, SHA
9e0475e8986aa9a43e9fbf4f6c8f2c4ab81c7c91.

Versão anterior a essa: **v1.14.0** (Painel de regras de categoria, Fatia 1: novo
tipo de regra editável "descrição/provider contém X → categoria Y", com
precedência de override sobre o mapa CK para categorias não-Transfer; nova
seção **Description rules** na tab Audit; a seção **Classification
history** foi removida a pedido do usuário) — PR #117, SHA
404dc8b8ac608df0bbf03cefd4d5f1b5b6386eba.

Versão anterior a essa: **v1.13.0** (sugestão automática de regras novas: nova
seção **Suggested rules** no topo da tab **Audit**, detecta agrupamentos de
transações Unassigned por fragmento de `srcAccount` normalizado e
agrupamentos de transações `category === "Other"` por `ckCategoryToken`,
100% client-side sobre dados já em memória, sem escrita automática — PR #115.
Com esta entrega, o item "Auditoria de classificação de categorias" da Fase
5 ficou **completo**, ver Roadmap.)

---

## Stack

| Camada        | Tecnologia                                             |
| ------------- | ------------------------------------------------------ |
| Front-end     | React 18 + hooks, Vite                                 |
| Gráficos      | recharts                                               |
| CSV           | papaparse                                              |
| Ícones        | lucide-react                                           |
| API           | Funções serverless Vercel (`/api/*`)                   |
| Persistência  | Redis via `ioredis`                                    |
| Auth          | Google Identity (JWT) com fallback de senha de app     |
| Deploy        | Vercel                                                 |

### Estrutura de pastas

```
household-ledger/
├── api/
│   ├── transactions.js     # GET/PUT do ledger (auth obrigatória)
│   ├── budgets.js          # GET/PUT de orçamentos por categoria
│   ├── account-map.js      # GET/PUT do mapa accountURN -> conta
│   ├── account-aliases.js  # GET/PUT dos aliases de conta (fragmentos por marca)
│   └── config.js           # GET/PUT das listas de contas/categorias
├── tools/
│   └── credit-karma/       # exportadores CK (bookmarklet Safari + Scriptable)
├── lib/
│   ├── auth.js             # verificação de token Google + senha + allowlist
│   └── redis.js            # singleton ioredis
├── src/
│   ├── App.jsx             # app completo (5 tabs)
│   └── main.jsx            # entrypoint React
├── index.html
├── vite.config.js
├── vercel.json
└── package.json
```

---

## Autenticação e armazenamento

Autenticação **somente por senha de app** compartilhada entre os
dispositivos da casa (`lib/auth.js`): header `x-app-password`, comparado
com `APP_PASSWORD` em tempo constante (`crypto.timingSafeEqual` sobre
digests SHA-256). O caminho de **Google JWT foi removido na v1.30.0**
(client e server) — o household usa uma única senha em vários dispositivos,
e o ID token do Google (validade ~1h) causava falhas silenciosas de save no
meio da sessão.

A chave de armazenamento é derivada da senha. A `auth.storageKey` mantém o
formato legado `portfolio:pwd:<hash>:holdings` (o hash é o mesmo de antes —
nenhum dado muda de lugar); em `api/transactions.js` ela é reescrita para o
namespace do household:

```
portfolio:pwd:<hash>:holdings    ->  household:pwd:<hash>:transactions
```

Assim o ledger nunca colide com nenhum blob de portfolio. Dados de
households que usavam login Google seguem intactos sob
`household:email:<hash>:*`, apenas sem caminho de acesso via UI.

**Concorrência (v1.30.0)**: o PUT de `/api/transactions` é otimista — o
client envia `expectedSavedAt` (o `savedAt` que carregou/salvou por último)
e o server responde **409** se o valor persistido divergir (outro
dispositivo salvou no meio). O client então recarrega do server e avisa o
usuário para refazer a última mudança. Clientes sem o campo mantêm o
last-write-wins antigo (back-compat).

**Snapshots (v1.30.0)**: o primeiro PUT bem-sucedido de cada dia (UTC)
grava uma cópia imutável em `household:*:transactions:snapshot:YYYY-MM-DD`
com TTL de 30 dias (`SET NX` — só o primeiro estado do dia). Aditivo, nunca
lido pelo app; rede de segurança contra um save/restore ruim (restauração
manual via Redis).

### Variáveis de ambiente

| Variável                 | Uso                                              |
| ------------------------ | ------------------------------------------------ |
| `REDIS_URL`              | conexão Redis                                    |
| `APP_PASSWORD`           | senha de app (única forma de autenticação)       |

*(Removidas na v1.30.0 junto com o login Google: `GOOGLE_CLIENT_ID`,
`ALLOWED_EMAILS`, `ADMIN_EMAILS`, `VITE_GOOGLE_CLIENT_ID`,
`VITE_ADMIN_EMAILS` — podem ser apagadas do projeto na Vercel.)*

---

## Modelo de dados

Cada transação:

```jsonc
{
  "id": "lf3k9-ab12cd",       // gerado no cliente
  "date": "2026-06-19",        // YYYY-MM-DD
  "description": "Costco run",
  "amount": 142.37,            // sinalizado na direção natural da categoria
  "category": "Groceries",
  "account": "Chase Reserve",  // "" quando não classificada (Unassigned)
  "srcAccount": "Chase CREDIT CARD 7612", // opcional — rótulo de origem (auditoria)
  "accountUrn": "urn:account:fdp::accountid:81f7bbd0-…", // opcional — id estável do cartão
  "last4": "7612",             // opcional — últimos 4 do cartão (rótulo)
  "ckCategory": "GROCERIES",   // opcional — categoria crua da fonte (auditoria)
  "sourceId": "abc123",        // opcional — id da transação na fonte (dedup)
  "categoryManual": true,      // opcional — usuário trocou a categoria manualmente
  "autoCategory": "Groceries"  // opcional — categoria computada por buildRow no import (snapshot)
}
```

Persistido no Redis como `{ transactions: [...], savedAt }`. Os campos
`srcAccount` e `ckCategory` só existem quando a fonte do import os fornece;
servem para auditar as decisões de classificação de conta e categoria.

**`categoryManual`/`autoCategory` (PR #119, v1.15.0, Fatia 2 do painel de
regras de categoria).** Ambos aditivos e opcionais — transações antigas sem
esses campos se comportam como "não editadas". `autoCategory` é gravado
**só no import**, em `buildRow`, como snapshot da categoria que o pipeline
computou (linha aditiva depois da categoria final; não altera precedência,
o safety-net de Transfer nem o sinal do `amount`); nunca é reescrito depois.
Serve só para exibir "was X → you: Y" na UI da sugestão. `categoryManual`
é setado em runtime pela UI, não pelo import:
- **`true`** quando o usuário troca a categoria manualmente (`EditModal`,
  ou bulk "Set category" na tab Transactions).
- **`false`** quando a transação vira `Transfer` (via `EditModal` ou bulk
  "Mark as Transfer") — virar Transfer não conta como "correção de
  categoria" para efeito de detecção.
- Ausente = a categoria nunca foi editada manualmente.

**Desde a v1.16.0 (PR #124)**, `categoryManual`/`autoCategory` também são
setados **no momento do import**: a prévia da tab Import permite editar a
categoria de cada linha antes de confirmar, e se a categoria escolhida
difere da `autoCategory` computada por `buildRow`, a transação já entra no
ledger com `categoryManual: true` (mesma regra `categoria !== Transfer`
para contar como manual) — não é mais só o `EditModal`/bulk actions em
runtime que geram esses campos.

Esses campos alimentam `detectManualCategoryCorrections` (ver "Regras de
categoria por descrição/provider" abaixo). Não mudam o contrato de
`/api/transactions` nem o formato Redis `household:*:transactions`
(passthrough).

**Sinal do `amount`.** O valor é um **fluxo de caixa sinalizado**,
preservado verbatim do Credit Karma e **independente da categoria**:
**saída (despesa) é negativa**, **entrada (receita, refund de despesa ou
crédito) é positiva**. As agregações somam o valor sinalizado dentro de
cada balde (`income += amount`, `expenses += amount`) e o NET é a **soma de
todos os fluxos**: `net = income + expenses`. Como `expenses` já é a soma
com sinal, um refund numa categoria de despesa (que chega positivo) abate o
gasto daquele balde; quando os refunds superam as despesas no período,
`expenses` fica **positivo** e contribui positivamente para o NET (ex.:
income 0, expenses +247.29 → net +247.29). ⚠️ **Não use `income − expenses`
nem `Math.abs`** — ambos invertem o sinal quando os refunds dominam (era o
bug da v1.5.10). Na UI o sinal/cor da linha segue o mesmo fluxo de caixa:
entrada em verde, saída (despesa) em vermelho com `−`. O exportador Credit
Karma e o import **nunca alteram o sinal do CK** (invariante) — só as
**categorias** são remapeadas (ex.: Apple Daily Cash → `Other Income`).
Não há mais calibração de sinal nem `Math.abs` no export. **O import também
preserva o sinal em todos os caminhos** (`buildRow`): tanto o profile Credit
Karma quanto o CSV genérico mantêm o sinal da fonte — o `Math.abs` que o
caminho genérico aplicava foi removido. A direção no fluxo de caixa vem da
**categoria** (income vs expense), não de uma transformação do número.
Para que receita importada não seja rebaixada para a despesa `Other` (o que
inverteria o sinal exibido), `applyConfig` garante que **`Other Income`**
seja sempre uma categoria de receita reconhecida — é o bucket que o
importador Credit Karma usa. Transfer continua excluída de todos os totais.

O **cashback do Apple Card ("Daily Cash")** chega do Credit Karma marcado
como `Transfer` nas contas Apple, mas já na **direção natural de receita**
do ledger, em duas formas:
- `Deposit` — cashback **ganho**, depositado na Apple Savings (CK: positivo);
- `Adjustment` — cashback **estornado** quando uma compra é reembolsada,
  lançado no Apple Card (CK: negativo).

Ambos são reclassificados para `Other Income` **preservando o sinal do CK**:
o `Deposit` entra positivo (soma a receita) e o `Adjustment` entra negativo
(clawback que abate o cashback ganho). A detecção é por heurística: provedor
com "Apple Card" + descrição "Deposit" ou "Adjustment". Um depósito manual
feito pelo usuário na Apple Savings também casaria com essa regra (trade-off
aceito — são raros).

**Heurística Apple Daily Cash — histórico e estado atual (PR #113/v1.12.0 →
unificada no PR #135/v1.20.0).** Entre o PR #113 e o PR #135, essa
heurística viveu como mecanismo dedicado e editável (endpoint
`api/apple-daily-cash-rule.js`, seed `DEFAULT_APPLE_DAILY_CASH_RULE`, module
state próprio, funções `appleDailyCashRuleMatches`/`applyAppleDailyCashRule`
e seção dedicada na tab Settings) e era **a única etapa do pipeline com
permissão de promover uma transação de `Transfer`** para outra categoria.
**Desde o PR #135 (v1.20.0), esse mecanismo dedicado foi removido por
completo** (seed, module state, funções puras, componente
`AppleDailyCashRuleSection` e sua seção na tab Settings) e a heurística
passou a ser expressa como **Description rules normais** com
`allowTransferOverride: true` + `providerPattern: "Apple Card"` (uma regra
por keyword — "Deposit" e "Adjustment") — ver "Regras de categoria por
descrição/provider" logo abaixo para o novo shape de regra, a nova ordem do
pipeline em `buildRow` e o mecanismo de migração automática. O endpoint
`api/apple-daily-cash-rule.js` **continua existindo no código**, mas hoje só
serve como fonte de leitura para a migração one-shot que converte a config
legada (se ainda ativa) nas Description rules equivalentes — não tem mais UI
dedicada. A garantia "nenhuma regra promove de `Transfer`" deixou de ser uma
exceção hard-coded só para o Apple Daily Cash e virou um mecanismo genérico
opt-in por regra (`allowTransferOverride`), disponível para qualquer
Description rule que o usuário criar.

### Mapa CK → ledger de categorias (editável, PR #111)

O import via profile Credit Karma recalcula a categoria da transação a
partir da categoria crua do CK (`ckCategory`) usando um mapa `{ [ckToken]:
"categoria do ledger" }`, em vez de confiar apenas na categoria já traduzida
que vinha no CSV. `DEFAULT_CK_CATEGORY_MAP` é o seed (paridade 1:1 com
`CAT`/`CATEGORY_MAP` dos exportadores externos, que continuam intocados em
`tools/credit-karma/`), sobrescrito em runtime por
`applyCkCategoryMapConfig`/`currentCkCategoryMapConfig` (mesmo padrão de
`applyAliasConfig`) a partir de `/api/ck-category-map` (GET/PUT), persistido
em Redis `household:USERID:ckcategorymap` como
`{ map: { [ckToken]: categoria }, savedAt }`. As funções puras
`mapCkCategory`/`ckCategoryToken` fazem a tradução token → categoria.

Em `buildRow`, quando `ckCategory` está presente: a categoria final é
recalculada via `mapCkCategory` usando o mapa editável corrente. **Rede de
segurança crítica**: se **ou** o recálculo **ou** a `category` que já vinha
do CSV disser `Transfer`, o resultado final é sempre `Transfer` — o
recálculo nunca pode rebaixar um Transfer legítimo para outra categoria
(ex.: "Other"). Essa regra existe porque **o CSV do Credit Karma nunca
exporta o `categoryType` bruto do CK** (só emite `type=income/expense`),
então a categoria já vinda do exportador é a única fonte confiável de "isso
é Transfer" quando o token da categoria por si só não é óbvio; sem essa
rede de segurança, um Transfer legítimo poderia ser reclassificado e
escapar da exclusão de totais (invariante de `Transfer` quebrada). Sem
`ckCategory` presente (import CSV genérico), o comportamento é inalterado:
usa a `category` que já vinha do arquivo.

A seção **Category mapping**, na tab **Settings** (antiga Audit; desde a
v1.17.0/PR #128 movida para o final da tab, com menos destaque), edita esse
mapa por token (dropdown das categorias correntes + `Transfer` + `Other
Income`) — sem preview de impacto e sem cascata retroativa: a mudança só
afeta **novos imports** a partir de então (decisão confirmada com o
usuário; ver UI e Roadmap Fase 5).

### Regras de categoria por descrição/provider (PR #117, v1.14.0 — unificada
### com a Apple Daily Cash rule no PR #135, v1.20.0)

Painel de regras de categoria, **Fatia 1**. Novo tipo de regra editável:
"descrição/provider contém X → categoria Y", com **precedência de override**
sobre o mapa CK→ledger para categorias não-`Transfer`. Endpoint
`api/category-description-rules.js` (GET/PUT, mesmo padrão de
`api/ck-category-map.js`), persiste `{ rules: [...], savedAt }` em Redis
`household:*:categorydescriptionrules`. A **ordem do array é semântica**: a
primeira regra da lista que casar vence (não há resolução por
especificidade). `destinationCategory` **nunca pode ser `Transfer`** —
bloqueado tanto no `sanitize()` do endpoint quanto no client.

**Shape de cada regra (desde o PR #135, v1.20.0):**

```js
{
  id, matchField: "description"|"provider"|"both", pattern, destinationCategory, // como já era (PR #117)
  providerPattern?: string,        // opcional — condição AND extra contra srcAccount || account
  allowTransferOverride?: boolean, // opcional, default ausente/false
}
```

Regras existentes sem `providerPattern`/`allowTransferOverride` continuam
com comportamento idêntico ao de antes do PR #135 (campos aditivos e
opcionais). Funções puras `descriptionRuleMatches`/
`matchDescriptionCategoryRule`; `matchField: "provider"` casa contra
`srcAccount || account` (mesmo campo usado pela classificação de conta);
`"description"` casa contra `description`; `"both"` exige match nos dois.
`descriptionRuleMatches` ganhou a condição AND extra opcional
`providerPattern` (independente do `matchField` da regra). Novo helper
`findMatchingDescriptionRule(row, rules)` retorna a regra inteira que casou
(não só a categoria); `matchDescriptionCategoryRule` é hoje um wrapper fino
sobre ele — contrato/comportamento inalterado para os callers já existentes
(`detectManualCategoryCorrections`, fix v1.16.3).

**Precedência exata em `buildRow` — mudança central do PR #135 (v1.20.0):**
(import profile Credit Karma, quando `ckCategory` está presente): (1)
`mapCkCategory` recalcula a categoria a partir do token CK; (2) passada
**única** que encontra a **primeira** Description rule que casa
(`findMatchingDescriptionRule`); (3) se essa regra vencedora tiver
`allowTransferOverride: true`, ela aplica direto sua `destinationCategory`,
**pulando** a rede de segurança de Transfer do PR #111; caso contrário
(regra sem o flag, ou nenhuma regra casou), a rede de segurança de sempre
continua se aplicando —
`(overridden === Transfer || csvCategory === Transfer) ? Transfer :
overridden` — e **nunca de-transfere**. Ou seja: a garantia "nenhuma
Description rule tira uma transação de `Transfer`" continua valendo **por
padrão**; agora é **opt-in por regra** via `allowTransferOverride`, e não
mais uma exceção hard-coded exclusiva da antiga heurística Apple Daily Cash
(removida — ver "Heurística Apple Daily Cash" no Modelo de dados, acima).
**Precedência entre regras**: como é "primeira que casa vence" (array order
já era semântico antes do PR #135), uma regra com `allowTransferOverride` só
ganha se nenhuma regra anterior no array já tiver casado primeiro — isso é
relevante tanto para a migração automática (abaixo) quanto para qualquer
regra nova que o usuário crie com o flag. O sinal do `amount` nunca é tocado
por essa regra.

**Migração automática do Apple Daily Cash (one-shot, idempotente, PR #135).**
Ao carregar `categoryDescriptionRules`, se a config legada do endpoint
`api/apple-daily-cash-rule.js` ainda estiver ativa (campos não vazios), o
app cria automaticamente **uma Description rule por keyword** (hoje: uma
para "Deposit", outra para "Adjustment", ambas com `providerPattern: "Apple
Card"` e `allowTransferOverride: true`, mesma `destinationCategory`),
insere essas regras no **início** do array (`prepend` — crítico para
preservar a precedência absoluta que a regra Apple tinha no pipeline
antigo, onde rodava por último com prioridade máxima), salva via `PUT
/api/category-description-rules` e esvazia a config legada (marcador de "já
migrado" — rodar de novo não duplica).

A seção **Description rules**, na tab **Settings**, permite add / edição
inline / delete com confirmação em 2 cliques / reordenar (↑/↓, já que a
ordem é semântica); o select de categoria de destino não lista `Transfer`;
um aviso explica a precedência sobre o mapa CK (exceto Transfer). **Desde o
PR #135**, cada regra tem também um checkbox **"Allow removing from
Transfer"** (`allowTransferOverride`, default desmarcado) que, quando
marcado, revela um campo condicional **"Provider/account pattern"**
(`providerPattern`) — a UI **bloqueia salvar** (client-side) se o checkbox
estiver marcado com esse campo vazio; o card da regra fica com borda âmbar +
nota explicativa enquanto o flag estiver ligado. **Sem preview de impacto e
sem cascata retroativa** — só afeta novos imports a partir da mudança (mesmo
padrão das demais seções de regra da tab).

**Aviso de conflito pré-save (PR #133, v1.19.0; mensagem reforçada no PR
#135, v1.20.0).** Ao clicar "Save rules", se alguma regra do draft (`pattern`
não vazio) bateria em transações **já existentes** que são `category ===
"Transfer"` ou têm `categoryManual === true`, um aviso âmbar inline (mesmo
padrão de "Account aliases" > Preview impact) lista por regra individual as
contagens de cada tipo + até 5 exemplos (descrição truncada a 40 caracteres
+ data); o botão vira "Save anyway", exigindo um segundo clique. Nova
função pura `computeDescriptionRuleConflicts(transactions, rule)`,
reaproveitando `descriptionRuleMatches` sem duplicar a lógica de match.
Regras sem conflito continuam salvando no primeiro clique; qualquer edição
no draft reseta o aviso. **Desde o PR #135**, regras com
`allowTransferOverride` ligado recebem uma mensagem de aviso mais séria
(deixa de ser "só informativo" — para elas, o aviso descreve uma
de-transferência real que vai acontecer, não hipotética). Continua
**puramente client-side** — não altera `onSave` nem o formato persistido.

**Débito técnico conhecido (identificado na auditoria do PR #135, não
bloqueou o merge).** `sanitize()` no endpoint `api/category-description-rules.js`
não impede salvar `allowTransferOverride: true` com `providerPattern` vazio
via chamada direta à API (só o client bloqueia isso hoje) — mesma postura
que a regra Apple antiga tinha (sem enforcement server-side). Possível
follow-up de segurança em profundidade — ver Roadmap.

**Fatia 2 (PR #119, v1.15.0) — concluída.** Detecção automática de
"correções manuais" recorrentes ("double check"): nova função pura
`detectManualCategoryCorrections` filtra transações com
`categoryManual === true` e categoria final ≠ `Transfer` (ver
`categoryManual`/`autoCategory` no Modelo de dados), agrupa por comerciante —
fragmento normalizado da descrição (`descFragment`), com fallback para o
token CK (`ckCategoryToken`) quando a descrição não gera fragmento (desde a
v1.16.1; antes o agrupamento era CK-token-first, o que juntava comerciantes
sem relação com a mesma categoria de origem), threshold ≥2
ocorrências no grupo. A UI é um terceiro grupo "Manual category
corrections" dentro da seção existente **Suggested rules** (mesmo padrão
dos grupos A/B: dismiss por sessão, sem persistência entre sessões). A ação
"Create rule from this" pré-preenche a seção **Description rules** (Fatia
1) com o pattern do fragmento comum e a categoria de destino = categoria
manual mais frequente do grupo — o usuário revisa e salva manualmente, sem
escrita automática. **Trade-off aceito: forward-only** — correções manuais
feitas antes desta versão (sem `categoryManual`/`autoCategory` gravados)
não são detectadas retroativamente.

**Fix v1.16.3 (PR #127) — skip por Description rule já existente.** Ao
contrário dos Grupos A/B (que pulam candidatos já cobertos por uma regra/
mapeamento vigente), o Grupo C nunca checava cobertura por Description rule
— então uma sugestão continuava reaparecendo para sempre mesmo depois de o
usuário criar exatamente a regra sugerida (nada nunca marcava o grupo como
"resolvido", já que `categoryManual` é permanente e forward-only).
`detectManualCategoryCorrections` passou a receber um segundo parâmetro
`descriptionRules` e pula a transação quando
`matchDescriptionCategoryRule(t, descriptionRules) === t.category` — reusa a
mesma função do pipeline de import. `AuditTab` agora passa
`categoryDescriptionRules` nessa chamada (dependência adicionada ao
`useMemo`). Só afeta a detecção; nenhuma mudança em `api/`, formato Redis,
modelo de transação ou nos Grupos A/B.

### Orçamentos

Limites mensais por categoria de despesa persistidos separadamente no Redis:

```jsonc
// chave: household:USERID:budgets
{ "budgets": { "Groceries": 800, "Restaurant": 300 }, "savedAt": "..." }
```

Endpoint `api/budgets.js`:

| Método | Rota           | Descrição                                   |
| ------ | -------------- | ------------------------------------------- |
| GET    | `/api/budgets` | Retorna `{ budgets: {...}, savedAt }`        |
| PUT    | `/api/budgets` | Body `{ budgets: {...} }` → `{ ok: true, savedAt }` |

### Tabela de/para de contas

Mapa `{ [accountURN]: "Conta amigável" }` persistido no Redis em
`household:USERID:accountmap` via `api/account-map.js` (GET/PUT, mesmo
padrão dos orçamentos). Alimenta `classifyAccount` no import e é editável
pela seção **Card mapping** (`AccountMapSection`) dentro da tab **Settings**
— até o PR #128 (v1.17.0) essa seção vivia dentro do `SettingsModal`
(engrenagem no header, removido); agora é renderizada diretamente na tab.

### Listas gerenciáveis (contas + categorias)

As listas `ACCOUNTS`, `EXPENSE_CATEGORIES` e `INCOME_CATEGORIES` deixaram de
ser fixas no código: são variáveis de módulo (mutáveis) semeadas pelos
`DEFAULT_*` e substituídas em runtime por `applyConfig()` a partir de
`api/config.js` (GET/PUT em `household:USERID:config`, sanitiza strings
não-vazias e deduplicadas). As funções puras (`matchAccount`, `isIncome`,
`buildRow`) leem os valores correntes; os componentes React re-renderizam
via o `config` state no App (`Transfer` continua fixo). A UI é a tab
**Settings** (ver UI), que reúne **Card mapping** + adiciona/renomeia/exclui
nas três listas. As três (`Accounts`, `Expense categories`, `Income
categories`) vivem juntas num único card **"Accounts & Categories"** desde
a v1.18.0 (PR #132), empilhadas e separadas por um divisor horizontal
(função `ManagedList` tem um modo `bare` sem o chrome do `CollapsibleCard`,
usado para nidificar as três dentro do card compartilhado). Evolução:
originalmente três `ManagedList` cards colapsáveis separados (migrados do
`SettingsModal`); no PR #131 (v1.17.1), `Expense categories` + `Income
categories` viraram um card "Categories" (Accounts seguia à parte); no PR
#132 (v1.18.0), `Accounts` entrou no mesmo card. Até o PR #107
(v1.9.0) isso vivia num modal (`SettingsModal`, atrás da engrenagem no
header), que já não continha a seção "Account aliases" (movida para a tab
dedicada Audit naquele PR); desde o PR #128 (v1.17.0) o próprio modal foi
removido e todo esse conteúdo passou a viver dentro da tab **Settings**
(antiga Audit, renomeada). **Renomear faz cascata** — conta atualiza transações +
valores do mapa de contas; categoria atualiza transações + chaves de
orçamento. Itens em uso por transações não podem ser excluídos (renomear,
sim).

**Edição de itens (`ManagedRow`).** Cada item tem **ordem manual** via
**drag-and-drop pela alça** (ícone `GripVertical`, desde a v1.18.0/PR #132 —
antes eram setas ↑/↓; handlers `reorderAccounts`/`reorderCategories` →
`saveConfig` com a nova ordem, inalterados); por isso contas e categorias de
despesa **não são mais auto-ordenadas alfabeticamente** no add/rename (novos
itens entram no fim, rename mantém a posição — a ordem persiste). O drag é
via Pointer Events (mouse + touch) numa alça dedicada em vez da linha
inteira, para não conflitar com o swipe horizontal de Edit/Delete: o item
arrastado segue o dedo/cursor 1:1, os demais itens "abrem espaço"
deslocando-se por uma altura de linha, e a nova ordem só é persistida
(`onReorder`) no pointer up. **Swipe para a esquerda** revela os chips Edit /
Delete (mesmo padrão de `TxnAuditCard`; Delete desabilitado se em uso) — o
gesto usa **Pointer Events** (não só `touch*`), então funciona tanto por
touch quanto **arrastando com o mouse no desktop** (antes só funcionava por
touch; bug corrigido no mesmo PR #132). O chip
de delete é vermelho (`#f87171`) e requer **confirmação em 2 cliques**; sem
segundo clique, reseta em 2,5 s. A **edição é inline**: campo de nome de
largura total com botões pequenos **Save** (✓) / **Cancel** logo abaixo. A
caixa de **adicionar** tem o input ocupando a largura toda + botão quadrado
compacto `+`. Até o PR #128 (v1.17.0), o `SettingsModal` tinha um botão
"Close" no footer fixo (`flexShrink:0`) para fechar sem rolar até o fim;
esse botão não existe mais (não há modal — é uma tab, sem necessidade de
"Close").

**AccountMapSection** exibe um status dot por card: verde se o URN já tem conta
mapeada, âmbar se não mapeado.

### Categorias

Defaults de despesa (`DEFAULT_EXPENSE_CATEGORIES`): `Car, Dog,
Entertainment, Fuel, Groceries, Home, Medical, Mobile Phone, Mortgage,
Other, Restaurant, Services, Shopping, Transport, Travel, Utilities`.

Defaults de receita (`DEFAULT_INCOME_CATEGORIES`): `Salary, Bonus, Bela
Income, Other Income`. Ambas as listas são editáveis em runtime (ver
"Listas gerenciáveis").

Especial: `Transfer` — **excluída de todos os totais** (saldo, receitas,
despesas e gráficos). Serve apenas para movimentações entre contas.

### Contas

Defaults (`DEFAULT_ACCOUNTS`, editáveis em runtime): `ATT Reward, Advancial,
Alaska, Amazon Card, Apple, Bank of America, Capital One, Chase Bela, Chase
Preferred, Chase Reserve, Chime, Discover, Ink Biz Cash, Ink Unlimited,
Jasper Card, Lowes Card, SoFi, Southwest, T-Mobile, United Explorer, Venmo,
Venture X`.

**Aliases de conta editáveis (PR #105).** Os fragmentos de marca usados por
`matchAccount` deixaram de ser a constante fixa `ACCOUNT_ALIASES` — agora
`DEFAULT_ACCOUNT_ALIASES` é só o seed, sobrescrito em runtime por
`applyAliasConfig`/`buildAliasArray`/`currentAliasConfig` a partir de
`/api/account-aliases` (GET/PUT, mesmo padrão de auth/storage-key de
`account-map.js`/`config.js`), persistido em Redis
`household:USERID:accountaliases` como
`{ aliases: { [conta]: [fragmento, ...] }, savedAt }`. A função pura
`matchAccountWithAliases(rawValue, aliasesArray)` faz o match (assinatura de
`matchAccount`/`classifyAccount` inalterada). Editável pela seção **Account
aliases** (`AccountAliasesSection`/`AccountAliasRow`), que desde o PR #107
(v1.9.0) vive na tab dedicada Audit (antes ficava dentro do `SettingsModal`,
logo abaixo de `AccountMapSection`) e, desde o PR #128 (v1.17.0), nessa
mesma tab renomeada **Settings** (a antiga Audit foi consolidada com o
`SettingsModal`, que deixou de existir — ver UI): chips de fragmento
por conta (add/remove) e fluxo **Preview impact** (mostra até 50 transações
afetadas + contador, client-side via `computeAliasImpact`) → **Confirm &
apply** (persiste via PUT e reclassifica em cascata as transações existentes
cujo `srcAccount` passa a casar com o alias alterado).

**Classificação de conta no import.** Ordem (`classifyAccount`): (1) a
**tabela de/para** keyed no `accountUrn` da fonte — id estável e único por
cartão, persistida em `/api/account-map`; (2) se não houver mapping, o
`matchAccount` por aliases — match exato normalizado contra a lista acima
e, senão, fragmentos de marca (agora editáveis, ver acima) ignorando
maiúsculas, pontuação e dígitos. A classificação usa **apenas** o campo de
conta da fonte, nunca a descrição do merchant. **Precedência**: URN mapeado
> alias de conta > Unassigned (nunca o primeiro da lista) — linhas já
mapeadas por URN não são afetadas por mudanças de alias.

A tabela de/para por URN existe porque o Credit Karma rotula vários cartões
com o mesmo nome genérico (cinco Chase como `"CREDIT CARD"`); o URN os
separa, e o último-4 (`last4`, extraído de `accountTypeAndNumberDisplay`) é
o rótulo legível. A UI fica na seção **Card mapping** (`AccountMapSection`)
dentro da tab **Settings** — desde o PR #128 (v1.17.0) não há mais
engrenagem/modal, a seção é renderizada diretamente na tab: lista os
cartões vistos (emissor · ••últimos-4 · contagem), você atribui uma conta a
cada um, e ao **Save & apply** aplica nas transações existentes (por URN) e
em todos os imports futuros.

---

## UI

Mobile-first, tema escuro iOS. Tab bar inferior fixa com 5 abas. A entrada de transações é exclusivamente via Import — não há formulário manual de adição. **Desde a v1.17.0 (PR #128)**, não há mais engrenagem no header nem modal separado de configuração — a antiga tab **Audit** e o antigo `SettingsModal` (match de cartões CK + listas de contas/categorias) foram consolidados numa única tab dedicada **Settings** (ver abaixo), última posição na tab bar. O antigo botão Refresh já tinha sido removido antes.

**Identidade visual (PR #23 — iOS 26 "Liquid Glass")**

- **Safe-area**: header usa `padding-top: calc(env(safe-area-inset-top) + 8px)` para não sobrepor a Dynamic Island; tab bar usa `env(safe-area-inset-bottom)` para o home indicator. Os modais (sheets ancorados embaixo) têm a altura limitada a `calc(100dvh − inset-top − inset-bottom − 28px)` — assim, por mais que as seções expandam, o topo nunca passa da Dynamic Island (o conteúdo interno rola).
- **Tipografia**: font stack `SF Pro Display, SF Pro Text, system-ui`; antialiasing ligado; título do app 15 px peso 600 com `letter-spacing: -0.3px`; section titles uppercase estilo headline iOS; tab labels 9 px peso 500.
- **Liquid Glass**: header e tab bar com `backdrop-filter: blur(20px) saturate(180%)` (superfície translúcida); borders `rgba(255,255,255,0.08)`.
- **Cantos arredondados**: cards 16 px, modais 20 px, inputs/botões 12 px, linhas de transação 14 px.
- **Paleta dark mode iOS**: superfícies `#161a20`, borders `#1e2530`, system blue `#0A84FF` em botões primários e links, cinza `#636366` no botão de exclusão. (Background anterior `#0b0d10` substituído.)
- **Densidade mobile (PR #40)**: Header e TabBar compactados para maximizar a área de lista na tab Transactions. Header: padding vertical `8px/8px` (antes `14px/12px`), ícones 16 px (antes 18 px), IconButton padding 6 px (antes 8 px), SaveIndicator 10 px (antes 11 px). TabBar: padding `4px / max(4px, inset-bottom)` (antes `8px / max(8px, ...)`), ícones 18 px (antes 22 px), labels 9 px com `marginTop: 1px` (antes 10 px / 2 px), tabBtn padding 2 px (antes 4 px). O header ocupa bem abaixo de 25 % da altura da tela. Um design spec developer-ready com dimensões, cores hex, font weights, spacing, hover states e responsividade mobile+desktop está embutido em `src/App.jsx` (bloco de comentário acima do objeto de estilos `S`).
- **Modernização Copilot-inspired**: Home com **hero card** de saldo líquido (gradiente, glow, 40 px, split receita/despesa), StatCards com borda de acento à esquerda + label uppercase, `TxnRow` com **avatar colorido** da categoria (inicial + paleta estável via `catDotColor`/`CATEGORY_COLORS`), logo tile azul no header, e linhas de orçamento com dot da categoria + glow na barra estourada. As **legendas dos ícones** da tab bar (Home/Trends/Txns/Import) seguem visíveis.
- **Rename Dashboard → Home (PR #138, v1.20.2)**: a tab antes chamada "Dashboard" (label, ícone `LayoutDashboard`→`Home` de `lucide-react`, id interno `"dashboard"`→`"home"`) passou a se chamar **"Home"** — puramente cosmético, mesma tela/comportamento descritos no item 1 da lista de tabs abaixo. O ícone `LayoutDashboard` do logo/header do app foi mantido (elemento separado).
- **Rename Analyze → Trends (PR #143, v1.21.0)**: a tab de gráficos antes chamada "Analyze" passou a se chamar **"Trends"** — apenas o label mudou; ícone (`TrendingUp`) e id interno (`"analyze"`) foram mantidos intactos.
- **Cores de categoria unificadas (PR #138, v1.20.2)**: nova função central `getCategoryColor(cat)` (= `CATEGORY_COLOR_MAP[cat] || catDotColor(cat)`) usada tanto pelos avatares de categoria da tab Home quanto pelo card "By Category" da tab Trends (`CategoryStackedBarCard`), eliminando a divergência de cor que existia antes entre as duas telas para a mesma categoria.
- **Overhaul visual "Liquid Glass" (fases A–F), CONCLUÍDO — todas as 6 fases entregues (PR #144/#145/#146/#147/#148, v1.21.0 → v1.21.5)**: overhaul visual em fases, inspirado no "Liquid Glass" da Apple, decidido com o usuário como evolução do Redesign iOS 26 "Liquid Glass" original (PR #23, acima). Único arquivo alterado em todas as fases: `src/App.jsx`. **Fase A** (header/tab bar): ícone do header trocado de `LayoutDashboard` para **`Wallet`** (mais condizente com o tema financeiro do app); tile do ícone do header com `borderRadius` 9 + gradiente de realce translúcido neutro + `boxShadow` inset (reflexo de vidro); `S.tabBar` deixou de ter fundo opaco e passou a ser translúcido (`rgba(11,13,16,0.85)`) com `backdropFilter: blur(20px) saturate(180%)`, igual ao já existente em `S.header` — header e tab bar compartilham o mesmo efeito glass. **Fase B** (modais/popovers/overlay): `S.modalOverlay` ganhou blur leve; `S.modalCard` e `S.loginCard` deixaram de ter fundo opaco (`rgba(22,26,32,0.82)` + `blur(20px) saturate(180%)` + borda translúcida + `boxShadow` de profundidade); `S.headerPop` (popover de filtro) ganhou o mesmo tratamento. **Fase C** (cards de conteúdo): `S.card` (base de `StatCard` e vários blocos) deixou de ter fundo opaco (`rgba(22,26,32,0.7)` + `blur(16px) saturate(160%)` + borda translúcida, `borderRadius` 16→14); hero card do Home com gradiente translúcido + realce de luz diagonal + `boxShadow` inset; `CollapsibleCard`, `S.summaryBar` e `S.bulkBar` receberam o mesmo tratamento, `borderRadius` uniformizado para 14px (hero card em 20px, igual ao `modalCard`); `StatCard` herdou a translucidez automaticamente via `S.card`. **Fase D** (linhas de transação) foi só uma verificação de consistência, sem código: decisão fixada reafirmada — linhas de transação (`S.txnRow`, `TxnAuditCard`, avatar de categoria) permanecem **opacas**, sem glass, por serem lista potencialmente longa (risco de performance no scroll); app permaneceu em v1.21.3 nesta fase. **Fase E** (inputs, botões e chips/pills): `S.input`, `S.select`, `S.searchWrap`, `S.cellSelect`, `S.importCatSelect` deixaram de ter fundo opaco e passaram a `rgba(15,18,22,0.92)` + borda translúcida + `boxShadow` inset simulando campo "escavado" (sem blur — inputs continuam sem `backdropFilter`, por serem pequenos e precisarem de máxima legibilidade); `S.primaryBtn` ganhou gradiente duplo (sheen branco translúcido + azul `#0A84FF→#0055cc`) + `boxShadow` com realce de luz no topo; `S.secondaryBtn` ganhou borda mais visível, fundo continua transparente; `S.chipBtn`, `S.togglePill`, `S.segmentedBtn`, `S.segmented` tiveram fundos sólidos por estado convertidos para `rgba` translúcido, mantendo bordas de acento como indicador de estado. **Fase F** (gráficos/tooltips Recharts, PR #148, v1.21.5 — última fase, fecha a iniciativa): os 5 blocos `Tooltip.contentStyle` (`MonthlyBarCard`, `DailyPaceCard`, `CategoryStackedBarCard`, `MonthlyAvgByCategoryCard`, `Charts`) tiveram a borda trocada para `rgba(255,255,255,0.12)`, `borderRadius` uniformizado para 14 e ganharam `boxShadow: "0 8px 24px rgba(0,0,0,0.4)"` (efeito de profundidade sobre o gráfico); o fundo do tooltip permanece **opaco** — exceção deliberada, por legibilidade instantânea de dados financeiros; `CartesianGrid` já estava consistente em todos os gráficos. Decisões de estilo fixadas para todo o overhaul: ícone do header = `Wallet`; realces de luz = branco neutro, sem tingimento de marca.
- **Tela cheia iOS PWA (full-bleed)**: o `viewport-fit=cover` só passa a valer com o meta limpo (sem `maximum-scale`) **e** uma reinstalação na tela inicial (o iOS faz snapshot do viewport no add-to-home-screen). A medição no device foi decisiva: `100dvh`/`100svh` = a *layout viewport* (812 pt no iPhone 16 Pro, que **exclui** a área do home indicator), enquanto `100vh`/`100lvh` = a tela física completa (874 pt). Por isso `html`/`body`/`#root` usam **`height: 100lvh`** com `overflow: hidden` (sem rubber-band) e o shell `height: 100%`. Resultado: a tab bar encosta na borda física real (medido `belowNav = 0`), sem faixa preta. `env(safe-area-inset-bottom)` no padding da barra mantém os ícones acima do home indicator; `env(safe-area-inset-top)` no header limpa a Dynamic Island.

São **5 tabs**: Home (antiga **Dashboard**, renomeada na v1.20.2, PR #138 —
ver "Identidade visual" acima), Trends (antiga **Analyze**, renomeada na
v1.21.0, PR #143 — ver "Identidade visual" acima), Transactions, Import,
Settings (antiga **Audit**, renomeada e consolidada com o antigo
`SettingsModal` na v1.17.0, PR #128 — ver item 5 abaixo). O app usa
shell de altura cheia (`#root` em `100lvh` + shell `height:100%`): só o
`<main>` faz scroll, então header e tab bar ficam fixos.

1. **Home** (antiga Dashboard) — **Desde o PR #161**, o antigo `PeriodFilter`
   (dois `<select>` nativos de ano/mês) foi substituído por
   **`SinglePeriodFilter`**: chip-button + Popover (mesmo padrão visual já
   usado nos chips da tab Transactions), mantendo semântica single-select
   (`year`/`month` continuam string única `"All"`|valor, não arrays — a
   lógica de `matchPeriod`/`heroComparisons`/`cutoffDay`/`dashboardPaceData`
   não mudou). O chip fica acima do hero e controla o período exibido.
   **Desde a v1.23.0**, o conteúdo do popover do `SinglePeriodFilter` deixou
   de ter duas seções separadas ("Year" / "Month") e virou uma **árvore
   única ano → mês, Excel-style** (mesmo padrão do `DateHeaderFilter` da
   Transactions): cada ano tem um botão "+" que expande para revelar os
   meses; clicar no ano seleciona o ano inteiro (`month = "All"`), clicar num
   mês dentro do ano expandido seleciona só aquele mês — sempre
   single-select (nunca vira array como na Transactions), fecha o popover ao
   escolher. O chip de categoria do bloco "by Category" também foi
   restilizado no PR #161: o antigo `<select>` nativo virou
   **`SingleCategoryFilter`** (chip-button + Popover, comportamento rádio —
   clicar seleciona e fecha), sem alterar `catFilter` (segue string única).
   **Desde a v1.23.0**, esse chip fica alinhado à esquerda ao lado do chip de
   data (`justifyContent: "flex-start"` no wrapper, antes era
   `"space-between"`, que empurrava a categoria para a ponta direita).
   **Desde a v1.24.1** (PR #170), o conteúdo do popover do
   `SinglePeriodFilter` deixou de ser a árvore Excel-style e virou (por um
   tempo) um "wheel picker" estilo iOS: duas colunas roláveis (Mês / Ano)
   com `scroll-snap`, item central em destaque (fonte maior/negrito) e
   linhas adjacentes esmaecidas por distância. **Desde a v1.25.0** (PR
   #171), esse wheel picker foi substituído por um `<input type="month">`
   nativo do HTML5 (o wheel picker não funcionava bem com mouse/scroll no
   desktop), ainda dentro do mesmo chip-button/`Popover`; `colorScheme:
   "dark"` inline garante que o picker do sistema renderize em modo escuro.
   O componente `WheelColumn` e os tokens `S.wheelCol`/`S.wheelItem` foram
   removidos por não terem mais uso. **Desde a v1.25.1** (PR #172), o
   `Popover` intermediário foi removido: o clique no chip principal aciona
   diretamente o picker nativo do `<input type="month">` (via
   `showPicker()`, com fallback `.focus()`), com o input posicionado de
   forma transparente sobre o próprio chip. Os chips extras "All
   months"/"All years" também foram removidos — a Home sempre opera sobre
   um mês/ano concreto (o suporte a `"All"` em `matchPeriod`/`periodLabel`
   foi mantido só para o filtro de período do Ledger). Em troca, um botão
   de reset (glifo ⟲) aparece ao lado do chip sempre que o período
   selecionado for diferente do mês/ano atual, restaurando para o mês
   corrente ao ser clicado. **Desde a v1.25.2** (PR #173), o `<input
   type="month">` tem `pointerEvents: "none"` (o clique chega ao `<button>`
   que chama `showPicker()`, em vez de ser capturado pelo input), e ganhou
   `min`/`max` calculados via `useMemo` `monthRange` no `Dashboard` a partir
   do menor/maior `date.slice(0,7)` em `transactions`, restringindo a
   seleção ao intervalo de meses com dados reais. **Desde a v1.26.0** (PR
   #174), como Safari iOS não abre `showPicker()`/não suporta `<input
   type="month">` de forma utilizável, o componente detecta iOS/iPadOS
   (`isIOSDevice`, via `userAgent` com heurística extra para iPadOS 13+:
   `navigator.platform === "MacIntel" && maxTouchPoints > 1`) e, nesse caso,
   renderiza dois `<select>` nativos (Mês / Ano, estilo `S.periodSelect`) no
   lugar do input; nos demais navegadores (desktop, Android) o
   `<input type="month">` + `showPicker()` continuam sendo usados sem
   alteração. Os anos disponíveis no select de iOS também são limitados por
   `minMonth`/`maxMonth` (mesmo `monthRange`), e o botão de reset funciona
   igual em ambos os casos. **Desde a v1.27.0** (PR #175), no branch iOS os
   dois `<select>` (Mês/Ano) da v1.26.0 foram substituídos por um wheel
   picker estilo iOS nativo em React puro + CSS scroll-snap (sem libs
   novas): o chip abre o mesmo `Popover` já usado nos demais filtros,
   contendo duas colunas `WheelColumn` (Mês | Ano) com scroll vertical
   (`scroll-snap-type: y mandatory`); a linha central é o valor selecionado,
   destacada por peso/tamanho de fonte (`S.wheelItem(dist)`, `dist` =
   distância até o centro); ao parar o scroll (debounce de 120 ms), calcula
   o item mais próximo do centro, aplica snap suave e chama
   `setMonth`/`setYear`. Essa mesma abordagem (wheel picker) já tinha sido
   tentada para ambas as plataformas na v1.24.1 e revertida na v1.25.0 por
   não funcionar bem com mouse/scroll no desktop — desta vez fica restrita
   ao branch iOS/iPadOS (`isIOSDevice`), onde esse problema não existe; o
   branch desktop/Android (`input type="month"` + `showPicker()`) permanece
   inalterado. Continua sem opção "All" no wheel picker mobile (já era
   assim desde a v1.25.1 — não é regressão). Estilos novos: `S.wheelCol`,
   `S.wheelItem`; `S.periodSelect` (dos dois `<select>` da v1.26.0) foi
   removido por ficar sem uso. **Desde a v1.28.0**, no desktop
   (`isWide === true`) o `SingleCategoryFilter` passou a usar um `<select>`
   HTML5 nativo (novo token `S.chipSelect(active)` + seta `▼` sobreposta via
   `S.chipSelectArrow`, `pointerEvents: "none"`) em vez do chip-button +
   `Popover`; no mobile o comportamento não mudou. `isWide` (já calculado na
   raiz do `App` via `useMediaWide(900)`) passou a ser propagado para
   `Dashboard` e daí para `SingleCategoryFilter`. Não afeta o
   `SinglePeriodFilter` nem o branch iOS descrito acima. O PR
   #161 também corrigiu um bug de fonte: os popovers usam `createPortal` para
   `document.body` (fora
   da árvore `.app`) e não herdavam a fonte do app; nova constante de módulo
   `FONT_STACK` foi aplicada em `S.headerPop` e nos inputs de data do
   `DateHeaderFilter` da Transactions (que tinham `fontFamily: "inherit"`
   hardcoded), uniformizando a fonte em todos os popovers do app. **Hero
   card** mostra o saldo líquido, receita
   e despesa do **período selecionado** (antes era all-time). Abaixo do hero,
   **`DailyPaceCard`** (v1.5.6; toggle **Expense | Income** adicionado na
   v1.33.0, PR #188) — AreaChart de gasto/receita cumulativo diário com
   duas séries vinculadas ao período selecionado pelo `SinglePeriodFilter`: mês
   selecionado e mês anterior (cinza `#8b94a3`, linha tracejada + fill sutil,
   mesma cor em ambos os modos). Header ganhou um **toggle Expense | Income**
   (`S.togglePill`, mesmo padrão do `MonthlyBarCard`/`CategoryStackedBarCard`),
   default **Expense** (comportamento original preservado ao abrir o app). No
   modo Expense, a série do mês selecionado é laranja `#F97316` (como sempre
   foi) e o cálculo exclui Transfer/income, invertendo o sinal para série
   positiva. No modo Income, a série é ciano `#06B6D4` (mesmo tom já usado
   para Income no `MonthlyBarCard`) e o cálculo exclui Transfer/expense,
   somando o sinal direto sem `Math.abs` (estornos/reversões de income netam
   naturalmente). Eixo X = dia do mês; eixo Y = valor cumulativo em formato
   `$X.XK`. Exibe ReferenceLine "Today" quando o mês exibido é o mês corrente
   do calendário. Transfers sempre excluídas em ambos os modos; `cursor={false}`.
   Abaixo do DailyPaceCard, bloco
   **"by Category"**: gastos do mês selecionado por categoria, ordenados do
   maior para o menor (só categorias com gasto > 0; Transfer e categorias de
   receita excluídas). Cada categoria exibe avatar colorido (cor via
   `getCategoryColor`, PR #138, v1.20.2 — mesma função usada pelo card "By
   Category" da tab Trends, item 2 abaixo, garantindo cor consistente entre
   as duas telas), valor e dois
   badges de variação percentual — **M/M** (vs. mês anterior) e **Y/Y**
   (vs. mesmo mês do ano anterior). Comparações usam cutoff do mesmo dia
   (mês corrente → até hoje; mês passado → mês completo). Base 0 exibe "—";
   alta de gasto = vermelho, queda = verde. Respeita o toggle de privacidade
   (olho). O bloco só aparece quando há ano+mês específico selecionado.
   Ao final da página, seção **"All Time"** com 3 StatCards (Income /
   Expenses / Net) totais históricos (`usd0`, sem centavos, para caberem na
   linha em telas estreitas).
   O bloco **"Recent" (transações recentes) foi removido** da Home
   (componente `TxnRow` permanece na aba Transactions).
2. **Trends** (antiga Analyze, renomeada na v1.21.0/PR #143 — só o label
   mudou, ícone `TrendingUp` e id interno `"analyze"` mantidos) — a tab renderiza **somente `Charts`** (PR #104, v1.7.0): as
   sub-seções Trends ("Tendências mês a mês"), Budgets ("Orçamentos por
   categoria") e Recurrents ("Recorrentes / assinaturas") que antes vinham
   abaixo dos 3 cards foram removidas do frontend (componentes deletados, não
   comentados), assim como o state de orçamentos no `App`. O endpoint
   `/api/budgets` e os dados já persistidos no Redis (`household:*:budgets`)
   permanecem intactos — só a UI parou de consumi-los; ver Roadmap Fase 5
   para as ideias de reimplementação em avaliação. A tab termina no card
   "By Category" (`CategoryStackedBarCard`). No topo da seção há um
   **segmented control de granularidade** (M / Quarter / Half / Year) e um
   **filtro de range de anos** (From / To) que substituiu os dropdowns
   Ano+Mês exclusivos do Charts (a Home usa seu próprio `SinglePeriodFilter`
   — ver item 1 acima, restilizado no PR #161). **Desde o PR #152**, os dois `<select>` de
   fromYear/toYear desse filtro de range foram substituídos pelo novo
   componente **`YearRangeSlider`**: trilha única com dois handles
   arrastáveis via pointer events (mouse + touch), snap discreto por ano e
   preenchimento visual do range selecionado; reaproveita os handlers
   `handleFromYear`/`handleToYear` e o clamp já existentes, sem mudar a
   lógica de negócio do filtro. **Desde o PR #153** (branch
   `claude/household-yearrange-refine`), o `YearRangeSlider` foi refinado:
   a trilha (`S.yearRangeTrack`) deixou de ir edge-to-edge do card
   (`maxWidth: 260`); os thumbs (bolas azuis) ganharam estilo "liquid glass"
   (gradiente translúcido + `backdrop-filter` + inset highlight),
   consistente com o hero card da Home; ao selecionar manualmente um range
   de mais de 1 ano, a granularidade (segmented M/Quarter/Half/Year) muda
   automaticamente e de forma sugestiva para **"Anos" (Y)** — não trava a
   escolha, o usuário ainda pode voltar para Mês/Trimestre/Semestre mesmo
   com range > 1 ano. **Desde o PR #154**, o inverso também acontece: ao
   voltar o range para cobrir só 1 ano (`fromYear === toYear`), a
   granularidade volta automaticamente para **"M" (meses)**, evitando visão
   mensal poluída (herdada de um range multi-ano anterior) ao estreitar de
   volta para 1 ano só. À esquerda do slider há também um novo **switch de 3
   opções (All / L3Y / YTD)** reaproveitando o padrão visual
   `S.segmented`/`S.segmentedBtn`: All seleciona todo o histórico
   disponível, L3Y os últimos 3 anos (clampado ao ano mais antigo se o
   histórico tiver menos de 3 anos) e YTD apenas o ano corrente; o botão do
   preset ativo é destacado quando o range atual bate com ele, e nenhum
   fica marcado se o usuário arrastar manualmente para um range que não
   corresponde a nenhum preset. **Desde o PR #154**: no mobile a trilha tem
   um wrapper com 12px de padding lateral para os handles não ficarem quase
   saindo da borda da tela; no desktop (`useMediaWide(900)`, prop `isWide`
   passada de `App` para `Charts`) o slider fica alinhado à esquerda, colado
   ao switch All/L3Y/YTD, em vez de centralizado na row. Puramente
   visual/UX, sem mudança de contrato de API/Redis/modelo de transação.
   Logo abaixo do range de anos, um **filtro
   de categoria (multi-select, PR #102, v1.6.0)** reutiliza o componente
   `HeaderFilter` (dropdown com checkboxes via Popover/portal, modo `chip`);
   a lista de opções é `EXPENSE_CATEGORIES + INCOME_CATEGORIES` combinadas
   (sem `Transfer`, que nunca é selecionável) e reage a mudanças feitas em
   Settings via a prop `config` que `Charts` passa a receber (mesmo padrão de
   `Budgets`/`Analyze`, componentes já removidos no PR #104). Default vazio =
   todas as categorias. O filtro se aplica **aos 3 cards de Charts** (Income
   vs Expenses, Monthly e By Category) — internamente, `scopedByYear` (o
   antigo filtro por range de anos) é composto com o `categoryFilter` para
   produzir o `scoped` que os três cards consomem. Os dois cards usam a mesma
   granularidade e range, sem limite de quantidade de buckets. Primeiro card:
   **`MonthlyBarCard`** — barras de Income, Expense ou **Net** agrupadas na
   granularidade selecionada, com toggle de pills no topo (default: Income;
   terceiro botão **Net** adicionado na v1.34.0, PR #190). Nos modos
   Income/Expense, valores sempre positivos (`Math.abs`), barra com `fill`
   estático; no modo Net, `dataKey` vira `income - expenses` por bucket e
   cada barra é colorida por sinal (verde `#34d399` ≥ 0, vermelho `#f87171`
   < 0) via `<Cell>`, com eixo Y/labels usando formatter com sinal
   (`fmtKTooltip`) em vez de `fmtK`. Respeita `hideValues`.
   Segundo card: **"Income vs Expenses"** (barras agrupadas na mesma
   granularidade; título antes era "Income vs Expenses (Monthly)"). Eixo Y e
   tooltip dos dois cards de barras exibem valores em formato `0.00K` (ex.
   `$1.50K`); desde a v1.44.6 (PR #207) valores com `|valor| < 1000` exibem
   como inteiro em dólar sem sufixo "K" (ex. `$123`) em vez de `$0.1K`;
   lógica de fallback de mês único (`isSingleMonth`) removida.
   **Padrão visual (PR #94):** ambos os cards seguem o mesmo design do
   `DailyPaceCard` — wrapper com `padding:0`/`overflow:hidden`, header
   interno com título e controles, `CartesianGrid vertical={false}`, eixos
   sem linhas/ticks (`tickLine={false}`/`axisLine={false}`) com fonte cinza
   10 px; `MonthlyBarCard` tem `height:260` e "Income vs Expenses" tem
   `height:280` com legenda inline manual (swatches `#06B6D4` Income /
   `#F97316` Expenses) no lugar do `<Legend>` do recharts.
   Terceiro card: **`CategoryStackedBarCard`** (PR #95/96/97/98/100, v1.5.24–29) — barras
   stacked por categoria agrupadas na granularidade selecionada (M / Q / H / Y)
   e range de anos do segmented control. Título: **"By Category"**. Header
   contém o título e um **toggle Expense | Income** (estado `mode`, ordem Expense
   primeiro) que alterna entre view de despesas e receitas por categoria; default
   é "expense". No modo Expense: exclui `isTransfer` e `isIncome`. No modo
   Income: exclui `isTransfer` e inclui apenas `isIncome`. Acumula por
   `[bucket, categoria]` via `useMemo` sobre `scoped` usando valor sinalizado
   + `Math.abs` por categoria após netting (espelha `byBucket`) — reembolsos
   abatam o total em vez de somarem. Paleta temática fixa por categoria via
   `CATEGORY_COLOR_MAP` (casa = vermelhos, carro = azuis, alimentação = verdes,
   lazer = púrpuras, finanças/saúde = âmbar/cinza; income: `Salary`/`Bonus`/
   `Bela Income`/`Other Income` em tons verdes `#10b981`/`#34d399`/`#6ee7b7`/
   `#a7f3d0`) — **desde a v1.20.2 (PR #138)** acessada via a mesma função
   central `getCategoryColor(cat)` usada pelos avatares da tab Home (ver
   "Identidade visual" acima), garantindo cor idêntica para uma dada
   categoria nas duas telas; `radius={[4,4,0,0]}` aplicado apenas na barra do topo de cada
   stack. As barras são **ordenadas por grupo temático fixo** via `CATEGORY_ORDER`
   (casa → carro → alimentação → lazer → finanças/saúde) em vez de por volume.
   **Total label** em formato `$X.XK` exibido acima de cada barra stacked via
   `<LabelList>` com renderer SVG personalizado; funciona corretamente em expense
   e income mode. **Legenda posicionada abaixo do gráfico** em layout wrap
   centralizado (`padding: "8px 16px 14px"`), swatches 10×10 px listando somente
   as categorias presentes no período. Card wrapper com `overflow: visible` para
   que o tooltip não seja truncado. Altura do container: 260 px. Respeita
   `hideValues`. Retorna `null` quando não há dados no período para o modo
   selecionado.
   Quarto card (novo, PR #181, v1.31.0): **`CompositionEvolutionCard`**,
   logo abaixo de "By Category" — mostra a **composição percentual** das
   expenses/income por categoria ao longo do tempo via `<AreaChart>` do
   recharts (`stackId` único, `stackOffset` do gráfico controlado pelo
   toggle abaixo). Header com **toggle Expense | Income** (mesmo padrão
   `S.togglePill` do `CategoryStackedBarCard`) e um **toggle Area | River**
   (segmented control) que alterna `stackOffset` entre `"expand"` (área
   100% empilhada, default) e `"wiggle"` (streamgraph). Tem **seletor de
   período local** (1Y / 2Y / 5Y / All, `COMPOSITION_PERIODS`) que refina
   por **interseção** o range já filtrado pelo masthead (não o substitui).
   Granularidade do eixo X (M/Q/H/Y) é **adaptativa** ao span efetivo de
   dados após todos os filtros, reaproveitando `bucketKey`/`bucketLabel`/
   `GRANULARITIES` já existentes. Agrupamento é **fixo por `category`**
   (não há toggle Class/Ticker — o modelo de transação atual não tem
   campo de subcategoria/ticker; possível follow-up se esse campo vier a
   existir). Cores via `getCategoryColor(cat)` + ordenação `CATEGORY_ORDER`
   (mesmo padrão do `CategoryStackedBarCard`); legenda com swatches abaixo
   do gráfico, sem paginação. Sem collapse/ícone, segue o padrão dos
   demais cards da tab (`<div style={S.card}>` fixo, sempre aberto).
   Controlado pelos filtros do masthead (category chip + year-range) via
   prop `scoped`. 100% client-side sobre `transactions` já carregadas, sem
   novo endpoint; `Transfer` excluída via `isTransfer`.
   Quinto card (PR #143, v1.21.0): **"Monthly Avg by Category"**,
   logo abaixo do `CompositionEvolutionCard` — visualmente idêntico ao
   `CategoryStackedBarCard` (mesmo
   `BarChart` stacked, mesma paleta via `getCategoryColor`/
   `CATEGORY_COLOR_MAP`, mesma legenda abaixo do gráfico, mesmo toggle
   Expense/Income), mas com granularidade **travada em anual** (sem
   segmented control de período) e **ignorando deliberadamente** o filtro
   de range de anos (From/To) do topo da tab — sempre mostra **todos os
   anos disponíveis** nos dados, respeitando apenas o filtro de categoria
   (`categoryFilter`). Cada barra representa a **média mensal de gastos**
   daquele ano: anos passados/completos dividem o total anual por 12; o ano
   corrente divide pelo total acumulado até o mês atual (ex.: em julho de
   2026, o ano 2026 divide por 7) — permite comparar de forma justa a média
   mensal de um ano completo com a de um ano ainda em andamento. `Transfer`
   continua excluído de todos os totais.
   Sexto card (movido do Home na v1.38.0/PR #194, redesenhado na v1.44.0/PR
   #200 e v1.44.3/PR #203): **`DailyHeatmapCard`** — "Daily Spend Pattern",
   agora o **último card** da tab Trends. Segue o mesmo `scoped` (categoria +
   range de anos do masthead) que `MonthlyBarCard`/`CategoryStackedBarCard`;
   não é mais um calendário de um mês específico, e sim um **padrão médio
   por dia-do-mês**: para cada dia 1–31, calcula a média do gasto líquido
   daquele dia em todos os meses do escopo que de fato têm aquele dia
   (`monthDayCounts` como divisor, evitando sub-estimar dias altos como o
   31). Além da média diária total, agrega o **top-3 de categorias** por
   gasto médio de cada dia. No **desktop** (`isWide`), renderiza como
   **bar-sparkline** — até 31 barras finas ocupando 100% da largura do card
   (sem o `maxWidth: 380` que sobrava espaço lateral antes da v1.44.3); no
   **mobile**, mantém a grade-calendário 7 colunas (sem cabeçalho de
   dia-da-semana nem offset de calendário, já que não representa um mês
   específico). O `title` nativo do HTML (não funcionava em touch) foi
   substituído por um **painel de tooltip controlado por estado**
   (`activeDay`), acionado por clique/toque em vez de hover: clicar num
   dia/barra abre um painel fixo abaixo do gráfico (estilo `ChartTooltip`)
   com o dia, o valor médio total e até 3 linhas de categoria; clicar de
   novo no mesmo dia fecha. `activeDay` reseta ao trocar o `scoped`.
   Respeita `hideValues` em todo valor exibido. `Transfer`/income excluídos
   (mesma lógica de `periodTxns`/`computeTotals`). Sem mudança de API/Redis/
   modelo de transação.
3. **Transactions** — busca textual livre + **chips de filtro** (Type /
   Account / Category / Date) que abrem dropdowns via **portal** (`Popover`
   em `position: fixed` no `document.body`, ancorado por `getBoundingClientRect`
   — escapam de qualquer container com `overflow`, antes ficavam clipados). O
   range from/to vive dentro do chip **Date**. **Desde o PR #152**, o
   `DateHeaderFilter` deixou de usar os dois `<input type="date">` nativos
   (From/To) e passou a abrir um popup com o novo componente
   **`DateWheelPicker`**: três colunas roláveis estilo "wheel" (Mês / Dia /
   Ano) com scroll-snap CSS, que auto-selecionam o valor ao parar de rolar
   (debounce ~130ms) — sem botão "Aplicar", só um "OK" para fechar o popup; a
   coluna de dia respeita o número de dias do mês/ano selecionado. O estado
   `from`/`to` continua string `YYYY-MM-DD`, sem mudança de contrato. A barra de resumo virou **pills
   coloridos** (↑ income / ↓ expenses / = net). A pill de expenses exibe a
   magnitude com `↓` em vermelho quando há saída líquida (`summary.expenses < 0`);
   quando reembolsos superam as despesas do período (`summary.expenses >= 0`),
   exibe a magnitude com `↑` e cor verde (`#34d399`). O NET é calculado como
   `income + expenses` (soma dos fluxos sinalizados) — fica positivo quando os
   reembolsos dominam o período. **Desde a v1.23.3**, quando `|income|`,
   `|expenses|` ou `|net|` atinge 8 dígitos (>= $100.000,00 com os 2
   decimais), os 3 valores monetários passam a usar o formato abreviado
   `moneyShortK` (ex. `$1.23K` / `-$1.23K`, 2 casas decimais, sinal antes do
   `$`) — tudo ou nada, nunca mistura formato completo com abreviado na
   mesma linha; a contagem de transações nunca abrevia. É uma regra fixa por
   dígitos, não uma medição de layout — as tentativas anteriores (v1.23.1/
   v1.23.2) com `ResizeObserver` não funcionavam de forma confiável em
   dispositivos reais. `S.summaryBar.flexWrap` é `"nowrap"` (a abreviação é o
   que evita a quebra em 2 linhas). A lista é **agrupada por data**
   com headers (`Today` / `Yesterday` / `Jun 25, 2026` via `formatDateHeader`)
   e a data saiu de dentro de cada linha (liberou espaço para a descrição). O
   filtro de conta inclui um chip **"Unassigned"**. A aba **flui e rola como um
   bloco só** dentro do `<main>` (`txnTab`/`txnControls`/`txnListScroll` sem
   mais as travas de `height:100%`/`maxHeight:50%`/scroll interno, que ficavam
   estranhas no layout full-screen).
   No mobile, **swipe da linha para a esquerda** revela os chips **Edit** (abre
   `EditModal`) e **Delete** (`TxnAuditCard`). O **botão de export CSV foi
   removido**. O botão JSON já tinha saído (PR #14).

   A auditoria de origem aparece como tooltip na célula de conta (desktop),
   linha "Source account (audit)" no `EditModal`, e `src:` no card mobile
   das linhas não-mapeadas. (A re-classificação por aliases — antigo
   `ReclassifyModal` — foi removida; a fonte de verdade para contas é a
   tabela de/para por URN.)

   **Lazy loading:** a lista renderiza no máximo 75 itens inicialmente e carrega
   mais 50 a cada vez que o usuário rola até o fim (IntersectionObserver no
   sentinel). Totais e seleção em massa sempre operam sobre a lista filtrada
   completa. Quando há mais itens além do visível, um indicador "Showing X of
   Y — scroll for more" aparece no fim da lista.

   **Seleção e edição em massa:** cada linha tem checkbox (sempre visível);
   "Select all" marca/desmarca a lista filtrada corrente. Com ao menos uma
   seleção, aparece a **barra de bulk**: definir categoria, definir conta,
   "Mark as Transfer" e "Delete (N)" com confirmação inline. Após qualquer
   **Apply**, a seleção é limpa automaticamente. Tudo é client-side (uma
   chamada `scheduleSave`, sem novo endpoint).
4. **Import** — importação de CSV (papaparse) com **dois métodos** apenas
   (`BANK_PROFILES`). **Desde a v1.16.2 (PR #126)**, o seletor de método
   deixou de ser os 2 cards grandes com title+descrição e virou um
   **segmented control (toggle) de 2 opções** (`S.segmented`/
   `S.segmentedBtn`), com dropzone de drag-and-drop abaixo; uma legenda
   curta logo abaixo do toggle exibe dinamicamente a descrição do método
   selecionado (mesma informação funcional de antes — auto-mapeado vs.
   manual/backfill —, só sem os cards grandes). Padding do toggle é maior
   que o do filtro de duplicatas, por ser a primeira decisão do fluxo.
   - **Credit Karma** (uso diário) — auto-mapeia as colunas do export
     (`account` passa por `classifyAccount`), preserva o sinal e já vem sem
     pendentes; sem UI de mapeamento.
   - **CSV** (uso único, backfill do histórico) — mapeamento manual de
     colunas (`IMPORT_FIELDS`, `guessMapping`, selects por campo com hints de
     fallback). Suporta valores contábeis com parênteses (`(47.50)` →
     `-47.50`) e detecta cabeçalhos repetidos no meio do arquivo (retorna
     `_skipped` em vez de descartar silenciosamente). O summary de diagnóstico
     exibe `N parsed · M valid · K skipped · X selected` — desde a v1.15.2
     (PR #123), omite o segmento "N parsed" quando `N === M` (parsed igual a
     valid), reduzindo redundância no caso comum.
     Desde a **v1.15.2 (PR #123)**, a seção **Column mapping** (só aparece
     nesse fluxo CSV) virou **colapsável** via `CollapsibleCard` — vem aberta
     por padrão apenas quando algum campo obrigatório ainda não foi mapeado;
     o aviso de campo obrigatório faltando permanece **sempre visível**, fora
     do card, independente do estado colapsado.
   Quando nenhum sinal de conta existe, a linha fica **Unassigned** (não mais
   "ATT Reward"). OFX/QFX e os profiles Chase foram removidos (o mapa de
   contas por URN cobre o caso Chase). O placeholder do dropzone de upload
   também foi traduzido PT→EN (PR #104, v1.7.0) — o restante do componente
   `ImportTransactions` já estava em inglês.

   **Deduplicação (híbrida).** Na prévia, cada linha tem checkbox e as
   duplicadas vêm **desmarcadas** (badge `DUP`), com Select/Deselect all —
   só as marcadas são importadas. Quando há duplicatas detectadas
   (`dupCount > 0`), aparece um filtro de visualização da prévia: **desde a
   v1.16.2 (PR #126)**, um **segmented control de 3 opções** — "All" / "New
   Only" / "Dup Only" (estado `dupFilter`, enum `"all"|"new"|"dup"`) — no
   lugar dos 2 checkboxes mutuamente exclusivos "Only duplicates"/"Only
   non-duplicates" introduzidos na v1.15.2 (PR #123). É um filtro **de
   visualização da prévia apenas** — não afeta o Set `selected` que
   determina o que de fato é importado. O botão **"Import N
   transactions"** fica em uma **barra sticky** (`bottom: 0`,
   gradiente para o fundo do app), sempre visível sem precisar rolar até o
   fim da lista depois de carregar o arquivo; `maxHeight` da lista de
   preview reduzido de 360 para 300 px para abrir espaço para a barra. A
   detecção (`markDuplicates`) compara contra os dados existentes **e**
   dentro do próprio lote em dois estágios (PR #51):

   - **Fast-path por `sourceId`** (Credit Karma): quando os dois lados têm
     `sourceId`, compara por id — assim dois gastos reais idênticos nunca são
     fundidos. Mantido intacto.
   - **Fuzzy sem `sourceId`** (CSV genérico): critério multicampo —
     mesmo `account` + mesmo `amount` em centavos exatos + data ±1 dia +
     ao menos 1 palavra em comum na descrição (≥3 chars, excluindo stop
     words). Índice por `account|cents` para eficiência (O(n + m×k)).
     Substitui o fingerprint anterior `data│valor│descrição│conta` que
     falhava quando o `sourceId` estava ausente.

   O export do CK emite a coluna `source_id`.

   **Edição de categoria na preview (v1.16.0, PR #124).** Cada linha da
   prévia tem um `<select>` compacto com todas as `CATEGORIES` (incl.
   `Transfer`) no lugar do texto estático da categoria — clicar no select
   não dispara o toggle de seleção da linha. Quando a categoria escolhida
   difere da auto-detectada, a linha exibe um badge azul **"EDITED"**
   (`#60a5fa`, `title` mostra a categoria original). Os overrides ficam em
   estado local, resetados ao trocar de arquivo/mapping (junto com
   `selected`/filtros), e são aplicados antes da confirmação — a transação
   importada carrega a categoria corrigida com `categoryManual`/
   `autoCategory` corretos, alimentando o mecanismo existente de detecção
   de correções manuais (`detectManualCategoryCorrections`) e o grupo
   "Manual category corrections" do painel **Suggested rules** na tab
   Settings, sem nenhuma escrita/endpoint novo.
5. **Settings** (PR #128, v1.17.0) — 5ª tab, ícone `Settings` (cog), última
   posição na tab bar. Consolidação da antiga tab **Audit** (`AuditTab`, PR
   #107, v1.9.0) com o antigo modal **`SettingsModal`** (aberto pela
   engrenagem no header) numa única tab: `AuditTab` foi renomeado para
   `SettingsTab`, e a engrenagem no header + o `SettingsModal` **foram
   removidos por completo** — não há mais atalho separado de configuração,
   tudo vive nesta tab. Nenhuma mudança de contrato de API, formato Redis ou
   modelo de transação — reorganização de composição de UI React.
   `src/App.jsx` foi o único arquivo alterado.

   **Ordem das seções dentro de Settings** (de cima para baixo):
   1. **Suggested rules** (topo)
   2. **Account aliases**
   3. **Card mapping** (Credit Karma) — migrado do antigo `SettingsModal`
   4. **Accounts & Categories** — card único com **Accounts**, **Expense
      categories** e **Income categories** empilhadas, cada uma separada por
      um divisor (desde a v1.18.0/PR #132; antes eram dois cards distintos —
      um "Accounts" e um "Categories" com Expense+Income, este último criado
      no PR #131/v1.17.1; e antes disso, três `ManagedList` cards colapsáveis
      separados, migrados do antigo `SettingsModal`)
   5. **Description rules** — desde o PR #135 (v1.20.0), absorveu a antiga
      seção dedicada **"Apple Daily Cash rule"** (removida por completo — ver
      abaixo)
   6. **Category mapping** — **movida para o final da tab** (antes vinha logo
      após "Account aliases"), com menos destaque/prioridade visual; continua
      colapsável e **fechada por padrão**.
   7. **Data & Backup** (desde a v1.20.3, PR #140; restore desde a v1.20.4) —
      novo card no final da tab, com dois botões: **"Backup transactions"**
      baixa localmente um JSON `household-transactions-backup-YYYY-MM-DD.json`
      com `{ transactions: [...], exportedAt }`, export puro do array de
      transactions já em memória (mesmo dado de `GET /api/transactions`),
      100% client-side, feedback "Downloaded N transactions." por ~2s;
      **"Restore from backup"** abre um seletor de arquivo, lê o JSON
      (aceita o envelope do backup ou um array puro), confirma com o usuário
      e então **substitui integralmente** as transactions em memória,
      salvando de imediato via `PUT /api/transactions`. Só cobre
      `transactions` — sem agendamento, sem merge/dedup, sem outros
      namespaces Redis (fora de escopo desta entrega).

   Renderiza `AccountAliasesSection` (mesmas props de antes:
   `transactions`, `accountMap`, `aliases={accountAliases}`,
   `onSave={onSaveAccountAliases}`), a seção **Account aliases** — chips de
   fragmento por conta (add/remove) + fluxo **Preview impact** → **Confirm &
   apply** (ver "Aliases de conta editáveis" no Modelo de dados). Nenhuma
   lógica de negócio mudou (`saveAccountAliasesAndApply`, `computeAliasImpact`,
   `buildAliasArray`, `applyAliasConfig`, `matchAccount`, `classifyAccount`,
   `api/account-aliases.js` — tudo igual, só mudou onde é renderizado).

   Logo abaixo, **Card mapping** (`AccountMapSection`, ver "Classificação de
   conta no import" no Modelo de dados) e o card **Accounts & Categories**
   com as três `ManagedList` — **Accounts**, **Expense categories**,
   **Income categories** (ver "Listas gerenciáveis" no Modelo de dados) —
   que antes só existiam dentro do `SettingsModal` (por trás da engrenagem
   no header) e agora vivem diretamente na tab, sem modal.

   > **Nota (PR #117, v1.14.0)**: a seção **"Classification history"** (e a
   > função `explainClassification`/`CLASSIFICATION_PAGE_SIZE`) foi
   > **removida** a pedido do usuário. Não existe mais nesta tab; a única
   > forma de auditar uma decisão de categoria hoje é através das seções de
   > regra abaixo (Category mapping / Description rules — a antiga "Apple
   > Daily Cash rule" foi absorvida por Description rules no PR #135,
   > v1.20.0, ver abaixo).

   **Category mapping** (desde o PR #111, v1.11.0; **posição movida ao final
   da tab na v1.17.0/PR #128**): lista os tokens de categoria do Credit Karma
   conhecidos — os do seed `DEFAULT_CK_CATEGORY_MAP` mais quaisquer outros
   descobertos nas transações já carregadas (via `ckCategory`) — cada um
   editável por um dropdown com as categorias correntes do ledger +
   `Transfer` + `Other Income` como destino. Persiste via
   `api/ck-category-map.js` em `household:*:ckcategorymap`. **Sem preview de
   impacto e sem cascata retroativa**: a edição só passa a valer para **novos
   imports** feitos depois da mudança (decisão confirmada com o usuário) —
   diferente do fluxo de aliases de conta, que tem preview + apply em
   cascata. Ver "Mapa CK → ledger de categorias" no Modelo de dados para a
   regra de segurança que nunca rebaixa `Transfer` no recálculo de
   `buildRow`.

   Antes de "Category mapping" (agora ao final), vem a seção **"Description
   rules"** (Painel de regras de categoria, Fatia 1, desde o PR #117,
   v1.14.0): lista as regras "descrição/provider contém X → categoria Y"
   (`categoryDescriptionRules`), com add / edição inline / delete (chip
   vermelho, confirmação em 2 cliques) / reordenar via setas ↑/↓ — a ordem é
   **semântica** (primeira regra que casa vence). Cada regra tem um select
   de `matchField` (description / provider / both), um input de padrão e um
   select de categoria de destino que **nunca lista `Transfer`** (bloqueado
   também no endpoint). Um aviso explica que essas regras têm precedência
   sobre o mapa CK (Category mapping) para categorias não-Transfer.

   > **Nota (PR #135, v1.20.0) — Apple Daily Cash rule removida como seção
   > dedicada.** Até a v1.19.0, existia aqui uma seção separada **"Apple
   > Daily Cash rule"** que editava a heurística de cashback do Apple Card
   > (`Deposit`/`Adjustment` → `Other Income`) via inputs de provider
   > pattern/keywords/categoria de destino, e era a **única** exceção
   > documentada que podia promover uma transação de `Transfer`. Essa seção
   > **foi removida por completo** no PR #135 (componente
   > `AppleDailyCashRuleSection`, seed/config/funções puras dedicadas — tudo
   > eliminado). Em vez disso, **Description rules** ganhou um mecanismo
   > genérico opt-in por regra: um checkbox **"Allow removing from
   > Transfer"** (`allowTransferOverride`, default desmarcado) que, marcado,
   > revela um campo condicional **"Provider/account pattern"**
   > (`providerPattern`) — a UI bloqueia salvar se o checkbox estiver
   > marcado com esse campo vazio. O card da regra fica com borda âmbar +
   > nota explicativa enquanto o flag estiver ligado. Uma migração
   > automática **one-shot e idempotente** converte a config legada do Apple
   > Daily Cash (se ainda ativa) em Description rules equivalentes
   > (`allowTransferOverride: true` + `providerPattern: "Apple Card"`,
   > inseridas no início do array para preservar a precedência que a regra
   > antiga tinha) na primeira carga após o deploy — nenhuma ação manual
   > necessária. Ver "Regras de categoria por descrição/provider" no Modelo
   > de dados para o shape completo, a nova ordem do pipeline em `buildRow` e
   > os detalhes da migração.

   Nunca sobrepõe o safety-net de Transfer, exceto quando a regra vencedora
   tem `allowTransferOverride: true` (ver Modelo de dados). **Sem preview de
   impacto e sem cascata retroativa** — só novos imports a partir da mudança
   (mesmo padrão das seções vizinhas). Ver "Regras de categoria por
   descrição/provider" no Modelo de dados para a precedência exata em
   `buildRow`. A **Fatia 2** (detecção automática de correções manuais
   recorrentes como candidatas a regra, PR #119, v1.15.0) está **concluída**
   — ver o Grupo C ("Manual category corrections") na seção **Suggested
   rules** abaixo.

   **Aviso de conflito pré-save (PR #133, v1.19.0; mensagem reforçada no PR
   #135, v1.20.0).** Antes de salvar, se alguma regra do draft bateria em
   transações já existentes marcadas `Transfer` ou `categoryManual === true`,
   um aviso âmbar (mesmo estilo do Preview impact de Account aliases)
   aparece **antes** do save, listando por regra as contagens + até 5
   exemplos, e o botão vira "Save anyway" (segundo clique confirma). Desde o
   PR #135, regras com `allowTransferOverride` ligado recebem uma mensagem
   mais séria (para elas, o aviso descreve uma de-transferência real, não
   hipotética). Puramente client-side/educativo — não muda `onSave`, o
   endpoint, nem o pipeline de import; ver "Regras de categoria por
   descrição/provider" no Modelo de dados para os detalhes técnicos.

   No **topo** da tab (`SettingsTab`, antes `AuditTab`), acima de "Account
   aliases", desde o **PR #115 (v1.13.0)**, a seção **"Suggested rules"**.
   **Desde o PR #121 (v1.15.1) o
   painel é sempre visível** — antes havia um `return null` quando os 3
   grupos (A/B/C) estavam vazios, o que o tornava indescobrível; agora, com
   os 3 grupos vazios, exibe um **estado vazio explicativo** (explica que o
   painel se popula conforme o uso do app, e que o grupo C — correções
   manuais — é forward-only, então pode aparecer vazio logo após a
   atualização mesmo havendo correções manuais feitas antes desta versão).
   O badge de contagem no card só aparece quando há itens (>0). Detecta
   automaticamente,
   100% client-side sobre as transações já carregadas em memória (sem novo
   endpoint), dois grupos de candidatos a regra:
   - **Grupo A (contas)** — `detectSuggestedAliasFragments` agrupa
     transações `Unassigned` por `normAccount(srcAccount)` (mesma
     normalização usada por `matchAccountWithAliases`), com threshold ≥2
     ocorrências; exclui `srcAccount`s que já casam com algum alias
     existente.
   - **Grupo B (categorias)** — `detectSuggestedCategoryTokens` agrupa
     transações com `category === "Other"` e `ckCategory` presente por
     `ckCategoryToken`, threshold ≥2; só inclui tokens cujo mapeamento
     corrente (`api/ck-category-map.js`) resolve para "Other".
   - **Grupo C (correções manuais, PR #119, v1.15.0)** — "Manual category
     corrections": `detectManualCategoryCorrections` agrupa transações com
     `categoryManual === true` e categoria final ≠ `Transfer` por comerciante
     — fragmento normalizado da descrição (`descFragment`), com fallback
     para o token CK (`ckCategoryToken`) quando não há fragmento (v1.16.1;
     antes era CK-token-first) —, threshold ≥2. Cada exemplo exibe a
     categoria que o usuário escolheu naquela transação ("was X → you: Y").
     **Desde a v1.16.3 (PR #127)**, no mesmo espírito dos Grupos A/B, a
     função também pula transações cuja categoria já é produzida por uma
     Description rule vigente (`matchDescriptionCategoryRule(t,
     descriptionRules) === t.category`) — antes o grupo continuava
     reaparecendo para sempre mesmo depois de o usuário criar exatamente a
     regra sugerida, já que `categoryManual` é permanente/forward-only e
     nada marcava o grupo como "resolvido". Ação **"Create rule
     from this"** rola/expande a seção **Description rules** e pré-preenche
     um novo rascunho de regra com o pattern do fragmento comum e a
     categoria de destino = categoria manual mais frequente do grupo — o
     usuário revisa e salva manualmente. **Forward-only**: só detecta
     correções feitas depois desta versão (depende de `categoryManual`/
     `autoCategory`, gravados a partir do PR #119); correções manuais
     anteriores não são detectadas retroativamente. Ver "Regras de
     categoria por descrição/provider" no Modelo de dados.
   Cada sugestão tem uma ação — **"Use this fragment"** (Grupo A),
   **"Review this token"** (Grupo B) ou **"Create rule from this"** (Grupo
   C) — que rola a tela até a seção alvo (Account aliases, Category mapping
   ou Description rules), força sua expansão (`CollapsibleCard` ganhou
   props `id`/`openSignal` para isso) e pré-preenche/destaca o campo
   relevante: no caso de aliases, preenche o campo de novo fragmento; no
   caso de category mapping, destaca visualmente a linha do token; no caso
   de correções manuais, pré-preenche um rascunho de regra de descrição.
   **Nenhuma escrita automática** — o usuário sempre confirma manualmente
   pelos fluxos de save já existentes (preview & apply para aliases; save
   direto para category mapping/description rules). Há um dismiss
   opcional por sugestão, só client-side, que **não persiste entre
   sessões** (não há endpoint nem chave no Redis para isso).

   Com esta seção, o item "Auditoria de classificação de categorias" da
   Fase 5 fica **completo** — ver Roadmap.

**Toggle do olho** no cabeçalho esconde/mostra todos os valores
monetários globalmente (persistido em `localStorage`).

**SaveIndicator** no cabeçalho exibe o estado do save: `saving`, `saved HH:MM`,
`unsaved` ou `error`. O save usa debounce de 800 ms (`scheduleSave`), com
flush via `beforeunload`. Erros de save são rastreados em `saveError`
separado do `error` geral.

**EditModal** abre com todos os campos da transação, `role="dialog"`,
`aria-modal` e `autoFocus`; persiste via PUT em `api/transactions.js`.

O app inicia com array vazio quando não há dados salvos (sem SEED).

---

## Roadmap

### Fase 1 — Scaffold (atual)
- [x] Scaffold do projeto (package.json, vite, vercel, index.html, main.jsx)
- [x] `lib/auth.js` e `lib/redis.js` (do aa-findocs)
- [x] `api/transactions.js` com namespace `household:*:transactions`
- [x] `src/App.jsx` com tabs, totais, eye toggle, import CSV
- [x] Documentação

### Fase 2 — Refino de UX
- [x] Edição de transações (não só add/delete)
- [x] Busca textual e filtros por intervalo de datas
- [x] Filtro por mês/ano no Dashboard e Charts
- [x] Save com debounce e indicador de estado mais rico
- [x] Mapeamento de colunas configurável no import
- [x] Entrada de transações exclusivamente via Import (tab Add e formulário manual removidos — PR #8)
- [x] Valores sinalizados: reversões (refund de despesa / clawback de receita) entram como negativo dentro da própria categoria e abatem o total; sinal/cor por fluxo de caixa

### Fase 3 — Análise
- [x] Orçamentos por categoria e alertas
- [x] Tendências e comparação mês a mês
- [x] Saldo e gastos por conta *(removido do Analyze no PR #8 — seção Account Balances descontinuada)*
- [x] Recorrentes / assinaturas detectadas

### Fase 4 — Plataforma
- [x] Exportar CSV (export JSON removido no PR #14)
- [x] Bulk delete de transações com confirmação inline (PR #14)
- [x] Redesign iOS 26 "Liquid Glass": safe-area, tipografia SF Pro, backdrop-filter, paleta dark mode, cantos arredondados (PR #23)
- [x] Classificação de conta por aliases (`ACCOUNT_ALIASES` / `matchAccount`):
  sem match vira Unassigned em vez de "ATT Reward"; profile de import
  Credit Karma; trilha de auditoria (`srcAccount`)
- [x] Tabela de/para de contas por `accountURN` (estável) + último-4
  (`AccountMapModal`, `/api/account-map`): separa cartões que a fonte rotula
  igual (5 Chase) e identifica o Venture X; export do CK passa a emitir
  `account_urn` e `last4`
- [x] Listas de contas e categorias gerenciáveis pela UI (`SettingsModal`,
  `/api/config`): add/rename/delete com cascata nos dados; antes eram
  constantes fixas no código
- [x] Dedup de import híbrido (`markDuplicates`): `source_id` do CK quando
  disponível, senão fingerprint conteúdo; prévia com checkbox por linha e
  duplicadas desmarcadas por padrão
- [x] Import redesenhado: dois métodos (Credit Karma auto / CSV manual) em
  cards + dropzone drag-and-drop; profiles Chase e OFX/QFX removidos
- [x] Settings unificado (engrenagem): Card mapping + listas em
  `CollapsibleCard`; export do CK exclui pendentes (`isPending`)
- [x] Layout: shell de altura fixa (`100dvh`, só `<main>` scrolla), Analyze +
  Charts numa tab só, aba Transactions com controles fixos (teto 50%) e lista
  com scroll próprio, modais limitados à área da Dynamic Island; Refresh e
  Reclassify removidos
- [x] Densidade mobile — Header e TabBar compactados (PR #40): header abaixo de
  25 % da altura da tela; design spec developer-ready embutido em `src/App.jsx`
- [x] Modernização visual Copilot-inspired: Dashboard com hero card de saldo,
  StatCards com borda de acento, avatares coloridos de categoria nas linhas e
  orçamentos, logo tile no header; tab bar com ícone + legenda
- [x] Transactions: chips de filtro com dropdown via portal (escapam de
  `overflow`), range from/to dentro do chip Date, resumo em pills coloridos,
  lista agrupada por data, data removida das linhas, swipe-to-reveal
  Edit/Delete (`TxnAuditCard`); botão CSV removido; travas de altura da aba
  removidas (flui/rola como bloco único)
- [x] Dashboard StatCards sem centavos (`usd0`) para caberem na linha
- [x] Settings: itens reordenáveis (setas ↑/↓, ordem persiste — fim do
  auto-sort alfabético), swipe Edit/Delete, edição inline com Save/Cancel,
  caixa de adicionar com input full-width + botão `+` compacto (`ManagedRow`)
- [x] Dashboard redesign v1.3.0 (PR #63): `PeriodFilter` movido para acima do
  hero; hero card exibe net/income/expenses do **período selecionado**; 3
  StatCards rebatizados "All Time" (totais históricos); bloco "Recent" removido;
  novo bloco **"by Category"** com gastos do mês selecionado ordenados
  decrescentes + badges **M/M** e **Y/Y** com cutoff de dia equivalente,
  cor por direção (vermelho = alta, verde = queda), base-zero exibe "—",
  respeita olho de privacidade; bloco visível só com ano+mês selecionado
- [x] Analyze redesign v1.4.0 (PR #65): card "Spending by Category" (PieChart)
  substituído por **`MonthlyBarCard`** — barras mensais de Income ou Expense
  (valores absolutos) com toggle de pills no topo (default Income); respeita
  `PeriodFilter` e `hideValues`; card "Income vs Expenses (Monthly)" (barras
  agrupadas) mantido inalterado abaixo; `PieChart` e `useMemo` `byCategory`
  removidos (código morto)
- [x] Charts v1.5.1: o filtro de range de anos abre com **From/To no ano mais
  recente** dos dados (em vez de todo o histórico), para o app abrir já focado
  no período atual
- [x] DailyPaceCard v1.5.5: AreaChart de gasto cumulativo diário adicionado ao
  Analyze → Charts entre o `MonthlyBarCard` e o card "Income vs Expenses"; duas
  séries (mês atual laranja `#F97316` sólido + mês anterior cinza `#8b94a3`
  tracejado); eixo X = dia do mês, eixo Y = cumulativo em `$X.XK`; ReferenceLine
  "Today" quando exibindo o mês corrente; sempre reflete os dois meses mais
  recentes com dados de despesa, ignorando o filtro de range/granularidade dos
  outros cards; Transfers excluídas; `cursor={false}`
- [x] DailyPaceCard v1.5.6: movido do Analyze → Charts para o **Dashboard**,
  posicionado entre o hero card e o bloco "by Category"; as duas séries passam
  a ser controladas pelo `PeriodFilter` do Dashboard (mês selecionado = laranja
  sólido; mês anterior = cinza tracejado) em vez de sempre refletir os dois
  meses mais recentes com dados; os 3 StatCards "All Time" (Income / Expenses /
  Net) foram movidos para o **rodapé** do Dashboard (antes ficavam logo abaixo
  do hero)
- [x] Charts v1.5.0 (PR #67): **granularidade selecionável** (segmented control
  M / Quarter / Half / Year) + **filtro de range de anos** (From/To) no topo
  da seção Charts, substituindo os dropdowns Ano+Mês do Charts (o
  `PeriodFilter` compartilhado permanece no Dashboard); sem limite de buckets
  (cap de 12 meses removido); eixo Y e tooltip em formato **`0.00K`** (ex.
  `$1.50K`) nos dois cards; expenses sempre positivas (`Math.abs` após
  netting); título do card agrupado alterado de "Income vs Expenses (Monthly)"
  para "Income vs Expenses"; lógica `isSingleMonth` removida
- [x] Design polish Settings + Analyze (PR #62, v1.2.0): `CollapsibleCard`
  com suporte a prop `icon` + fontWeight 600 no título + padding interno
  maior; `AccountMapSection` com status dot verde/âmbar por card
  (mapeado/não-mapeado); `ManagedRow` com delete chip vermelho (`#f87171`)
  e confirmação em 2 cliques com auto-reset em 2,5 s; `SettingsModal` com
  botão "Close" no footer fixo (`flexShrink:0`); orçamentos com threshold
  amarelo em 75 % (antes 80 %), % usada sempre visível e glow vermelho
  intensificado; recorrentes com frequency badge colorido + subtexto "Próx.
  estimada: [data]"; tendências com `marginBottom:16` antes da tabela e
  Legend com `iconType="circle"` e `paddingTop:8`
- [x] iOS PWA full-bleed: `viewport-fit=cover` (meta sem `maximum-scale` +
  reinstalação), shell em `100lvh` (a tela física real; `100dvh` = só a
  layout viewport de 812 pt no 16 Pro) com `html/body/#root` em `100lvh` +
  `overflow:hidden`; tab bar encosta na borda física (`belowNav = 0`), sem
  faixa preta nem rubber-band
- [x] Refinamento dos filtros de data (PR #152, branch
  `claude/date-wheel-year-range-picker`): na tab Transactions, o
  `DateHeaderFilter` trocou os dois `<input type="date">` (From/To) por
  botões que abrem um popup com o novo `DateWheelPicker` (três colunas
  roláveis Mês/Dia/Ano estilo "wheel", scroll-snap + auto-seleção por
  debounce, sem botão "Aplicar" manual); na tab Trends, os `<select>` de
  fromYear/toYear foram substituídos pelo novo `YearRangeSlider` (trilha com
  dois handles arrastáveis via pointer events, snap por ano). Puramente
  visual, sem mudança de contrato de `from`/`to` (continuam string
  `YYYY-MM-DD`) nem de API/Redis/modelo de transação
- [x] Refinamento do `YearRangeSlider` na tab Trends (PR #153, branch
  `claude/household-yearrange-refine`): trilha mais curta (`maxWidth: 260`,
  antes edge-to-edge do card); thumbs em estilo "liquid glass"
  (gradiente translúcido + `backdrop-filter` + inset highlight); ao
  selecionar range > 1 ano, a granularidade sugere automaticamente "Anos"
  (Y) sem travar a escolha manual; novo switch **All / L3Y / YTD** à
  esquerda do slider (reaproveita `S.segmented`/`S.segmentedBtn`) com
  destaque do preset ativo quando o range bate com ele. Só `src/App.jsx`
  alterado; sem mudança de API/Redis/modelo de transação
- [x] Ajustes finos no `YearRangeSlider` da tab Trends (PR #154, branch
  `claude/household-yearrange-refine`, mergeado em `main`): no mobile, a
  trilha do slider ganhou um wrapper com padding lateral de 12px para os
  handles não ficarem colados/quase saindo da borda direita da tela; no
  desktop, o slider deixou de ficar centralizado na row e passou a ficar
  alinhado à esquerda, colado ao segmented All/L3Y/YTD, via novo prop
  `isWide` passado de `App` para `Charts` (reaproveita o hook
  `useMediaWide(900)` já existente); e quando o range volta a cobrir só 1
  ano (`fromYear === toYear`), a granularidade dos gráficos agora volta
  automaticamente para "M" (meses), espelhando a lógica inversa já existente
  que troca para "Y" ao expandir para múltiplos anos — evita visão mensal
  poluída em períodos multi-ano ao alternar de volta para 1 ano. Só
  `src/App.jsx` alterado (`YearRangeSlider`, `Charts`, `applyYearRange`); sem
  mudança de API/Redis/modelo de transação
- [x] Filtro de categoria da tab Trends movido para o lado esquerdo do
  switch All/L3Y/YTD no desktop (`isWide`): no desktop o chip `HeaderFilter`
  de Category entra na mesma row do segmented All/L3Y/YTD +
  `YearRangeSlider` (posicionado antes deles); no mobile continua numa
  linha própria abaixo. Só `src/App.jsx` alterado; sem mudança de
  API/Redis/modelo de transação
- [x] Fix: labels do `YearRangeSlider` sobrepostos quando o range é 1 ano só
  — o label do handle "from" agora é omitido quando `fromYear === toYear`,
  deixando só o label do handle "to" visível. Só `src/App.jsx` alterado; sem
  mudança de API/Redis/modelo de transação
- [x] Reorganização dos controles da tab Trends (v1.22.0): removido o header
  com o rótulo do range de anos; no desktop, category chip + presets
  All/L3Y/YTD + `YearRangeSlider` + switch M/Q/H/Y ficam todos na mesma
  linha; no mobile, category chip + switch M/Q/H/Y numa linha e presets +
  `YearRangeSlider` na linha seguinte. Só `src/App.jsx` alterado; sem
  mudança de API/Redis/modelo de transação
- [x] Desktop: switch M/Q/H/Y da tab Trends alinhado à direita da linha
  (v1.22.1), separado do bloco category/presets/slider à esquerda. Só
  `src/App.jsx` alterado; sem mudança de API/Redis/modelo de transação
- [x] Restyle dos chips de Date/Category da tab Home (PR #161, mergeado em
  `main`): antigo `PeriodFilter` (dois `<select>` nativos) substituído por
  `SinglePeriodFilter` (chip-button + Popover, padrão já usado na tab
  Transactions); chip de categoria do bloco "by Category" trocado de
  `<select>` nativo para `SingleCategoryFilter` (chip-button + Popover,
  comportamento rádio). Semântica single-select preservada — `year`/`month`/
  `catFilter` continuam string única, `matchPeriod`/`heroComparisons`/
  `cutoffDay`/`dashboardPaceData` não foram tocados. Corrigido também um bug
  de fonte nos popovers (`createPortal` para `document.body`, fora de
  `.app`, não herdava a fonte do app): nova constante `FONT_STACK` aplicada
  em `S.headerPop` e nos inputs de data do `DateHeaderFilter` da
  Transactions. Só `src/App.jsx` alterado; sem mudança de API/Redis/modelo
  de transação
- [x] Home: chip de data em árvore Excel-style + alinhamento do chip de
  categoria (v1.23.0): popover do `SinglePeriodFilter` trocou as duas seções
  "Year"/"Month" por uma árvore única ano → mês (botão "+" expande o ano,
  clique no ano seleciona o ano inteiro, clique num mês dentro do ano
  expandido seleciona só aquele mês — sempre single-select, nunca vira
  array); `SingleCategoryFilter` passou a ficar alinhado à esquerda ao lado
  do chip de data (`justifyContent: "flex-start"`, antes `"space-between"`).
  Só `src/App.jsx` alterado; sem mudança de API/Redis/modelo de transação
- [x] Home: chip de data (`SinglePeriodFilter`) trocado de árvore Excel-style
  para "wheel picker" estilo iOS (PR #170, v1.24.1): duas colunas roláveis
  (Mês / Ano) com `scroll-snap`, item central em destaque tipográfico (sem
  checkmark) e "All" como linha no topo de cada coluna, permitindo
  combinações independentes de mês/ano (já suportadas por `matchPeriod`).
  Implementação nativa em React/CSS (sem `@ionic/react`, que não é
  dependência do projeto); novos tokens `S.wheelCol`/`S.wheelItem`. Só
  `src/App.jsx` alterado; sem mudança de API/Redis/modelo de transação
- [x] Home: chip de data (`SinglePeriodFilter`) — wheel picker trocado por
  `<input type="month">` nativo (PR #171, v1.25.0), pois o wheel picker do
  PR #170 não funcionava bem com mouse/scroll no desktop; chips extras
  "All months"/"All years" cobrem o caso "All" que o input nativo não
  representa; `colorScheme: "dark"` para o tema escuro; `WheelColumn` e
  `S.wheelCol`/`S.wheelItem` removidos. Só `src/App.jsx` alterado; sem
  mudança de API/Redis/modelo de transação
- [x] Home: chip de data (`SinglePeriodFilter`) — removido o `Popover`
  intermediário; clique no chip abre direto o picker nativo do
  `<input type="month">` (via `showPicker()`, fallback `.focus()`),
  posicionado transparente sobre o próprio chip (PR #172, v1.25.1). Chips
  extras "All months"/"All years" removidos (a Home sempre opera sobre
  mês/ano concreto); suporte a `"All"` em `matchPeriod`/`periodLabel`
  mantido só para o Ledger. Adicionado botão de reset (⟲) ao lado do chip,
  visível só quando o período selecionado difere do mês/ano atual,
  restaurando para o mês corrente. Só `src/App.jsx` alterado; sem mudança
  de API/Redis/modelo de transação
- [x] Home: fix no `SinglePeriodFilter` (PR #173, v1.25.2) — o
  `<input type="month">` transparente sobre o chip tinha `pointerEvents:
  "none"` adicionado, deixando o clique passar para o `<button>` que chama
  `showPicker()` (antes o clique era capturado pelo input e o picker nativo
  não abria no Chrome/Edge desktop). Adicionados `min`/`max` ao input,
  calculados via `useMemo` `monthRange` no `Dashboard` a partir do
  menor/maior `date.slice(0,7)` em `transactions`, restringindo a seleção ao
  intervalo de meses com dados reais. Só `src/App.jsx` alterado; sem
  mudança de API/Redis/modelo de transação
- [x] Home: fix de compatibilidade iOS no `SinglePeriodFilter` (PR #174,
  v1.26.0) — Safari iOS não abre `showPicker()`/não renderiza
  `<input type="month">` de forma utilizável mesmo após o fix de clique da
  v1.25.2. Detecção de iOS/iPadOS via `isIOSDevice` (`userAgent` +
  fallback `navigator.platform === "MacIntel" && maxTouchPoints > 1` para
  iPadOS 13+); quando é iOS, renderiza dois `<select>` nativos (Mês/Ano,
  novo token de estilo `S.periodSelect`) em vez do input; desktop/Android
  seguem usando o input nativo. Anos do select limitados ao mesmo
  `minMonth`/`maxMonth` (`monthRange`) da v1.25.2. Só `src/App.jsx`
  alterado; sem mudança de API/Redis/modelo de transação
- [x] Home: wheel picker estilo iOS no `SinglePeriodFilter` (PR #175,
  v1.27.0) — no branch `isIOSDevice`, os dois `<select>` (Mês/Ano) da
  v1.26.0 foram substituídos por um wheel picker nativo em React puro +
  CSS scroll-snap (sem libs novas): duas colunas roláveis (Mês | Ano),
  linha central em destaque, snap por debounce de 120 ms. Mesma abordagem
  tentada para ambas as plataformas na v1.24.1 e revertida na v1.25.0 por
  problemas de mouse/scroll no desktop — desta vez escopada só ao branch
  iOS/iPadOS, evitando repetir o problema; desktop/Android seguem com
  `input type="month"` + `showPicker()`, inalterado. `S.periodSelect`
  removido por ficar sem uso; novos tokens `S.wheelCol`/`S.wheelItem`. Só
  `src/App.jsx` alterado; sem mudança de API/Redis/modelo de transação
- [x] Home: `<select>` HTML5 nativo no `SingleCategoryFilter` para desktop
  (PR #176, v1.28.0) — quando `isWide` (`useMediaWide(900)`), o chip de categoria
  passa a usar um `<select>` nativo estilizado (`S.chipSelect(active)` +
  seta `S.chipSelectArrow`) em vez do chip-button + `Popover`; no mobile
  mantém o `Popover` original, inalterado. `catFilter` continua string
  única. Só `src/App.jsx` alterado; sem mudança de API/Redis/modelo de
  transação
- [ ] Multiusuário / household compartilhado
- [ ] PWA offline-first
- [~] Integrações de import (bancos, cartões) — exportador Credit Karma para
  iPhone via Scriptable e bookmarklet de Safari em `tools/credit-karma/`
  (gera CSV `date,description,amount,category,account,ck_account,provider,
  ck_category,type,account_urn,last4,source_id`, consumido pelo profile
  Credit Karma do Import). **Invariante de sinal:** o export nunca altera o
  sinal do CK — o Credit Karma já entrega o `amount` na direção natural da
  categoria (normal positivo, reversão negativo), então o valor cru é
  preservado verbatim; só as **categorias** são remapeadas. O cashback do
  **Apple Card ("Daily Cash")**, que o CK entrega como `Transfer` nas contas
  Apple, é reclassificado para `Other Income` mantendo o sinal do CK:
  `Deposit` (cashback ganho) vem positivo e `Adjustment` (cashback estornado
  em refund) vem negativo, abatendo o cashback ganho.
  Transações **pendentes são excluídas** do export (`isPending`) — só linhas
  liquidadas (cleared) entram no CSV.
- [x] Invariante de sinal (PR #48): o exportador CK não altera mais o sinal
  do CK — removidas a calibração de sinal de despesa e o `Math.abs` de
  income; `naturalAmount` retorna o valor cru. Só categorias são remapeadas
- [x] Invariante de sinal no import: `buildRow` preserva o sinal em todos os
  caminhos (removido o `Math.abs` do CSV genérico); `applyConfig` garante que
  `Other Income` seja sempre reconhecida como receita, evitando que income
  importado seja rebaixado para a despesa `Other` (o que invertia o sinal
  exibido de Deposit/Adjustment do Apple Card)
- [x] Bugfix PR #42: income do exportador CK agora sai sempre positivo nos
  dois exportadores (`creditkarma-export.scriptable.js` e `bookmarklet.src.js`)
- [x] Bugfix: cashback Apple Card ("Daily Cash") chegava do CK como `Transfer`
  negativo na conta Apple Savings e aparecia como "Deposit −$0.30"; agora é
  reclassificado para `Other Income` (positivo) por heurística (provedor
  "Apple Card" + descrição "Deposit"); `bookmarklet.txt` regenerado
- [x] Bugfix: `Adjustment` do Apple Card (estorno de cashback em refund de
  compra) agora entra como `Other Income` negativo (clawback que abate o
  cashback ganho); o exporter preserva o sinal do CK (Deposit positivo,
  Adjustment negativo) em vez de negá-lo; antes ficava como `Transfer`
- [x] Invariante de sinal confirmada (PR #48 + #49): `Deposit` do Apple Card
  aparece como `Other Income +$X` e `Adjustment` como `Other Income −$X`
  no ledger, com sinal idêntico ao do Credit Karma — importação via CSV
  e importação direta via profile CK ambas preservam o sinal verbatim
- [x] Lazy loading na tab Transactions (PR #61, SHA 62e12a9): `visibleCount`
  state (inicial 75, incremento 50) via IntersectionObserver em sentinel no
  fim da lista; DOM renderiza `filtered.slice(0, visibleCount)`, mas totais e
  seleção operam sobre `filtered` completo; indicador "Showing X of Y — scroll
  for more" quando há mais itens; sem mudanças server-side nem novas dependências
- [x] Bugfix duplo no import de CSV (PR #51): (1) dedup fuzzy sem `sourceId`
  — critério multicampo (`account` + centavos + data ±1 dia + palavra em
  comum na descrição) com índice `account|cents`; fast-path por `sourceId`
  mantido; (2) parsing de valores contábeis com parênteses (`(47.50)` →
  `-47.50`) + detecção de cabeçalhos repetidos no meio do arquivo
  (`_skipped`); UI de import exibe `N parsed · M valid · K skipped · X selected`
- [x] Bugfix cálculo do NET (PR #80, SHA 4637270, v1.5.10): removido
  `Math.abs` de `net = income − expenses` na aba Transactions e em
  `computeTotals` (StatCards "All Time" do Dashboard) — o `Math.abs`
  invertia o sinal quando reembolsos superavam despesas no período (exibia
  −$247 em vez de +$247); pill de expenses agora exibe valor positivo com
  `↑` e cor verde (`#34d399`) quando `summary.expenses <= 0`
- [x] Correção do cálculo do NET (v1.5.11): a v1.5.10 trocou `Math.abs` por
  `income − expenses`, mas como o `amount` é fluxo de caixa sinalizado
  (despesa negativa, entrada positiva) a fórmula correta é
  **`net = income + expenses`** (soma dos fluxos). `income − expenses`
  continuava errado quando os refunds dominavam (`expenses` positivo →
  exibia −$247.29) e ainda inflava o NET em meses normais (`expenses`
  negativo). Corrigido em `computeTotals` e na aba Transactions; a pill de
  expenses passou a usar `↓` vermelho para saída líquida (`expenses < 0`) e
  `↑` verde para entrada líquida (`expenses >= 0`), sempre exibindo a
  magnitude. Atualizada a seção "Sinal do `amount`" para refletir a
  convenção real do Credit Karma
- [x] Design polish cards Analyze (PR #94, v1.5.23): `MonthlyBarCard` e card
  "Income vs Expenses" atualizados para o padrão visual do `DailyPaceCard` —
  wrapper com `padding:0`/`overflow:hidden`, header interno com título e
  controles/toggle, `CartesianGrid vertical={false}`, eixos `XAxis`/`YAxis`
  com `tick={{ fill: "#6b7280", fontSize: 10 }}` e `tickLine={false}`/
  `axisLine={false}`, container `height:260` (MonthlyBarCard) e `height:280`
  ("Income vs Expenses"), margens ajustadas; legenda inline manual no card
  "Income vs Expenses" substituindo o `<Legend>` do recharts, com swatches
  `#06B6D4` (Income) e `#F97316` (Expenses)
- [x] `CategoryStackedBarCard` (PR #95, v1.5.24): terceiro card de gráfico na
  tab Analyze, adicionado abaixo do card "Income vs Expenses"; barras stacked
  de despesas por categoria agrupadas na granularidade e range do segmented
  control; `CATEGORY_COLOR_MAP` global com paleta temática por categoria (casa
  = vermelhos, carro = azuis, alimentação = verdes, lazer = púrpuras,
  finanças/saúde = âmbar/cinza); `radius={[4,4,0,0]}` só na barra do topo do
  stack; legenda inline manual com swatches 10×10 px das categorias presentes
  no período; respeita `hideValues` e filtros de `scoped`; retorna `null`
  quando não há despesas no período
- [x] Correções de UX no `CategoryStackedBarCard` (PR #96, v1.5.25): barras
  ordenadas por grupo temático fixo via `CATEGORY_ORDER` (casa → carro →
  alimentação → lazer → finanças/saúde) em vez de por volume; legenda movida
  para abaixo do gráfico em layout wrap centralizado; header simplificado
  (só título, sem legenda no topo); tooltip corrigido com
  `allowEscapeViewBox={{ x: true, y: true }}` + `wrapperStyle={{ zIndex: 100 }}`
  (resolve truncamento pelo `overflow:hidden` do card); altura do container
  reduzida de 300 para 260 px
- [x] Melhorias no `CategoryStackedBarCard` (PR #97, v1.5.26): tooltip
  corrigido definitivamente com `overflow: visible` no card wrapper (abordagem
  mais limpa que `allowEscapeViewBox`/`zIndex`); **total label** em `$X.XK`
  acima de cada barra stacked via `<LabelList>` com renderer SVG; **toggle
  Expense/Income** no header (estado `mode`) para alternar entre despesas e
  receitas por categoria; cores de income (`Salary`/`Bonus`/`Bela Income`/
  `Other Income`) adicionadas ao `CATEGORY_COLOR_MAP` com tons verdes
  (`#10b981`/`#34d399`/`#6ee7b7`/`#a7f3d0`); título renomeado de
  "Expenses by Category" para **"By Category"**
- [x] Correções no `CategoryStackedBarCard` (PR #98, v1.5.29): bug de total
  corrigido — acumulação usa valor sinalizado + `Math.abs` por categoria após
  netting (espelha `byBucket`), reembolsos agora subtraem do total em vez de
  somar (eliminava discrepância entre o label e o gasto real); ordem do toggle
  reordenada para **Income | Expense** (Income primeiro), default continua
  "expense"; total labels `$X.XK` no topo das barras corrigidos para funcionar
  corretamente em expense e income mode
- [x] Toggle `CategoryStackedBarCard` reordenado para **Expense | Income**
  (PR #100, v1.5.29): ordem dos botões invertida — Expense aparece primeiro,
  Income segundo; default "expense" permanece inalterado
- [x] Auto-reload do PWA ao atualizar (PR #101, v1.5.30): listener
  `controllerchange` adicionado em `src/main.jsx` (antes do `createRoot`,
  guard `'serviceWorker' in navigator`); quando o novo service worker assume
  o controle via `skipWaiting()`, dispara `window.location.reload()`
  automaticamente — elimina a necessidade de fechar/reabrir o app duas vezes
  para receber uma atualização
- [x] Filtro de categoria (multi-select) nos gráficos (PR #102, SHA aa8da9d,
  v1.6.0) — pedido direto do usuário, fora da sequência planejada do roadmap:
  novo filtro no topo do `Charts` (tab Analyze), reutilizando o `HeaderFilter`
  já existente (dropdown multi-select com checkboxes, modo `chip`); afeta os
  3 cards (Income vs Expenses, Monthly, By Category) via `scoped` (composição
  de `scopedByYear` + `categoryFilter`); opções = `EXPENSE_CATEGORIES +
  INCOME_CATEGORIES` sem `Transfer` (nunca selecionável); `Charts` passou a
  receber a prop `config` para invalidar `categoryOptions` quando as listas
  mudam em Settings; `Trends`/`Budgets`/`Recurrents` ficaram fora de escopo
  (não respeitam o filtro, como antes); único arquivo tocado: `src/App.jsx`
- [x] Analyze reduzido a somente Charts + tradução da tab Import (PR #104,
  commit c270244, v1.7.0): a tab Analyze passou a renderizar **apenas**
  `<Charts/>`, terminando no card "By Category"; os componentes `Trends`,
  `Budgets`, `Recurrents` e `Analyze` foram **deletados** (não comentados),
  junto com o state de orçamentos do `App` (`budgets`, `budgetSaving`,
  `loadBudgets`, `saveBudgets`, `updateBudget`) e o cascade de rename de
  categoria que sincronizava chaves de budget; o endpoint `/api/budgets.js`
  e os dados já persistidos no Redis (`household:*:budgets`) foram mantidos
  intactos, congelados para uma eventual reimplementação (ver Fase 5).
  Também traduzidas PT→EN as 3 últimas strings em português da tab Import
  (`ImportTransactions`): descrição do método Credit Karma, descrição do
  método CSV, e placeholder do dropzone de upload. Único arquivo tocado:
  `src/App.jsx`
- [x] UX improvements na tab Import (PR #123, branch
  `claude/import-tab-ux-improvements-i1b7az`, v1.15.2, squash merge, SHA
  4819642): novo checkbox "Only non-duplicates" ao lado de "Only
  duplicates" (mutuamente exclusivos, só aparecem quando há duplicatas
  detectadas — filtro só de visualização da prévia, não afeta o Set
  `selected` usado para importar); botão "Import N transactions" movido para
  barra sticky (`bottom: 0`, gradiente) sempre visível sem scroll, lista de
  preview com `maxHeight` reduzido de 360 para 300; textos das descrições dos
  method cards (Credit Karma/CSV) condensados e o resumo de diagnóstico
  omite "N parsed" quando igual a "N valid"; seção **Column mapping** (fluxo
  CSV) virou colapsável via `CollapsibleCard`, aberta por padrão só quando
  falta campo obrigatório mapeado (aviso de campo faltando continua sempre
  visível fora do card). Frontend puro, sem mudança de contrato de API/Redis.
- [x] Edição de categoria na preview da tab Import (PR #124, branch
  `claude/import-tab-ux-improvements-i1b7az`, v1.16.0): refinamento sobre o
  Import redesenhado da Fase 4, cruzando com o mecanismo de correções
  manuais da Fase 5 (PR #119). Cada linha da prévia ganhou um `<select>` de
  categoria (lista completa `CATEGORIES`, incl. Transfer) no lugar do texto
  estático; overrides em estado local (`categoryOverrides` Map, resetado ao
  trocar arquivo/mapping), aplicados via `displayRows` antes da
  confirmação — mesma semântica do `EditModal` para `categoryManual`/
  `autoCategory` (ver Modelo de dados). A transação importada já entra no
  ledger com a categoria corrigida, alimentando
  `detectManualCategoryCorrections` e o grupo "Manual category corrections"
  do painel Suggested rules (tab Audit) sem nenhum endpoint/persistência
  nova. Badge azul "EDITED" quando a categoria difere da auto-detectada.
  Frontend puro, sem mudança de contrato de API/Redis.
- [x] Ajustes visuais na tab Import (PR #126, branch
  `claude/import-tab-ux-improvements-i1b7az`, v1.16.2): method picker
  (Credit Karma/CSV) trocado dos 2 cards grandes por um **segmented
  control de 2 opções** com legenda dinâmica da descrição do método
  selecionado abaixo; filtro de duplicatas trocado dos 2 checkboxes
  mutuamente exclusivos "Only duplicates"/"Only non-duplicates" (PR #123)
  por um **segmented control de 3 opções** (All / New Only / Dup Only,
  enum `dupFilter`), mesma guarda `dupCount > 0` e mesma independência do
  Set `selected`. Novos tokens de estilo reutilizáveis `S.segmented`/
  `S.segmentedBtn`, no padrão visual do segmented control de granularidade
  do Analyze. Frontend puro, sem mudança de contrato de API/Redis.
- [x] **Fix: Grupo C ("Manual category corrections") reaparecia mesmo após
  o usuário criar a Description rule sugerida** (PR #127, branch
  `claude/import-tab-ux-improvements-i1b7az`, v1.16.3, pendente de merge) —
  ao contrário dos Grupos A/B (que pulam candidatos já cobertos), o Grupo C
  nunca checava cobertura por Description rule existente, então a sugestão
  não tinha como ser marcada como "resolvida" (`categoryManual` é permanente
  e forward-only, PR #119). `detectManualCategoryCorrections` ganhou o
  parâmetro `descriptionRules` e passa a pular transações cuja categoria já
  é produzida por uma regra vigente (`matchDescriptionCategoryRule`);
  `AuditTab` passou a fornecer `categoryDescriptionRules` nessa chamada. O
  "Dismiss" (só de sessão) não mudou — não era a causa do bug. Frontend
  puro, sem mudança de contrato de API/Redis, nenhum impacto nos Grupos A/B.
- [x] Rename da tab "Dashboard" para "Home" + padronização de cores dos
  ícones de categoria (PR #138, branch
  `claude/dashboard-category-colors-ytmb16`, v1.20.2): label/ícone
  (`LayoutDashboard`→`Home`)/id interno da tab atualizados juntos (ícone do
  logo/header mantido, fora de escopo); nova função central
  `getCategoryColor(cat)` unifica a cor do avatar de categoria entre a tab
  Home e o card "By Category" da tab Analyze, eliminando a divergência de
  cor que existia antes para a mesma categoria. Frontend puro, sem mudança
  de contrato de API/Redis/modelo de transação.
- [x] **Overhaul visual "Liquid Glass" (fases A–F), Fase A — Header e Tab
  Bar** (PR #144, branch `feature/liquid-glass-phase-a-header-tabbar`,
  v1.21.0 → v1.21.1, squash-merged em `main`) — início de um overhaul
  visual em múltiplas fases inspirado no "Liquid Glass" da Apple, decidido
  com o usuário, evoluindo o Redesign iOS 26 "Liquid Glass" original (PR
  #23, acima) para além de header/tab bar. Único arquivo alterado:
  `src/App.jsx`. Nesta Fase A: (1) ícone do header trocado de
  `LayoutDashboard` (genérico) para **`Wallet`** (`lucide-react`) — mais
  condizente com o tema de finanças domésticas do app; (2) tile do ícone
  do header: `borderRadius` 8→9, adicionado gradiente de realce translúcido
  neutro ("glass highlight") + `boxShadow` inset simulando reflexo de
  vidro; (3) `S.tabBar` deixou de ter fundo opaco sólido e passou a ser
  **translúcido** (`rgba(11,13,16,0.85)`) com `backdropFilter`/
  `WebkitBackdropFilter: blur(20px) saturate(180%)`, espelhando o padrão
  já existente em `S.header` — agora topo e rodapé do app compartilham o
  mesmo efeito "glass". Nenhuma mudança em API, Redis, modelo de transação
  ou dependências. **Decisões de estilo fixadas para todo o overhaul**
  (valem para as fases seguintes): ícone do header = `Wallet`; realces de
  luz = branco neutro, sem tingimento de marca; listas de transação
  permanecem **opacas**, sem glass, por legibilidade/performance.
  **Fases seguintes:**
  - [x] **Fase B** — modais, popovers e overlay de fundo (PR #145, branch
    `feature/liquid-glass-phase-b-modals-popovers`, v1.21.1 → v1.21.2,
    squash-merged em `main`). Único arquivo alterado: `src/App.jsx`.
    `S.modalOverlay` ganhou `backdropFilter`/`WebkitBackdropFilter:
    blur(4px)` leve (mantendo `rgba(0,0,0,0.6)`); `S.modalCard` deixou de
    ter fundo opaco e passou a `rgba(22,26,32,0.82)` +
    `backdropFilter: blur(20px) saturate(180%)` + borda
    `rgba(255,255,255,0.08)` + novo `boxShadow` de profundidade (não tinha
    sombra antes); `S.loginCard` recebeu o mesmo tratamento do
    `modalCard`; `S.headerPop` (popover de filtro) ganhou o mesmo fundo
    translúcido + blur, com o `boxShadow` já existente mantido. Nenhuma
    mudança em API, Redis, modelo de transação ou dependências.
  - [x] **Fase C** — cards de conteúdo (StatCard, hero card,
    CollapsibleCard) (PR #146, branch
    `feature/liquid-glass-phase-c-content-cards`, v1.21.2 → v1.21.3,
    squash-merged em `main`). Único arquivo alterado: `src/App.jsx`.
    `S.card` (base de `StatCard` e vários blocos) deixou de ter fundo opaco
    e passou a `rgba(22,26,32,0.7)` + `backdropFilter: blur(16px)
    saturate(160%)` + borda `rgba(255,255,255,0.08)`, `borderRadius` 16→14;
    o hero card do Home teve o gradiente convertido para translúcido, com
    realce de luz diagonal + `boxShadow` inset simulando reflexo de vidro;
    `CollapsibleCard`, `S.summaryBar` e `S.bulkBar` receberam o mesmo
    tratamento de translucidez/blur, `borderRadius` uniformizado para 14px
    (hero card ficou em 20px, igual ao `modalCard` da Fase B); `StatCard`
    herdou a translucidez automaticamente por herdar de `S.card` via
    spread, sem edição direta. Nenhuma mudança em API, Redis, modelo de
    transação ou dependências.
  - [x] **Fase D** — linhas de transação (`S.txnRow`, `TxnAuditCard`, avatar
    de categoria) — **verificação/auditoria de consistência, sem nenhuma
    alteração de código**. Diferente das fases A–C, esta fase não gerou
    diff nem PR nem bump de versão (app permanece em **v1.21.3**, da Fase
    C). Decisão do usuário reafirmada: linhas de transação continuam
    **opacas**, sem glass/blur, por serem uma lista potencialmente longa
    (risco de custo de performance no scroll). O feature-coder investigou
    `S.txnRow` (`borderRadius` 14, opaco), `TxnAuditCard` (`borderRadius`
    14, herda de `S.txnRow`) e o avatar de categoria (`borderRadius` 10,
    circular, com alpha próprio) e confirmou que os três já estavam
    consistentes com a escala de 14px estabelecida nas Fases A–C e sem
    translucidez indevida — nada precisou ser mudado. Fase encerrada como
    "nenhuma ação necessária".
  - [x] **Fase E** — inputs, botões e chips/pills (PR #147, branch
    `feature/liquid-glass-phase-e-inputs-buttons`, v1.21.3 → v1.21.4,
    squash-merged em `main`). Único arquivo alterado: `src/App.jsx`.
    `S.input`, `S.select`, `S.searchWrap`, `S.cellSelect`,
    `S.importCatSelect`: fundo deixou de ser opaco e passou a
    `rgba(15,18,22,0.92)` + borda `rgba(255,255,255,0.08)` + `boxShadow`
    inset simulando campo "escavado" — sem blur, inputs continuam sem
    `backdropFilter` por serem pequenos e precisarem de máxima
    legibilidade; `S.primaryBtn` ganhou gradiente duplo (sheen branco
    translúcido + azul `#0A84FF→#0055cc`, reaproveitando os stops do ícone
    do header) + `boxShadow` com realce de luz no topo; `S.secondaryBtn`
    ganhou borda mais visível (`rgba(255,255,255,0.14)`), fundo continua
    transparente; `S.chipBtn`, `S.togglePill`, `S.segmentedBtn`,
    `S.segmented` tiveram os fundos sólidos por estado convertidos para
    `rgba` translúcido, mantendo bordas de acento como indicador de estado.
    Auditoria confirmou contraste de texto ≥5:1 nos novos fundos. Nenhuma
    mudança em API, Redis, modelo de transação ou dependências.
  - [x] **Fase F** — gráficos/tooltips Recharts (PR #148, branch
    `feature/liquid-glass-phase-f-charts-tooltips`, v1.21.4 → v1.21.5,
    squash-merged em `main`). Único arquivo alterado: `src/App.jsx`. Os 5
    blocos `Tooltip.contentStyle` (`MonthlyBarCard`, `DailyPaceCard`,
    `CategoryStackedBarCard`, `MonthlyAvgByCategoryCard`, `Charts`) tiveram
    a borda trocada para `rgba(255,255,255,0.12)`, `borderRadius`
    uniformizado para 14 (escala consolidada nas fases anteriores) e
    ganharam `boxShadow: "0 8px 24px rgba(0,0,0,0.4)"` para efeito de
    profundidade "flutuando" sobre o gráfico; fundo do tooltip permanece
    **opaco** — exceção deliberada, tooltip precisa de legibilidade
    instantânea de dados financeiros mesmo com o card ao redor translúcido
    desde a Fase C. `CartesianGrid` já estava consistente em todos os
    gráficos, nenhuma mudança necessária. Nenhuma mudança em API, Redis,
    modelo de transação ou dependências.

  **Com a Fase F, o overhaul visual "Liquid Glass" (fases A–F) está
  concluído** — todas as 6 fases (A, B, C, D, E, F) entregues (PRs
  #144–#148, v1.21.0 → v1.21.5).
- [x] **Card "Composition Evolution" na tab Trends** (PR #181, v1.31.0):
  novo `CompositionEvolutionCard`, inserido logo após o
  `CategoryStackedBarCard`, mostrando a composição percentual das
  expenses/income por categoria ao longo do tempo via `<AreaChart>` do
  recharts. Toggle Expense/Income (`S.togglePill`, mesmo padrão dos outros
  cards); toggle **Area/River** (segmented control) alterna `stackOffset`
  entre `"expand"` (100% stacked area, default) e `"wiggle"`
  (streamgraph); seletor de período local 1Y/2Y/5Y/All
  (`COMPOSITION_PERIODS`) que refina por interseção o range já filtrado
  pelo masthead (não o substitui); granularidade do eixo X (M/Q/H/Y)
  adaptativa ao span efetivo de dados, reaproveitando `bucketKey`/
  `bucketLabel`/`GRANULARITIES`; agrupamento fixo por `category` (sem
  toggle Class/Ticker — não existe campo de subcategoria/ticker no modelo
  de transação atual; possível follow-up se esse campo vier a existir);
  cores via `getCategoryColor(cat)` + `CATEGORY_ORDER`, legenda com
  swatches sem paginação; segue o padrão visual real dos demais cards da
  tab (`<div style={S.card}>` fixo, sempre aberto, sem collapse/ícone).
  Controlado pelos filtros do masthead (category chip + year-range) via
  prop `scoped`, igual aos outros cards de Trends. 100% client-side a
  partir de `transactions` já carregadas, sem novo endpoint; `Transfer`
  continua excluída (via `isTransfer`). Só `src/App.jsx` alterado; sem
  mudança de API/Redis/modelo de transação.
- [x] **KPIs M/M ("LM") e Y/Y ("LY") do hero card usam MTD** (PR #187,
  commit b84b494, v1.32.0): `heroComparisons` passa a filtrar `mmTxns`/
  `yyTxns` pelo mesmo `cutoffDay` já usado nos badges de categoria do bloco
  "by Category" (`catChanges`/`sumCat`), em vez de comparar mês/ano de
  referência inteiro. Mês corrente compara até hoje; mês passado continua
  efetivamente mês cheio (cutoff = último dia do mês). Só `src/App.jsx`
  alterado; sem mudança de API/Redis/modelo de transação; `Transfer`
  continua excluída via `computeTotals`.
- [x] **Toggle Income | Expense no card "Daily Spending Pace"** (PR #188,
  branch `claude/household-daily-pace-toggle`, v1.33.0): novo toggle
  (`S.togglePill`, mesmo padrão do `MonthlyBarCard`/`CategoryStackedBarCard`)
  no header do `DailyPaceCard` (Home), default **Expense** (preserva o
  comportamento original ao carregar a Home). Novo estado `paceView`
  (`"expense" | "income"`) controlado no componente pai e passado como prop;
  `dashboardPaceData` (`useMemo`) passa a aceitar o modo: Expense mantém o
  cálculo anterior (exclui Transfer/income, inverte sinal para série
  positiva); Income exclui Transfer/expense e soma o sinal direto sem
  `Math.abs`. `Transfer` continua excluída em ambos os modos. Série "current"
  laranja `#F97316` no modo Expense (como já era), ciano `#06B6D4` no modo
  Income (mesmo tom do Income no `MonthlyBarCard`). Só `src/App.jsx`
  alterado; sem mudança de API/Redis/modelo de transação.
- [x] **Toggle Net no card `MonthlyBarCard`** (PR #190, branch
  `claude/household-monthlybar-net-toggle`, merge commit `9413494`,
  v1.34.0): terceiro botão de toggle (`S.togglePill`) ao lado de
  Expense/Income no header do `MonthlyBarCard` (tab Trends). No modo Net,
  `dataKey` vira `"net"` (`income - expenses` por bucket, calculado a partir
  do `byBucket` já recebido do pai, que já exclui `Transfer`); cada barra é
  colorida por sinal via `<Cell>` (verde `#34d399` quando net ≥ 0, vermelho
  `#f87171` quando net < 0), em vez do `fill` estático usado por
  Expense/Income. Eixo Y e labels de topo de barra usam `fmtKTooltip`
  (preserva sinal) só no modo Net; Expense/Income continuam com `fmtK`
  (`Math.abs`), sem regressão. Limitação cosmética conhecida e aceita:
  `radius={[4,4,0,0]}` não é ajustado por sinal, então barras negativas no
  modo Net ficam com o arredondamento visualmente invertido (canto
  arredondado na base em vez do topo) — possível item de polish futuro. Só
  `src/App.jsx` alterado; sem mudança de API/Redis/modelo de transação.
- [x] **Data labels no `YearInReviewCard` + fix de formatação < $1K** (PR
  #207, merge squash `968995a`, v1.44.6): waterfall do Year in Review ganha
  `<LabelList>` no `Bar dataKey="value"` (mesmo padrão do `MonthlyBarCard`),
  fechando a lacuna de ser o único gráfico de barras principal da tab Charts
  sem rótulo de valor; e as 4 funções de formatação "K" (`Charts.fmtK`/
  `fmtKFull`, `Dashboard.fmtK`, `Transactions.moneyShortK`) passam a exibir
  valores com `|valor| < 1000` como `$123` (inteiro, sem "K") em vez de
  `$0.1K`. Só `src/App.jsx` alterado; sem mudança de API/Redis/modelo de
  transação.
- [x] **LM/LY ao lado do NET no card hero da Home** (PR #208, branch
  `claude/household-hero-net-lmly`, squash SHA
  `c059fb5a36d1f6b726248b8602276a72d77708fc`, v1.44.7): extensão do
  padrão de KPIs M/M ("LM") e Y/Y ("LY") — já existente para Income/Expenses
  desde o PR #187/v1.32.0 — para o valor NET do hero card. `heroComparisons`
  ganhou `mmPctNet`/`yyPctNet` via a mesma `pct(cur, base)` do Income (net
  mais alto = melhor = verde); layout em linha (à direita do número, não
  abaixo, diferente do padrão vertical de Income/Expenses). Só `src/App.jsx`
  alterado; sem mudança de API/Redis/modelo de transação.

### Fase 5 — Inteligência e Auditoria

- [x] **Nova tab Audit** (PR #107, SHA 7782746, v1.9.0) — migração
  estrutural: adicionada 5ª tab **Audit** (ícone `ShieldCheck`, última
  posição na tab bar); novo componente `AuditTab` renderiza
  `AccountAliasesSection` (mesmas props de antes); a seção "Account aliases"
  foi removida de dentro do `SettingsModal`, que agora contém só
  `AccountMapSection` + as 3 `ManagedList`. Nenhuma lógica de negócio
  tocada (`saveAccountAliasesAndApply`, `computeAliasImpact`,
  `buildAliasArray`, `applyAliasConfig`, `matchAccount`, `classifyAccount`,
  `api/account-aliases.js` — tudo igual, só mudou onde é renderizado). É
  preparação de espaço para os próximos sub-itens do item "Auditoria de
  classificação de categorias" abaixo (mapa CK→ledger, heurísticas
  especiais, histórico de decisões, sugestão automática de regras), que
  continuam pendentes.
- [x] **Aliases de conta editáveis + preview de impacto** (PR #105,
  v1.8.0) — fatia do item "Auditoria de classificação de categorias"
  abaixo. Novo endpoint `api/account-aliases.js` (GET/PUT, mesmo padrão de
  `account-map.js`/`config.js`), persiste `{ aliases: { [conta]:
  [fragmento,...] }, savedAt }` em `household:*:accountaliases`.
  `ACCOUNT_ALIASES` deixou de ser constante fixa: `DEFAULT_ACCOUNT_ALIASES`
  é seed, sobrescrito em runtime por conta via `applyAliasConfig`/
  `buildAliasArray`/`currentAliasConfig` (mesmo padrão de `applyConfig()`).
  `matchAccount`/`classifyAccount` mantiveram assinatura, delegando à nova
  função pura `matchAccountWithAliases(rawValue, aliasesArray)`. Nova seção
  **Account aliases** no `SettingsModal` (`AccountAliasRow`/
  `AccountAliasesSection`), abaixo de `AccountMapSection`: chips de
  fragmento por conta (add/remove) + fluxo **Preview impact**
  (`computeAliasImpact`, até 50 transações afetadas + contador) → **Confirm
  & apply** (persiste e reclassifica em cascata as transações existentes
  cujo `srcAccount` passa a casar com o alias alterado). Precedência URN >
  alias preservada. Fora de escopo nesta fatia (pendente): mapa CK→ledger e
  heurísticas especiais editáveis, painel de histórico de decisões por
  transação, motor de sugestão automática de regras — ver item abaixo.
- [x] **Histórico de decisões por transação** (PR #109, SHA
  5a2bfd77c14db0a86d6b6331b6ebb9a46769fb1f, v1.10.0) — fatia do item
  "Auditoria de classificação de categorias" abaixo. Nova função pura
  `explainClassification(txn, accountMap, aliasesArray)` retorna
  `{ accountReason, categoryReason }`: conta segue URN mapeado > match exato
  de nome de conta > match de alias > vazio ("No rule matched"/"Unassigned")
  > "Set manually"; categoria segue mapeamento Credit Karma (`ckCategory` ≠
  `category`) > heurística Apple Daily Cash (leitura, não editável) >
  "Manually set" > "As imported". Durante a auditoria foi extraído o helper
  `matchAccountWithAliasesReason`, compartilhado com `matchAccountWithAliases`,
  para eliminar o risco de duas fontes de verdade divergirem (assinaturas
  públicas de `matchAccountWithAliases`/`matchAccount`/`classifyAccount`
  permanecem inalteradas). Nova seção **Classification history** dentro da
  `AuditTab`, abaixo de "Account aliases": lista as transações com busca
  textual simples e paginação "Show more" (blocos de 25), mostrando data,
  descrição, conta/categoria atuais e a explicação de
  `explainClassification`. 100% somente leitura — nenhum endpoint novo,
  nenhuma escrita no Redis, nenhuma edição de regra. Decisão intencional:
  essa lista **não filtra `Transfer`** (trilha por transação individual, ao
  contrário dos totais/gráficos). Nota: a heurística Apple Daily Cash exibida
  aqui é reimplementada só para leitura client-side — risco de dessincronizar
  se a regra real dos exportadores mudar sem atualizar esta função também.
  Pendente nesta fatia: mapa CK→ledger editável, heurísticas especiais
  editáveis, sugestão automática de regras — ver item abaixo.
- [x] **Mapa CK→ledger editável** (PR #111, SHA
  ca4d38f74cfd10451788c4fa17e42589967a10d3, v1.11.0) — fatia do item
  "Auditoria de classificação de categorias" abaixo. Nova seed
  `DEFAULT_CK_CATEGORY_MAP` (paridade 1:1 confirmada pelo auditor contra
  `CAT`/`CATEGORY_MAP` dos dois exportadores externos, que continuam
  intocados), funções puras `mapCkCategory`/`ckCategoryToken` e
  `applyCkCategoryMapConfig`/`currentCkCategoryMapConfig` (mesmo padrão de
  `applyAliasConfig`). Novo endpoint `api/ck-category-map.js` (GET/PUT,
  mesmo padrão de `account-aliases.js`), persiste `{ map: { [ckToken]:
  categoria }, savedAt }` em `household:*:ckcategorymap`. `buildRow` (import
  profile Credit Karma) recalcula a categoria via o mapa editável quando
  `ckCategory` está presente, **com rede de segurança crítica adicionada na
  correção pós-auditoria**: se o recálculo ou a categoria já vinda do CSV
  disser `Transfer`, o resultado final é sempre `Transfer` (nunca
  rebaixado) — necessário porque o CSV do CK nunca exporta o
  `categoryType` bruto (só `type=income/expense`), então a categoria do CSV
  é a única fonte confiável de "isso é Transfer" quando o token não é
  óbvio; sem essa rede de segurança o recálculo podia rebaixar Transfers
  legítimos e quebrar a exclusão de totais. Sem `ckCategory` (CSV genérico),
  comportamento inalterado. Nova seção **Category mapping** na `AuditTab`:
  tokens seed + descobertos nas transações carregadas, editáveis via
  dropdown das categorias correntes + `Transfer` + `Other Income`. **Sem
  preview de impacto e sem cascata retroativa** — só afeta novos imports a
  partir de agora (decisão confirmada com o usuário). Pendente nesta fatia:
  heurísticas especiais editáveis, sugestão automática de regras — ver item
  abaixo.
- [x] **Heurística Apple Daily Cash editável** (PR #113, SHA
  2ba7d53063e6546beaa4651c708f9d32d541515c, v1.12.0) — fatia do item
  "Auditoria de classificação de categorias" abaixo. Novo endpoint
  `api/apple-daily-cash-rule.js` (GET/PUT, mesmo padrão de
  `api/ck-category-map.js`), persiste `{ providerPattern, keywords,
  destinationCategory, savedAt }` em `household:*:appledailycashrule`
  (sem campo `enabled` — `keywords` vazio já desliga a regra). Seed
  `DEFAULT_APPLE_DAILY_CASH_RULE` = `{ providerPattern: "Apple Card",
  keywords: ["Deposit", "Adjustment"], destinationCategory: "Other
  Income" }`, editável em runtime. Funções puras
  `appleDailyCashRuleMatches`/`applyAppleDailyCashRule` casam provider
  pattern contra `srcAccount`/`account` e keyword contra `description`;
  nunca tocam `amount`/sinal. Em `buildRow`, a regra roda estritamente
  depois do safety-net de Transfer do mapa CK→ledger (PR #111) — é a
  única etapa com permissão de promover de `Transfer` para a categoria de
  destino, e só quando o padrão realmente casa (aditivo). O
  `explainClassification` (Classification history) foi atualizado para
  usar o mesmo helper/config editável, eliminando a divergência anterior
  entre exibição (regex hardcoded) e lógica real. Nova seção **"Apple
  Daily Cash rule"** na `AuditTab`, mesmo padrão visual das seções
  vizinhas: inputs de provider pattern/keywords + select de categoria de
  destino, aviso explícito sobre a exceção de promover Transfer. Sem
  preview de impacto/cascata retroativa — só novos imports. Pendente
  nesta fatia: sugestão automática de regras novas — ver item abaixo.
- [x] **Sugestão automática de regras novas** (PR #115, SHA
  ae8624f41ad6745fccc3f3ab55cda05ae56dcabc, v1.13.0) — última fatia do item
  "Auditoria de classificação de categorias" abaixo, que com esta entrega
  fica **completo**. Novas funções puras
  `detectSuggestedAliasFragments`/`detectSuggestedCategoryTokens`, 100%
  client-side sobre transações já em memória (sem novo endpoint): Grupo A
  agrupa transações `Unassigned` por `normAccount(srcAccount)` (mesma
  normalização de `matchAccountWithAliases`), threshold ≥2, excluindo
  `srcAccount`s que já casam com alias existente; Grupo B agrupa
  transações `category === "Other"` com `ckCategory` presente por
  `ckCategoryToken`, threshold ≥2, só tokens cujo mapeamento corrente
  resolve para "Other". Nova seção **"Suggested rules"** na `AuditTab`,
  posicionada no **topo** (acima de Account aliases/Category
  mapping/Apple Daily Cash rule; à época da entrega deste PR #115 havia
  também "Classification history", removida depois no PR #117). Ações "Use this
  fragment"/"Review this token" rolam até a seção alvo, forçam sua
  abertura (`CollapsibleCard` ganhou props `id`/`openSignal`) e
  pré-preenchem/destacam o campo relevante — **nenhuma escrita
  automática**, o usuário sempre confirma pelos fluxos de save já
  existentes. Dismiss opcional, só client-side, não persiste entre
  sessões. Ver item "Auditoria de classificação de categorias" abaixo e
  seção UI/Audit.
- [x] **Painel de regras de categoria, Fatia 1** (PR #117, SHA
  404dc8b8ac608df0bbf03cefd4d5f1b5b6386eba, v1.14.0) — evolução pós-roadmap
  pedida diretamente pelo usuário (o item "Auditoria de classificação de
  categorias" abaixo já estava marcado 100% completo desde o PR #115). Novo
  tipo de regra de categoria editável: "descrição/provider contém X →
  categoria Y", com **precedência de override sobre o mapa CK** para
  categorias não-`Transfer` (nunca de-transfere). Novo endpoint
  `api/category-description-rules.js` (GET/PUT), persiste `{ rules: [{ id,
  matchField, pattern, destinationCategory }], savedAt }` em Redis
  `household:*:categorydescriptionrules` — ordem do array é semântica
  (primeira regra que casa vence). Em `buildRow`, a regra roda entre o
  `mapCkCategory` e o safety-net de Transfer do PR #111; a Apple Daily Cash
  rule continua rodando por último. Nova seção **"Description rules"** na
  tab Audit (add/edit inline/delete/reorder). A seção **"Classification
  history"** (PR #109) e a função `explainClassification` foram
  **removidas** a pedido do usuário. Ver "Regras de categoria por
  descrição/provider" no Modelo de dados e seção UI/Audit para detalhes.
  **Fatia 2 entregue** — ver item logo abaixo.
- [x] **Painel de regras de categoria, Fatia 2** (PR #119, branch
  `feature/manual-correction-detection`, SHA
  9e0475e8986aa9a43e9fbf4f6c8f2c4ab81c7c91, v1.15.0) — detecção automática
  de "correções manuais" de categoria ("double check"), no mesmo espírito
  do motor de sugestão de regras do PR #115. Novos campos opcionais e
  aditivos na transação: `categoryManual: true` (setado quando o usuário
  troca a categoria manualmente via `EditModal` ou bulk "Set category";
  setado `false` quando a transação vira `Transfer` via `EditModal` ou bulk
  "Mark as Transfer", já que virar Transfer não conta como correção de
  categoria) e `autoCategory` (categoria computada por `buildRow` no
  import, snapshot só para exibição, nunca reescrita). Nova função pura
  `detectManualCategoryCorrections` agrupa transações com `categoryManual
  === true` e categoria ≠ Transfer por token CK (`ckCategoryToken`) com
  fallback para fragmento normalizado da descrição, threshold ≥2. Terceiro
  grupo "Manual category corrections" na seção **Suggested rules** (mesmo
  padrão dos grupos A/B), com ação "Create rule from this" que pré-preenche
  a seção **Description rules** (Fatia 1) com o pattern comum e a categoria
  manual mais frequente do grupo — sem escrita automática, o usuário
  confirma e salva manualmente. **Trade-off aceito: forward-only** —
  correções manuais anteriores a esta versão não são detectadas
  retroativamente (não houve pedido do usuário por um scan retroativo do
  histórico; se vier a ser pedido, tratar como uma futura "Fatia 3"). Com
  esta entrega, o item "Painel de regras de categoria" está completo (Fatia
  1 + Fatia 2).
- [x] **Fix: painel "Suggested rules" invisível quando vazio** (PR #121,
  branch `fix/suggested-rules-always-visible`, SHA
  19fa8aabd7001d3dd3ec73f2e9a48f876459a034, v1.15.1) — o painel tinha
  `return null` quando os 3 grupos estavam vazios; removido, agora é
  **sempre visível** com estado vazio explicativo (inclui nota de que o
  grupo "Manual category corrections" é forward-only). Badge do card só
  aparece com itens (>0).
- [x] **Consolidação da tab Audit + modal Settings numa única tab "Settings"**
  (PR #128, SHA 86ddbc1d3bd081d065f3edac43ca5ea9be829ff4, squash merge,
  v1.17.0) — `AuditTab` renomeado para `SettingsTab`; a antiga tab **Audit**
  passou a ser a 5ª e última tab **Settings** (ícone `Settings`/cog no lugar
  de `ShieldCheck`), incorporando todo o conteúdo do antigo `SettingsModal`
  (Card mapping + as 3 `ManagedList`), que junto com a engrenagem no header
  **foi removido por completo** — não há mais atalho de configuração
  separado da tab bar. Nova ordem das seções: Suggested rules → Account
  aliases → Card mapping → Accounts → Expense categories → Income
  categories → Apple Daily Cash rule → Description rules → **Category
  mapping** (movida para o final, com menos destaque, colapsável e fechada
  por padrão). Único arquivo alterado: `src/App.jsx`. Nenhuma mudança de
  contrato de API, formato Redis ou modelo de transação — puramente
  reorganização de composição de UI React.
- [x] **Unificar Expense/Income categories num único card** (PR #131,
  v1.17.1) — na tab **Settings**, `Expense categories` e `Income categories`
  deixaram de ser dois `CollapsibleCard` separados e passaram a viver dentro
  de um único card **"Categories"**, um logo abaixo do outro, separados por
  um divisor horizontal. `ManagedList` ganhou um modo `bare` (sem o chrome do
  `CollapsibleCard`, só a lista + caixa de adicionar) para permitir essa
  nidificação. Menos relevância dada ao card de `Accounts`, que segue
  separado. Nenhuma mudança de lógica (add/rename/delete/reorder,
  `api/config.js`) — puramente reorganização visual.
- [x] **Reordenar `ManagedList` por drag-and-drop em vez de setas ↑/↓**
  (PR #132, v1.18.0) — nas listas **Accounts**, **Expense categories** e
  **Income categories** (tab Settings), o par de botões ↑/↓ foi substituído
  por uma **alça de arrastar** (`GripVertical`) por item. Decisão de UX:
  arrastar pela alça (não a linha inteira), para não conflitar com o swipe
  horizontal já existente de Edit/Delete. Implementado com **Pointer Events**
  nativos (sem lib de terceiros) — funciona com mouse e touch: no
  `pointerdown` na alça, captura o pointer (`setPointerCapture`); no
  `pointermove`, o item arrastado segue o dedo/cursor 1:1 (`translateY`) e os
  itens entre a posição original e a posição-alvo se deslocam por uma altura
  de linha para abrir espaço (só visual, via `transform`, sem re-render da
  lista real); no `pointerup`/`pointercancel`, a nova ordem é computada uma
  única vez e persistida via o `onReorder` já existente
  (`reorderAccounts`/`reorderCategories` → `saveConfig`, inalterados). O
  wrapper de cada linha (`overflow: hidden`, usado para esconder o swipe
  rail de Edit/Delete) passa a `overflow: visible` enquanto qualquer drag
  está em andamento na lista, senão o próprio card cliparia o item sendo
  arrastado/deslocado ao ultrapassar a altura de uma linha. Nenhuma mudança
  de contrato de API, formato Redis ou modelo de transação — a assinatura de
  `onReorder` (array de nomes na nova ordem) não mudou. As setas ↑/↓ do
  painel **Description rules** (ordem semântica de regras, lista tipicamente
  curta) não foram tocadas — fora do escopo deste pedido.

  **Amendments no mesmo PR #132/v1.18.0** (feedback de teste manual no
  preview de desktop):
  1. **Fix: swipe Edit/Delete não funcionava com mouse no desktop** — os
     handlers de swipe (`ManagedRow`) usavam só eventos `onTouchStart`/
     `onTouchMove`/`onTouchEnd` (`e.touches[0].clientX/Y`), que nunca
     disparam com mouse. Convertidos para **Pointer Events**
     (`onPointerDown`/`onPointerMove`/`onPointerUp`/`onPointerCancel`,
     `e.clientX/Y` direto — mesmo padrão já usado na alça de drag), com
     `setPointerCapture` e `touchAction: "pan-y"` na linha (permite scroll
     vertical da página, intercepta o arrasto horizontal). A alça de drag
     (`GripVertical`) chama `e.stopPropagation()` nos seus próprios
     handlers de pointer para não disparar também o swipe da linha.
  2. **`Accounts` unificado no mesmo card que `Categories`** — o card
     **"Accounts & Categories"** agora contém as três `ManagedList`
     (`Accounts`, `Expense categories`, `Income categories`) empilhadas,
     cada uma separada por um divisor — antes `Accounts` tinha seu próprio
     card e só `Expense`+`Income` estavam unificados (PR #131). Badge do
     card passou a somar as três listas.
  3. **Fix (tentativa 1, insuficiente): fechar `open`/`dx` de toda linha
     quando qualquer drag está ativo** — `ManagedRow` ganhou um
     `useLayoutEffect` que fecha o próprio swipe sempre que `dragActive` é
     true, não só a linha efetivamente arrastada. Reduziu mas não eliminou
     o bug.
  4. **Causa raiz real + fix definitivo: o rail de Edit/Delete é irmão do
     "foreground" da linha, não filho dele** — só o **foreground** recebe
     `transform: translateY(yShift)` durante o drag (seja a própria linha
     arrastada, seja uma linha vizinha só "abrindo espaço"); o **rail**
     (`position: absolute; inset: 0`) nunca se move, pois nenhum yShift era
     aplicado a ele. Resultado: assim que o foreground desliza para
     cima/baixo, ele deixa de cobrir o rail, que fica exposto exatamente na
     posição original da linha — reproduzindo o "Edit/Delete abaixo do
     tile" em **qualquer** linha deslocada (não só a arrastada), consistente
     com o relato do usuário ("aparece de todos os tiles"). Como as ações
     de Edit/Delete não fazem sentido durante um drag de reordenar de
     qualquer forma, o fix é **não renderizar o rail enquanto `dragActive`
     for true** (`{!dragActive && (<div>...rail...</div>)}`) em vez de
     tentar sincronizar seu transform com o do foreground.
- [x] **Aviso de conflito pré-save em Description rules** (PR #133, squash
  merge, SHA 12d4c0901303e8223e759815ef34c37dab2eb030, v1.19.0) — antes,
  "Save rules" salvava direto; agora, se alguma regra do draft (`pattern`
  não vazio) bateria em transações já existentes `category === "Transfer"`
  ou com `categoryManual === true`, um aviso âmbar inline (mesmo padrão do
  Preview impact de Account aliases) aparece antes do save, listando por
  regra as contagens de cada tipo + até 5 exemplos (descrição truncada a 40
  caracteres + data); o botão vira "Save anyway", exigindo segundo clique.
  Nova função pura `computeDescriptionRuleConflicts(transactions, rule)`
  reaproveita `descriptionRuleMatches` sem duplicar lógica de matching;
  `DescriptionRulesSection` ganhou a prop `transactions`. Puramente
  client-side e não-bloqueante — não altera `onSave`, o formato persistido
  em `api/category-description-rules.js`, `matchDescriptionCategoryRule`
  nem o pipeline de import (`buildRow`); a rede de segurança real contra
  de-transferir em novos imports continua sendo exclusivamente o
  safety-net de Transfer do PR #111, intocado. Único arquivo alterado:
  `src/App.jsx`.
- [x] **Unificação da Apple Daily Cash rule dentro de Description rules**
  (PR #135, squash merge, SHA dd7c95ccf04f481181638eb096956308eee88f27,
  branch `claude/settings-tab-consolidation-ec2ds1`, v1.20.0) — auditada com
  rigor extra por mexer no pipeline central de `buildRow`. A heurística
  Apple Daily Cash deixou de ser um mecanismo dedicado (seed
  `DEFAULT_APPLE_DAILY_CASH_RULE`, module state, `applyAppleDailyCashRuleConfig`/
  `currentAppleDailyCashRuleConfig`, `appleDailyCashRuleMatches`/
  `applyAppleDailyCashRule`, componente `AppleDailyCashRuleSection` e sua
  seção na tab Settings — **todos removidos**) e foi absorvida por
  **Description rules**, que ganhou um mecanismo genérico opt-in de
  "permissão de de-transferir": campos novos e opcionais na regra,
  `providerPattern` (condição AND extra contra `srcAccount || account`) e
  `allowTransferOverride` (boolean, default ausente/false). Novo helper
  `findMatchingDescriptionRule(row, rules)` retorna a regra inteira que
  casou; `matchDescriptionCategoryRule` virou wrapper fino sobre ele (mesmo
  contrato). Nova ordem em `buildRow`: CK map → primeira Description rule
  que casa → se tiver `allowTransferOverride: true`, aplica direto,
  **pulando** a rede de segurança de Transfer; senão, a rede de segurança do
  PR #111 continua valendo como sempre. A garantia "nenhuma regra tira uma
  transação de `Transfer`" continua existindo por padrão — agora é opt-in
  por regra, não mais uma exceção hard-coded exclusiva do Apple Daily Cash.
  **Migração automática one-shot e idempotente**: ao carregar
  `categoryDescriptionRules`, se a config legada de
  `api/apple-daily-cash-rule.js` ainda estiver ativa, o app cria uma
  Description rule por keyword (`providerPattern: "Apple Card"`,
  `allowTransferOverride: true`), insere no início do array (prepend,
  preservando a precedência absoluta que a regra antiga tinha) e esvazia a
  config legada. O endpoint `api/apple-daily-cash-rule.js` continua existindo
  no código, só sem UI dedicada (serve só de fonte para essa migração). Nova
  UI em Description rules: checkbox "Allow removing from Transfer" + campo
  condicional "Provider/account pattern" (bloqueio de salvar client-side se
  vazio com o checkbox marcado); card com borda âmbar enquanto o flag estiver
  ligado; aviso de conflito pré-save (PR #133) ganhou mensagem mais séria
  para regras com o flag ligado. `sanitize()` do endpoint estendido para os 2
  campos novos, mantendo o bloqueio de `destinationCategory === "Transfer"`.
  **Débito técnico conhecido (não bloqueou o merge)**: o `sanitize()` do
  endpoint não impede salvar `allowTransferOverride: true` com
  `providerPattern` vazio via chamada direta à API — só o client bloqueia
  isso hoje (mesma postura da regra Apple antiga, sem enforcement
  server-side). Ver "Regras de categoria por descrição/provider" no Modelo
  de dados e a seção UI/Settings para os detalhes completos.
  - [ ] **Follow-up de hardening (débito técnico, não bloqueante)**: adicionar
    enforcement server-side em `api/category-description-rules.js` para
    rejeitar `allowTransferOverride: true` com `providerPattern` vazio,
    fechando a lacuna que hoje só o client bloqueia.
  - [x] **Fix (v1.20.1): migração não rodava para households que nunca
    salvaram a regra manualmente** — a Apple Daily Cash rule tinha um
    default hardcoded (`Apple Card` / `Deposit`,`Adjustment` / `Other
    Income`) que funcionava sem precisar de save explícito; para quem nunca
    customizou, nada estava persistido no Redis, e a migração (que só lê do
    Redis) tratava isso como "nunca configurado" — o comportamento
    desapareceu silenciosamente. Fix: `migrateAppleDailyCashRule` usa
    `savedAt` (só existe após algum `PUT`) para diferenciar "nunca salvo →
    usar o default hardcoded pra migrar" de "já migrado → marcador vazio,
    pular". Households que já haviam customizado ou já migrado continuam
    inalterados.
- [x] **Auditoria de classificação de categorias** — área no app onde o
  usuário pode ver e editar as regras de auto-classificação que o app usa. A
  decisão de layout (tab dedicada **Audit**, em vez de dentro do
  `SettingsModal`) foi tomada e entregue no PR #107 (v1.9.0) — ver item
  acima. Regras a saber:
  - **Mapa CK → ledger** (`mapCat` / `CAT` nos exportadores): de qual categoria
    do Credit Karma cada ledger-category é mapeada (ex.: `GROCERIES` →
    `Groceries`, `TRAVEL` → `Travel`). **[x] Entregue no PR #111 (v1.11.0)**
    — mapa editável por token via seção **Category mapping** na tab Audit,
    sem preview/cascata (só afeta novos imports) — ver item acima.
    **Exceções por descrição/provider dentro do mesmo token**: **[x]
    Entregue no PR #117 (v1.14.0)** — seção **Description rules**, com
    precedência de override sobre este mapa (nunca de-transfere) — ver
    item "Painel de regras de categoria, Fatia 1" acima.
  - **Heurísticas especiais** (ex.: Apple Daily Cash): listar as regras
    embutidas, mostrar quais transações cada uma capturou, permitir ajuste
    da descrição ou do provider-pattern. **[x] Entregue no PR #113
    (v1.12.0)** — seção dedicada **Apple Daily Cash rule** na tab Audit,
    editando provider pattern, keywords e categoria de destino; sem preview
    de impacto por transação. **Atualização (PR #135, v1.20.0)**: essa seção
    dedicada foi removida e a heurística foi unificada dentro de
    **Description rules** via o mecanismo genérico `allowTransferOverride`/
    `providerPattern` — ver item "Unificação da Apple Daily Cash rule dentro
    de Description rules" acima.
  - **Aliases de conta**: ver quais fragmentos de marca casam com qual conta
    do ledger; adicionar/remover aliases; ver transações afetadas antes de
    salvar. **[x] Entregue no PR #105**, agora hospedado na tab **Audit**
    desde o PR #107 — ver itens acima.
  - **Histórico de decisões** — por transação, um painel mostrando por que
    foi classificada como X (qual regra/alias casou, se foi classificação
    manual ou automática). **[x] Entregue no PR #109 (v1.10.0)** — seção
    "Classification history" na tab **Audit**, somente leitura — ver item
    acima.
  - **Sugestão de regras novas**: detectar automaticamente transações
    recorrentes sem account match (Unassigned) ou com categoria `Other`, e
    propor uma regra baseada em fragmentos da descrição/provider. **[x]
    Entregue no PR #115 (v1.13.0)** — seção **Suggested rules** no topo da
    tab Audit, detecção 100% client-side (Grupo A: fragmento de conta;
    Grupo B: token de categoria CK), ações que levam até a seção relevante
    e pré-preenchem/destacam, sem escrita automática — ver item acima.
  Com esta última fatia, **todos os 5 sub-itens estão entregues** (Account
  aliases: PR #105/#107; Classification history: PR #109; Category
  mapping: PR #111; Apple Daily Cash rule: PR #113; Suggested rules: PR
  #115) — este item da Fase 5 está **completo**. O objetivo era transformar
  a auto-classificação de uma caixa-preta em um algoritmo auditável e
  refinável ao longo do tempo pelo usuário; alcançado.

  **Nota (PR #128, v1.17.0)**: as referências acima à "tab Audit" descrevem o
  estado histórico até essa versão. Desde o PR #128, a tab foi renomeada
  para **Settings** e consolidada com o antigo `SettingsModal` (que deixou de
  existir) — ver item "Consolidação da tab Audit + modal Settings" acima e a
  seção UI para o estado atual.

  **Nota**: a Fase 5 como um todo **não** está completa — restam pendentes
  os três itens abaixo ("Trends", "Budgets", "Recurrents" — reavaliar
  formato), que são discussões de design separadas, sem relação com este
  item de auditoria de classificação.
- [ ] **Trends (mês a mês) — reavaliar formato** *(removido do Analyze no PR
  #104)*: antes vivia como LineChart top-5 categorias de despesa (12 meses) +
  StackedBarChart de mix mensal + tabela comparativa mês atual vs. anterior
  (delta $/%). Discutir: manter como estava, fundir com o
  `CategoryStackedBarCard` (que já tem granularidade M/Q/H/Y e filtro de
  categoria), ou redesenhar como card dedicado dentro do novo layout de
  Analyze.
- [ ] **Budgets (orçamentos por categoria) — reavaliar formato** *(removido
  do Analyze no PR #104)*: antes vivia como lista de categorias de despesa
  com limite mensal editável inline, barra de progresso (verde/amarelo
  75%/vermelho 100%), banner de estouro; persistido em `/api/budgets`
  (endpoint e dado no Redis continuam existindo, só a UI foi retirada).
  Discutir: reintroduzir como seção própria, mover para dentro da Home,
  ou repensar a interação.
- [x] **Backup + restore local de transactions na tab Settings** (PR #140,
  v1.20.3; restore adicionado depois, v1.20.4, branch
  `claude/transaction-backup-import-d5e86h`) — item **avulso de
  manutenção/segurança**, pedido diretamente pelo usuário fora do roadmap
  de fases, para mitigar risco de perda de dados antes de mudanças
  estruturais futuras. Card **"Data & Backup"** na tab Settings com dois
  botões: "Backup transactions" baixa localmente um JSON com
  `{ transactions: [...], exportedAt }`; "Restore from backup" lê esse
  mesmo JSON (ou um array puro), confirma com o usuário e **substitui
  integralmente** as transactions carregadas, salvando de imediato. 100%
  client-side, sem mudança de API/Redis/modelo de transação. Cobre só
  `transactions` — backup agendado, merge/dedup no restore, e backup de
  outros namespaces Redis (account-map, config, budgets, aliases,
  description-rules) ficaram fora de escopo e **não** foram adicionados
  como pendência formal (avaliar sob demanda, se o usuário pedir).
- [x] **Rename "Analyze" → "Trends" + card "Monthly Avg by Category"** (PR
  #143, commit 29f7e3de9e2390cf6f6c318cf6c2824fb99e4b7b, v1.21.0) — item
  **avulso** pedido diretamente pelo usuário fora do roadmap de fases. A
  tab Analyze passou a se chamar **Trends** (só o label; ícone `TrendingUp`
  e id interno `"analyze"` mantidos). Novo card "Monthly Avg by Category"
  adicionado abaixo de "By Category": visualmente idêntico a ele, mas com
  granularidade travada em anual, sempre exibindo todos os anos disponíveis
  (ignora o filtro de range de anos From/To, respeita só o filtro de
  categoria), e cada barra mostrando a média mensal de gastos do ano (total
  ÷ 12 para anos completos, total ÷ mês corrente para o ano em andamento).
  `Transfer` continua excluído. 100% front-end (`src/App.jsx`), sem mudança
  de API/Redis/modelo de transação.

  **Follow-up (PR #168, v1.24.0)**: adicionada barra extra "L12M" (últimos
  12 meses fechados, janela dinâmica a partir da data atual, divisor fixo
  em 12, netting por categoria antes do `Math.abs`), sempre anexada por
  último no gráfico para comparar com o ano corrente. 100% front-end,
  `Transfer` continua excluído.
- [ ] **Recurrents (recorrentes / assinaturas) — reavaliar formato**
  *(removido do Analyze no PR #104)*: antes vivia como detecção client-side
  de transações com a mesma descrição em ≥2 meses e valor dentro de ±10% da
  mediana, listando valor típico, conta, frequência (badge mensal/anual/
  semanal/irregular) e próxima ocorrência estimada. Nota: essa seção tinha
  texto em português hardcoded (Mensal/Anual/Semanal/Irregular, "Próx.
  estimada:") que precisa ser traduzido se/quando reintroduzida. Discutir:
  manter como está, mover para a Home, ou integrar como alerta.

### Fase 6 — Confiabilidade de dados

Fase nascida da revisão técnica de 2026-07-10 (report completo entregue ao
usuário na sessão), que auditou o app inteiro e concluiu que a lógica
financeira está sólida, mas a camada de persistência/sincronização tinha
riscos reais de perda de dados.

- [x] **Fatia 1 — pacote de confiabilidade + remoção do login Google**
  (v1.30.0; a v1.29.0 foi pulada por ter sido usada e revertida no PR #178):
  - **Concorrência otimista** no PUT de `/api/transactions`: client envia
    `expectedSavedAt`, server responde 409 quando outro dispositivo salvou
    no meio; client recarrega e avisa ("please redo your last change") em
    vez de sobrescrever silenciosamente. Back-compat com clients antigos.
  - **Save resiliente**: flush do save pendente em
    `visibilitychange(hidden)`/`pagehide` (eventos que disparam de verdade
    em PWA iOS) com `fetch keepalive` (fallback para fetch normal acima de
    ~60 KB), além do `beforeunload` de desktop; retry automático quando a
    conexão volta (o banner offline já prometia isso, agora acontece);
    indicador "updated elsewhere" no header para o caso de conflito.
  - **Snapshot diário automático** no Redis
    (`household:*:transactions:snapshot:YYYY-MM-DD`, `SET NX`, TTL 30 dias)
    a cada primeiro save do dia.
  - **Autenticação somente por senha** (decisão do usuário: "não estou
    usando autenticação do Google"): Google JWT/GIS removidos do client
    (`Login`, `buildAuthHeaders`) e do server (`lib/auth.js` reescrito,
    password-only, comparação timing-safe); metas `google-client-id`/
    `admin-emails` removidas do `index.html`; env vars Google obsoletas.
    Chave de storage inalterada — nenhum dado migrou.
  - **`todayISO()` local**: `toISOString()` (UTC) virava "amanhã" à noite
    nos fusos dos EUA, distorcendo o período default da Home, cutoffs
    M/M-Y/Y, a linha "Today" do Daily Pace e os headers Today/Yesterday.
  - **Cascatas completas** em Settings: renomear categoria agora atualiza
    também Description rules e mapa CK→ledger; deletar categoria re-bucketa
    as transações para "Other"/"Other Income" (antes, deletar categoria de
    income fazia as transações contarem como despesa em `computeTotals`);
    renomear conta move os fragmentos de alias; deletar conta manda as
    transações para Unassigned, remove entradas do card map e desativa os
    aliases.
  - **Validação do restore de backup** (shape mínimo date+amount por linha,
    ids gerados quando ausentes) antes de substituir o ledger.
  - Limpezas: CORS wildcard removido dos endpoints (app é same-origin),
    regra morta de runtime-caching `/api` removida do `vite.config.js` (a
    regex nunca casava com `url.href` no Workbox — e, se casasse, um GET
    stale + PUT do array inteiro regravaria dados antigos), comentário do
    dedup fuzzy alinhado ao código (±2 dias), aviso quando a preview do
    import passa de 400 linhas, `package.json.version` sincronizado,
    `sortNames` (código morto) removido, preview do import invalida ao
    editar regras/CK map em Settings.
- [ ] **Restore com merge/dedup** — hoje o restore substitui tudo; opção de
  mesclar um backup com o ledger atual usando o dedup híbrido do import.
- [x] **UI de snapshots** (v1.43.0, PR #199) — seção "Daily snapshots" na
  Settings lista e restaura os snapshots diários via `api/snapshots.js`
  (read-only) + fluxo normal de restore.
- [ ] **Backup dos demais namespaces** (config, aliases, rules, CK map,
  account map, dismissed) no arquivo de backup local e/ou nos snapshots.

### Fase 7 — Extensões propostas (da revisão de 2026-07-10, ainda não iniciadas)

- [ ] **Cascata retroativa opcional com preview** para Description rules e
  mapa CK→ledger — "Apply to existing transactions" com preview de impacto,
  reaproveitando o padrão de `computeAliasImpact` dos Account aliases.
- [ ] **Painel "Data quality" na Settings** — transações com categoria/conta
  fora das listas atuais, datas inválidas, possíveis duplicatas retroativas,
  contagem de Unassigned.
- [x] **Alertas de anomalia de gasto na Home** (v1.36.0, PR #192) —
  `AnomalyBadge` âmbar "⚠ N.N× avg" quando o gasto MTD ≥ 1.5× a `avg12m`;
  Budgets reintroduzidos no mesmo PR (bullet bars + editor na Settings).
- [ ] **Scan retroativo de correções manuais ("Fatia 3" do PR #119)** — o
  histórico pré-v1.15 não alimenta o Suggested rules.
- [x] **Year in Review** (v1.42.0, PR #198) — card na Trends com KPIs vs ano
  anterior + waterfall por categoria. (Export CSV por categoria segue
  pendente.)
- [x] **Suite de testes + CI** (v1.39.0, PR #195) — helpers puros extraídos
  para `src/ledger.js`, 24 testes Vitest (`src/ledger.test.js`), workflow
  GitHub Actions (test + build em push/PR). `buildRow` segue no App.jsx
  (module state) — sem cobertura direta ainda.
- [x] **Code-splitting (parcial: vendor chunks)** (v1.40.0, PR #196) —
  chunks separados `charts` (recharts/d3, ~427 KB) e `react` (~142 KB); app
  cai para ~189 KB. Lazy-load real do recharts adiado (exigiria extrair os
  cards do monolito); migração recharts v3 segue pendente.
