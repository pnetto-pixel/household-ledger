# Household Ledger — Contexto fixo (resumo p/ agentes)

> Fonte completa e histórico de versões: `household-ledger.md`. Este arquivo
> existe só para os agentes do `/feature-workflow` não precisarem reler o
> doc inteiro (2000+ linhas) a cada rodada. Se um agente precisar de
> detalhe de UI/roadmap/histórico, aí sim vá ao `household-ledger.md`.

## Stack
React 18 + Vite (front) · recharts (gráficos) · papaparse (CSV) ·
lucide-react (ícones) · funções serverless Vercel (`/api/*`) · Redis via
`ioredis` · Auth somente por senha de app (`lib/auth.js`; Google JWT
removido na v1.30.0). Auto-lock de cliente após 30 min de inatividade
(v1.45.0): a senha sai do `localStorage` e o login volta; timestamp
`household_last_active` compartilhado entre abas.

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
- GET/PUT em `/api/transactions`, payload `{ transactions, savedAt, clientId }`.
- PUT aceita `expectedSavedAt` opcional (concorrência otimista, v1.30.0):
  responde 409 quando o `savedAt` persistido diverge; sem o campo, mantém
  last-write-wins (back-compat). PUT também aceita `clientId` (v1.44.8, id
  por page-load): mismatch de `savedAt` é perdoado quando o blob armazenado
  foi gravado pelo mesmo `clientId` (evita auto-409 quando o iOS suspende a
  página antes da resposta do save chegar). Em 409 real, o cliente faz
  merge de três vias (`mergeTransactions`, `src/ledger.js`, v1.46.0) e
  regrava, em vez de descartar a mudança local.
- Namespace `household:*:transactions` (chave derivada por usuário a partir
  de `auth.storageKey`, reescrita de `portfolio:...:holdings` para
  `household:...:transactions`). Snapshots diários aditivos em
  `household:*:transactions:snapshot:YYYY-MM-DD` (TTL 7d — reduzido de 30d
  pra caber no free tier de 30MB do Redis Cloud, compartilhado com o app
  portfolio; lidos só por `api/snapshots.js`, restore manual na Settings).
  Meta de concorrência em `household:*:transactions:meta` (v1.47.1,
  string `savedAt|clientId` — o CAS Lua NÃO decodifica o blob JSON; cjson
  rejeita surrogates sem par que o JS aceita, o que já travou um ledger em
  409 eterno). PUT sanitiza surrogates sem par (→ U+FFFD) antes de gravar.
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

## Versionamento (OBRIGATÓRIO em todo PR)
Toda feature/fix — mesmo pequena — exige bump de versão nos **dois** lugares:
`src/App.jsx` (span `v1.x.x` ao lado de "Household") e `household-ledger.md`
(título `# Household Ledger · v1.x.x` + entrada "Versão atual"). Patch para
bugfix/ajuste de UI/estilo; minor para feature/mudança de comportamento;
major só se pedido. O feature-auditor reprova PR sem bump. Ver
`household-ledger.md` seção `## Versionamento` para o histórico.

## Env vars
`REDIS_URL`, `APP_PASSWORD`, `SIMPLEFIN_ACCESS_URL` (credencial SimpleFin
Bridge), `CRON_SECRET` (protege `api/cron/simplefin-sync.js`; sem ela o
endpoint sempre responde 401). (Vars do login Google removidas na v1.30.0.)
