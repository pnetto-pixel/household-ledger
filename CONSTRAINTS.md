# Household Ledger — Contexto fixo (resumo p/ agentes)

> Fonte completa e histórico de versões: `household-ledger.md`. Este arquivo
> existe só para os agentes do `/feature-workflow` não precisarem reler o
> doc inteiro (2000+ linhas) a cada rodada. Se um agente precisar de
> detalhe de UI/roadmap/histórico, aí sim vá ao `household-ledger.md`.

## Stack
React 18 + Vite (front) · recharts (gráficos) · papaparse (CSV) ·
lucide-react (ícones) · funções serverless Vercel (`/api/*`) · Redis via
`ioredis` · Auth Google JWT + senha de app fallback (`lib/auth.js`).

## Estrutura
- `src/App.jsx` — app inteiro, monolito single-file (5 tabs), organizado em
  seções com comentários `// ===`.
- `api/transactions.js`, `api/budgets.js`, `api/account-map.js`,
  `api/account-aliases.js`, `api/config.js` — GET/PUT serverless.
- `lib/auth.js`, `lib/redis.js` — não tocar sem motivo claro.

## Modelo de transação (fixo)
```jsonc
{
  "id": "...", "date": "YYYY-MM-DD", "description": "...",
  "amount": 142.37,        // fluxo de caixa SINALIZADO (não sempre positivo!)
  "category": "Groceries", "account": "...",
  // opcionais: srcAccount, accountUrn, last4, ckCategory, sourceId,
  // categoryManual, autoCategory
}
```
- **`amount` é sinalizado**: despesa negativa, receita positiva — vem
  verbatim da fonte (Credit Karma / CSV), a categoria não determina o
  sinal. **Nunca** use `income − expenses` nem `Math.abs` nas agregações —
  `net = income + expenses` (ambos já sinalizados). Isso já foi bug uma vez
  (v1.5.10); não reintroduzir.
- **`Transfer` é excluída de TODOS os totais e gráficos.** Use os helpers
  existentes (`isIncome`, `isTransfer`, `computeTotals`) — não reimplemente.
- Persistido no Redis como `{ transactions: [...], savedAt }`.

## Contrato de API / Redis (não alterar sem necessidade explícita)
- GET/PUT em `/api/transactions`, payload `{ transactions, savedAt }`.
- Namespace `household:*:transactions` (chave derivada por usuário a partir
  de `auth.storageKey`, reescrita de `portfolio:...:holdings` para
  `household:...:transactions`).
- Headers custom chegam lowercase no Node.

## Constraints de implementação
- **Sem TypeScript** — JS/JSX puro.
- **Sem libs novas** além do que já está no `package.json` (react, react-dom,
  recharts, papaparse, lucide-react). Sem CSS files / sem Tailwind.
- **Estilos inline via objeto `S`** no fim de `src/App.jsx`. Tokens: fundo
  `#0b0d10`, cards `#14171c`, texto mudo `#8b94a3`, verde `#34d399`,
  vermelho `#f87171`, azul `#60a5fa`. Acrescente entradas novas em `S`.
- **Mobile-first, tema escuro, app inicia vazio (sem SEED).** Respeite o
  toggle do olho (`hideValues` / helper `money`) em qualquer valor
  monetário novo.
- Padrão visual: `StatCard`, `TxnRow`, `Field`, `Empty`, `SinglePeriodFilter`/
  `SingleCategoryFilter` (chip-button + Popover, single-select — PR #161)
  (cards/linhas); `EditModal` (overlay `S.modalOverlay` + `S.modalCard`,
  fecha no clique fora); `S.select`/`S.input`; ícones `lucide-react`;
  gráficos `recharts` respeitando `hideValues`.
- Reaproveite helpers existentes (`uid`, `todayISO`, `monthKey`, `usd`,
  `money`, `matchPeriod`, `computeTotals`) em vez de duplicar.

## Env vars
`REDIS_URL`, `GOOGLE_CLIENT_ID`, `ALLOWED_EMAILS`, `ADMIN_EMAILS`,
`APP_PASSWORD`, `VITE_GOOGLE_CLIENT_ID`, `VITE_ADMIN_EMAILS`.
