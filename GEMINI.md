# household-ledger — contexto para o Gemini CLI

Controle financeiro doméstico mobile-first: React 18 + Vite + Vercel functions + Redis.

Este projeto usa o **Claude Code** como ferramenta principal, com subagentes isolados
(`.claude/agents/`) orquestrados por um comando (`.claude/commands/feature-workflow.md`).
O Gemini CLI não tem equivalente a subagentes isolados (`Task`) nem skills — então este
arquivo condensa as mesmas regras e o mesmo fluxo de trabalho para você (Gemini) seguir
sozinho, na mesma sessão, passo a passo.

**Antes de qualquer mudança de código, leia `household-ledger.md` por completo** — ele é a
fonte de verdade do roadmap, modelo de dados, contexto fixo e UI.

## Constraints inegociáveis (NUNCA violar sem confirmação explícita do usuário)

- **Modelo de transação fixo:** `{ id, date (YYYY-MM-DD), description, amount (sempre positivo), category, account }`. O sinal vem da categoria — nunca grave `amount` negativo.
- **`Transfer` é excluída de TODOS os totais e gráficos.** Use os helpers existentes (`isIncome`, `isTransfer`, `computeTotals`) — não reimplemente a regra.
- **Contrato da API / formato Redis:** GET/PUT em `/api/transactions`, payload `{ transactions, savedAt }`, namespace `household:*:transactions`. Não altere sem necessidade real e explícita; não toque em `lib/auth.js`, `lib/redis.js` nem `api/transactions.js` sem motivo claro.
- **Sem TypeScript.** JS/JSX puro.
- **Sem libs novas** além do que já está em `package.json` (react, react-dom, recharts, papaparse, lucide-react). Sem CSS files / sem Tailwind.
- **Estilos inline via objeto `S`** no fim de `src/App.jsx`. Reaproveite tokens existentes (fundo `#0b0d10`, cards `#14171c`, texto mudo `#8b94a3`, verde `#34d399`, vermelho `#f87171`, azul `#60a5fa`).
- **`App.jsx` é um monolito por design** — não introduza roteamento/lazy-load novo sem pedido explícito.
- **Mobile-first, tema escuro, app inicia vazio (sem SEED).** Respeite o toggle `hideValues` / helper `money` em qualquer valor monetário novo.
- **Reaproveite helpers existentes** (`uid`, `todayISO`, `monthKey`, `usd`, `money`, `matchPeriod`, `computeTotals`, etc.) em vez de duplicar.

## Fluxo de trabalho de feature (`/feature-workflow` no Claude) — execute manualmente, em ordem

Quando o usuário pedir uma feature nova (ou digitar `/feature-workflow` como atalho mental),
siga estas 4 fases você mesmo, na mesma conversa:

### 1. Planejar (read-only)
Leia `household-ledger.md` (roadmap, contexto fixo, UI) e faça uma varredura rápida no código
relevante para distinguir o que já existe do que está pendente. Recomende **uma** próxima
feature pequena (entregável em 1 sessão/1 PR), com escopo, arquivos prováveis e riscos. Se o
usuário já especificou a feature, valide-a contra o roadmap em vez de escolher por conta própria.
**Apresente ao usuário e confirme antes de codar.**

### 2. Codar
Leia por completo os arquivos que vai modificar antes de editar — nunca chute nomes de função
ou linhas. Implemente respeitando as constraints acima e o padrão visual existente (`StatCard`,
`TxnRow`, `Field`, `Empty`, `PeriodFilter`, modais no padrão `EditModal`, `S.select`/`S.input`,
ícones via `lucide-react`, gráficos via `recharts` respeitando `hideValues`).
**Rode `npm run build` ao final** (rode `npm install` antes se faltar `node_modules`). Avisos
pré-existentes de `VITE_*` e tamanho de chunk são esperados; qualquer outra falha precisa ser
corrigida antes de prosseguir.

### 3. Auditar
Rode `git diff` / `git status` e revise criticamente o próprio trabalho (ou o do usuário)
procurando por: violação do modelo de transação, regra do `Transfer` quebrada, contrato de
API/Redis alterado sem necessidade, bugs de lógica/edge cases, contratos de função/componente
compartilhado quebrados, libs novas fora do `package.json`, estilos soltos fora do objeto `S`.
Confirme que o build passou. Só prossiga para a entrega se tudo passar; senão, corrija e repita.

### 4. Entregar
- Nunca commite direto em `main`. Crie/garanta uma branch descritiva (ex: `gemini/household-<feature>`).
- `git add` dos arquivos relevantes + commit com mensagem clara.
- `git push -u origin <branch>` (retry com backoff em falha de rede).
- Abra o PR (via `gh pr create --draft` ou GitHub MCP, se disponível) contra `main`, com título
  conciso e corpo explicando o que mudou e como testar.
- **Não faça merge automaticamente** — deixe para revisão humana, a menos que o usuário peça
  explicitamente para mergear.

### 5. Documentar
Atualize `household-ledger.md`: marque o item do roadmap como concluído (`- [ ]` → `- [x]`) na
fase certa, adicione follow-ups se a feature gerou pendências, e atualize `## Modelo de dados`
/ `## UI` só se o shape ou o comportamento visível realmente mudou. Edite o arquivo existente —
nunca crie `household-ledger-v2.md` ou similar. Inclua esse commit na mesma branch/PR da feature.

## Status rápido (`/status` no Claude)

Quando o usuário pedir "status do projeto" ou similar: leia `household-ledger.md` por completo
e reporte, de forma concisa:
- Itens pendentes por fase (todo `- [ ]` na seção `## Roadmap`).
- O que falta para fechar a fase atual.
- Lembrete rápido das constraints fixas (para não reabrir decisões já tomadas).
- 2–3 próximas prioridades sugeridas, normalmente da fase atual antes de avançar.
