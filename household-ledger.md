# Household Ledger · v1.17.0

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

A cada PR, atualize a versão em **dois lugares**:
1. `src/App.jsx` — a string `v1.x.x` no span ao lado de "Household"
2. `household-ledger.md` — o `· v1.x.x` no título `# Household Ledger`

Versão atual: **v1.17.0** — **Consolidação da tab Audit + modal Settings numa
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

A autenticação é idêntica à do aa-findocs (`lib/auth.js`):

- **Google JWT** via header `x-google-token` (verificado contra os certs do
  Google, audiência `GOOGLE_CLIENT_ID`, allowlist de e-mails).
- **Senha de app** via header `x-app-password` (comparada com `APP_PASSWORD`).

A chave de armazenamento é derivada por usuário. A `auth.storageKey` vem no
formato `portfolio:<scope>:<hash>:holdings`; em `api/transactions.js` ela é
reescrita para o namespace do household:

```
portfolio:email:<hash>:holdings  ->  household:email:<hash>:transactions
portfolio:pwd:<hash>:holdings    ->  household:pwd:<hash>:transactions
```

Assim o ledger nunca colide com nenhum blob de portfolio.

### Variáveis de ambiente

| Variável                 | Uso                                              |
| ------------------------ | ------------------------------------------------ |
| `REDIS_URL`              | conexão Redis                                    |
| `GOOGLE_CLIENT_ID`       | validação de audiência do token Google           |
| `ALLOWED_EMAILS`         | allowlist (csv) de e-mails permitidos            |
| `ADMIN_EMAILS`           | e-mails admin (csv)                              |
| `APP_PASSWORD`           | senha de app para o fallback                     |
| `VITE_GOOGLE_CLIENT_ID`  | client id exposto ao front-end (login Google)    |
| `VITE_ADMIN_EMAILS`      | admins expostos ao front-end                     |

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

**Heurística Apple Daily Cash editável (PR #113, v1.12.0).** Essa heurística
deixou de existir apenas nos exportadores externos (`tools/credit-karma/`) —
agora também é aplicada e editável dentro do próprio app. Novo endpoint
`api/apple-daily-cash-rule.js` (GET/PUT, mesmo padrão de
`api/ck-category-map.js`) persiste `{ providerPattern, keywords,
destinationCategory, savedAt }` em Redis
`household:*:appledailycashrule`. Sem campo `enabled` — esvaziar `keywords`
já desliga a regra na prática. Seed `DEFAULT_APPLE_DAILY_CASH_RULE` =
`{ providerPattern: "Apple Card", keywords: ["Deposit", "Adjustment"],
destinationCategory: "Other Income" }`. As funções puras
`appleDailyCashRuleMatches`/`applyAppleDailyCashRule` casam o provider
pattern contra `srcAccount`/`account` e a keyword contra `description`; se
casar, forçam a categoria de destino — **nunca tocam `amount`/sinal**. Em
`buildRow`, a regra roda **estritamente depois** da rede de segurança de
Transfer do mapa CK→ledger (PR #111) e é a **única etapa do pipeline de
classificação com permissão de promover de `Transfer` para a categoria de
destino** — só o faz quando o padrão realmente casa (comportamento aditivo;
para a esmagadora maioria das transações, idêntico a antes). O
`explainClassification` (Classification history) foi atualizado para usar o
mesmo helper `appleDailyCashRuleMatches`/config editável, eliminando a
divergência anterior entre a explicação exibida (regex hardcoded) e a lógica
real aplicada no import.

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

A seção **Category mapping**, na tab Audit, edita esse mapa por token
(dropdown das categorias correntes + `Transfer` + `Other Income`) — sem
preview de impacto e sem cascata retroativa: a mudança só afeta **novos
imports** a partir de então (decisão confirmada com o usuário; ver UI e
Roadmap Fase 5).

### Regras de categoria por descrição/provider (PR #117, v1.14.0)

Painel de regras de categoria, **Fatia 1**. Novo tipo de regra editável:
"descrição/provider contém X → categoria Y", com **precedência de override**
sobre o mapa CK→ledger para categorias não-`Transfer`. Novo endpoint
`api/category-description-rules.js` (GET/PUT, mesmo padrão de
`api/ck-category-map.js`), persiste `{ rules: [{ id, matchField:
"description"|"provider"|"both", pattern, destinationCategory }], savedAt }`
em Redis `household:*:categorydescriptionrules`. A **ordem do array é
semântica**: a primeira regra da lista que casar vence (não há resolução por
especificidade). `destinationCategory` **nunca pode ser `Transfer`** —
bloqueado tanto no sanitize do endpoint quanto no client. Funções puras
`descriptionRuleMatches`/`matchDescriptionCategoryRule`; `matchField:
"provider"` casa contra `srcAccount || account` (mesmo campo usado pela
classificação de conta); `"description"` casa contra `description`;
`"both"` exige match nos dois.

**Precedência exata em `buildRow`** (import profile Credit Karma, quando
`ckCategory` está presente): (1) `mapCkCategory` recalcula a categoria a
partir do token CK; (2) a regra por descrição roda em seguida —
`overridden = descOverride ?? recomputedCategory` — ou seja, se alguma regra
casar, ela **sobrepõe** o resultado do mapa CK; (3) o **safety-net de
Transfer** do PR #111 roda depois e tem a palavra final:
`(overridden === Transfer || csvCategory === Transfer) ? Transfer :
overridden` — a regra por descrição **nunca de-transfere** uma transação que
o CK ou o CSV já marcou como `Transfer` (invariante preservada); (4) a
heurística **Apple Daily Cash** roda por último, e continua sendo a única
etapa com permissão de **promover** de `Transfer` para outra categoria. Em
suma: a regra por descrição serve para o caso "o mapa CK errou, minha regra
corrige" — vale para não-Transfer, nunca sobrepõe uma exclusão de Transfer.
O sinal do `amount` nunca é tocado por essa regra.

A seção **Description rules**, na tab Audit, permite add / edição inline /
delete com confirmação em 2 cliques / reordenar (↑/↓, já que a ordem é
semântica); o select de categoria de destino não lista `Transfer`; um aviso
explica a precedência sobre o mapa CK (exceto Transfer). **Sem preview de
impacto e sem cascata retroativa** — só afeta novos imports a partir da
mudança (mesmo padrão das demais seções de regra da tab Audit).

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
nas três listas (cards colapsáveis via `CollapsibleCard`). Até o PR #107
(v1.9.0) isso vivia num modal (`SettingsModal`, atrás da engrenagem no
header), que já não continha a seção "Account aliases" (movida para a tab
dedicada Audit naquele PR); desde o PR #128 (v1.17.0) o próprio modal foi
removido e todo esse conteúdo passou a viver dentro da tab **Settings**
(antiga Audit, renomeada). **Renomear faz cascata** — conta atualiza transações +
valores do mapa de contas; categoria atualiza transações + chaves de
orçamento. Itens em uso por transações não podem ser excluídos (renomear,
sim).

**Edição de itens (`ManagedRow`).** Cada item tem **ordem manual** via setas
↑/↓ (handlers `reorderAccounts`/`reorderCategories` → `saveConfig` com a nova
ordem); por isso contas e categorias de despesa **não são mais auto-ordenadas
alfabeticamente** no add/rename (novos itens entram no fim, rename mantém a
posição — a ordem persiste). **Swipe para a esquerda** revela os chips Edit /
Delete (mesmo padrão de `TxnAuditCard`; Delete desabilitado se em uso). O chip
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
(v1.9.0) vive na tab dedicada **Audit** (antes ficava dentro do
`SettingsModal`, logo abaixo de `AccountMapSection`): chips de fragmento
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
o rótulo legível. A UI fica na seção **Card mapping** dentro de Settings
(engrenagem no header → `AccountMapSection`): lista os cartões vistos
(emissor · ••últimos-4 · contagem), você atribui uma conta a cada um, e ao
**Save & apply** aplica nas transações existentes (por URN) e em todos os
imports futuros.

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
- **Modernização Copilot-inspired**: Dashboard com **hero card** de saldo líquido (gradiente, glow, 40 px, split receita/despesa), StatCards com borda de acento à esquerda + label uppercase, `TxnRow` com **avatar colorido** da categoria (inicial + paleta estável via `catDotColor`/`CATEGORY_COLORS`), logo tile azul no header, e linhas de orçamento com dot da categoria + glow na barra estourada. As **legendas dos ícones** da tab bar (Dashboard/Analyze/Txns/Import) seguem visíveis.
- **Tela cheia iOS PWA (full-bleed)**: o `viewport-fit=cover` só passa a valer com o meta limpo (sem `maximum-scale`) **e** uma reinstalação na tela inicial (o iOS faz snapshot do viewport no add-to-home-screen). A medição no device foi decisiva: `100dvh`/`100svh` = a *layout viewport* (812 pt no iPhone 16 Pro, que **exclui** a área do home indicator), enquanto `100vh`/`100lvh` = a tela física completa (874 pt). Por isso `html`/`body`/`#root` usam **`height: 100lvh`** com `overflow: hidden` (sem rubber-band) e o shell `height: 100%`. Resultado: a tab bar encosta na borda física real (medido `belowNav = 0`), sem faixa preta. `env(safe-area-inset-bottom)` no padding da barra mantém os ícones acima do home indicator; `env(safe-area-inset-top)` no header limpa a Dynamic Island.

São **5 tabs**: Dashboard, Analyze, Transactions, Import, Settings (antiga
**Audit**, renomeada e consolidada com o antigo `SettingsModal` na v1.17.0,
PR #128 — ver item 5 abaixo). O app usa
shell de altura cheia (`#root` em `100lvh` + shell `height:100%`): só o
`<main>` faz scroll, então header e tab bar ficam fixos.

1. **Dashboard** — `PeriodFilter` (seletor ano/mês) fica acima do hero e
   controla o período exibido. **Hero card** mostra o saldo líquido, receita
   e despesa do **período selecionado** (antes era all-time). Abaixo do hero,
   **`DailyPaceCard`** (v1.5.6) — AreaChart de gasto cumulativo diário com
   duas séries vinculadas ao período selecionado pelo `PeriodFilter`: mês
   selecionado (laranja `#F97316`, linha sólida + fill semi-transparente) e
   mês anterior (cinza `#8b94a3`, linha tracejada + fill sutil). Eixo X =
   dia do mês; eixo Y = despesa cumulativa em formato `$X.XK`. Exibe
   ReferenceLine "Today" quando o mês exibido é o mês corrente do calendário.
   Transfers excluídas; `cursor={false}`. Abaixo do DailyPaceCard, bloco
   **"by Category"**: gastos do mês selecionado por categoria, ordenados do
   maior para o menor (só categorias com gasto > 0; Transfer e categorias de
   receita excluídas). Cada categoria exibe avatar colorido, valor e dois
   badges de variação percentual — **M/M** (vs. mês anterior) e **Y/Y**
   (vs. mesmo mês do ano anterior). Comparações usam cutoff do mesmo dia
   (mês corrente → até hoje; mês passado → mês completo). Base 0 exibe "—";
   alta de gasto = vermelho, queda = verde. Respeita o toggle de privacidade
   (olho). O bloco só aparece quando há ano+mês específico selecionado.
   Ao final da página, seção **"All Time"** com 3 StatCards (Income /
   Expenses / Net) totais históricos (`usd0`, sem centavos, para caberem na
   linha em telas estreitas).
   O bloco **"Recent" (transações recentes) foi removido** do Dashboard
   (componente `TxnRow` permanece na aba Transactions).
2. **Analyze** — a tab renderiza **somente `Charts`** (PR #104, v1.7.0): as
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
   Ano+Mês exclusivos do Charts (o componente compartilhado `PeriodFilter`
   continua usado pelo Dashboard). Logo abaixo do range de anos, um **filtro
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
   **`MonthlyBarCard`** — barras de Income ou Expense agrupadas na
   granularidade selecionada, com toggle de pills no topo (default: Income);
   valores de expense sempre positivos (`Math.abs`); respeita `hideValues`.
   Segundo card: **"Income vs Expenses"** (barras agrupadas na mesma
   granularidade; título antes era "Income vs Expenses (Monthly)"). Eixo Y e
   tooltip dos dois cards de barras exibem valores em formato `0.00K` (ex.
   `$1.50K`); lógica de fallback de mês único (`isSingleMonth`) removida.
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
   `#a7f3d0`); `radius={[4,4,0,0]}` aplicado apenas na barra do topo de cada
   stack. As barras são **ordenadas por grupo temático fixo** via `CATEGORY_ORDER`
   (casa → carro → alimentação → lazer → finanças/saúde) em vez de por volume.
   **Total label** em formato `$X.XK` exibido acima de cada barra stacked via
   `<LabelList>` com renderer SVG personalizado; funciona corretamente em expense
   e income mode. **Legenda posicionada abaixo do gráfico** em layout wrap
   centralizado (`padding: "8px 16px 14px"`), swatches 10×10 px listando somente
   as categorias presentes no período. Card wrapper com `overflow: visible` para
   que o tooltip não seja truncado. Altura do container: 260 px. Respeita
   `hideValues`. Retorna `null` quando não há dados no período para o modo
   selecionado. É o **último card** da tab Analyze.
3. **Transactions** — busca textual livre + **chips de filtro** (Type /
   Account / Category / Date) que abrem dropdowns via **portal** (`Popover`
   em `position: fixed` no `document.body`, ancorado por `getBoundingClientRect`
   — escapam de qualquer container com `overflow`, antes ficavam clipados). O
   range from/to vive dentro do chip **Date**. A barra de resumo virou **pills
   coloridos** (↑ income / ↓ expenses / = net). A pill de expenses exibe a
   magnitude com `↓` em vermelho quando há saída líquida (`summary.expenses < 0`);
   quando reembolsos superam as despesas do período (`summary.expenses >= 0`),
   exibe a magnitude com `↑` e cor verde (`#34d399`). O NET é calculado como
   `income + expenses` (soma dos fluxos sinalizados) — fica positivo quando os
   reembolsos dominam o período. A lista é **agrupada por data**
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
   4. **Accounts** (managed list) — migrado do antigo `SettingsModal`
   5. **Expense categories** (managed list) — migrado do antigo `SettingsModal`
   6. **Income categories** (managed list) — migrado do antigo `SettingsModal`
   7. **Apple Daily Cash rule**
   8. **Description rules**
   9. **Category mapping** — **movida para o final da tab** (antes vinha logo
      após "Account aliases"), com menos destaque/prioridade visual; continua
      colapsável e **fechada por padrão**.

   Renderiza `AccountAliasesSection` (mesmas props de antes:
   `transactions`, `accountMap`, `aliases={accountAliases}`,
   `onSave={onSaveAccountAliases}`), a seção **Account aliases** — chips de
   fragmento por conta (add/remove) + fluxo **Preview impact** → **Confirm &
   apply** (ver "Aliases de conta editáveis" no Modelo de dados). Nenhuma
   lógica de negócio mudou (`saveAccountAliasesAndApply`, `computeAliasImpact`,
   `buildAliasArray`, `applyAliasConfig`, `matchAccount`, `classifyAccount`,
   `api/account-aliases.js` — tudo igual, só mudou onde é renderizado).

   Logo abaixo, **Card mapping** (`AccountMapSection`, ver "Classificação de
   conta no import" no Modelo de dados) e as três `ManagedList` — **Accounts**,
   **Expense categories**, **Income categories** (ver "Listas gerenciáveis"
   no Modelo de dados) — que antes só existiam dentro do `SettingsModal` (por
   trás da engrenagem no header) e agora vivem diretamente na tab, sem modal.

   > **Nota (PR #117, v1.14.0)**: a seção **"Classification history"** (e a
   > função `explainClassification`/`CLASSIFICATION_PAGE_SIZE`) foi
   > **removida** a pedido do usuário. Não existe mais nesta tab; a única
   > forma de auditar uma decisão de categoria hoje é através das seções de
   > regra abaixo (Category mapping / Apple Daily Cash rule / Description
   > rules).

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

   Antes de "Category mapping" (agora ao final), vem a seção **"Apple Daily
   Cash rule"** (desde o PR #113, v1.12.0): edita a heurística que reclassifica o
   cashback do Apple Card (`Deposit`/`Adjustment`, marcado como `Transfer`
   pelo CK) para `Other Income` — inputs de texto para o **provider
   pattern** e as **keywords** (separadas por vírgula), e um select da
   **categoria de destino**. Mesmo padrão visual `CollapsibleCard`/draft/
   dirty/save das seções vizinhas. Exibe um aviso explícito de que essa
   regra pode promover uma transação de `Transfer` para a categoria de
   destino — a única exceção documentada à regra geral de nunca rebaixar/
   alterar Transfer no pipeline de classificação. **Sem preview de
   impacto e sem cascata retroativa** — só afeta novos imports a partir da
   mudança.

   Logo abaixo de "Apple Daily Cash rule", desde o **PR #117 (v1.14.0)**,
   uma nova seção **"Description rules"** (Painel de regras de categoria,
   Fatia 1): lista as regras "descrição/provider contém X → categoria Y"
   (`categoryDescriptionRules`), com add / edição inline / delete (chip
   vermelho, confirmação em 2 cliques) / reordenar via setas ↑/↓ — a ordem é
   **semântica** (primeira regra que casa vence). Cada regra tem um select
   de `matchField` (description / provider / both), um input de padrão e um
   select de categoria de destino que **nunca lista `Transfer`** (bloqueado
   também no endpoint). Um aviso explica que essas regras têm precedência
   sobre o mapa CK (Category mapping) para categorias não-Transfer, mas
   nunca sobrepõem o safety-net de Transfer. **Sem preview de impacto e sem
   cascata retroativa** — só novos imports a partir da mudança (mesmo
   padrão das seções vizinhas). Ver "Regras de categoria por
   descrição/provider" no Modelo de dados para a precedência exata em
   `buildRow`. A **Fatia 2** (detecção automática de correções manuais
   recorrentes como candidatas a regra, PR #119, v1.15.0) está **concluída**
   — ver o Grupo C ("Manual category corrections") na seção **Suggested
   rules** abaixo.

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
    (v1.12.0)** — seção **Apple Daily Cash rule** na tab Audit, editando
    provider pattern, keywords e categoria de destino; sem preview de
    impacto por transação — ver item acima.
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
  Discutir: reintroduzir como seção própria, mover para dentro do Dashboard,
  ou repensar a interação.
- [ ] **Recurrents (recorrentes / assinaturas) — reavaliar formato**
  *(removido do Analyze no PR #104)*: antes vivia como detecção client-side
  de transações com a mesma descrição em ≥2 meses e valor dentro de ±10% da
  mediana, listando valor típico, conta, frequência (badge mensal/anual/
  semanal/irregular) e próxima ocorrência estimada. Nota: essa seção tinha
  texto em português hardcoded (Mensal/Anual/Semanal/Irregular, "Próx.
  estimada:") que precisa ser traduzido se/quando reintroduzida. Discutir:
  manter como está, mover para o Dashboard, ou integrar como alerta.
