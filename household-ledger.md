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
  "amount": 142.37,            // sempre positivo; o sinal vem da categoria
  "category": "Groceries",
  "account": "Chase Reserve"
}
```

Persistido no Redis como `{ transactions: [...], savedAt }`.

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

### Categorias

Despesas: `Car, Dog, Entertainment, Fuel, Groceries, Home, Medical,
Mobile Phone, Mortgage, Other, Restaurant, Services, Shopping, Transport,
Travel, Utilities`.

Receitas: `Salary, Bonus, Bela Income, Other Income`.

Especial: `Transfer` — **excluída de todos os totais** (saldo, receitas,
despesas e gráficos). Serve apenas para movimentações entre contas.

### Contas

`ATT Reward, Advancial, Alaska, Amazon Card, Apple, Bank of America,
Capital One, Chase Bela, Chase Preferred, Chase Reserve, Chime, Discover,
Ink Biz Cash, Ink Unlimited, Jasper Card, Lowes Card, SoFi, Southwest,
T-Mobile, United Explorer, Venmo, Venture X`.

---

## UI

Mobile-first, tema escuro (`#0b0d10`). Tab bar inferior fixa com 5 abas. A entrada de transações é exclusivamente via Import — não há formulário manual de adição.

1. **Dashboard** — saldo líquido, receitas/despesas totais, resumo do mês
   corrente e transações recentes. Filtrável por mês/ano via `PeriodFilter`
   (inicia no mês corrente).
2. **Charts** — pizza de despesas por categoria e barras de receita vs
   despesa por mês (recharts). Filtrável por mês/ano via `PeriodFilter`
   compartilhado (inicia em "All").
3. **Transactions** — lista com busca textual livre, filtros por intervalo
   de datas (from/to), categoria, conta e mês/ano via `PeriodFilter`
   (reutilizado do Dashboard e Charts), botão "Clear filters" e contador
   de resultados. Suporta edição via `EditModal` (PUT) e exclusão. Botões
   **CSV** e **JSON** exportam as transações filtradas (campos: `date,
   description, amount, category, account`); desabilitados quando o toggle
   do olho está ativo.
4. **Import** — importação de CSV (papaparse) com mapeamento de colunas
   configurável (`IMPORT_FIELDS`, `guessMapping`, selects por campo com
   hints de fallback) e contador "Showing 50 of N rows" na prévia.
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

### Fase 3 — Análise
- [x] Orçamentos por categoria e alertas
- [x] Tendências e comparação mês a mês
- [x] Saldo e gastos por conta *(removido do Analyze no PR #8 — seção Account Balances descontinuada)*
- [x] Recorrentes / assinaturas detectadas

### Fase 4 — Plataforma
- [x] Exportar CSV/JSON
- [ ] Multiusuário / household compartilhado
- [ ] PWA offline-first
- [ ] Integrações de import (bancos, cartões)
