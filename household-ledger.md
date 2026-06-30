# Household Ledger · v1.5.28

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

Versão atual: **v1.5.28** (correções no `CategoryStackedBarCard`: bug de total corrigido — acumulação usa valor sinalizado + `Math.abs` por categoria após netting, espelhando `byBucket`, para que reembolsos abatam o total em vez de somarem; ordem do toggle reordenada para Income | Expense (Income primeiro), default continua "expense"; total labels `$X.XK` no topo das barras funcionam corretamente em ambos os modos.)

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
│   └── config.js           # GET/PUT das listas de contas/categorias
├── tools/
│   └── credit-karma/       # exportadores CK (bookmarklet Safari + Scriptable)
├── lib/
│   ├── auth.js             # verificação de token Google + senha + allowlist
│   └── redis.js            # singleton ioredis
├── src/
│   ├── App.jsx             # app completo (4 tabs)
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
  "sourceId": "abc123"         // opcional — id da transação na fonte (dedup)
}
```

Persistido no Redis como `{ transactions: [...], savedAt }`. Os campos
`srcAccount` e `ckCategory` só existem quando a fonte do import os fornece;
servem para auditar as decisões de classificação de conta e categoria.

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
pela seção **Card mapping** dentro de Settings (`AccountMapSection`, dentro
do `SettingsModal`).

### Listas gerenciáveis (contas + categorias)

As listas `ACCOUNTS`, `EXPENSE_CATEGORIES` e `INCOME_CATEGORIES` deixaram de
ser fixas no código: são variáveis de módulo (mutáveis) semeadas pelos
`DEFAULT_*` e substituídas em runtime por `applyConfig()` a partir de
`api/config.js` (GET/PUT em `household:USERID:config`, sanitiza strings
não-vazias e deduplicadas). As funções puras (`matchAccount`, `isIncome`,
`buildRow`) leem os valores correntes; os componentes React re-renderizam
via o `config` state no App (`Transfer` continua fixo). A UI é o
`SettingsModal` (engrenagem no header), que reúne **Card mapping** +
adiciona/renomeia/exclui nas três listas (cards colapsáveis via
`CollapsibleCard`). **Renomear faz cascata** — conta atualiza transações +
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
compacto `+`. O `SettingsModal` tem botão "Close" no footer fixo
(`flexShrink:0`) para fechar sem rolar até o fim.

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

**Classificação de conta no import.** Ordem (`classifyAccount`): (1) a
**tabela de/para** keyed no `accountUrn` da fonte — id estável e único por
cartão, persistida em `/api/account-map`; (2) se não houver mapping, o
`matchAccount` por aliases — match exato normalizado contra a lista acima
e, senão, fragmentos de marca (`ACCOUNT_ALIASES`) ignorando maiúsculas,
pontuação e dígitos. A classificação usa **apenas** o campo de conta da
fonte, nunca a descrição do merchant. Sem match → **Unassigned** (nunca o
primeiro da lista).

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

Mobile-first, tema escuro iOS. Tab bar inferior fixa com 4 abas. A entrada de transações é exclusivamente via Import — não há formulário manual de adição. Configuração (match de cartões CK + listas de contas/categorias) fica atrás da **engrenagem** no header (`SettingsModal`); o antigo botão Refresh foi removido.

**Identidade visual (PR #23 — iOS 26 "Liquid Glass")**

- **Safe-area**: header usa `padding-top: calc(env(safe-area-inset-top) + 8px)` para não sobrepor a Dynamic Island; tab bar usa `env(safe-area-inset-bottom)` para o home indicator. Os modais (sheets ancorados embaixo) têm a altura limitada a `calc(100dvh − inset-top − inset-bottom − 28px)` — assim, por mais que as seções expandam, o topo nunca passa da Dynamic Island (o conteúdo interno rola).
- **Tipografia**: font stack `SF Pro Display, SF Pro Text, system-ui`; antialiasing ligado; título do app 15 px peso 600 com `letter-spacing: -0.3px`; section titles uppercase estilo headline iOS; tab labels 9 px peso 500.
- **Liquid Glass**: header e tab bar com `backdrop-filter: blur(20px) saturate(180%)` (superfície translúcida); borders `rgba(255,255,255,0.08)`.
- **Cantos arredondados**: cards 16 px, modais 20 px, inputs/botões 12 px, linhas de transação 14 px.
- **Paleta dark mode iOS**: superfícies `#161a20`, borders `#1e2530`, system blue `#0A84FF` em botões primários e links, cinza `#636366` no botão de exclusão. (Background anterior `#0b0d10` substituído.)
- **Densidade mobile (PR #40)**: Header e TabBar compactados para maximizar a área de lista na tab Transactions. Header: padding vertical `8px/8px` (antes `14px/12px`), ícones 16 px (antes 18 px), IconButton padding 6 px (antes 8 px), SaveIndicator 10 px (antes 11 px). TabBar: padding `4px / max(4px, inset-bottom)` (antes `8px / max(8px, ...)`), ícones 18 px (antes 22 px), labels 9 px com `marginTop: 1px` (antes 10 px / 2 px), tabBtn padding 2 px (antes 4 px). O header ocupa bem abaixo de 25 % da altura da tela. Um design spec developer-ready com dimensões, cores hex, font weights, spacing, hover states e responsividade mobile+desktop está embutido em `src/App.jsx` (bloco de comentário acima do objeto de estilos `S`).
- **Modernização Copilot-inspired**: Dashboard com **hero card** de saldo líquido (gradiente, glow, 40 px, split receita/despesa), StatCards com borda de acento à esquerda + label uppercase, `TxnRow` com **avatar colorido** da categoria (inicial + paleta estável via `catDotColor`/`CATEGORY_COLORS`), logo tile azul no header, e linhas de orçamento com dot da categoria + glow na barra estourada. As **legendas dos ícones** da tab bar (Dashboard/Analyze/Txns/Import) seguem visíveis.
- **Tela cheia iOS PWA (full-bleed)**: o `viewport-fit=cover` só passa a valer com o meta limpo (sem `maximum-scale`) **e** uma reinstalação na tela inicial (o iOS faz snapshot do viewport no add-to-home-screen). A medição no device foi decisiva: `100dvh`/`100svh` = a *layout viewport* (812 pt no iPhone 16 Pro, que **exclui** a área do home indicator), enquanto `100vh`/`100lvh` = a tela física completa (874 pt). Por isso `html`/`body`/`#root` usam **`height: 100lvh`** com `overflow: hidden` (sem rubber-band) e o shell `height: 100%`. Resultado: a tab bar encosta na borda física real (medido `belowNav = 0`), sem faixa preta. `env(safe-area-inset-bottom)` no padding da barra mantém os ícones acima do home indicator; `env(safe-area-inset-top)` no header limpa a Dynamic Island.

São **4 tabs**: Dashboard, Analyze, Transactions, Import. O app usa shell de
altura cheia (`#root` em `100lvh` + shell `height:100%`): só o `<main>` faz
scroll, então header e tab bar ficam fixos.

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
2. **Analyze** — sessão consolidada de análise (antigas tabs Charts + Analyze
   juntas). Começa com a parte de **Charts**: no topo da seção há um
   **segmented control de granularidade** (M / Quarter / Half / Year) e um
   **filtro de range de anos** (From / To) que substituiu os dropdowns
   Ano+Mês exclusivos do Charts (o componente compartilhado `PeriodFilter`
   continua usado pelo Dashboard). Os dois cards usam a mesma granularidade e
   range, sem limite de quantidade de buckets. Primeiro card:
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
   Terceiro card: **`CategoryStackedBarCard`** (PR #95/96/97/98, v1.5.24–27) — barras
   stacked por categoria agrupadas na granularidade selecionada (M / Q / H / Y)
   e range de anos do segmented control. Título: **"By Category"**. Header
   contém o título e um **toggle Income | Expense** (estado `mode`, ordem Income
   primeiro) que alterna entre view de receitas e despesas por categoria; default
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
   selecionado.
   Seguida de:
   - **Tendências mês a mês** — LineChart com top-5 categorias de despesa por
     volume nos últimos 12 meses; StackedBarChart com mix de todas as
     categorias por mês; tabela comparativa mês atual vs. anterior (delta $/%).
   - **Orçamentos por categoria** — limites mensais editáveis inline por
     categoria de despesa; barra de progresso verde/amarelo/vermelho; banner
     ao ultrapassar 100%; persistidos no Redis via `/api/budgets`.
   - **Recorrentes / assinaturas** — detecção client-side por descrição exata
     em ≥ 2 meses distintos com valor ± 10 % da mediana; lista com valor
     típico, conta, frequência e último mês visto. Cada item exibe um
     **frequency badge** colorido (mensal/anual/semanal/irregular) e subtexto
     "Próx. estimada: [data]".
   - **Orçamentos** — threshold de alerta amarelo ajustado de 80 % para
     **75 %**; percentual usado sempre visível (não só ao ultrapassar);
     glow vermelho intensificado ao estourar.
   - **Tendências** — margem de 16 px antes da tabela comparativa;
     legenda com `iconType="circle"` e `paddingTop: 8`.
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
   (`BANK_PROFILES`, cards selecionáveis + dropzone com drag-and-drop):
   - **Credit Karma** (uso diário) — auto-mapeia as colunas do export
     (`account` passa por `classifyAccount`), preserva o sinal e já vem sem
     pendentes; sem UI de mapeamento.
   - **CSV** (uso único, backfill do histórico) — mapeamento manual de
     colunas (`IMPORT_FIELDS`, `guessMapping`, selects por campo com hints de
     fallback). Suporta valores contábeis com parênteses (`(47.50)` →
     `-47.50`) e detecta cabeçalhos repetidos no meio do arquivo (retorna
     `_skipped` em vez de descartar silenciosamente). O summary de diagnóstico
     exibe `N parsed · M valid · K skipped · X selected`.
   Quando nenhum sinal de conta existe, a linha fica **Unassigned** (não mais
   "ATT Reward"). OFX/QFX e os profiles Chase foram removidos (o mapa de
   contas por URN cobre o caso Chase).

   **Deduplicação (híbrida).** Na prévia, cada linha tem checkbox e as
   duplicadas vêm **desmarcadas** (badge `DUP`), com filtro "Only duplicates"
   e Select/Deselect all — só as marcadas são importadas. A detecção
   (`markDuplicates`) compara contra os dados existentes **e** dentro do
   próprio lote em dois estágios (PR #51):

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
- [x] Correções no `CategoryStackedBarCard` (PR #98, v1.5.28): bug de total
  corrigido — acumulação usa valor sinalizado + `Math.abs` por categoria após
  netting (espelha `byBucket`), reembolsos agora subtraem do total em vez de
  somar (eliminava discrepância entre o label e o gasto real); ordem do toggle
  reordenada para **Income | Expense** (Income primeiro), default continua
  "expense"; total labels `$X.XK` no topo das barras corrigidos para funcionar
  corretamente em expense e income mode

### Fase 5 — Inteligência e Auditoria

- [ ] **Auditoria de classificação de categorias** — área no app (sugestão:
  dentro do `SettingsModal` ou tab dedicada) onde o usuário pode ver e editar
  as regras de auto-classificação que o app usa, a saber:
  - **Mapa CK → ledger** (`mapCat` / `CAT` nos exportadores): de qual categoria
    do Credit Karma cada ledger-category é mapeada (ex.: `GROCERIES` →
    `Groceries`, `TRAVEL` → `Travel`). Poder renomear o destino ou criar
    exceções por descrição/provider.
  - **Heurísticas especiais** (ex.: Apple Daily Cash): listar as regras
    embutidas, mostrar quais transações cada uma capturou, permitir ajuste
    da descrição ou do provider-pattern.
  - **Aliases de conta** (`ACCOUNT_ALIASES`): ver quais fragmentos de marca
    casam com qual conta do ledger; adicionar/remover aliases; ver transações
    afetadas antes de salvar.
  - **Histórico de decisões** — por transação, um tooltip ou painel mostrando
    por que foi classificada como X (qual regra/alias casou, se foi
    classificação manual ou automática).
  - **Sugestão de regras novas**: detectar automaticamente transações
    recorrentes sem account match (Unassigned) ou com categoria `Other`, e
    propor uma regra baseada em fragmentos da descrição/provider.
  O objetivo é transformar a auto-classificação de uma caixa-preta em um
  algoritmo auditável e refinável ao longo do tempo pelo usuário.
