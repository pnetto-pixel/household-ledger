# Household Ledger · v1.70.2

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

Versão atual: **v1.70.2** (PR #265, squash-merge) — fix: `S.stickyTh` (v1.70.1) não fazia spread de
`S.th`, então os `<th>` sticky de Transactions e Import perderam
padding/cor/borda/`whiteSpace`. `S.th` e `S.stickyTh` agora derivam de um
`TH_BASE` hoisted para fora do objeto `S` (necessário porque, dentro do
próprio literal de `S`, `S.th` ainda não existe — o binding `S` só é
atribuído depois que o literal termina de ser avaliado); `stickyTh` faz
`{ ...TH_BASE, position: "sticky", ... }`, preservando o padding/borda/cor
normais de um `th` e adicionando só a posição fixa + fundo opaco por cima.
Nenhum uso individual de `<th style={{...S.stickyTh, ...}}>` nas tabelas
precisou mudar.

Versão anterior: **v1.70.1** — thead sticky nas tabelas desktop de Transactions
(`TxnTable`) e do preview do Import (`ImportTransactions`, branch `wide`):
ao rolar `<main>` (único elemento com scroll do shell), o cabeçalho (linha
de filtros de coluna) fica fixo no topo em vez de rolar junto, então os
filtros `HeaderFilter`/`DateHeaderFilter` continuam acessíveis com a lista
rolada. Novo token `S.stickyTh` (`position: sticky`, `top: 0`, `zIndex: 2`,
fundo opaco `rgba(11,13,16,0.92)` + `backdropFilter: blur(20px)
saturate(180%)` — mesmo visual da sticky bar de Trends) aplicado a cada
`<th>` das duas tabelas, substituindo `S.th` só ali (mesmo padding/borda,
por spread). Fundo opaco é necessário porque `S.card` usa superfície
semi-transparente — sem isso as linhas ficam visíveis por baixo do header
ao rolar. Diferente da sticky bar de Trends, não precisou do truque de
`top: -16`/margin negativa (que cancela o padding-top de `<main>` pra ficar
flush contra o header do app): aqui o header da tabela pode ficar na
posição padrão (respeitando o padding de `<main>`), então `top: 0` já
resolve. Popovers de filtro continuam abrindo via `createPortal` em
`document.body`, sem conflito de z-index com o header agora sticky.
Client-side apenas (CSS/estilo), sem mudança de contrato de API/Redis,
modelo de transação, ou layout mobile/Settings (fora de escopo, não
tocados).

Versão anterior: **v1.70.0** — três mudanças no fluxo de categorização:
(1) badges de proveniência de categoria (`categoryBadge`) reduzidos para no
máximo 4 caracteres (`rule`→`RULE`, `confirmed`→`OK`, `learned N%`→`LNNN`,
ex. `L100`/`L067`/`L013`; `?` do Uncategorized ficou como estava); (2) novo
filtro "Status" na coluna Category (Transactions e Import), ao lado do
filtro de categoria já existente, via novo helper puro
`categoryBadgeFilterKey(row)` (buckets: `Rule`, `Confirmed`, `Learned –
High/Medium/Low`, `Uncategorized`, ou `null` sem badge) e o `HeaderFilter`
já existente — reaplica os mesmos thresholds de tier do badge (>=0.7 /
>=0.4); estado `badgeFilter`/`importBadgeFilter`, sem filtro mobile
dedicado no Import (não havia padrão de filtro mobile ali para reaproveitar
além dos chips já existentes na Transactions tab); (3) fix: `Confirm` na
tela de Import (`ImportTransactions`) perdia confirmações silenciosamente
quando o usuário confirmava linhas mas não clicava em "Import" antes de um
novo sync — `confirmedRows` é estado local resetado a cada `dedupedRows`
novo. Agora `syncSimpleFin`/`loadSimpleFinPending` chamam
`confirmDiscardUnimportedConfirmations()`, que usa `window.confirm` (mesmo
padrão já usado no restore de backup) para avisar quantas confirmações
seriam perdidas antes de prosseguir; cancelar aborta o sync.

Versão anterior: **v1.69.2** (PR #262, squash-merge SHA
`bf5703151a026fc31e1317d51cb3cecc2e85134e`) — Tradução de strings de UI
visíveis (PT→EN) em `src/App.jsx` e `src/ledger.js`: badges de categoria
(`regra`→`rule`, `confirmado`→`confirmed`, `aprendido N%`→`learned N%`,
"Nada classificou esta linha ainda"→"Nothing classified this row yet"),
tooltip do `ConfirmCategoryButton`, painel de duplicatas do import
(`ImportDupReviewPanel`), `ImportNearMissHint`, mensagens de erro do
SimpleFin, labels do fluxo de import ("Carregando…"→"Loading…", "Revisar N
pendente(s)"→"Review N pending", "N aprendido(s)"→"N learned", "Confirmar
todos os aprendidos visíveis"→"Confirm all visible learned", "Mais
recentes"→"Most recent", "Revisar primeiro"→"Review first"), hint do modal
de edição para categoria sugerida pela memória, e os `reasons`/
`_dupReasons`/`categoryReason` gerados por
`scoreDuplicateCandidate`/`markDuplicates`/`resolveImportCategory` em
`ledger.js` (ex.: "mesmo valor"→"same amount", "mesmo dia"→"same day", "N
dia(s) de diferença"→"N day(s) apart", "mesmo id de origem"→"same source
id", "conteúdo idêntico..."→"identical content..."; consumidos como
badges/tooltips no App). 3 asserts de `src/ledger.test.js` atualizados para
os novos textos em inglês. **Fora do escopo por decisão explícita do
usuário (não é pendência)**: comentários de código em PT (ex.: `// Alimentação`,
`// Finanças/Saúde` em `src/ledger.js`/`src/App.jsx`) permanecem
intencionalmente não traduzidos. Nomes de categoria
(`DEFAULT_EXPENSE_CATEGORIES`/`DEFAULT_INCOME_CATEGORIES`) já estavam em EN
e não foram alterados. Sem mudança de chave interna/persistida
(`categorySource`, `CATEGORY_BADGE_TIERS`, contrato de API/Redis, modelo de
transação, regra de `Transfer`).

Versão anterior: **v1.69.1** — Bugfix na tab Transactions (Account filter):
de-dupe defensivo por `id` no `filtered` (useMemo) da `TransactionsTab`, antes
de qualquer filtro. Se dois objetos de transação na `transactions` em memória
compartilhassem o mesmo `id` (dado legado/corrompido de algum import/merge
antigo — não confirmado onde ele se origina), eles colidiam como `key` de
React em `<tr>`/`<TxnAuditCard>`, e o reconciliador podia manter o DOM (e o
valor já renderizado do `<select>` de conta) de uma linha "vazado" sobre a
outra — sintoma reportado: com o filtro "Account (source): Apple" ativo, duas
linhas no topo (ordenadas por data desc) mostravam Account = "Bank of
America" mesmo passando pelo predicado `acctFilter.includes(t.account)`
(que só pode ser satisfeito se o `t.account` real fosse "Apple"). Mantém a
ÚLTIMA ocorrência de cada `id` repetido. Client-side apenas, sem mudança de
contrato de API/Redis/modelo de transação — não corrige o dado já persistido
no Redis (se houver mesmo `id` duplicado lá, ele continua existindo, só não
quebra mais a renderização da tabela).

Versão anterior: **v1.69.0** — Home e Import agora persistem estado entre
trocas de tab, reduzindo chamadas desnecessárias ao SimpleFin (client-side
apenas, sem mudança de contrato de API/Redis):
1. **`AccountBalancesCard` (Home)** — parou de ter seu próprio
   `useState`/`useEffect` de fetch (que rodava a cada remount, ou seja, a
   cada troca pra aba Home). Passa a receber `sfBalances`/`refreshSfBalances`
   como props (já existiam a nível de `App()` desde a v1.59.0, alimentando
   Settings/badge da TabBar) — agora a Home também lê desse mesmo estado
   compartilhado, e `useSfBalances(authed)` continua sendo a única fonte de
   fetch automático (no sign-in). Botão de refresh manual novo no header do
   card (ícone `RefreshCw`, `S.iconBtnSmall`) chama
   `refreshSfBalances({ force: true })`, ignorando o cache de 5 min do
   `sessionStorage` quando o usuário pede explicitamente.
2. **`ImportTransactions` (Import)** — o preview do fluxo SimpleFin
   (`method`, `sfRows`, `sfFromPending`, `selected`, `fileName`, `error`,
   `done`) subiu de `useState` local para `App()`, seguindo o mesmo padrão
   do item 1, e é passado como props. Antes, trocar de aba durante uma
   revisão de sync (checkboxes, correções de categoria antes de importar)
   descartava tudo, porque o componente desmonta ao sair da aba Import. O
   estado do CSV genérico/Credit Karma (`rawRows`/`headers`/`mapping`)
   continua local — fora de escopo, não é o fluxo do dia a dia. `resetAll()`
   e o clique em "Sync now" continuam substituindo/limpando o preview
   normalmente; só a sobrevivência a trocas de aba mudou.

Versão anterior: **v1.68.0** — fecha a lacuna encontrada na auditoria
`/feature-workflow` da PR #256: linhas `categorySource === 'learned'` nunca
revisadas na tela de Import ficavam congeladas indefinidamente — sem badge,
sem confirmação, excluídas do treino futuro (`isMemoryTrainableRow`) para
sempre, sem nenhuma outra forma de promovê-las. Reaproveita `CategoryBadge`/
`ConfirmCategoryButton` (Fase 2) fora do Import:
1. **`TxnTable`/`TxnAuditCard`** (`src/App.jsx`, aba Transactions) — badge
   por linha e botão "✓" ao lado do seletor de categoria, idêntico ao do
   Import. Novo prop `onConfirmLearned` encadeado de `Transactions` até os
   dois componentes de linha (desktop e mobile).
2. **`confirmLearned(id)`** (novo, em `Transactions`) — promove uma linha
   `categorySource === 'learned'` para `'confirmed'` via `onUpdate`, sem
   alterar a categoria. **`learnedCount`/`confirmAllVisibleLearned`**
   (novos) — contador "N aprendidos" + confirmação em massa respeitando os
   filtros atuais (`filtered`, não só a janela lazy-loaded `visible`) —
   mesmo padrão dos outros botões de ação em massa já existentes na aba.
   Posicionados na barra de filtros, ao lado de "Clear filters"/"Clear
   selection".
3. **`handleInlineChange`** (novo, substitui a arrow function inline que
   existia em `onInlineChange`) — corrige o mesmo bug latente já corrigido
   na Fase 2 do Import (`setCategoryOverride`): trocar a categoria pelo
   dropdown inline da tabela/card agora limpa `categorySource`/
   `categoryConfidence`/`categoryReason` obsoletos, para que
   `isMemoryTrainableRow` não continue excluindo do treino uma correção
   humana genuína achando que ainda é um palpite não revisado.
4. **`EditModal.submit`** — mesma correção de limpeza de proveniência ao
   trocar a categoria pelo formulário de edição. Além disso, um aviso
   informativo (somente leitura, sem botão de confirmar dentro do modal de
   propósito — o "✓" já existe na linha da lista, sem precisar abrir o
   modal) mostra o badge + "categoria sugerida pela memória — confirme ou
   corrija na lista de transações" quando `txn.categorySource === "learned"`.
5. Validado com Playwright contra um dev server real (mesma metodologia da
   Fase 2): badge/confirmação individual/confirmação em massa/edição manual
   limpando o badge/hint no EditModal — todos conferidos com persistência
   real via PUT `/api/transactions` mockado (`categorySource: "confirmed"`
   de fato chega no payload salvo), em desktop e mobile.

Versão anterior: **v1.67.0** — Fase 2 da classificação automática de categorias:
finalmente visível na tela de Import (`ImportTransactions`, `src/App.jsx`) —
a memória da Fase 1 passa a aparecer, ser revisável e ensinável.
1. **Etiqueta por linha** (`CategoryBadge`, nova) ao lado do seletor de
   categoria: `regra` (azul) quando uma Description Rule decidiu, `aprendido
   XX%` (verde ≥70%, amarelo ≥40%, vermelho abaixo disso) quando a memória
   decidiu, `confirmado` (verde) depois que o usuário valida um palpite, e um
   `?` (cinza) quando nada classificou a linha. Sem etiqueta quando a
   categoria já veio pronta da própria fonte (CSV/CK) — não é um palpite,
   não precisa de marcação. Tooltip mostra `categoryReason`.
2. **Botão "✓" por linha** (`ConfirmCategoryButton`, nova), visível só em
   linhas `categorySource === 'learned'` — confirma que o palpite está
   certo, promovendo `categorySource` para `'confirmed'` (sem alterar a
   categoria em si). Isso é o que fecha o ciclo de aprendizado: uma linha
   `'learned'` é excluída do treino futuro por design (evita loop de
   reforço — ver Fase 1), mas `'confirmed'` já não é `'learned'`, então
   passa a ensinar a memória no próximo import. Some sozinho quando a linha
   deixa de ser `'learned'` (confirmada, ou recategorizada manualmente).
3. **Ordenação "Revisar primeiro"** — toggle ao lado do filtro de duplicatas
   existente, alternando entre a ordem por data (padrão, inalterado) e por
   `categoryReviewConfidence` crescente (nova): linhas menos confiáveis
   sobem ao topo. Regra/confirmado/categoria real da fonte contam como
   confiança máxima; só um palpite da memória (pela própria confiança) ou
   uma linha genuinamente sem classificação (`Uncategorized`) rendem
   embaixo — só aparece quando há pelo menos uma linha `'learned'` visível
   (mesmo padrão de "só mostrar quando relevante" do filtro de duplicatas).
4. **"Confirmar todos os aprendidos visíveis"** — botão de ação em massa que
   confirma toda linha `'learned'` atualmente visível no preview filtrado
   (respeitando os filtros de conta/categoria/data já aplicados).
5. **Correção de um bug latente da Fase 0**: `setCategoryOverride` (a troca
   manual de categoria no preview, existente desde antes deste projeto) não
   limpava `categorySource`/`categoryConfidence`/`categoryReason` da linha —
   uma correção manual sobre um palpite `'learned'` deixava esses campos
   obsoletos, e `isMemoryTrainableRow` (Fase 1) excluiria essa linha do
   treino por engano (achando que ainda era um palpite não revisado, quando
   na verdade é uma correção humana genuína — o tipo de dado mais valioso
   pra treinar). Corrigido para limpar os três campos em toda troca manual.
6. Validado com Playwright contra um servidor de desenvolvimento real
   (dados mockados: histórico de treino + sync SimpleFin simulado) — badge,
   ordenação, confirmação individual, confirmação em massa, limpeza de
   badge ao editar manualmente, e o layout mobile (quebra de linha do
   badge/botão) todos conferidos rodando de verdade no navegador, não só em
   teste unitário.

Versão anterior: **v1.66.0** — Fase 1 da classificação automática de categorias:
a memória de comerciante, construída em cima da fundação da Fase 0.
1. `buildMerchantMemory(transactions)` (`src/ledger.js`, nova) — varre o
   ledger inteiro e monta 6 mapas em camadas (`conta+descrição completa`,
   `descrição completa`, `conta+2 tokens`, `2 tokens`, `1 token`, `conta`
   sozinha como prior), cada um `chave → contagem por categoria`. Só treina
   com linhas "confiáveis" (`isMemoryTrainableRow`, nova): exclui
   `Uncategorized` (sem sinal), `Transfer` (estrutural — conta de origem/
   destino, não tipo de comerciante; mesma razão pela qual uma regra de
   descrição nunca pode ter `destinationCategory: Transfer`) e qualquer linha
   cujo `categorySource === 'learned'` (nunca treina com os próprios palpites
   — evita um loop de reforço onde um erro se perpetua a cada import sem
   correção humana). Como o `categoryManual` desta household cobre só ~0.8%
   do ledger, o bootstrap é o histórico inteiro sem essa flag — decisão
   discutida e aceita com o usuário.
2. `classifyMerchantMemory(row, memory)` (`src/ledger.js`, nova) — testa as 6
   camadas da mais específica pra mais genérica; a PRIMEIRA com histórico
   pra sua chave vence (sem votação entre camadas, pra uma correspondência
   específica nunca ser diluída por ruído de uma camada mais grosseira).
   `confidence = peso_da_camada × pureza × (0,5 + 0,5 × min(1, suporte/3))`.
   Sempre retorna o melhor palpite disponível, por menor que seja a
   confiança — Fase 1 aplica tudo automaticamente (decisão do usuário: revisa
   no import de qualquer forma); o corte de aceitar/rejeitar por confiança
   fica pra uma fase de UI futura. Retorna `null` só em cold-start genuíno
   (nenhuma camada tem qualquer histórico).
3. `resolveImportCategory` (`src/ledger.js`) ganha um novo degrau 2.5 na
   precedência: quando nem regra nem categoria da própria fonte (CSV/CK)
   produzem uma resposta real (`recomputed === "Uncategorized"`), a memória
   tenta antes do fallback final. Nunca sobrepõe uma categoria real que a
   fonte já forneceu (CSV/CK continuam mais autoritativos que um palpite),
   nunca vence uma regra, e nunca desfaz a rede de segurança de Transfer
   (mesma trava que já protegia contra regras). Quando a memória decide,
   `categorySource` passa a valer `'learned'` com a confiança/motivo do
   `classifyMerchantMemory`. `ctx.merchantMemory` é o novo campo opcional que
   carrega essa memória pré-construída.
4. `ImportTransactions` (`src/App.jsx`) constrói a memória uma vez por
   `useMemo(() => buildMerchantMemory(transactions), [transactions])` —
   componente só monta na aba Import, então isso não roda a cada tecla
   digitada em outro lugar do app — e passa pra `buildRow`/
   `classifySimpleFinRows`, que por sua vez passam pra `resolveImportCategory`
   via `ctx.merchantMemory`. Sem essa memoização, o classificador recalcularia
   a memória do zero pra CADA linha de um lote importado.
   `merchantKey(description)` (Fase 0) é computado UMA vez por linha dentro
   de `buildMerchantMemory`/`classifyMerchantMemory` e reaproveitado pelas 4
   camadas que dependem dele — chamá-lo por camada era um desperdício de
   4-5x medido (~250ms → ~117ms varrendo um ledger real de ~11,5 mil linhas).
   Validado contra o histórico real da própria household (split cronológico
   treino/teste): ~62% das linhas classificadas automaticamente com ~91% de
   precisão no corte de confiança 0,5; ~42% a ~98% de precisão no corte 0,9 —
   consistente com as estimativas discutidas com o usuário antes da
   implementação.

Versão anterior: **v1.65.0** — Fase 0 da classificação automática de categorias
(fundação — nenhuma mudança visível ainda; o plano completo, debatido com o
usuário, cobre normalizador de comerciante, memória de aprendizado,
confiança/etiqueta na UI e confirmação manual como próximas fases):
1. Nova função pura `merchantKey(description)` (`src/ledger.js`) — reduz uma
   descrição bruta a uma chave de comerciante comparável: corta endereço
   completo inline (formato Apple Card: "CIRCLE K # 41554 3100 N AW GRIMES
   BLVD" → "CIRCLE K"), separa prefixo de agregador de pagamento ("TST*",
   "DD *") em campo próprio, remove telefone/número de loja/sigla de estado
   final. Retorna `{ key, tokens, prefix }` — `tokens` existe pra quem chamar
   truncar em N palavras (base da memória de comerciante da Fase 1, ainda não
   implementada). Testada em `src/ledger.test.js` com os formatos reais do
   SimpleFin/Apple Card/agregadores de delivery.
2. `resolveImportCategory` (`src/ledger.js`) passa a retornar também
   `categorySource`/`categoryConfidence`/`categoryReason` — hoje só dois
   valores possíveis: `'rule'` (confiança 1) quando uma regra de descrição
   efetivamente decidiu a categoria FINAL (checado contra o resultado, não
   contra "uma regra bateu" — a rede de segurança de Transfer pode vetar uma
   regra vencedora sem `allowTransferOverride`), ou `'none'` (confiança 0)
   pro resto. `buildRow` e `classifySimpleFinRows` (`src/App.jsx`) gravam
   esses três campos na linha só quando `categorySource !== 'none'` —
   aditivo, não infla toda linha com "nada a dizer ainda". Nunca grava
   `'manual'` aqui — isso continua exclusivo dos fluxos de edição do usuário
   (`categoryManual`), que não passam por esta função.
3. Nova categoria `Uncategorized`, que substitui `Other` como fallback de
   "nada classificou esta linha" em três pontos: `resolveImportCategory` e
   `mapCkCategory` (`src/ledger.js`), e `DEFAULT_CATEGORY` (`lib/simplefin.js`
   — crítico corrigir aqui também, já que esse placeholder alimenta
   `resolveImportCategory` como se fosse a categoria da própria fonte; deixá-lo
   em `"Other"` faria `matchOption` casar como categoria legítima e todo
   lançamento SimpleFin não classificado cairia silenciosamente em "Other" em
   vez de sinalizar como não-classificado). `Other` continua existindo,
   inalterado, como categoria normal e selecionável manualmente — linhas
   antigas nela não mudam; só o alvo do fallback automático mudou.
   `applyConfig` (`src/App.jsx`) garante `Uncategorized` sempre presente em
   `EXPENSE_CATEGORIES` mesmo para households com config já salva no Redis
   (mesmo padrão de guarantee já usado para `"Other Income"`).
   `detectOtherDescriptionFragments` (painel "Suggested rules", Grupo D)
   passa a olhar `Other` E `Uncategorized` juntos, pra não perder cobertura
   silenciosamente com a troca do fallback.

Versão anterior: **v1.64.6** — Home's `AccountBalancesCard` (`src/App.jsx`)
removed the per-group subtitle (e.g. "Credit Cards" / "Checking & Savings" /
"Other") that used to render above each group's row list (`renderGroup`'s
`<h3 style={S.sectionTitle}>`), keeping only the card's overall "Account
Balances" title and the Credit Cards/Accounts toggle, to reduce vertical
space. Row list, Total row, grouping/sum/filter/sort logic unchanged.

Previous: **v1.64.5** — Home's `AccountBalancesCard` (`src/App.jsx`)
adds a segmented-control toggle (same `S.segmented`/`S.segmentedBtn(active)`
visual pattern already used by the Trends year-range presets and the Import
duplicate-filter picker) to switch between two views: "Credit Cards" (default)
and "Accounts" (Checking & Savings + Other, when present). In the Credit
Cards view, individual card rows whose consolidated (post label-grouping)
balance is exactly `0` are hidden from the list — accounts with an unknown
balance (`null`, fetch failed) are still shown as "—". The group's "Total"
row is always computed from the full consolidated row list (not the
zero-filtered display list), so hiding $0 rows never changes the total.

Versão anterior: **v1.64.4** — Home's `AccountBalancesCard` (`src/App.jsx`)
agora agrupa contas SimpleFin com o mesmo label consolidado (mesmo cálculo:
`accountMap[accountUrn]` ou fallback `orgName — name`) dentro de cada bucket
de tipo (Credit Cards / Checking & Savings / Other), somando o saldo quando
duas `accountUrn` distintas resolvem para o mesmo nome (ex: dois cartões
físicos renomeados para o mesmo nome em Settings). A lista dentro de cada
grupo é ordenada alfabeticamente pelo label já consolidado (não pelo `name`
raw de cada conta, que pode divergir do label exibido). Cada grupo passa a
exibir uma linha "Total" ao final, somando os saldos (já agrupados) daquele
grupo — usa `money()` (respeita `hideValues`) e a mesma regra de cor
condicional verde/vermelho das linhas individuais, com borda superior e peso
maior pra se destacar visualmente da lista. Antes, cada `accountUrn` virava
uma linha própria, duplicando visualmente contas que o usuário havia
intencionalmente unificado pelo nome. `SimplefinAccountRow` (Settings) não
foi alterado — lá cada urn continua individual.

Versão anterior: **v1.64.1** — Home's `AccountBalancesCard` (`src/App.jsx`)
agora exibe o nome de conta mapeado no app (`accountMap[accountUrn]`, o
mesmo usado em Settings → "SimpleFin accounts") em vez do nome raw do
SimpleFin (`orgName — name`); contas sem mapeamento continuam usando o
fallback raw. `accountMap` foi propagado como prop de `App()` → `Dashboard`
→ `AccountBalancesCard`. `SimplefinAccountRow` (Settings) não foi alterado —
lá o raw label é intencional.

Versão anterior: **v1.64.0** — adiciona coluna "Source" na tabela "SimpleFin
accounts" (`SimplefinAccountsSection`/`SimplefinAccountRow`, `src/App.jsx`):
não existe campo `source` persistido por conta, só por transação
(`t.source`: `"sf"` | `"ck"` | `"csv"`), então o badge é derivado em runtime
a partir das transações já casadas por `accountUrn` — nenhuma transação
casada, ou só `"sf"`, vira badge "SimpleFin"; só `"ck"`/`"csv"` (sem `"sf"`)
vira "Credit Karma" (os dois tratados como a mesma origem "importada"); a
presença de `"sf"` e de `"ck"`/`"csv"` juntas vira "Mixed". Nenhuma mudança
de contrato de API/Redis ou de modelo de transação.

Versão anterior: **v1.63.0** — reorganiza a tab Settings (`src/App.jsx`):
"SimpleFin accounts" e a lista de "Description rules" agora usam tabela
compacta (mesmo padrão de `TxnTable`) em vez de cards empilhados; "Daily
snapshots" e "Data & Backup" foram fundidos num único card "Data
Management"; "Account aliases" e "Category mapping" foram fundidos num
único card "Account aliases & Category mapping" (mesmos `id`s internos
`account-aliases-section`/`category-mapping-section` preservados para o
scroll dos botões de sugestão); "Description rules" subiu para a posição 2
(logo após "Suggested rules"). Nenhuma mudança de contrato de API/Redis ou
de modelo de transação.

Anterior: **v1.62.0** — corrige `markDuplicates` (`src/ledger.js`) para
não vetar automaticamente candidatas a duplicata quando ambos os lados vêm
do SimpleFin ("sf") com `sourceId` diferentes (cartões podem reemitir o id
na transição pending → posted; o veto de PR #51 agora só se aplica a pares
do mesmo feed legado/"ck"). Também adiciona filtros de coluna (conta,
categoria, data) nos headers da tabela de import (desktop), reaproveitando
`HeaderFilter`/`DateHeaderFilter`, e ordena a preview de import por data
decrescente com tie-break estável — a tab Transactions ganhou o mesmo
tie-break estável por índice original (`src/App.jsx`).

Anterior: **v1.61.1** (PR #245, SHA
cdf7d4e84f56a81d7c121d44fdee7a24cc723ec1) — **"Account aliases" em Settings
vira lista compacta** (linhas colapsadas por conta, expande ao clicar para
editar fragments; sugestão de "Suggested rules" expande todas as linhas)
(`src/App.jsx`).

Anterior: **v1.61.0** — diagnóstico "candidata mais próxima" para
duplicatas invisíveis + redesenho da tela de import (`src/ledger.js`,
`src/App.jsx`).

O fix da v1.60.1 (`providerDescription`) resolveu a causa que ele mirava, mas
o relato seguinte mostrou que as mesmas 4 transações da Amazon continuavam
caindo em `new`. Reproduzindo o caso à mão: o melhor cenário possível do fix
melhora o score de 65 para 80 — ainda dentro da faixa `uncertain`, nunca
`certain`, e **80 é bem acima de 60**. Se a transação real ainda cai em
`new` (score < 60), tem que existir uma penalidade adicional que o fix não
tocava — o candidato mais provável é uma divergência na `account` (a conta
já classificada da transação existente é diferente do nome do banco que o
SimpleFin usa), que sozinha já custa 40 pontos.

Em vez de arriscar um quarto fix às cegas, `markDuplicates` (`src/ledger.js`)
agora expõe esse fato diretamente: toda linha que fica em `new` carrega um
`_dupNearMiss` — a existing row de mesmo valor mais próxima por data,
mantida mesmo quando foi desqualificada (por data > 5 dias, conta diferente
ou descrição sem sobreposição), com `{ date, description, account, amount,
dayDiff, score }`. Quando não há sequer uma existing row com o mesmo valor
em centavos, `_dupNearMiss` é `null` — o que já é diagnóstico (o valor não
bate, não é uma questão de data/conta/descrição). A tela de import
(`ImportNearMissHint` em `src/App.jsx`) mostra essa linha, discreta e em
itálico, abaixo de qualquer linha "new": "Candidata mais próxima não bateu:
{data} · {conta} · {valor} · {Xd de diferença} · {pontuação/motivo}" — dá pra
ver o motivo exato (data, conta ou descrição) sem precisar de mais um
round-trip de screenshot.

De quebra, três ajustes de layout pedidos junto com o relato: (1) a caixa do
"Sync now" do SimpleFin era um dropzone grande com padding de 26px —
virou uma barra fina (10px/14px) já que não é uma área de drag-and-drop como
o CSV; (2) o preview de import tinha um cap de `maxHeight:300 +
overflowY:auto` que, combinado com `S.importActionsBar` (sticky no fundo do
`<main>` de tela cheia), deixava um vão preto enorme entre a lista curta e o
botão — removido, a lista agora cresce com o scroll único da página, mesmo
padrão já usado na tab Transactions; (3) no desktop (`useMediaWide`, ≥900px)
o preview agora usa uma `<table>` no mesmo estilo de `S.table`/`TxnTable` da
tab Transactions (linha com checkbox/Date/Description/Account/Category/
Amount) em vez do card empilhado — mais denso, mais linhas visíveis por
tela, consistente com o resto do app. Mobile (<900px) continua com o layout
de cards. A faixa "Review" (side-by-side + botão "marcar como duplicata")
virou o componente compartilhado `ImportDupReviewPanel`, usado pelos dois
layouts para não divergir.

Versão anterior: **v1.60.1** — **fix: duplicatas da Amazon não eram detectadas
depois da mudança para `memo`** (`lib/simplefin.js`, `src/ledger.js`,
`src/App.jsx`).

Regressão introduzida pela própria v1.56.1/v1.60.0: ao trocar a descrição de
exibição para o `memo` (item do pedido, ex. "100 Pack Mini Sunscreen for
Family"), o token que identificava o comerciante ("amazon"/"amzn") sumiu da
descrição — e uma transação já importada via Credit Karma para a MESMA
compra só tem a string genérica do comerciante (ex. "AMAZON.COM*RT4XY1"). As
duas descrições passaram a não compartilhar nenhuma palavra, o que:

- zera a penalidade de descrição no pior tier (35), deixando o **melhor caso
  possível** (mesmo dia, mesma conta) com score = 65 — na borda entre
  `uncertain` e `certain`, sem folga nenhuma;
- qualquer ruído realista de data de postagem (comum entre cartões — 2+ dias
  de diferença já bastam) ou de conta empurra o score abaixo de 60, e a
  duplicata cai em `new` — invisível, sem badge, sem faixa "Review".

Fix: novo campo aditivo `providerDescription` em `mapTransaction`
(`lib/simplefin.js`) — guarda a `description`/`payee` genérica original
**só** quando `memo` de fato venceu e a substituiu (nada a acrescentar no
caso comum onde `memo` está ausente). `scoreDuplicateCandidate`
(`src/ledger.js`) passou a montar o conjunto de tokens de cada lado a partir
de `description` **+** `providerDescription` (quando presente) — a
descrição exibida ao usuário não muda, só o sinal usado para casar
duplicatas ganha de volta a palavra-chave do comerciante. No caso do
screenshot que motivou o fix, o score do melhor caso sobe de 65 para 80
(sai de "na borda" para uma folga real de 20 pontos antes de cair abaixo de
`uncertain`).

O campo é preservado no import (não está na lista de strip do `confirm()`,
mesmo padrão de `ckCategory`/`srcAccount`) e aparece como "Source description
(audit)" no `EditModal`, ao lado da Description, quando presente — mesmo
padrão visual das outras linhas de auditoria (`Source category`/
`Source account`).

Versão anterior: **v1.60.0** — **fix: `memo` do SimpleFin agora tem prioridade
sobre `description` para QUALQUER conta** (`lib/simplefin.js`).

Desde a v1.56.1, `mapTransaction` só preferia `memo` sobre `description`/
`payee` para contas da Amazon — o `description` que a Amazon manda é
boilerplate genérico ("Amazon.com"), enquanto o `memo` carrega o detalhe real
do pedido. Generalizado: **nada nessa regra é específico da Amazon**, e
outras instituições sofrem do mesmo problema (código de comerciante cru,
descrição genérica do gateway) enquanto o `memo` traz o dado útil.

```js
const memo = String(sfTxn.memo || '').trim();
const description = memo || sfTxn.description || sfTxn.payee || '(no description)';
```

`.trim()` evita que um `memo` só com espaço em branco (visto em algumas
instituições) vença silenciosamente uma `description` real. Como a regra
deixou de depender do nome/org da conta, o helper `accountMatchesKeyword`
(usado só para esse propósito) foi removido — sem chamadores restantes, não
faz sentido mantê-lo à espera de um uso futuro. `accountIsIgnored` (lista de
contas ignoradas, v1.57–1.59) é independente e não foi tocado.

**Sem cascata retroativa**: só afeta linhas de syncs futuros — a descrição
das transações já importadas não muda.

Versão anterior: **v1.59.0** — **feat: card único "SimpleFin accounts" em
Settings**, consolidando os três cards antigos (Card mapping / Ignored
SimpleFin accounts / Account types) numa única tabela — uma linha por conta
do SimpleFin, com mapping de card, tipo de conta e um botão Ignorar/Unignore
por linha (confirmação em 2 cliques, sem `window.confirm`). Badge vermelho na
tab Settings quando o Sync traz conta(s) novas ainda não configuradas.

- **`lib/simplefin.js`**: `fetchSimplefinTransactions` agora inclui contas
  ignoradas em `accountBalances` (campo aditivo `ignored: true/false`) — antes
  eram removidas por completo da resposta, o que impedia a nova tabela de
  mostrar/designorar uma conta já ignorada. Transactions/holdings/accountCount
  continuam pulando a conta ignorada, sem mudança de comportamento aí.
- **Ignorar é não-destrutivo e por `accountUrn` exato** (não mais fragmento de
  texto livre digitado à mão): grava o urn exato em `ignoredSimplefinAccounts`,
  limpa `accountMap`/`accountTypeOverrides` daquela conta, mas nunca apaga
  transações já importadas — só afeta syncs futuros, e é reversível
  (Unignore remove o urn da lista). Padrões de texto livre legados (pré-v1.59)
  continuam funcionando (`isIgnoredSimplefinAccount`/`accountIsIgnored`
  inalterados) e não são migrados automaticamente para `accountUrn` — mas a
  linha "Ignored (legacy rule)" não fica travada: o botão remove o(s)
  padrão(ões) legado(s) que casam com aquela conta (confirmação em 2 cliques
  mostra qual padrão será removido e, se ele também casar com outras contas
  sincronizadas, quantas — já que remover um padrão de texto livre pode
  afetar mais de uma conta). Depois de removido, a linha volta ao estado
  normal e o toggle Ignore/Unignore por `accountUrn` exato passa a valer —
  inclusive para re-ignorar só aquela conta.
- **`accountTypeOverrides` ganha 4 valores**: `checking` / `savings` /
  `credit` / `other` (antes só `credit`/`depository`). `depository` continua
  aceito na leitura como alias legado de `checking`/"Checking & Savings" —
  não migrado em massa no Redis. `AccountBalancesCard` (Home) agora agrupa em
  3 buckets: Credit Cards / Checking & Savings / Other, e filtra
  `!acc.ignored` explicitamente (a mudança acima tornou isso necessário, senão
  uma conta ignorada reaparecia no saldo da Home).
- **Nova config `simplefinAcknowledgedAccounts`** (`api/config.js` `LIST_KEYS`):
  lista de accountUrns que o usuário já viu/tocou na tabela. Junto com
  `accountMap`/`accountTypeOverrides`/`ignoredSimplefinAccounts`, decide se
  uma conta sincronizada conta como "nova" para o badge — cálculo 100%
  client-side (`useMemo` em App), sem endpoint novo.

Versão anterior: **v1.58.0** — **feat: Account Balances card na Home** com
saldos por conta via SimpleFin, classificação manual de tipo de conta
(credit/checking-savings) em Settings, e remoção do hardcode de exclusão da
Fidelity, substituído pela lista configurável `ignoredSimplefinAccounts`
(agora respeitada também no servidor).

Versão anterior: **v1.57.0** — **feat: lista editável de contas do SimpleFin a
ignorar** (`api/config.js`, `src/ledger.js`, `src/App.jsx`).

Contas cujas transações já chegam ao ledger por outra fonte (Credit Karma,
CSV) só produziam duplicatas a cada sync — o usuário tinha que rejeitá-las
manualmente toda vez. Até aqui a única forma de excluir uma conta era o
hardcode da Fidelity em `lib/simplefin.js` (v1.56.1), que exige um deploy por
conta. Agora é configurável na Settings.

- **Nova lista `ignoredSimplefinAccounts`** em `api/config.js`, encaixada no
  `LIST_KEYS` existente — o sanitizador já é genérico (array deduplicado de
  strings não vazias), então **não há endpoint novo nem chave nova no Redis**.
  Isso importa: o plano Vercel Hobby limita o projeto a 12 Serverless
  Functions e já estamos no teto.
- **Função pura `isIgnoredSimplefinAccount(row, patterns)`**
  (`src/ledger.js`): substring case-insensitive contra o nome da conta
  (`srcAccount`, ex. `"Chase Auto Lease (0870)"`) **e** o id estável
  (`accountUrn`) — então tanto `auto lease` quanto `0870` funcionam, e a
  regra sobrevive à instituição renomear a conta.
- **Filtro em `classifySimpleFinRows`**, que cobre os dois caminhos ("Sync
  now" e "Revisar pendentes") de uma vez: as linhas são descartadas antes de
  chegar à prévia.
- **UI**: novo `CollapsibleCard` "Ignored SimpleFin accounts" na tab Settings,
  reusando `ManagedList`. `ManagedList` também ganhou uma guarda
  (`onReorder?.()`), já que antes ele quebrava se a lista não fosse
  reordenável.
- Em `applyConfig`, esta lista **não** leva o guarda `&& length` das demais:
  array vazio aqui significa "não ignorar nada", não "não configurado" —
  sem isso, remover o último padrão não teria efeito.

**Sem cascata retroativa**, mesmo padrão das outras seções de regra: só afeta
syncs futuros, nada do que já foi importado muda. O hardcode da Fidelity
continua no servidor (também mantém a fila do cron menor, o que é relevante
depois do incidente de memória da v1.56.5).

Versão anterior: **v1.56.5** — **fix: Redis estourou `maxmemory` por causa dos
snapshots diários e o ledger ficou impossível de salvar**
(`api/transactions.js`).

**Causa raiz encontrada** (o diagnóstico da v1.56.4 é que a revelou — a
mensagem em campo foi `OOM command not allowed when used memory >
'maxmemory'. script: 5983ef… on @user_script:32`, com `9511 rows · 1944 KB`).
As v1.56.3/v1.56.4 trataram sintomas: nem dado inválido nem falta de retry
eram o problema. **O Redis estava cheio e recusava toda escrita**, o script
Lua do CAS incluído.

O consumo vinha dos **snapshots diários**: `api/transactions.js` grava uma
cópia integral do ledger por dia em `household:*:transactions:snapshot:
YYYY-MM-DD` com TTL de 30 dias. Com ~1,9 MB por cópia, isso é **~57 MB de
snapshots contra ~1,9 MB de dado vivo — 97% da memória**, e a proporção piora
conforme o ledger cresce. O ledger cresceu até bater no teto, e a partir daí
não dava mais nem para salvar nem para o Redis encolher sozinho.

- **Retenção de snapshot: 30 → 7 dias** (`SNAPSHOT_RETENTION_DAYS`). Uma
  semana de cópias diárias ainda é rede de segurança real e custa um quinto
  da memória.
- **Varredura explícita dos snapshots antigos** (`sweepOldSnapshots`).
  Baixar o TTL só afeta os snapshots novos — os já gravados manteriam a
  expiração de 30 dias e segurariam a memória por mais três semanas. As
  chaves são datas determinísticas, então a limpeza não precisa de `SCAN`
  (caro, e indisponível em alguns planos de Redis hospedado).
- **Auto-reparo na escrita.** `DEL` é um dos poucos comandos que o Redis
  ainda aceita acima do `maxmemory` (libera memória em vez de consumir), o
  que permite destravar sozinho: se a escrita falha com OOM, a requisição
  varre os snapshots antigos e tenta de novo. Persistindo o OOM, responde
  **507** com uma mensagem acionável em vez de vazar o erro cru do Redis.
- A varredura também roda **uma vez por dia** por household, junto da
  primeira gravação de snapshot do dia (o `SET NX` só passa uma vez), para
  higiene contínua sem custo por save.

Versão anterior: **v1.56.4** — **fix: save que falha por motivo transitório
nunca era re-tentado, e a razão sumia num toast de 5s** (`src/App.jsx`).

Contexto: a v1.56.3 atacou uma causa possível do "unsaved…" permanente (linha
sem data → 400). Não era essa — `repairUnsavableRows` rodou e não achou nada
para consertar, e o erro persistiu. O problema real é do **mecanismo de
recuperação**, não de um dado específico:

- **Nada re-tentava um save falho.** Os únicos gatilhos eram reconectar
  (`online`), fechar o app (`pagehide`/`visibilitychange`) ou fazer outra
  edição (`scheduleSave`). Um 5xx, timeout ou queda de rede deixava
  `dirty: true` e mais nada acontecia — a mudança voltava para o espelho
  pendente, o boot seguinte restaurava, o save falhava de novo, e o ciclo se
  repetia indefinidamente. Agora há **retry automático com backoff**
  (2s → 5s → 15s → 30s), cancelado no sucesso e rearmado a cada edição nova.
  **4xx é excluído de propósito**: o payload é que está errado, re-enviar os
  mesmos bytes falha igual.
- **A razão da falha era descartada.** Só um `setSaveError` transitório de 5s,
  e o header mostrava "● unsaved…" sem explicação — foi exatamente por isso
  que o bug precisou de várias rodadas para ser diagnosticado. Agora a falha
  vai para o banner persistente, com diagnóstico no mesmo padrão da mensagem
  de conflito 409: versão, contagem de linhas, tamanho do payload e a
  tentativa atual (ex.: `[v1.56.4 · 2.481 rows · 892 KB · attempt 2/4]`).
- **Timeout do cliente era menor que o do servidor.** O PUT abortava em 25s,
  mas `api/transactions.js` tem `maxDuration: 30` no `vercel.json` — um save
  lento porém bem-sucedido virava "falha" no cliente enquanto o servidor
  seguia escrevendo. Subiu para 35s, acima do teto do servidor.

Versão anterior: **v1.56.3** — **fix: linha do SimpleFin sem data travava TODO
save do ledger; SimpleFin vira o método padrão do Import**
(`lib/simplefin.js`, `src/ledger.js`, `src/App.jsx`).

- **Ledger permanentemente travado em "unsaved…" (crítico).**
  `mapTransaction` (`lib/simplefin.js`) emitia `date: ''` quando a transação
  chegava sem `transacted_at` **e** sem `posted` (ausente, `null` ou `0` —
  todos falsy). O `PUT /api/transactions` valida **todas** as linhas
  (`findInvalidRow`) e rejeita o **ledger inteiro** com 400 se uma só tiver
  data fora de `YYYY-MM-DD`. O resultado era terminal e silencioso: o save
  falhava, a mudança voltava para o espelho pendente do `localStorage`, o
  load seguinte restaurava e falhava de novo — "unsaved…" para sempre, com
  toda edição posterior presa atrás disso. O caminho CSV sempre se protegeu
  (`buildRow`: `if (!date) date = todayISO()`); o mapper do SimpleFin não —
  essa assimetria é o bug. Três frentes de correção: (a) `mapTransaction`
  agora cai para a data de hoje quando não há timestamp usável (e valida o
  `Date` resultante); (b) nova função pura `repairUnsavableRows` em
  `src/ledger.js`, aplicada às linhas restauradas do espelho pendente no
  `load()`, conserta data/valor inválidos (e descarta entradas que nem são
  objeto) para **destravar ledgers já envenenados**, avisando quantas linhas
  foram reparadas; (c) erro de save 4xx virou permanente em vez de um toast
  de 5s — "o servidor rejeitou este ledger" não é transitório e não pode
  sumir da tela antes de o usuário ler.
- **SimpleFin passou a ser a primeira opção e o default** do seletor de
  método da tab Import (era o terceiro, com `useState("ck")`). Reflete o uso
  real desde a v1.56.0: o sync é o caminho diário, o Credit Karma virou
  export ocasional e o CSV segue como backfill de histórico.

Versão anterior: **v1.56.2** — **fix: linhas de duplicata colapsavam na prévia
do import, e o resumo mentia depois de "Select all"** (`src/App.jsx`). Dois
bugs achados no primeiro sync real com a v1.56.x:

- **Linhas viravam traços âmbar.** Na prévia, cada linha `certain`/`uncertain`
  é envolvida por `S.importDupWrap`, que usa `overflow: "hidden"` para
  arredondar os cantos do conteúdo interno. Pela spec de flexbox, um item cujo
  `overflow` não é `visible` tem seu tamanho mínimo automático
  (`min-height: auto`) trocado por `0` — o que libera o `flex-shrink: 1`
  padrão a colapsar o item até sobrar só a borda, dentro do container da
  prévia (`S.list`, flex column, `maxHeight: 300`). Linhas comuns não têm
  `overflow`, mantêm `min-height: auto` e por isso nunca colapsaram: só as de
  duplicata quebravam, e quanto mais linhas no bucket, mais fina cada uma.
  Fix: `flexShrink: 0` em `importDupWrap` (mantendo o `overflow`, que é o que
  arredonda os cantos).
- **O resumo afirmava o default, não o estado.** Os segmentos eram
  `"{N} duplicates auto-unchecked"` e `"{N} to review (kept checked)"` —
  descrições de como a seleção *nasce*, renderizadas como se fossem fato
  corrente. Depois de um "Select all" (ou de marcar uma duplicata na mão), o
  texto seguia dizendo que as duplicatas estavam desmarcadas enquanto o botão
  importava todas — dava para importar o lote inteiro acreditando que as 123
  duplicatas tinham ficado de fora. Agora os rótulos são neutros
  (`"{N} duplicates"`, `"{N} to review"`) e um aviso vermelho
  `"⚠ {N} duplicates checked for import"` aparece sempre que uma duplicata
  `certain` estiver marcada (novo memo `dupSelectedCount`). "Select all"
  continua literal — é ação explícita do usuário —, só deixou de ser
  silenciosa.
- Bônus no mesmo diff: o resumo mostrava `"0 parsed · 169 valid"` no método
  SimpleFin, onde não existe arquivo e `rawRows` é sempre vazio. O segmento
  "parsed" agora é omitido nesse método.

Versão anterior: **v1.56.1** — **fix: SimpleFin exclui a conta Fidelity do sync
e prioriza `memo` na descrição da Amazon** (`lib/simplefin.js`). Duas regras
específicas de instituição, aplicadas em `fetchSimplefinTransactions`/
`mapTransaction` (compartilhado pelo "Sync now" e pelo cron):

- **Fidelity sempre excluída.** `accountMatchesKeyword(account, "fidelity")`
  (case-insensitive contra `account.name`/`org.name`/`org.domain` — sobrevive
  a um re-link que troque o id da conta no SimpleFin) faz a conta ser pulada
  por inteiro no loop de `fetchSimplefinTransactions`: nem transações nem
  holdings dela chegam à fila de pendências ou ao fetch ao vivo.
  `accountCount` no retorno passou a contar só contas efetivamente
  sincronizadas (antes contava `accounts.length` bruto de todas as retornadas
  pelo SimpleFin — o campo nunca foi exibido na UI, então não é mudança de
  contrato visível). Decisão de produto do usuário, não limitação da API — a
  investigação sobre o schema de `holdings` da Fidelity (ver "Modelo de
  dados") fica sem novo dado a partir daqui, já que a conta não é mais
  sincronizada.
- **Amazon usa `memo` como descrição.** Para uma conta cujo nome/org contém
  "amazon" (ex. o cartão "Amazon Card"), `mapTransaction` passa a preferir
  `sfTxn.memo` sobre `description`/`payee` — o `description` que a Amazon
  manda via SimpleFin é genérico ("Amazon.com"), enquanto o `memo` carrega o
  detalhe real do pedido. Toda outra instituição mantém a precedência normal
  (`description` primeiro, `memo` como último recurso).

`accountMatchesKeyword`/`mapTransaction` exportados de `lib/simplefin.js`
para teste direto (`lib/simplefin.test.js`, novo arquivo — 6 casos, incluindo
o fetch mockado ponta a ponta confirmando que a Fidelity some do resultado).
Nenhuma mudança de contrato de API/Redis nem do modelo de transação.

Versão anterior: **v1.56.0** — **feat: dedup cross-source no import +
categorização automática de linhas SimpleFin** (`src/ledger.js`,
`src/App.jsx`, `lib/simplefin.js`). Três frentes:

1. **Dedup cross-source** (`markDuplicates` reescrito). A mesma compra vinda
   pelo Credit Karma e depois pelo SimpleFin não era detectada (o fuzzy era
   curto-circuitado para qualquer linha com `sourceId`, e o índice era
   chaveado por conta+centavos, então uma linha `Unassigned` nunca casava com
   uma classificada). Agora: campo aditivo opcional `source` (`"ck" | "csv" |
   "sf"`) gravado no import; ids **em comum** provam duplicata sempre
   (inclusive cross-source, que é o que faz o `altSourceIds` funcionar), mas
   ids **diferentes** só provam "transações distintas" quando as fontes não
   são comprovadamente diferentes — "não provado diferente" **bloqueia**, não
   libera. Como só o SimpleFin escreve `source: "sf"` (`lib/simplefin.js`),
   uma linha sem tag é comprovadamente não-SimpleFin, e isso basta para
   decidir sem backfill: legado×ck e ck×ck bloqueiam (proteção do PR #51
   preservada para todo o histórico, que nasce sem `source`), legado×sf e
   ck×sf liberam o fuzzy. Comparar os dois campos diretamente seria um bug
   silencioso — leria legado×ck como troca de fonte e fundiria gastos
   genuinamente distintos no caminho de import diário; índice por centavos assinados, com a conta virando sinal
   pontuado; matching **1:1 com consumo**. Função pura nova
   `scoreDuplicateCandidate(a, b)` → `{ score, dayDiff, reasons }`, com gate
   rígido de centavos e `score = 100 − penalidade de data − de conta − de
   descrição` (data 0d→0, 1d→5, 2d→10, 3d→18, 4–5d→28, >5d descarta;
   conta igual→0, um lado sem conta→10, diferentes→40; descrição por Jaccard
   sobre tokens de `normalizeMerchant`+`descWords`: ≥0.6→0, ≥0.3→10, ≥1
   token→20, nenhum→35). `reasons` são frases curtas em PT — o número cru
   nunca vai sozinho à tela. Três estados na prévia do Import
   (`_dupState`): **certain** (id igual, fingerprint idêntico ou score ≥85)
   → desmarcada, badge `DUP`; **uncertain** (60–84) → **marcada**, badge
   âmbar `DUP?` + comparação lado a lado com a linha existente; **new**
   (<60) → marcada, sem badge. O default é assimétrico de propósito: falso
   positivo faz uma transação real sumir em silêncio, falso negativo só
   duplica uma linha visível e removível em massa. Quarto bucket "Review" no
   filtro do preview. Botão explícito "Marcar como duplicata da existente" na
   faixa incerta grava `altSourceIds` (array aditivo opcional) na transação
   **existente** via `updateTransaction`, então a próxima sync vira id-match
   exato. Helper novo `normalizeMerchant()` (tira prefixos de gateway `SQ *`,
   `TST*`, `PAYPAL *`, `SP `, `POS DEBIT`, `PURCHASE AUTHORIZED ON MM/DD`,
   runs de dígitos e sufixo de cidade/estado de 2 letras) — consumido só pela
   penalidade de descrição do dedup; **não** foi ligado em
   `descriptionRuleMatches` (as rules casam por substring, o ganho seria
   baixo e o risco de mudar regras salvas, alto).
2. **SimpleFin dentro do motor de regras**. A etapa de categoria do
   `buildRow` virou função pura `resolveImportCategory()` em `src/ledger.js`
   (junto com `matchOption`, que saiu do `App.jsx`), chamada também por
   `classifySimpleFinRows`. Antes, toda linha do SimpleFin entrava como
   `Other` para sempre — nunca via o mapa CK→ledger nem as Description
   rules. A precedência do PR #135 saiu byte a byte igual e está coberta por
   testes: nenhuma Description rule de-transfere por padrão; o único escape
   continua sendo regra vencedora com `allowTransferOverride: true` (que
   exige `providerPattern`).
3. **Link de contas do SimpleFin**. `accountUrn` subiu a campo de topo em
   `mapTransaction()` (`lib/simplefin.js`) — antes só existia dentro de
   `raw`, que é descartado no confirm do import, e `classifySimpleFinRows`
   passava `""` como URN, então o card map nunca se aplicava (no Chase são
   cinco cartões chamados "CREDIT CARD"). O card "Card mapping" (renomeado
   de "Card mapping (Credit Karma)") passa a listar cartões SimpleFin
   automaticamente, sem mudança de UI.

Extras: grupo D em "Suggested rules" (Settings) — "merchants stuck in
Other", agrupados por fragmento de descrição, com dismiss persistido
(prefixo `otherdesc:`) e "Create rule from this" pré-preenchendo a seção
Description rules; nasce pulando linhas já cobertas por rule vigente (senão
inundaria com todo o histórico SimpleFin pré-fix). Fix: a prévia do import
agora respeita o olho de privacidade (`money`/`hideValues` threaded até
`ImportTransactions`, que imprimia `usd.format` cru). Sem mudança de
contrato de API/Redis; `source`, `altSourceIds` e `accountUrn` são campos
aditivos opcionais.

Versão anterior: **v1.55.0** — **feat: login via Google OAuth (Google Identity
Services), substitui a senha de app compartilhada** (`lib/auth.js`,
endpoint `POST /api/config?googleLogin=1` (dobrado em `api/config.js` para
respeitar o limite de 12 Serverless Functions do Vercel Hobby), `src/App.jsx`,
`index.html`). Allowlist fixa de 2
emails (`pnetto@gmail.com`, `belasp@hotmail.com`, via env `ALLOWED_EMAILS`).
O client carrega o script `accounts.google.com/gsi/client` (tag, sem
dependência nova) e troca o ID token do Google por uma sessão própria do
servidor (token opaco de 32 bytes, guardado em Redis
`household:session:<token>`, TTL 30 dias, enviado depois via header
`x-session-token` em vez de `x-app-password`). Isso evita repetir o bug da
v1.30.0 (ID token do Google expira em ~1h e o app fica aberto por horas —
saves falhavam silenciosamente); agora o ID token só é usado uma vez, no
login. `storageKey` continua fixo e compartilhado entre os dois emails —
derivado da mesma seed de antes (`APP_PASSWORD`/`HOUSEHOLD_ID`), só que não é
mais usado para autenticar, apenas para nomear a chave no Redis — nenhuma
migração de dado foi necessária. Envs novas: `GOOGLE_CLIENT_ID` (server,
valida `aud` do token contra o tokeninfo do Google),
`VITE_GOOGLE_CLIENT_ID` (client, id do botão), `ALLOWED_EMAILS` (opcional,
default já cobre os 2 emails). `APP_PASSWORD` não é mais checado como
credencial (pode continuar setado no Vercel — só é lido, se presente, para
reproduzir a mesma `storageKey` de antes).

Versão anterior: **v1.54.0** — **remove: tab "SimpleFin" (preview)**
(`src/App.jsx`). Removidos `TABS` entry `preview`, o branch de render que
montava `SimpleFinPreview`, e os componentes `SimpleFinPreview`,
`SimpleFinHoldingsSection`, `SF_RAW_COLUMN_ORDER`, `useSfRawTable` e
`SfRawTable` (únicos consumidores exclusivos). Não afeta o fluxo de sync
automático (`classifySimpleFinRows`, `syncSimpleFin`,
`loadSimpleFinPending`, o card "SimpleFin (auto)" em `ImportTransactions`,
nem as rotas/API server-side do SimpleFin).

Versão anterior: **v1.53.1** — **fix: Daily Spending Pace com dimensões
erradas no cold load mobile** (`src/App.jsx`, `DailyPaceCard`). No primeiro
carregamento no celular, o card às vezes renderizava o gráfico com o
tamanho errado (achatado/cortado), corrigindo sozinho só ao trocar de tab ou
alternar Income/Expense. Causa: `ResponsiveContainer` (recharts) mede o
container só uma vez, no mount; como `DailyPaceCard` monta no exato
instante em que o fetch inicial termina, essa medição podia acontecer antes
do layout mobile assentar (resize da toolbar do browser, resolução de
`100lvh`), travando o chart num tamanho transiente errado. Fix: o card agora
adia a montagem do `ResponsiveContainer` com `useState`+`useEffect` (double
`requestAnimationFrame`, já que um frame só pode não bastar no Safari iOS),
mostrando um placeholder vazio com a mesma altura (`height: 220`) até o
layout assentar. Escopo limitado a este componente — não mexe em
`dashboardPaceData`, `TabErrorBoundary`/`key={tab}`, `index.html`/`100lvh`,
nem em outros gráficos.

Versão anterior: **v1.53.0** — **feat: tab SimpleFin mostra `account.holdings`
cru** (`lib/simplefin.js`, `api/simplefin-sync.js`, `src/App.jsx`).
Investigação em andamento: a conta Fidelity "Individual - TOD" não reporta
trades de compra/venda de stock nem compra/maturidade de bond em
`account.transactions` via SimpleFin — só dividend/interest/reinvestment-
cash/transferência aparecem lá. Esses eventos, se existirem via SimpleFin,
só podem estar em `account.holdings`, um array irmão de `transactions` no
mesmo response `GET <access-url>/accounts` que o código nunca lia. Etapa 1
(esta versão): `fetchSimplefinTransactions()` (`lib/simplefin.js`) agora
também lê `account.holdings` de cada conta (mesmo padrão de
"array-ou-ausente" já usado para `transactions`, pula holdings sem `id`) e
mapeia cada um com `mapHolding()` — interpretação mínima, análoga a
`mapTransaction`: só `{ id, sourceId, raw }`, com `raw` preservando o objeto
original da SimpleFin mais os metadados de conta/org já usados no `raw` de
transactions (`accountId`, `accountName`, `accountCurrency`, `orgName`,
`orgDomain`) — nenhuma tentativa de inferir "compra"/"venda"/"maturidade" ou
derivar uma data de evento ainda (isso fica para a Etapa 2, depois que o
schema real dos dados da Fidelity for observado). O retorno de
`fetchSimplefinTransactions()` ganhou a chave `holdings` (ao lado de
`transactions`/`accountCount`/`errors`), e `GET /api/simplefin-sync` (sem
`?pending=1`) agora inclui `holdings` na resposta JSON — só a busca ao vivo
retorna holdings, a fila `?pending=1` do cron continua transactions-only
(fila é append-only por natureza; holdings é um snapshot do estado atual da
conta, não um evento incremental, então não faz sentido empilhar lá; `api/
cron/simplefin-sync.js` não foi tocado). Na tab SimpleFin, nova sub-seção
**"Holdings"** abaixo da tabela de transactions existente, com fetch/estado
(loading/error/rows) próprios e independentes da tabela de cima — sempre
via busca ao vivo (`GET /api/simplefin-sync`, nunca `?pending=1`, já que a
fila nunca traz holdings), disparada ao montar a tab e com botão próprio
"Atualizar holdings". Tabela crua no mesmo padrão visual/de interação da
tabela de transactions (colunas derivadas da união de chaves em `raw` entre
as linhas carregadas, `id` primeiro e o resto alfabético — sem uma "ordem
preferida" chutada, já que o schema real ainda não é conhecido; clique no
cabeçalho ordena asc → desc → sem-sort, numérico quando o valor é número;
campo de texto abaixo do cabeçalho filtra por substring case-insensitive).
A mecânica de "colunas derivadas de raw + sort + filtro + tabela sticky-
header", que já existia quase idêntica só para a tabela de transactions,
foi extraída para um hook `useSfRawTable(rows, { preferredOrder,
extraColumns })` + componente `<SfRawTable columns={...} rows={...} .../>`
reutilizados pelas duas tabelas (a de transactions passou a chamar esse
mesmo hook/componente, sem mudança de comportamento visível) —
`formatSfRawCell`/`compareSfValues` (funções de módulo já isoladas) seguem
como estavam. **Próximo passo (Etapa 2, fora de escopo desta versão)**:
com os dados reais de `holdings` observados, decidir como (e se) inferir
eventos de compra/venda/maturidade — provavelmente via diff/snapshot entre
syncs sucessivos, já que holdings é um estado pontual, não um log de
eventos.

Versão anterior: **v1.52.0** — **feat: tab SimpleFin (ex-Preview) com sort e
filtro por coluna** (`src/App.jsx`). A tab mudou de nome de "Preview" para
"SimpleFin" na navegação (label e `h3` interno). A tabela crua ganhou uma
segunda linha de cabeçalho com um campo de texto por coluna (filtro por
substring, case-insensitive, aplicado ao valor já formatado da célula) e
clique no nome da coluna ordena por ela (asc → desc → sem ordenação,
numérico quando o valor é número, alfabético caso contrário) — tudo
client-side, sem re-fetch. Colunas raw e as duas colunas de sugestão
(conta/categoria) usam o mesmo mecanismo.

Versão anterior: **v1.51.1** — **fix: tab Preview funciona sem depender do
cron** (`src/App.jsx`). A tab só lia a fila `household:*:simplefin-pending`
— populada exclusivamente pelo cron diário — então ficava vazia até o
primeiro cron bem-sucedido rodar (ex. logo após corrigir os bugs de
`start-date`/credenciais na URL, v1.50.1/v1.50.2). Agora, se a fila vier
vazia, a tab automaticamente cai para uma busca ao vivo (mesmo endpoint do
"Sync now" do Import); também ganhou um botão manual **"Buscar ao vivo"** e
um indicador de fonte ("fila do cron diário" vs. "busca ao vivo (agora)").

Versão anterior: **v1.51.0** — **feat: tab Preview mostra os campos crus do
SimpleFin** (`lib/simplefin.js`, `src/App.jsx`). `mapTransaction()` agora
preserva o objeto original do SimpleFin inteiro (mais metadados de conta/org
— `accountId`, `accountName`, `accountBalance`, `orgName` etc.) num campo
`raw`, e a tab Preview foi reescrita para uma tabela com uma coluna por
campo (ordem: campos conhecidos primeiro, qualquer campo extra/institucional
sob `extra` depois, alfabético) mais duas colunas finais com a conta/categoria
que o app sugeriria — dá pra comparar a estrutura crua da API com a
classificação lado a lado. `raw` é estritamente um campo de inspeção: o
`confirm()` do Import agora o remove explicitamente (`{ _dup, raw, ...t }`)
antes de gravar no ledger, então ele nunca polui o modelo de transação
persistido.

Versão anterior: **v1.50.2** — **fix: remove credenciais da URL antes do fetch
do SimpleFin** (`lib/simplefin.js`). O `fetch()` do Node/Vercel (undici)
recusa construir uma requisição a partir de uma URL que ainda carrega
`usuário:senha@host` embutidos — mesmo enviando a mesma credencial via
header `Authorization` — e falhava com "Request cannot be constructed from
a URL that includes credentials". Agora o `username`/`password` são lidos
da Access URL para montar o header Basic Auth e depois removidos da URL
antes do `fetch`, corrigindo tanto o "Sync now" manual quanto o cron.

Versão anterior: **v1.50.1** — **fix: SimpleFin busca últimos 30 dias**
(`lib/simplefin.js`). A chamada a `<access url>/accounts` não passava
nenhum parâmetro de data, e o SimpleFin Bridge por padrão retorna pouca ou
nenhuma transação sem um `start-date` explícito — por isso a fila de
pendências e a tab Preview apareciam vazias. Agora a requisição inclui
`start-date=<epoch de 30 dias atrás>`, aplicado tanto ao "Sync now" manual
quanto ao cron diário (mesma função compartilhada `fetchSimplefinTransactions`).

Versão anterior: **v1.50.0** — **feat: nova tab Preview — vitrine read-only da
fila de pendências do SimpleFin** (PR #216, branch
`claude/household-simplefin-preview-tab`). Nova tab "Preview" (ícone `Eye`),
logo após Import na navegação principal, que busca automaticamente
(sem clique) `GET /api/simplefin-sync?pending=1` ao entrar na tela, classifica
as transações pendentes com o novo helper `classifySimpleFinRows(transactions,
accountMap)` (extraído de `src/App.jsx`, mesma lógica de sugestão de
conta/categoria antes duplicada nos fluxos "Sync now" e "Revisar pendentes"
do Import) e renderiza a lista via `TxnRow`, com aviso fixo de que as
sugestões não estão confirmadas. **100 % read-only por decisão de
produto**: nenhuma ação de escrita (editar/deletar/selecionar/confirmar) —
para importar de fato, o fluxo continua sendo a tab Import ("Sync now" /
"Revisar N pendentes"), inalterado. Ver seção "UI" para detalhes de estados
vazio/erro/loading.

Versão anterior: **v1.49.0** — **feat: SimpleFin Fase 2 — sync automático via
cron + fila de pendências** (PR #215, branch
`claude/simplefin-credit-karma-automation-722ffq`). Lógica de fetch
extraída para `lib/simplefin.js` (`fetchSimplefinTransactions()`,
reaproveitada por `api/simplefin-sync.js` sem mudar o contrato externo).
Novo `api/cron/simplefin-sync.js`, acionado 1x/dia pelo Vercel Cron
(`vercel.json`, `"0 9 * * *"` UTC), protegido por `Authorization: Bearer
<CRON_SECRET>` (fail-safe: sem a env var, sempre 401). O cron busca as
transações e faz merge append-only por `id` numa chave Redis **separada**,
`household:<storageKey>:simplefin-pending` — nunca escreve na chave
principal de transações. `api/simplefin-sync.js` também expõe a fila via
`?pending=1` (GET/DELETE, autenticado via `x-app-password` como os demais
endpoints) — dobrado no mesmo arquivo em vez de um endpoint separado, para
respeitar o limite de 12 Serverless Functions do plano Vercel Hobby
para o client. Na tab Import, um aviso mostra "N transações pendentes de
revisão" com botão "Revisar N pendentes" que injeta a fila no mesmo
pipeline de prévia/dedup/confirmação já usado pelos outros métodos; após
confirmar, a fila é limpa via DELETE. **Decisão de produto deliberada**: a
gravação no ledger continua 100% manual — o cron nunca escreve
diretamente nas transações, só popula a fila de pendências para revisão.
Ver Roadmap Fase 7 e seção "UI" (tab Import) para detalhes.

Versão anterior: **v1.48.0** — **feat: Sync automático via SimpleFin (Fase 1)**
(PR #213, branch `claude/simplefin-credit-karma-automation-722ffq`). Novo
endpoint `api/simplefin-sync.js` (GET autenticado, read-only, credencial via
env var `SIMPLEFIN_ACCESS_URL`) que mapeia transações da SimpleFin Bridge
para o shape padrão do projeto; terceiro card "SimpleFin (auto)" na tab
Import reaproveitando o pipeline de prévia/dedup já existente. Escopo
cortado para depois (Fase 2): cron real, UI de credencial na Settings,
reconciliação silenciosa. Ver Roadmap Fase 7 e seção "UI" (tab Import) para
detalhes.

Versão anterior: **v1.47.1** — **fix: CAUSA RAIZ do 409 eterno — cjson do CAS
Lua engasgava com surrogate solto no blob**. O diagnóstico de campo da
v1.47.0 (`[other write ? by old-vers · merge failed: put 409]`) entregou o
bug: o blob armazenado tinha `savedAt`/`clientId` ilegíveis PARA O LUA.
Reproduzido em laboratório: um único surrogate UTF-16 sem par numa
descrição (ex.: emoji cortado por truncamento de CSV) passa ileso pelo
`JSON.parse` do JS mas faz `cjson.decode` falhar no blob INTEIRO — o CAS
(v1.35.0) lia `stored=''`, nunca batia com nenhum `expectedSavedAt`, e
TODO save otimista levava 409 para sempre (o "conflito" nunca foi outro
dispositivo). Correção em 3 partes em `api/transactions.js`: (1) o CAS
não decodifica mais JSON — `savedAt|clientId` vivem numa chave lateral
`<key>:meta` que o Lua compara como string pura (`KEYS[2]`; migração: GET
faz seed da meta a partir do parse JS tolerante, `SET NX`; fallback Lua
sem meta: decode antigo, e se ATÉ o decode falhar — o ledger travado — o
write é aceito uma vez para curar); (2) `sanitizeStrings` no PUT troca
surrogates sem par por U+FFFD antes de gravar, então o blob volta a ser
JSON válido para qualquer parser (o dado corrompido é higienizado no
primeiro save pós-deploy); (3) caminho legacy sem `expectedSavedAt`
também mantém a meta. Validação: teste do handler real contra Redis
reproduzindo o estado travado de produção — GET lê e faz seed, save
destrava, blob volta a ser cjson-decodável, 409 informativo para
conflito real, perdão same-client e fallbacks legacy intactos (11/11).
**Confirmado em produção**: import do Credit Karma no iPhone, que vinha
falhando desde o lote de 18/07, funcionou após este deploy — fecha a
sequência v1.44.8→v1.47.1 de tentativas sobre o mesmo sintoma.

Versão anterior: **v1.47.0** — **feat: resync ao voltar ao app + merge com
retry + diagnóstico no conflito**. Contexto: TODO o maquinário de conflito
(409/`expectedSavedAt` do pack v1.35.0, pending queue v1.41.0) entrou em
produção num único lote de 23 versões em 18/07 — antes disso o erro
"updated on another device" era impossível (last-write-wins), o que
explica o problema ter "aparecido de ontem para hoje". Três mudanças:
(1) **Resync on return** — ao voltar a ficar visível/focado, se nada está
sujo/em voo e o último load tem >10s, o app refaz o GET em silêncio
(`load({silent:true})`, sem spinner) e adota `savedAt`/dados atuais; o
fluxo típico do iPhone (sair p/ rodar o bookmarklet CK, voltar, importar)
deixava o app com timestamp velho e o import nascia condenado ao 409.
(2) O merge de três vias (v1.46.0) agora tenta **até 3 vezes** (GET→merge→
PUT) antes de cair no fallback. (3) O fallback agora mostra **diagnóstico
no próprio erro**: `[vX · this device abc · other write HH:MM:SS by def ·
merge failed: motivo]` — o 409 do servidor passou a devolver também o
`clientId` de quem gravou (Lua retorna `{0, savedAt, clientId}`), então
uma recorrência em campo identifica sozinha o dispositivo/motivo. Versão
do header centralizada na constante `APP_VERSION`. `AbortSignal.timeout`
também no GET de load. Sem mudança de modelo; 409 ganha campo `clientId`.

Versão anterior: **v1.46.0** — **feat: merge de três vias em conflito de save
(fim do "please redo your last change")**. Mesmo com o perdão por
`clientId` (v1.44.8), um 409 legítimo — outra instância/dispositivo gravou
depois do load desta — descartava a mudança local inteira ("server wins")
e pedia para o usuário refazer; com duas instâncias abertas, o dispositivo
mais lento perdia um import inteiro toda vez. Agora o cliente guarda o
último estado conhecido do servidor (`baseTransactionsRef`, atualizado no
load e a cada save OK) e, no 409, busca o estado atual do servidor, faz um
**merge de três vias** (`mergeTransactions` em `src/ledger.js`, com testes
de unidade) e grava o resultado sobre o `savedAt` novo. Regras por linha
(identidade = `t.id`): adição local e adição do servidor são mantidas
(locais na frente, como `addTransactions`); deleção local vence edição do
servidor; deleção do servidor vence linha local intocada, mas NÃO derruba
linha editada localmente; edição de um lado só vence; edição dos dois
lados → local vence. Sucesso mostra "Changes from another device were
merged with yours."; se o merge também levar 409 (terceiro escritor
correndo), cai no comportamento antigo (reload + redo). Também: timeout de
25s (`AbortSignal.timeout`) nos PUT/GET de save — um fetch suspenso pelo
iOS segurava o lock de serialização (v1.44.8) para sempre e travava todos
os saves futuros; se o PUT tiver chegado e só a resposta se perdeu, o
retry cai no perdão por `clientId`. Sem mudança de API/modelo.

Versão anterior: **v1.45.0** — **feat: auto-lock por inatividade (30 min)**
(branch `claude/credit-karma-sync-error-ep76xi`, mesmo PR do fix v1.44.8).
A senha do app ficava no `localStorage` para sempre — quem pegasse o
dispositivo desbloqueado tinha o ledger aberto. Agora, após 30 minutos sem
interação (`IDLE_LOGOUT_MS`, `src/App.jsx`), a senha armazenada é removida
e a tela de login volta, com aviso "Signed out after 30 minutes of
inactivity.". Mecânica: timestamp `household_last_active` no `localStorage`
(compartilhado entre abas — atividade em qualquer aba conta), atualizado
com throttle de 30s em `pointerdown`/`keydown`; expiração checada (1) no
boot, antes de renderizar qualquer dado (dispositivo parado por dias pede
senha ao abrir), (2) ao voltar a ficar visível (`visibilitychange`, checada
ANTES de contar o toque de retorno como atividade) e (3) a cada 60s com a
aba aberta. O pending mirror NÃO é limpo no lock — trabalho não salvo
sobrevive e é restaurado/salvo após o próximo login (mesmo caminho do
fechamento offline). É um lock de cliente (o servidor segue validando a
mesma senha compartilhada por request) — protege dispositivo
perdido/esquecido aberto, não substitui rotação de senha. Sem mudança de
API/Redis/modelo de transação.

Versão anterior: **v1.44.8** — **fix: falso conflito "updated on another
device" causado pelo próprio dispositivo (iOS)** (branch
`claude/credit-karma-sync-error-ep76xi`). O 409 de concorrência otimista
(v1.30.0) disparava sem nenhum outro dispositivo envolvido, tipicamente ao
importar CSV do Credit Karma no iPhone: (1) o flush com `keepalive` em
`visibilitychange`/`pagehide` gravava no servidor, mas o iOS suspendia a
página antes de a resposta chegar — o cliente ficava com o `savedAt` velho
e o save seguinte levava 409 do próprio write anterior; (2) um segundo PUT
podia disparar com o primeiro ainda em voo, enviando `expectedSavedAt`
obsoleto. Correção em três partes: (a) cada page-load gera um `clientId`
(não persistido — abas distintas continuam conflitando entre si), enviado
em todo PUT e gravado no blob (`{ transactions, savedAt, clientId }`); o
CAS Lua em `api/transactions.js` perdoa o mismatch de `savedAt` quando o
blob armazenado foi escrito pelo MESMO `clientId` (o estado em memória do
cliente já contém aquele write — nada é sobrescrito; proteção entre
dispositivos intacta, clients antigos sem `clientId` mantêm o comportamento
anterior); (b) saves serializados no cliente — um PUT em voo por vez, fila
de 1 com o `next` mais recente, descartada em 409/401 (um queued pós-409
dispararia com `savedAt` fresco e sobrescreveria o "server wins"); (c) no
boot, pending mirror idêntico aos dados do servidor é descartado em
silêncio (o save aconteceu, só a resposta se perdeu) em vez do aviso
"discarded because the ledger was updated elsewhere". Sem mudança de
modelo de transação; PUT ganha campo opcional `clientId` (back-compat).

Versão anterior: **v1.44.7** — **ui: LM/LY ao lado do NET no card hero da
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
| Auth          | Google Identity Services (OAuth) + sessão opaca no Redis |
| Deploy        | Vercel                                                 |

### Estrutura de pastas

```
household-ledger/
├── api/
│   ├── transactions.js             # GET/PUT do ledger (auth obrigatória)
│   ├── budgets.js                  # GET/PUT de orçamentos por categoria
│   ├── account-map.js              # GET/PUT do mapa accountURN -> conta
│   ├── account-aliases.js          # GET/PUT dos aliases de conta (fragmentos por marca)
│   ├── config.js                   # GET/PUT das listas de contas/categorias; dobra POST ?googleLogin=1
│   ├── ck-category-map.js          # GET/PUT do mapa categoria CK -> categoria ledger
│   ├── category-description-rules.js # GET/PUT das Description rules
│   ├── dismissed-suggestions.js    # GET/PUT dos cards dispensados em "Suggested rules"
│   ├── apple-daily-cash-rule.js    # GET/PUT da regra Apple Card Daily Cash
│   ├── snapshots.js                # GET read-only dos snapshots diários
│   ├── simplefin-sync.js           # GET sync manual; dobra ?pending=1 (GET/DELETE da fila do cron)
│   └── cron/simplefin-sync.js      # Vercel Cron Job diário, grava a fila do SimpleFin
├── tools/
│   └── credit-karma/       # exportadores CK (bookmarklet Safari + Scriptable)
├── lib/
│   ├── auth.js             # login Google (uma vez) + sessão opaca + allowlist
│   ├── redis.js            # singleton ioredis
│   └── simplefin.js        # cliente/mapeamento da API SimpleFin
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

**Autenticação via Google Identity Services** (reinstated na v1.55.0, depois
de ter sido removida na v1.30.0 — ver os dois changelogs no topo do
documento para o histórico completo). O client troca o ID token do Google
(usado uma única vez, no login) por uma sessão própria do servidor: token
opaco de 32 bytes, guardado em Redis (`household:session:<token>`, TTL 30
dias), enviado em todo request seguinte via header `x-session-token`
(`lib/auth.js`, `authenticate()`). Allowlist fixa de 2 emails
(`pnetto@gmail.com`, `belasp@hotmail.com`, configurável via env
`ALLOWED_EMAILS`). `APP_PASSWORD` **não é mais checado como credencial** —
segue lido, se presente, só para reproduzir a mesma `storageKey` de antes
(sem ele, cai para `HOUSEHOLD_ID` ou um fallback fixo).

A chave de armazenamento continua fixa e compartilhada entre os dois
emails, derivada da mesma seed de sempre (`APP_PASSWORD`/`HOUSEHOLD_ID`) via
`auth.storageKey`, formato legado `portfolio:pwd:<hash>:holdings` (o hash é
o mesmo de antes — nenhum dado mudou de lugar com a reintrodução do Google
login); em `api/transactions.js` ela é reescrita para o namespace do
household:

```
portfolio:pwd:<hash>:holdings    ->  household:pwd:<hash>:transactions
```

Assim o ledger nunca colide com nenhum blob de portfolio.

**Concorrência (v1.30.0)**: o PUT de `/api/transactions` é otimista — o
client envia `expectedSavedAt` (o `savedAt` que carregou/salvou por último)
e o server responde **409** se o valor persistido divergir (outro
dispositivo salvou no meio). O client então recarrega do server e avisa o
usuário para refazer a última mudança. Clientes sem o campo mantêm o
last-write-wins antigo (back-compat).

**Snapshots (v1.30.0; TTL reduzido de 30 → 7 dias na v1.56.5 após um
incidente de `maxmemory` no Redis — ver changelog v1.56.5)**: o primeiro PUT
bem-sucedido de cada dia (UTC) grava uma cópia imutável em
`household:*:transactions:snapshot:YYYY-MM-DD` com TTL de 7 dias
(`SET NX` — só o primeiro estado do dia; `sweepOldSnapshots` varre
explicitamente snapshots fora da janela, já que baixar o TTL só afeta
gravações novas). Aditivo, nunca lido pelo app; rede de segurança contra um
save/restore ruim (restauração manual via Redis).

**Fila de pendências do SimpleFin cron (v1.49.0)**: chave Redis auxiliar
`household:<storageKey>:simplefin-pending`, payload `{ transactions: [...],
lastFetchAt }`. Totalmente separada da chave principal
`household:*:transactions` — não faz parte do contrato de dados de
transações propriamente dito. Escrita apenas por
`api/cron/simplefin-sync.js` (merge append-only por `id`, nunca sobrescreve
o histórico da fila); lida/limpa via GET/DELETE em
`api/simplefin-sync.js?pending=1` (mesmo arquivo do sync manual, para não
estourar o limite de Serverless Functions do plano Hobby). A gravação no
ledger real segue manual — a
fila só existe para alimentar a tela de revisão/import na tab Import.

### Variáveis de ambiente

| Variável                 | Uso                                              |
| ------------------------ | ------------------------------------------------ |
| `REDIS_URL`              | conexão Redis                                    |
| `APP_PASSWORD`           | legado — só deriva a `storageKey` compartilhada; não autentica mais nada desde a v1.55.0 |
| `SIMPLEFIN_ACCESS_URL`   | credencial SimpleFin Bridge (v1.48.0)            |
| `CRON_SECRET`            | protege `api/cron/simplefin-sync.js` (v1.49.0); precisa ser configurada manualmente na Vercel — sem ela o endpoint sempre responde 401 (fail-safe) |
| `GOOGLE_CLIENT_ID`       | login Google (v1.55.0, server) — valida o `aud` do ID token contra o tokeninfo do Google |
| `VITE_GOOGLE_CLIENT_ID`  | login Google (v1.55.0, client) — id do botão/GIS  |
| `ALLOWED_EMAILS`         | login Google (v1.55.0, opcional) — allowlist; default já cobre os 2 emails da casa |

*(`ADMIN_EMAILS`/`VITE_ADMIN_EMAILS` seguem sem uso desde a v1.30.0 — podem
ser apagadas do projeto na Vercel. `GOOGLE_CLIENT_ID`/`ALLOWED_EMAILS`/
`VITE_GOOGLE_CLIENT_ID` tinham sido removidas junto naquela versão, mas
voltaram a ser usadas com a reintrodução do login Google na v1.55.0.)*

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
  "autoCategory": "Groceries", // opcional — categoria computada por buildRow no import (snapshot)
  "source": "ck",              // opcional (v1.56.0) — feed de origem: "ck" | "csv" | "sf"
  "altSourceIds": ["9"],       // opcional (v1.56.0) — ids de OUTRAS fontes confirmados como a mesma transação
  "categorySource": "learned", // opcional (v1.65.0) — 'rule' | 'learned' | 'confirmed'; ausente = categoria real/desconhecida
  "categoryConfidence": 0.82,  // opcional (v1.65.0) — 0–1, confiança da classificação automática
  "categoryReason": "..."      // opcional (v1.65.0) — texto explicativo da classificação (tooltip)
}
```

**`categorySource`/`categoryConfidence`/`categoryReason` (v1.65.0–v1.67.0,
classificação automática por memória de comerciante — ver "Versão atual"/
"Versão anterior" no topo e o Roadmap).** Aditivos e opcionais, gravados por
`resolveImportCategory` (`src/ledger.js`) no import. `categorySource: 'rule'`
= veio de uma Description rule/mapa CK; `'learned'` = palpite da memória de
comerciante, ainda não revisado; `'confirmed'` = um `'learned'` que o
usuário validou (via `ConfirmCategoryButton`/`confirmLearned`, sem alterar a
categoria). Linhas `'learned'` são excluídas do treino
(`isMemoryTrainableRow`), evitando que um palpite errado se auto-reforce a
cada import; confirmar (`'learned'` → `'confirmed'`) devolve a linha ao
conjunto de treino — é justamente para isso que o ✓ existe. Editar a
categoria
manualmente limpa os três campos (junto com `categoryManual`/`autoCategory`
sendo setados normalmente).

**`source`/`altSourceIds` (v1.56.0).** Ambos aditivos e opcionais; nenhum
altera o contrato de `/api/transactions` nem o formato Redis, e
`mergeTransactions` não sabe nada sobre eles (opera sobre o objeto inteiro,
por `id` — permanece agnóstico de schema por princípio).

`source` é gravado **no import**, por `buildRow` (`"ck"`/`"csv"` conforme o
profile) e por `classifySimpleFinRows`/`mapTransaction` (`"sf"`). Serve
exclusivamente ao dedup: dois `sourceId` diferentes só significam
"transações distintas" quando vêm do mesmo espaço de ids. **Todo o histórico
anterior à v1.56.0 não tem o campo** — e a regra é escrita para isso: "não
provado diferente" bloqueia. Como só o SimpleFin escreve `"sf"`, uma linha
sem tag é comprovadamente não-SimpleFin, o que basta para decidir sem
backfill nem migração. Comparar os dois campos com `===`/`!==` direto seria
um bug silencioso — leria legado×`"ck"` como troca de fonte e fundiria
gastos genuinamente distintos no import diário, quebrando a garantia do
PR #51 justamente para os dados que já existem.

`altSourceIds` é gravado **em runtime**, na transação **já existente**, quando
o usuário clica "Marcar como duplicata da existente" na faixa `uncertain` da
prévia de import (via `updateTransaction`, sem endpoint novo). É o mecanismo
que faz a incerteza decair: o que hoje exige julgamento humano vira, na
próxima sincronização, um id-match exato de custo zero.

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
v1.17.0/PR #128 movida para o final da tab, com menos destaque; **desde a
v1.63.0/PR #248** fundida com "Account aliases" num único card, ver UI),
edita esse mapa por token (dropdown das categorias correntes + `Transfer` +
`Other Income`) — sem preview de impacto e sem cascata retroativa: a mudança
só afeta **novos imports** a partir de então (decisão confirmada com o
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

A seção **Description rules**, na tab **Settings** (posição 2, logo após
"Suggested rules" desde a v1.63.0/PR #248; **desde a v1.63.0** também em
formato de tabela compacta, mesmo padrão de `TxnTable`, em vez de cards
empilhados), permite add / edição inline / delete com confirmação em 2
cliques / reordenar (↑/↓, já que a ordem é semântica); o select de
categoria de destino não lista `Transfer`;
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
padrão dos orçamentos). Alimenta `classifyAccount` no import. Até o PR #128
(v1.17.0) essa seção vivia dentro do `SettingsModal` (engrenagem no header,
removido); depois passou a ser editável pela seção dedicada **Card mapping**
(`AccountMapSection`) na tab **Settings**. **Desde a v1.59.0 (PR #240)**,
`AccountMapSection` foi removida: o mapping por conta passou a ser uma
coluna (select) dentro da tabela única `SimplefinAccountsSection` — uma
linha por conta vista via SimpleFin (ver "Consolidação em tabela única
'SimpleFin accounts'" abaixo e UI). O contrato de `/api/account-map.js` e o
formato do mapa no Redis não mudaram.

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

**Status dot por conta** (verde = já mapeada, âmbar = não mapeada) — era
exibido pelo `AccountMapSection` (um card por conta); **desde a v1.59.0**
esse dot vive na linha da tabela `SimplefinAccountsSection` (ver UI).

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
o rótulo legível. Até a v1.58.0, a UI ficava na seção **Card mapping**
(`AccountMapSection`) dentro da tab **Settings** — desde o PR #128
(v1.17.0) não havia mais engrenagem/modal, a seção era renderizada
diretamente na tab: listava os cartões vistos (emissor · ••últimos-4 ·
contagem), com um select de conta por cartão e **Save & apply** para
aplicar nas transações existentes (por URN) e em todos os imports futuros.
**Desde a v1.59.0 (PR #240)**, esse card foi removido e o mapping virou
uma coluna (select de `ACCOUNTS` + "— Unassigned —") por linha da tabela
única `SimplefinAccountsSection` (ver "Consolidação em tabela única
'SimpleFin accounts'" abaixo e UI) — mesma persistência por URN em
`/api/account-map`, agora aplicada linha a linha em vez de um `Save &
apply` único para todos os cartões.

### Classificação de tipo de conta SimpleFin + `ignoredSimplefinAccounts` no servidor (v1.58.0, PR #238)

- **Novo campo `accountTypeOverrides`** em `/api/config.js` (GET/PUT,
  `household:USERID:config`): à época, `{ [accountUrn]: "credit" |
  "depository" }`. Alimenta exclusivamente o agrupamento do
  `AccountBalancesCard` (ver UI, tab Home) — conta sem override entra em
  "Checking/Savings" por padrão. Não é usado por `classifyAccount`/import;
  não altera o modelo de transação nem cria endpoint novo (mesmo arquivo
  `api/config.js`). Editável pela nova seção **Account types** na tab
  Settings (ver UI). *(Valores aceitos e UI evoluem na v1.59.0 — ver
  abaixo.)*
- **`ignoredSimplefinAccounts` passou a ser lido também no servidor**
  (antes só filtrava client-side em `classifySimpleFinRows`, v1.57.0):
  `fetchSimplefinTransactions` (`lib/simplefin.js`) agora recebe
  `ignoredPatterns` a partir da mesma lista salva em `/api/config.js` e
  filtra **transações, holdings e accountBalances** antes de retornar —
  não só transações. Isso substitui o hardcode de exclusão da conta
  Fidelity (v1.56.1), removido nesta versão: instalações que dependiam
  desse hardcode precisam adicionar `"fidelity"` na lista "Ignored
  SimpleFin accounts" em Settings para manter o comportamento anterior.
- **`api/simplefin-sync.js`** (GET normal, sem `?pending=1`) passou a
  retornar também `accountBalances` na resposta, consumido pelo
  `AccountBalancesCard`.

### Consolidação em tabela única "SimpleFin accounts" (v1.59.0, PR #240)

As três seções separadas de Settings que operavam sobre as contas do
SimpleFin — **Card mapping** (`AccountMapSection`), **Ignored SimpleFin
accounts** (`CollapsibleCard` com `ManagedList`, v1.57.0) e **Account
types** (`AccountTypeOverridesSection`, v1.58.0) — foram **removidas** e
substituídas por uma única tabela `SimplefinAccountsSection`, uma linha por
conta vista via SimpleFin (ver UI). Mudanças de modelo de dados:

- **`accountTypeOverrides` ganha 4 valores**: `checking` | `savings` |
  `credit` | `other` (antes só `credit`/`depository`). `depository`
  continua aceito **na leitura** como alias legado de `checking` — nunca
  reescrito no Redis (sem migração em massa); é tratado como "Checking &
  Savings" na exibição.
- **`AccountBalancesCard` (Home) agrupa em 3 buckets**: Credit Cards /
  Checking & Savings / Other (antes 2: Credit Cards / Checking/Savings).
  Passou também a filtrar `!acc.ignored` explicitamente — necessário
  porque `accountBalances` agora inclui contas ignoradas (ver abaixo);
  antes disso uma conta ignorada reapareceria no saldo da Home.
- **`accountBalances`** (retorno de `fetchSimplefinTransactions`/`GET
  /api/simplefin-sync`) **passa a incluir também as contas ignoradas**,
  com campo aditivo `ignored: true|false` — antes elas eram omitidas por
  completo da resposta, o que impedia a nova tabela de mostrar/desfazer o
  ignore de uma conta já ignorada. `transactions`, `holdings` e
  `accountCount` continuam pulando a conta ignorada, sem mudança de
  comportamento aí.
- **Ignorar continua não-destrutivo**, agora por `accountUrn` exato (em
  vez de fragmento de texto livre digitado à mão): grava o urn exato em
  `ignoredSimplefinAccounts`, limpa `accountMap[urn]` e
  `accountTypeOverrides[urn]`, mas nunca apaga transações já importadas —
  só afeta syncs futuros, e é reversível (Unignore remove o urn da lista).
  Padrões de texto livre legados (pré-v1.59.0) continuam funcionando
  (`isIgnoredSimplefinAccount`/`accountIsIgnored` inalterados) e não são
  migrados automaticamente para `accountUrn`; a linha correspondente
  aparece como "Ignored (legacy rule)" e o botão remove o(s) padrão(ões)
  que casam com aquela conta (confirmação em 2 cliques avisa quantas
  outras contas sincronizadas o padrão também afeta).
- **Nova lista `simplefinAcknowledgedAccounts`** em `api/config.js`
  `LIST_KEYS` (mesmo padrão genérico de array deduplicado de strings — sem
  endpoint novo, sem chave nova no Redis): urns de conta que o usuário já
  viu/tocou na tabela. Uma conta conta como "nova" (dispara o badge, ver
  UI) quando o urn está em `accountBalances` **e**, ao mesmo tempo, ausente
  de `accountMap`, `accountTypeOverrides`, `ignoredSimplefinAccounts` **e**
  `simplefinAcknowledgedAccounts`. Qualquer interação na linha (mapear,
  classificar, ignorar) acknowledgeia o urn. Cálculo 100% client-side
  (`useMemo` em `App`), sem endpoint novo.

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
`SettingsModal` na v1.17.0, PR #128 — ver item 5 abaixo). (Houve uma 6ª tab,
**Preview**, de v1.50.0 a v1.53.1 — removida na v1.54.0; ver item 4 "Import"
abaixo e o changelog v1.54.0 para o histórico.) O app usa
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
   **Fix v1.53.1 (PR #225)**: no cold load mobile, o `ResponsiveContainer`
   do recharts mede o container uma única vez no mount, e o card monta no
   exato instante em que o fetch inicial termina — antes do layout mobile
   assentar (toolbar do browser, `100lvh`) — travando o chart num tamanho
   transiente errado até algo forçar reflow. Fix: montagem do
   `ResponsiveContainer`/`AreaChart` adiada por double `requestAnimationFrame`
   (estado `ready`), com placeholder de `height: 220` idêntico enquanto
   `!ready`. **Padrão a reaplicar** se o mesmo sintoma aparecer em outro
   card com `ResponsiveContainer` que monte no instante em que `loading`
   vira `false` (ex.: `MonthlyBarCard`, `CategoryStackedBarCard`).
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
   **Desde a v1.58.0** (PR #238), logo abaixo do bloco "by Category", novo
   card **`AccountBalancesCard`** mostra o saldo de cada conta sincronizada
   via SimpleFin. O agrupamento usa o campo `accountTypeOverrides` (ver
   Modelo de dados). **Desde a v1.59.0** (PR #240), agrupa em **3 seções**
   — **Credit Cards** / **Checking & Savings** / **Other** (antes 2:
   Credit Cards / Checking/Savings; ordem alfabética dentro de cada grupo)
   — e filtra `!acc.ignored` explicitamente (necessário porque
   `accountBalances` passou a incluir contas ignoradas — ver Modelo de
   dados); conta sem classificação manual cai em "Checking & Savings" por
   padrão. **Desde a v1.64.1** (PR #252), cada linha exibe o nome de conta
   mapeado no app (`accountMap[accountUrn]`, o mesmo de Settings →
   "SimpleFin accounts") em vez do label raw do SimpleFin (`orgName —
   name`); contas sem mapeamento caem no fallback raw. Os saldos vêm do
   `accountBalances` já retornado por
   `api/simplefin-sync.js`, cacheados em `sessionStorage` com TTL de 5 min;
   respeita `hideValues`/`money`. **Desde a v1.69.0** (PR #259),
   `AccountBalancesCard` não faz fetch próprio: recebe `sfBalances`/
   `refreshSfBalances` como props de `App()` (mesmo estado de
   `useSfBalances(authed)` já usado por Settings/badge da TabBar desde a
   v1.59.0), cuja única fonte de fetch automático é o sign-in — antes, o
   `useEffect` local do card refazia a chamada ao SimpleFin a cada
   remount/troca para a aba Home, mesmo dentro do TTL de 5 min. Botão de
   refresh manual (ícone `RefreshCw`) no header do card chama
   `refreshSfBalances({ force: true })`, ignorando o cache quando o usuário
   pede explicitamente.
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

   **Desde a v1.70.0 (PR #263)**, o header da coluna Category (desktop) ganhou
   um segundo `HeaderFilter` **"Status"** ao lado do filtro de categoria já
   existente, filtrando por proveniência do badge (`Rule` / `Confirmed` /
   `Learned – High` / `Learned – Medium` / `Learned – Low` / `Uncategorized`)
   via `categoryBadgeFilterKey(row)`, reaplicando os mesmos thresholds de tier
   do `categoryBadge()`. Os próprios badges (`categoryBadge()`) ficaram mais
   compactos nessa versão — no máximo 4 caracteres (`RULE`, `OK`, `L100`/
   `L067`/`L013`; o `?` de `Uncategorized` ficou como estava, por decisão do
   usuário).
   No mobile, **swipe da linha para a esquerda** revela os chips **Edit** (abre
   `EditModal`) e **Delete** (`TxnAuditCard`). O **botão de export CSV foi
   removido**. O botão JSON já tinha saído (PR #14).

   **Desde a v1.70.1 (PR #265, desktop only)**, o `<thead>` da tabela fica
   sticky (`S.stickyTh`, `top: 0`) ao rolar a lista, mantendo os filtros de
   coluna (`HeaderFilter`/`DateHeaderFilter`) sempre visíveis; mesmo token
   aplicado à tabela do preview do Import (branch `wide`). Ver changelog no
   topo do documento para detalhes de implementação.

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
4. **Import** — importação de CSV (papaparse) com **dois métodos**
   (`BANK_PROFILES`), mais o card de sync automático SimpleFin (ver abaixo).
   **Desde a v1.16.2 (PR #126)**, o seletor de método
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
   `ImportTransactions` já estava em inglês. **Desde a v1.69.2 (PR #262)**,
   as demais strings de UI ainda em PT no fluxo de import (badges de
   categoria, tooltips, painel de duplicatas, near-miss hint, labels de
   loading/review/confirm) e os `reasons`/`categoryReason` de dedupe/
   classificação em `src/ledger.js` também foram traduzidos — ver
   changelog acima. Comentários de código em PT permanecem intencionalmente
   não traduzidos (decisão explícita do usuário, fora do escopo de i18n de
   UI).

   **Filtros de coluna no header da tabela (desktop, v1.62.0, PR #247)** —
   no preview de import em `<table>` (desktop, `isWide`, ver v1.61.0 acima),
   os headers de conta/categoria/data passaram a ser `HeaderFilter`/
   `DateHeaderFilter` (mesmos componentes reaproveitados da tab
   Transactions), em vez de texto estático; estado do filtro é local ao
   `ImportTransactions` (não persiste entre sessões/imports). A preview
   também passou a ordenar por data decrescente com tie-break estável (por
   índice original), mesmo padrão adotado na tab Transactions. **Escopo:
   só a visão desktop em tabela** — a visão mobile (cards) do preview de
   import não ganhou filtro de header nesta versão.

   **Filtro "Status" no header de Category (desktop, v1.70.0, PR #263)** —
   mesmo `categoryBadgeFilterKey`/`HeaderFilter` "Status" descrito na tab
   Transactions (item 3 acima), aplicado também à tabela de preview do
   Import; sem equivalente na visão mobile (cards), pelo mesmo motivo do
   item anterior. Nessa mesma versão, o botão **Confirm** deixou de perder
   confirmações silenciosamente: `confirmedRows` era um estado local
   resetado a cada novo `dedupedRows` (novo sync), descartando confirmações
   já dadas mas ainda não importadas. Agora `syncSimpleFin`/
   `loadSimpleFinPending` chamam `confirmDiscardUnimportedConfirmations()`
   no início, que avisa via `window.confirm` quantas confirmações serão
   perdidas e permite cancelar o sync.

   **SimpleFin (auto)** (v1.48.0, PR #213, Fase 1) — terceiro card na tab
   Import, ao lado de Credit Karma (CSV) e CSV genérico, com botão "Sync
   now". Ao clicar, busca `GET /api/simplefin-sync` (endpoint autenticado,
   read-only, credencial via env var `SIMPLEFIN_ACCESS_URL` — SimpleFin
   Bridge access URL, sem UI de configuração ainda), resolve a conta via os
   mesmos helpers `classifyAccount`/`matchOption` do fluxo CSV, e injeta as
   transações resultantes no **mesmo** pipeline de prévia/dedup
   (`markDuplicates`)/checkbox por linha/confirmação usado pelos outros dois
   métodos — não é um pipeline paralelo. Mensagens de erro específicas: env
   var ausente ("SimpleFin não configurado", 501) vs. falha de rede/resposta
   não-OK do SimpleFin (502).

   **Persistência do preview entre trocas de tab (v1.69.0, PR #259)** — o
   estado da prévia de sync (`method`, `sfRows`, `sfFromPending`,
   `selected`, `fileName`, `error`, `done`) subiu de `useState` local de
   `ImportTransactions` para `App()`, e é passado como props. Antes, trocar
   de aba durante uma revisão em andamento (checkboxes marcados, correções
   de categoria antes de confirmar) descartava tudo, já que o componente
   desmonta ao sair da aba Import. Clicar em "Sync now" de novo ou concluir
   o import ainda limpa/substitui o preview normalmente — só a sobrevivência
   a trocas de aba mudou. O estado do fluxo CSV genérico/Credit Karma
   (`rawRows`/`headers`/`mapping`) permanece local ao componente, fora de
   escopo dessa mudança.

   **Fila de pendências do cron (v1.49.0, PR #215, Fase 2)** — além do
   "Sync now" manual, um Vercel Cron Job roda 1x/dia (`vercel.json`, 9h UTC)
   chamando `api/cron/simplefin-sync.js`, que busca as transações via
   `lib/simplefin.js` e grava numa fila Redis separada
   (`household:*:simplefin-pending`) — nunca no ledger diretamente. Quando
   há itens na fila, a tab Import mostra um aviso "N transações pendentes
   de revisão" com botão **"Revisar N pendentes"**, que carrega a fila
   (`GET /api/simplefin-sync?pending=1`) e injeta as transações no **mesmo**
   pipeline de prévia/dedup/checkbox/confirmação dos outros métodos. Após
   confirmar o import, a fila é limpa automaticamente (`DELETE
   /api/simplefin-sync?pending=1`). **Decisão de produto deliberada**: não há
   gravação automática/silenciosa no ledger — o cron só alimenta a fila,
   a revisão manual pelo usuário continua obrigatória. Nota de
   comportamento conhecido: usar "Sync now" enquanto há fila pendente não
   limpa a fila (ela só é limpa pelo fluxo "Revisar pendentes"); sem risco
   de duplicata real, pois o dedup final (`markDuplicates`) sempre roda
   contra o ledger antes de importar.

   **Tab SimpleFin/Preview — REMOVIDA na v1.54.0** (`src/App.jsx`). Existiu
   de v1.50.0 a v1.53.1 (PR #216) como uma vitrine 100% read-only, logo após
   Import na navegação, dos dados crus da API SimpleFin (tabela com uma
   coluna por campo de `raw`, sort/filtro por coluna desde v1.52.0,
   sub-seção Holdings desde v1.53.0). Removida junto com `TABS` entry
   `preview`, `SimpleFinPreview`, `SimpleFinHoldingsSection`,
   `SF_RAW_COLUMN_ORDER`, `useSfRawTable` e `SfRawTable` — não afetou o
   fluxo de sync automático (`classifySimpleFinRows`, `syncSimpleFin`,
   `loadSimpleFinPending`, o card "SimpleFin (auto)" abaixo, nem as
   rotas/API server-side do SimpleFin). Ver changelog v1.54.0 acima para o
   detalhe da remoção.

   **Deduplicação (três estados, desde a v1.56.0).** Na prévia, cada linha
   tem checkbox e um `_dupState` calculado por `markDuplicates`, com
   Select/Deselect all — só as marcadas são importadas. Quando há duplicatas
   detectadas (`dupCount > 0`), aparece um filtro de visualização da prévia:
   um **segmented control** — "All" / "New Only" / "Dup Only" / "Review"
   (estado `dupFilter`, enum `"all"|"new"|"dup"|"review"`; o quarto bucket
   entrou na v1.56.0, os três primeiros vêm da v1.16.2/PR #126, que já havia
   substituído os 2 checkboxes mutuamente exclusivos da v1.15.2/PR #123). É
   um filtro **de visualização da prévia apenas** — não afeta o Set
   `selected` que determina o que de fato é importado. O botão **"Import N
   transactions"** fica em uma **barra sticky** (`bottom: 0`, gradiente para
   o fundo do app), sempre visível sem precisar rolar até o fim da lista
   depois de carregar o arquivo; `maxHeight` da lista de preview reduzido de
   360 para 300 px para abrir espaço para a barra.

   Os três estados e seus defaults de seleção:

   - **`certain`** — id de origem em comum (inclusive cross-source via
     `altSourceIds`), fingerprint de conteúdo idêntico, ou `score >= 85`.
     Vem **desmarcada**, badge `DUP` + as `reasons` do score.
   - **`uncertain`** — `score` entre 60 e 84. Vem **MARCADA**, badge âmbar
     `DUP?` + comparação lado a lado com a linha existente (data, descrição,
     conta, valor via `money`, respeitando `hideValues`) e um botão
     "Marcar como duplicata da existente" que grava `altSourceIds`.
   - **`new`** — `score < 60` ou nenhum candidato. Marcada, sem badge.

   **O default é assimétrico de propósito** e está documentado no código
   (`DUP_SCORE_CERTAIN`/`DUP_SCORE_REVIEW`, `src/ledger.js`): um falso
   positivo faz uma transação real nunca entrar no ledger, e o usuário não
   tem como perceber que ela sumiu; um falso negativo só duplica uma linha
   que fica visível na tab Transactions e é removível em massa. Perder é
   pior que duplicar, então só a quase-certeza desmarca.

   A detecção compara contra os dados existentes **e** dentro do próprio
   lote, em três estágios:

   - **Id de origem** — `sourceId` + `altSourceIds`, sobre o pool inteiro.
     Id em comum é veredito de duplicata, sempre. Ids diferentes só provam
     "transações distintas" quando as fontes **não** são comprovadamente
     diferentes (ver `source` no Modelo de dados) — é o que preserva a
     garantia do PR #51 de que dois gastos reais idênticos nunca são
     fundidos, inclusive para todo o histórico legado sem `source`.
   - **Fingerprint exato** — `data│valor│descrição│conta` (`txnFingerprint`).
   - **Score de similaridade** — `scoreDuplicateCandidate(a, b)`, função pura
     em `src/ledger.js`. Gate rígido de centavos assinados idênticos (senão
     nem vira candidato); `score = 100 − penalidade de data − de conta − de
     descrição`, com data 0d→0, 1d→5, 2d→10, 3d→18, 4–5d→28 e **>5d
     descartando o candidato**; conta igual→0, um lado sem conta→10,
     diferentes→40; descrição por Jaccard sobre tokens de
     `normalizeMerchant` + `descWords`: ≥0.6→0, ≥0.3→10, ≥1 token→20,
     nenhum→35. Índice por **centavos** (a conta virou sinal pontuado em vez
     de parte da chave, senão uma linha `Unassigned` nunca casava com uma
     classificada) e **matching 1:1 com consumo**: cada linha existente só
     absorve um candidato, então dois gastos idênticos no mesmo dia não
     colapsam num só.

   Nota de calibração: o antigo hit fuzzy (mesma conta + centavos + ≤2 dias +
   ≥1 palavra em comum) era auto-desmarcado como certeza. Ele agora pontua
   70–80 e cai em `uncertain`. É correção de falso positivo, não afrouxamento
   — `descOverlap` exige uma única palavra ≥3 chars, então
   "AMAZON MARKETPLACE ORDER" × "AMAZON PRIME VIDEO RENTAL" com mesmo valor a
   2 dias era descartado em silêncio. Duplicata real segue em `certain`
   (descrição idêntica: 100 no mesmo dia, 95/90 a 1–2 dias).

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

   **Ordem das seções dentro de Settings** (de cima para baixo, **desde a
   v1.63.0/PR #248**):
   1. **Suggested rules** (topo)
   2. **Description rules** — subiu para a posição 2 (logo após "Suggested
      rules"; antes ficava mais abaixo, posição 5 na ordem anterior); desde
      a v1.63.0 também virou tabela compacta (mesmo padrão de `TxnTable`)
      em vez de cards empilhados.
   3. **Account aliases & Category mapping** — card único fundido na
      v1.63.0/PR #248: `AccountAliasesSection` + `CkCategoryMapSection` num
      mesmo card com divisor interno (antes eram dois cards separados, e
      "Category mapping" ficava no final da tab). Os `id`s internos
      `account-aliases-section`/`category-mapping-section` foram
      preservados (usados pelo scroll dos botões de sugestão em "Suggested
      rules").
   4. **SimpleFin accounts** — tabela única (`SimplefinAccountsSection`,
      desde a v1.59.0/PR #240 — ver detalhe abaixo); até a v1.58.0 eram três
      seções separadas nesta posição: **Card mapping** (`AccountMapSection`,
      migrado do antigo `SettingsModal`), **Ignored SimpleFin accounts**
      (v1.57.0) e **Account types** (v1.58.0). **Desde a v1.63.0**, uma
      coluna "source" (SimpleFin vs Credit Karma) foi cogitada nesta tabela
      mas **cancelada** — hoje esse dado só existe por transação
      (`sourceId`/feed de origem), não por conta; ver item de roadmap
      pendente.
   5. **Budgets** (`BudgetsSection`)
   6. **Accounts & Categories** — card único com **Accounts**, **Expense
      categories** e **Income categories** empilhadas, cada uma separada por
      um divisor (desde a v1.18.0/PR #132; antes eram dois cards distintos —
      um "Accounts" e um "Categories" com Expense+Income, este último criado
      no PR #131/v1.17.1; e antes disso, três `ManagedList` cards colapsáveis
      separados, migrados do antigo `SettingsModal`)
   7. **Data Management** — card único fundido na v1.63.0/PR #248:
      **"Daily snapshots"** (`SnapshotsSection`) + **"Data & Backup"**
      (`DataBackupSection`) num mesmo card com divisor interno (antes eram
      dois cards separados no final da tab). "Daily snapshots" (desde a
      v1.43.0, PR #199) lista e restaura snapshots via `api/snapshots.js`;
      "Backup transactions" (desde a v1.20.3, PR #140; restore desde a
      v1.20.4) baixa localmente um JSON
      `household-transactions-backup-YYYY-MM-DD.json` com
      `{ transactions: [...], exportedAt }`, export puro do array de
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

   **Desde a v1.61.1 (PR #245)**, `AccountAliasesSection`/`AccountAliasRow`
   viraram uma lista compacta: cada conta é uma linha colapsada por padrão
   (nome + resumo curto de fragments + chevron), em vez do card grande
   sempre expandido; clicar na linha expande e revela a edição completa
   (chips removíveis + input "add fragment" + botão "+"). Quando chega um
   `prefillFragment` do "Suggested rules" (nonce muda), todas as linhas se
   expandem automaticamente para a sugestão ficar visível. `draft`/`dirty`/
   `setFrags`, `computeAliasImpact` e o fluxo Preview impact → Confirm &
   apply, além do endpoint `/api/account-aliases`, não mudaram — só a
   apresentação (novos tokens `S.aliasRow`/`S.aliasRowHeader`).

   Logo abaixo, a tabela **SimpleFin accounts** (`SimplefinAccountsSection`,
   ver detalhe a seguir) e o card **Accounts & Categories** com as três
   `ManagedList` — **Accounts**, **Expense categories**, **Income
   categories** (ver "Listas gerenciáveis" no Modelo de dados) — que antes
   só existiam dentro do `SettingsModal` (por trás da engrenagem no header)
   e agora vivem diretamente na tab, sem modal.

   **`SimplefinAccountsSection` (desde a v1.59.0, PR #240)** substitui as
   três seções que existiam até a v1.58.0 nesta posição — **Card mapping**
   (`AccountMapSection`, ver "Classificação de conta no import" no Modelo
   de dados), **Ignored SimpleFin accounts** (`CollapsibleCard` +
   `ManagedList`, v1.57.0) e **Account types**
   (`AccountTypeOverridesSection`, v1.58.0) — por uma única tabela, uma
   linha por conta vista via SimpleFin (fonte: `accountBalances`; ver
   "Consolidação em tabela única 'SimpleFin accounts'" no Modelo de
   dados). Cada linha tem:
   - **Identidade**: `orgName — name` + últimos 4 dígitos, com um dot
     verde/âmbar indicando se a conta já tem card mapping.
   - **Select de card mapping**: lista `ACCOUNTS` + opção
     "— Unassigned —".
   - **Select de tipo de conta**, 4 valores: Checking / Savings / Credit
     Card / Other (`accountTypeOverrides`, ver Modelo de dados).
   - **Botão Ignore/Unignore**, com confirmação em 2 cliques (sem
     `window.confirm`, mesmo padrão de delete do `ManagedRow`). Ignorar é
     não-destrutivo (ver Modelo de dados) — nunca apaga transações já
     importadas, só afeta syncs futuros. Contas afetadas por um padrão de
     texto livre legado (pré-v1.59.0) aparecem como "Ignored (legacy
     rule)"; o botão remove o(s) padrão(ões) correspondentes.
   - **Badge "Source"** (v1.64.0, PR #250): não existe campo `source`
     persistido por conta, só por transação (`t.source`: `"sf"` | `"ck"` |
     `"csv"`), então o badge é derivado em runtime a partir das transações
     já casadas por `accountUrn` — `"sf"` presente e nenhuma `"ck"`/`"csv"`,
     ou ainda sem nenhuma transação casada, vira "SimpleFin"; só `"ck"`/
     `"csv"` (sem `"sf"`) vira "Credit Karma" (tratadas como a mesma origem
     "importada"); `"sf"` + `"ck"`/`"csv"` juntas vira "Mixed".

   Contas ainda não configuradas — sem card mapping, sem tipo, não
   ignoradas e ausentes de `simplefinAcknowledgedAccounts` (ver Modelo de
   dados) — disparam um **badge vermelho**: um dot na tab **Settings** da
   `TabBar` e a contagem na prop `badge` do `CollapsibleCard` que envolve a
   tabela. Qualquer interação numa linha (mapear, classificar, ignorar)
   acknowledgeia aquela conta, tirando-a da contagem; o badge some quando
   não sobra nenhuma conta pendente.

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
- [x] Saldo e gastos por conta *(removido do Analyze no PR #8 — seção Account Balances descontinuada; reintroduzido na v1.58.0/PR #238 como `AccountBalancesCard` na Home, com saldos ao vivo via SimpleFin em vez de agregação sobre transações históricas; desde a v1.59.0/PR #240 agrupa em 3 buckets — Credit Cards / Checking & Savings / Other — e filtra `!acc.ignored` explicitamente, já que `accountBalances` passou a incluir contas ignoradas — ver Modelo de dados)*
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
  `account_urn` e `last4` *(a UI dedicada — `AccountMapModal` →
  `AccountMapSection` — foi removida na v1.59.0/PR #240: o mapping por
  conta agora é uma coluna da tabela única `SimplefinAccountsSection` em
  Settings, junto com o "Ignored SimpleFin accounts" de v1.57.0 e o
  "Account types" de v1.58.0; `accountMap`/`/api/account-map` inalterados)*
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
- [ ] **Diagnóstico/limpeza de `id` duplicado em `transactions`** (origem
  provável: import de restauração de backup JSON preserva o `id` de entrada
  quando já presente — `rows.map(r => r.id ? r : {...r, id: uid()})`,
  `src/App.jsx` ~linha 7808 — reimportar/mesclar backups sobrepostos pode
  legitimamente produzir dois objetos com o mesmo `id`; achado durante a
  investigação do bugfix v1.69.1 do filtro de Account em Transactions, que só
  mitigou o sintoma client-side). Falta: (a) `console.warn`/telemetria
  quando o de-dupe defensivo do `filtered` (`TransactionsTab`) encontrar ids
  de fato duplicados, para confirmar a origem real; (b) rotina de
  auditoria/limpeza server-side (ou no "Data quality" da Fase 7) para ids
  duplicados já persistidos no Redis.

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
- [x] **Sync automático via SimpleFin — Fase 1** (v1.48.0, PR #213) — novo
  endpoint `api/simplefin-sync.js` (GET autenticado via `authenticate()`,
  read-only, não escreve no Redis) chama a SimpleFin Bridge access URL
  (env var `SIMPLEFIN_ACCESS_URL`, credencial embutida na URL) e mapeia as
  transações da fonte para o shape padrão do projeto (`srcAccount`,
  `sourceId` reaproveitados, sinal preservado verbatim). Terceiro card
  "SimpleFin (auto)" na tab Import, ao lado de Credit Karma (CSV) e CSV
  genérico, com botão "Sync now" que injeta o resultado no mesmo pipeline
  de prévia/dedup/checkbox/confirmação já existente (sem pipeline
  paralelo). Erros distintos na UI: credencial ausente (501) vs. falha de
  rede/SimpleFin (502).
  - [x] **Fase 2 — agendamento automático real** (v1.49.0, PR #215) — Vercel
    Cron Job (`vercel.json`, `"0 9 * * *"` UTC, 1x/dia) chama
    `api/cron/simplefin-sync.js` (protegido por `Authorization: Bearer
    CRON_SECRET`, fail-safe 401 sem a env var), que popula uma fila de
    pendências separada (`household:*:simplefin-pending`, merge
    append-only por `id`) — nunca escreve na chave principal de
    transações. Lógica de fetch compartilhada extraída para
    `lib/simplefin.js`. Fila lida/limpa via `api/simplefin-sync.js?pending=1`
    (GET/DELETE, dobrado no endpoint de sync manual para não estourar o
    limite de 12 Serverless Functions do plano Vercel Hobby) e
    aviso + botão "Revisar N pendentes" na tab Import, reusando o mesmo
    pipeline de prévia/dedup/confirmação. Ver seção "Modelo de dados" e
    "UI" para detalhes.
  - [x] **Tab Preview — vitrine read-only da fila de pendências** (v1.50.0,
    PR #216) — nova tab "Preview" que busca e classifica a mesma fila do
    cron automaticamente ao abrir, sem nenhum caminho de escrita (não
    edita/deleta/importa); reuso de `TxnRow` e do novo helper
    `classifySimpleFinRows` (extraído da lógica antes duplicada no Import).
    Ver seção "UI" para detalhes.
  - [x] **Fase 3 — dedup cross-source, link de contas e categorização
    automática** (v1.56.0) — fecha as três lacunas que sobraram das Fases
    1/2, todas encontradas em auditoria do código e não pelo uso:
    (a) **dedup cross-source** — a mesma compra vinda pelo CK e depois pelo
    SimpleFin não era detectada (`isFuzzyDup` curto-circuitava em
    `r.sourceId` e o índice era chaveado por `account|cents`); `markDuplicates`
    reescrito com campo `source`, score de confiança
    (`scoreDuplicateCandidate`), três estados na prévia, bucket "Review" e
    `altSourceIds`; (b) **link de contas** — `classifySimpleFinRows` passava
    `""` como URN para `classifyAccount`, então o mapa por URN nunca se
    aplicava ao SimpleFin (no Chase, cinco cartões chamados "CREDIT CARD");
    `mapTransaction` agora promove `account.id` a `accountUrn` de topo e o
    `AccountMapSection` existente resolve o vínculo sem mudança de UI;
    (c) **categorização** — toda linha do SimpleFin entrava como `Other`,
    sempre, porque nunca passava por `buildRow`; a etapa de categoria virou
    a função pura `resolveImportCategory` (`src/ledger.js`), compartilhada
    pelos dois caminhos, com a precedência do PR #135 e o safety-net de
    `Transfer` preservados byte a byte. Ver "Modelo de dados" e "UI".
  - [x] **Fix: Fidelity excluída do sync + Amazon usa `memo`** (v1.56.1) —
    `accountMatchesKeyword(account, keyword)` (novo helper, `lib/simplefin.js`,
    case-insensitive contra `account.name`/`org.name`/`org.domain`) filtra a
    conta Fidelity por inteiro em `fetchSimplefinTransactions` (decisão de
    produto, não limitação de API — a investigação sobre o schema de
    `holdings` da Fidelity, acima, fica sem novo dado a partir daqui) e faz
    `mapTransaction` preferir `sfTxn.memo` sobre `description`/`payee` só
    para contas Amazon (o `description` que a Amazon manda é genérico;
    o detalhe do pedido está em `memo`). `accountCount` do retorno passou a
    contar só contas efetivamente sincronizadas.
  - [x] **Fix: duplicatas SimpleFin (reissue pending → posted) não eram
    detectadas** (v1.62.0, PR #247) — `markDuplicates` (`src/ledger.js`)
    vetava automaticamente candidatos com `sourceId` diferente sempre que
    o feed batia (`sameFeed`), inclusive quando ambos os lados eram `"sf"`
    (SimpleFin), impedindo pares Amazon Card reemitidos (pending → posted)
    de sequer entrar no scoring fuzzy. O veto agora só se aplica a
    `sameFeed && !bothSf` (mesmo feed legado/"ck"); pares sf/sf com
    `sourceId` diferente passam pelo scoring normal. Testes novos em
    `src/ledger.test.js` cobrindo o caso positivo e a não-regressão do
    PR #51. Ver também item de UI abaixo (filtros de header no import).
  - [ ] UI de configuração de credencial SimpleFin na Settings — ainda
    hardcoded via env var `SIMPLEFIN_ACCESS_URL` (single-tenant).
  - [x] **Coluna "Source" (SimpleFin vs Credit Karma) na tabela
    `SimplefinAccountsSection`** — cogitada e cancelada na v1.63.0/PR #248
    (o dado não existe persistido por conta); implementada na v1.64.0/PR
    #250 com abordagem derivada por transação: badge calculado em runtime a
    partir de `t.source` das transações já casadas por `accountUrn`
    ("SimpleFin" / "Credit Karma" / "Mixed"), sem novo campo no modelo de
    conta. Ver seção UI (item 5. Settings).
- [x] **Reorganização da tab Settings** (v1.63.0, PR #248) —
  `SimplefinAccountsSection` e `DescriptionRulesSection` convertidas de
  cards empilhados para tabela compacta (padrão `TxnTable`); "Daily
  snapshots" + "Data & Backup" fundidos em "Data Management"; "Account
  aliases" + "Category mapping" fundidos num único card; "Description
  rules" subiu para a posição 2 (logo após "Suggested rules"). Ver seção
  UI (item 5. Settings) para a nova ordem completa. Nenhuma mudança de
  contrato de API/Redis ou de modelo de transação.
  - [ ] **Follow-ups da v1.56.0** (não bloqueantes, achados na auditoria):
    o piso da penalidade de descrição deixa um par de mesmo valor/conta/dia
    sem token em comum pontuando 65 → ruído no bucket "Review"; e confirmar
    um match duplicado altera `transactions`, o que remonta `dedupedRows` e
    dispara o effect que zera `selected`/`dupFilter`/`categoryOverrides` —
    correções de categoria feitas na prévia antes do clique se perdem
    (a correção é chavear o reset por identidade de lote).
  - [ ] **`normalizeMerchant()` no matching de Description rules** — o
    helper existe desde a v1.56.0 mas tem um consumidor só (a penalidade de
    descrição do dedup). Ligá-lo às rules foi **adiado deliberadamente**: as
    rules casam por substring, então um pattern `"starbucks"` já casa com
    `"SQ *STARBUCKS #1234"` hoje — o ganho é baixo e o risco de mudar
    silenciosamente como as regras salvas casam é alto. Se for feito, exige
    teste de regressão contra as regras reais e normalizar só o lado da
    descrição da linha, nunca o `pattern` digitado nem o `provider`.
  - [x] ~~Reconciliação silenciosa sem prévia do usuário~~ — **descartado
    por decisão de produto** (v1.49.0): o usuário optou explicitamente por
    nunca gravar automaticamente no ledger; a fila de pendências do cron
    sempre passa por revisão manual na mesma tela de prévia/confirmação.
- [x] **Fix: `DailyPaceCard` ("Daily Spending Pace", Home) com dimensões
  erradas no cold load mobile** (PR #225, v1.53.1) — no primeiro
  carregamento no celular, o gráfico às vezes renderizava achatado/cortado,
  corrigindo sozinho só ao trocar de tab ou alternar o toggle Income/Expense.
  Causa raiz: o `ResponsiveContainer` (recharts) mede o container uma única
  vez no mount; como `DailyPaceCard` monta no exato instante em que
  `loading` vira `false` (fim do fetch inicial), essa medição podia
  acontecer antes do layout mobile assentar (resize da toolbar do browser,
  resolução de `100lvh`), travando o chart num tamanho transiente errado até
  algo forçar reflow (troca de tab remonta via `key={tab}` no
  `TabErrorBoundary`; o toggle Income/Expense força reflow sem remount).
  Fix: a montagem do `ResponsiveContainer`/`AreaChart` passou a ser adiada
  por um double `requestAnimationFrame` (novo estado `ready`, cleanup com
  `cancelAnimationFrame`), com placeholder de `height: 220` idêntico
  enquanto `!ready` — sem pulo de layout. Só `src/App.jsx` alterado; sem
  mudança em `dashboardPaceData`, API/Redis, modelo de transação ou outros
  gráficos. Padrão de "deferred mount via double rAF" documentado na seção
  UI/Home (item 1, `DailyPaceCard`) para reaproveitar caso o mesmo sintoma
  apareça em outro card com `ResponsiveContainer`.
- [x] **Classificação automática de categorias por memória de comerciante**
  (PR #256, branch `claude/simplefin-transaction-classification-luezyx`, 3
  commits/fases na mesma PR, v1.65.0 → v1.66.0 → v1.67.0) — pipeline de
  aprendizado que reduz a fração de importações caindo em "não
  classificado", complementar às regras manuais (Description rules, Fase 5)
  e ao mapa CK→ledger, sem substituir nenhum dos dois. **Fase 0** (SHA
  `16bfdf6`, v1.65.0): nova função pura `merchantKey(description)`
  (`src/ledger.js`) normaliza a descrição bruta numa chave de comerciante
  comparável (corta endereço inline formato Apple Card, separa prefixo de
  agregador tipo "TST*"/"DD *", remove telefone/número de loja/UF final),
  retornando `{ key, tokens, prefix }`; `resolveImportCategory` passa a
  retornar também `categorySource`/`categoryConfidence`/`categoryReason`
  (campos novos, opcionais e aditivos na transação). Nova categoria
  `Uncategorized` substitui `"Other"` como fallback de "nada classificou
  esta linha" em `resolveImportCategory`/`mapCkCategory` (`src/ledger.js`) e
  `DEFAULT_CATEGORY` (`lib/simplefin.js`); `Other` continua existindo
  intocada como categoria manual normal, selecionável como sempre. **Fase 1**
  (SHA `794a494`, v1.66.0): `buildMerchantMemory(transactions)` (nova) varre
  o ledger inteiro e monta 6 camadas de confiança decrescente (conta+
  descrição completa → descrição completa → conta+2 tokens → 2 tokens → 1
  token → conta sozinha como prior), treinando só com linhas confiáveis
  (`isMemoryTrainableRow`, nova — exclui `Uncategorized`, `Transfer` e
  linhas já `categorySource === 'learned'`, pra não treinar com os próprios
  palpites e criar loop de reforço); `classifyMerchantMemory` testa as
  camadas da mais específica pra mais genérica, `confidence = peso_da_camada
  × pureza × suporte`. `resolveImportCategory` ganha um novo degrau de
  precedência entre regra/categoria da própria fonte e o fallback final —
  nunca sobrepõe nem regra nem categoria real da fonte, nunca desfaz o
  safety-net de Transfer (PR #111). Validado contra o histórico real da
  household: ~62% das linhas auto-classificadas a ~91% de precisão no corte
  de confiança 0,5, ~42% a ~98% no corte 0,9. **Fase 2** (SHA `f4059f5`,
  v1.67.0): a memória fica visível e revisável na tela de Import —
  `CategoryBadge` (nova) etiqueta cada linha (`regra`/`aprendido XX%`/
  `confirmado`/`?`), `ConfirmCategoryButton` (nova) promove uma linha
  `'learned'` pra `'confirmed'` (fecha o ciclo de treino sem alterar a
  categoria), toggle de ordenação "Revisar primeiro" (por
  `categoryReviewConfidence` crescente) e botão de confirmação em massa
  respeitando os filtros já aplicados no preview; corrigido de brinde um bug
  latente da Fase 0 em que `setCategoryOverride` não limpava os campos de
  classificação obsoletos ao corrigir manualmente uma linha, o que excluía
  correções humanas genuínas do treino por engano. 125 testes unitários
  novos/passando, build de produção ok, teste manual real via Playwright
  (badge/ordenação/confirmação individual/confirmação em massa/limpeza de
  badge ao editar manualmente/layout mobile). Ver "Versão atual"/"Versão
  anterior" no topo deste documento para o detalhamento completo por fase.
  - [ ] **Fase 4 futura — classificação por LLM** para o que sobrar sem
    classificação, só depois de um período real de uso da memória —
    decisão explícita do usuário de aguardar; ainda não iniciada.
  - [x] **Linhas `'learned'` nunca revisadas no import ficam congeladas
    indefinidamente** — resolvido em v1.68.0 (ver "Versão atual" no topo
    deste documento): `TxnTable`/`TxnAuditCard`/`EditModal` agora leem
    `categorySource` e oferecem o mesmo badge/confirmação do Import.
  - [x] **Badges compactos + filtro "Status" + fix de confirmações
    perdidas** (v1.70.0, PR #263) — `categoryBadge()` reduzido para no
    máximo 4 caracteres (`RULE`/`OK`/`LNNN`, `?` intocado); novo filtro
    "Status" na coluna Category (Transactions + Import desktop) via
    `categoryBadgeFilterKey(row)`/`CATEGORY_BADGE_FILTER_OPTIONS`, sem
    equivalente mobile no Import; fix de bug em que `Confirm` no Import
    perdia confirmações silenciosamente a cada novo sync
    (`confirmedRows` resetado sem aviso) — `syncSimpleFin`/
    `loadSimpleFinPending` agora chamam
    `confirmDiscardUnimportedConfirmations()` (`window.confirm`) antes de
    descartar. Ver "Versão atual" no topo deste documento para o
    detalhamento completo.
