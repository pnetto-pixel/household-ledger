# Household Ledger

Aplicativo mobile-first de controle financeiro doméstico. Registra
transações da casa (despesas e receitas) por categoria e conta, com
dashboard, gráficos, importação de CSV e visão por mês.

Construído a partir do mesmo scaffold do **aa-findocs**: React 18 + Vite no
front-end, funções serverless na Vercel e Redis (ioredis) como armazenamento
persistente por usuário.

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
│   └── budgets.js          # GET/PUT de orçamentos por categoria (auth obrigatória)
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
  "ckCategory": "GROCERIES"    // opcional — categoria crua da fonte (auditoria)
}
```

Persistido no Redis como `{ transactions: [...], savedAt }`. Os campos
`srcAccount` e `ckCategory` só existem quando a fonte do import os fornece;
servem para auditar as decisões de classificação de conta e categoria.

**Sinal do `amount`.** O valor é sinalizado na **direção natural da
categoria**: positivo é uma despesa/receita normal; **negativo é uma
reversão** — um refund numa categoria de despesa (reduz as despesas) ou um
cashback/imposto clawback numa categoria de receita (reduz a receita). As
agregações somam o valor sinalizado (`income += amount`, `expenses +=
amount`, `net = income − expenses`), então um refund de despesa entra como
crédito sem precisar trocar de categoria. Na UI o sinal/cor da linha segue
o **fluxo de caixa**: entrada (refund de despesa ou receita) em verde com
`+`, saída (despesa ou clawback de receita) em vermelho com `−`. O profile
Credit Karma preserva o sinal vindo do export (que detecta reversões); os
demais profiles normalizam para positivo (`Math.abs`) e reversões são
marcadas à mão no `EditModal` (valor negativo). Transfer continua excluída
de todos os totais.

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
pelo `AccountMapModal`.

### Listas gerenciáveis (contas + categorias)

As listas `ACCOUNTS`, `EXPENSE_CATEGORIES` e `INCOME_CATEGORIES` deixaram de
ser fixas no código: são variáveis de módulo (mutáveis) semeadas pelos
`DEFAULT_*` e substituídas em runtime por `applyConfig()` a partir de
`api/config.js` (GET/PUT em `household:USERID:config`, sanitiza strings
não-vazias e deduplicadas). As funções puras (`matchAccount`, `isIncome`,
`buildRow`) leem os valores correntes; os componentes React re-renderizam
via o `config` state no App (`Transfer` continua fixo). A UI é o
`SettingsModal` (engrenagem no header): adiciona/renomeia/exclui nas três
listas. **Renomear faz cascata** — conta atualiza transações + valores do
mapa de contas; categoria atualiza transações + chaves de orçamento. Itens
em uso por transações não podem ser excluídos (renomear, sim).

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
o rótulo legível. A UI fica no botão **Accounts** da aba Transactions
(`AccountMapModal`): lista os cartões vistos (emissor · ••últimos-4 ·
contagem), você atribui uma conta a cada um, e ao salvar aplica nas
transações existentes (por URN) e em todos os imports futuros.

---

## UI

Mobile-first, tema escuro iOS. Tab bar inferior fixa com 5 abas. A entrada de transações é exclusivamente via Import — não há formulário manual de adição.

**Identidade visual (PR #23 — iOS 26 "Liquid Glass")**

- **Safe-area**: header usa `padding-top: env(safe-area-inset-top)` para não sobrepor a Dynamic Island; tab bar e modais usam `env(safe-area-inset-bottom)` para o home indicator.
- **Tipografia**: font stack `SF Pro Display, SF Pro Text, system-ui`; antialiasing ligado; título do app peso 600 com `letter-spacing` negativo; section titles uppercase estilo headline iOS; tab labels peso 500.
- **Liquid Glass**: header e tab bar com `backdrop-filter: blur(20px) saturate(180%)` (superfície translúcida); borders `rgba(255,255,255,0.08)`.
- **Cantos arredondados**: cards 16 px, modais 20 px, inputs/botões 12 px, linhas de transação 14 px.
- **Paleta dark mode iOS**: superfícies `#161a20`, borders `#1e2530`, system blue `#0A84FF` em botões primários e links, cinza `#636366` no botão de exclusão. (Background anterior `#0b0d10` substituído.)

1. **Dashboard** — saldo líquido, receitas/despesas totais, resumo do mês
   corrente e transações recentes. Filtrável por mês/ano via `PeriodFilter`
   (inicia no mês corrente).
2. **Charts** — pizza de despesas por categoria e barras de receita vs
   despesa por mês (recharts). Filtrável por mês/ano via `PeriodFilter`
   compartilhado (inicia em "All").
3. **Transactions** — lista com busca textual livre, filtros por intervalo
   de datas (from/to), categoria e conta, botão "Clear filters" e contador
   de resultados. O filtro de conta inclui um chip **"Unassigned"** que
   agrupa as transações sem conta classificada. Suporta edição via
   `EditModal` (PUT) e exclusão individual.
   Botão **CSV** exporta as transações filtradas (campos: `date, description,
   amount, category, account`); desabilitado quando o toggle do olho está
   ativo. O botão JSON foi removido (PR #14).

   A auditoria de origem aparece como tooltip na célula de conta (desktop),
   linha "Source account (audit)" no `EditModal`, e `src:` no card mobile
   das linhas não-mapeadas. (A re-classificação por aliases — antigo
   `ReclassifyModal` — foi removida; a fonte de verdade para contas é a
   tabela de/para por URN.)

   **Modo de seleção (bulk delete):** botão "Select" alterna o modo de
   seleção; quando ativo, muda para "Cancel" e o botão de lixeira individual
   de cada linha fica oculto. Cada linha exibe um checkbox; "Select all"
   marca/desmarca todas as transações da lista filtrada corrente. Com ao
   menos uma seleção, aparece o botão "Delete selected (N)"; ao clicar, um
   banner de confirmação inline é exibido antes de efetivar a remoção. O
   bulk delete é client-side: remove as N transações e dispara uma única
   chamada `scheduleSave` (mesmo padrão do delete singular, sem novo
   endpoint).
4. **Import** — importação de CSV (papaparse) com mapeamento de colunas
   configurável (`IMPORT_FIELDS`, `guessMapping`, selects por campo com
   hints de fallback) e contador "Showing 50 of N rows" na prévia.
   **Bank profiles** (`BANK_PROFILES`) pré-configuram o mapeamento por
   fonte: `Generic` (mapeamento manual), **`Credit Karma`** (auto-mapeia
   `date,description,amount,category,account,ck_category` — a coluna
   `account` passa por `matchAccount`), os profiles Chase (Bela/Preferred/
   Reserve/Ink) que forçam a conta via `defaultAccount`, e Chase OFX/QFX.
   Quando nenhum sinal de conta existe, a linha fica **Unassigned** (não
   mais "ATT Reward").
5. **Analyze** — análise aprofundada com três seções:
   - **Tendências mês a mês** — LineChart com top-5 categorias de despesa por
     volume nos últimos 12 meses; StackedBarChart com mix de todas as categorias
     por mês; tabela comparativa mês atual vs. anterior com delta $ e %.
   - **Orçamentos por categoria** — limites mensais editáveis inline por
     categoria de despesa; barra de progresso verde/amarelo/vermelho; banner de
     alerta ao ultrapassar 100%; limites persistidos no Redis via
     `/api/budgets`.
   - **Recorrentes / assinaturas** — detecção client-side por descrição exata
     em ≥ 2 meses distintos com valor ± 10 % da mediana; lista com valor
     típico, conta, frequência e último mês visto.

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
- [x] `src/App.jsx` com 5 tabs, totais, eye toggle, import CSV
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
- [ ] Multiusuário / household compartilhado
- [ ] PWA offline-first
- [~] Integrações de import (bancos, cartões) — exportador Credit Karma para
  iPhone via Scriptable e bookmarklet de Safari em `tools/credit-karma/`
  (gera CSV `date,description,amount,category,account,ck_account,provider,
  ck_category,type,account_urn,last4`, consumido pelo profile Credit Karma do
  Import). O export
  detecta reversões (refund de despesa / clawback de receita) auto-calibrando
  a convenção de sinal do CK e emite o `amount` na direção natural da
  categoria (normal positivo, reversão negativo); o profile Credit Karma
  preserva esse sinal no import. Transações **pendentes são excluídas** do
  export (`isPending`) — só linhas liquidadas (cleared) entram no CSV
