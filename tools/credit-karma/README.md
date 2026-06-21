# Exportar transações do Credit Karma pelo iPhone

O Credit Karma **não tem botão oficial de exportar transações**, mas funciona
como agregador (todas as suas contas e cartões estão conectados lá). Esta
ferramenta extrai as transações linha a linha direto da API interna do Credit
Karma e gera um CSV pronto para o **Import** do Household Ledger — tudo rodando
no iPhone, sem PC.

Há **dois caminhos**, ambos rodando no iPhone:

| | **Safari + bookmarklet** | **Scriptable (app)** |
|---|---|---|
| Baixar app | **Não** | Sim (Scriptable) |
| Login a cada uso | Não — usa a sessão já logada no Safari | Sim, dentro da WebView |
| Setup inicial | Criar o bookmarklet (chato 1x no iOS) | Colar o script no app |
| Saída do CSV | Share sheet → "Salvar em Arquivos" | Salva direto em Arquivos |

Use o **Safari** se quiser evitar instalar app e ter menos passos por uso.
Use o **Scriptable** se preferir uma UI de erros melhor ou já tiver o app.

> **Por que não bookmarklet no Chrome?** O Chrome no iOS não roda bookmarklets
> `javascript:` de forma confiável. O bookmarklet abaixo é **só para Safari**.
> Extensões de browser tipo desktop também não existem no iOS.

## Como funciona

Os dois caminhos usam a mesma ideia: executar o `fetch` da API GraphQL do
Credit Karma **de dentro de uma página logada** (a aba do Safari no caminho A,
ou uma WebView do Scriptable no caminho B). Assim a requisição sai com a origem
`www.creditkarma.com` e os cookies de sessão, exatamente como o site real faz
(CORS e autenticação funcionam). Ambos usam duas operações que o próprio app
web do Credit Karma usa:

- `GetTransactionsList` — pega o grosso das transações recentes numa tacada.
- `GetTransactions` — pagina (via `afterCursor`) voltando no tempo até cobrir
  o período pedido.

O resultado vira um CSV cujas **5 primeiras colunas batem com o import do
ledger**: `date,description,amount,category,account` (mais `ck_category,type`
para ajudar você a ajustar o mapeamento).

---

## Caminho A — Safari (sem app)

Arquivos: `bookmarklet.src.js` (fonte legível) e `bookmarklet.txt` (o
one-liner `javascript:` pronto pra colar; gerado por `build-bookmarklet.js`).

### Setup (uma vez)

Instalar bookmarklet no iOS Safari é meio chato, mas é só uma vez:

1. No Safari, favorite qualquer página (ícone de compartilhar →
   **Adicionar aos Favoritos**). Dê o nome **"CK Export"**.
2. Abra **Favoritos** → **Editar** → toque no "CK Export".
3. Apague o endereço (URL) e **cole o conteúdo de `bookmarklet.txt`**
   inteiro (começa com `javascript:`). Salve.
   - Dica: abra `bookmarklet.txt` deste repo no celular e copie tudo.

### Uso

1. No Safari, abra `https://www.creditkarma.com/networth/transactions` e
   **faça login** (a sessão fica salva para as próximas vezes).
2. Toque na barra de endereço, comece a digitar **CK Export** e toque no
   favorito (ou abra Favoritos e toque nele).
3. Um banner mostra o progresso; ao terminar abre o **share sheet** com o
   CSV → **Salvar em Arquivos**.
4. No Household Ledger, **Import** → escolha o CSV.

Se o share de arquivo não estiver disponível no seu iOS, ele copia o CSV
para a área de transferência como fallback.

---

## Caminho B — Scriptable (app)

### Setup (uma vez)

1. Instale o app **Scriptable** (grátis) na App Store.
2. Abra o arquivo `creditkarma-export.scriptable.js` deste repositório, copie
   todo o conteúdo.
3. No Scriptable, toque em **+**, cole o código e dê um nome
   (ex.: "Credit Karma Export"). Salve.

## Uso (cada vez que quiser exportar)

1. Abra o script no Scriptable e toque em ▶︎.
2. Toque em **Abrir Credit Karma**. Faça login se pedir (inclusive 2FA) e
   **espere a página de transações carregar**.
3. Toque em **Done** no canto superior da WebView.
4. O script busca tudo, mostra quantas transações achou e salva o CSV no
   Scriptable (iCloud Drive). Toque em **Compartilhar / Salvar em Arquivos**
   para mandar pro app Arquivos, e-mail, etc.
5. No Household Ledger, vá em **Import**, escolha o CSV. O mapeamento de
   colunas já deve acertar `date/description/amount/category/account`; ajuste
   se necessário e confirme.

### Ajustes rápidos (topo do script)

- `DAYS_BACK` — quantos dias para trás exportar (padrão 90).
- `MAX_PAGES` — teto de páginas na paginação (padrão 60).

## Sobre categorias e contas

- **Categoria**: o script traduz as categorias do Credit Karma para as do
  ledger (ex.: `FOOD_AND_DINING` → `Restaurant`, `PETS` → `Dog`). O que não
  reconhece vira `Other`. A coluna `ck_category` mostra o original para você
  conferir/ajustar.
- **Transferências e pagamentos de cartão** (categoria/tipo `TRANSFER`,
  `CREDIT_CARD_PAYMENT`, `PAYMENT`) viram a categoria especial **`Transfer`**,
  que o ledger **exclui de todos os totais** — assim movimentação entre contas
  e pagamento de fatura não contam como receita nem despesa.
- **Conta**: a coluna `account` combina banco + nome + 4 últimos dígitos
  quando disponíveis (ex.: "Chase TOTAL CHECKING 1234"). Para algumas contas o
  Credit Karma só reporta o tipo do produto ("CREDIT CARD", "TOTAL CHECKING")
  e **não** envia os 4 dígitos — nesses casos cartões do mesmo banco podem
  ficar com o mesmo rótulo e você precisa diferenciá-los à mão. As colunas
  `ck_account` (nome cru) e `provider` (banco) vão no CSV para ajudar a
  remapear no Import ou editar depois para os nomes do ledger.
- **Valor**: sempre positivo; o sinal (receita/despesa) vem da categoria, como
  o ledger espera. A coluna `type` indica `income`/`expense` para referência.

## Passos manuais que continuam existindo

Isto **não** é 100% automático — e não dá pra ser, com honestidade:

- Você precisa logar na WebView e tocar em Done a cada execução (a sessão do
  Scriptable não compartilha login com o Chrome, e o Credit Karma pode pedir
  2FA).
- A importação no ledger é um passo separado (escolher o CSV no Import).

O que ele elimina é o trabalho de rolar a lista infinita e copiar à mão — pega
tudo do período em segundos.

## Troubleshooting

- **"Não achei o token de sessão" (NO_TOKEN)**: você não estava logado ou a
  página de transações não tinha carregado quando tocou em Done. Rode de novo
  e espere a lista aparecer.
- **"A API do Credit Karma mudou" (HASH_OUTDATED / PersistedQueryNotFound)**:
  o Credit Karma atualizou o schema GraphQL e os hashes de *persisted query*
  no script ficaram velhos. Para atualizar:
  1. No desktop, logue no Credit Karma, abra DevTools → aba Network.
  2. Vá em Net Worth → Transactions e role um pouco.
  3. Ache as requisições `POST` para `api.creditkarma.com/graphql` com
     `operationName: GetTransactions` e `GetTransactionsList`.
  4. Copie o `sha256Hash` de cada uma (em `extensions.persistedQuery`) e
     substitua `TRANSACTIONS_QUERY_HASH`/`TRANSACTIONS_LIST_HASH` (no
     `creditkarma-export.scriptable.js`) ou `PAGE_HASH`/`LIST_HASH` (no
     `bookmarklet.src.js`). No caminho A, depois rode
     `node tools/credit-karma/build-bookmarklet.js` e reinstale o bookmarklet.
  - Referência da técnica:
    [CreditKarmaExtractor](https://github.com/cbangera2/CreditKarmaExtractor)
    (extensão Chrome) e
    [creditkarma_export_transactions](https://github.com/mmrobins/creditkarma_export_transactions)
    (script Ruby).
- **Veio menos transação do que esperava**: aumente `DAYS_BACK` e/ou
  `MAX_PAGES`.

## Aviso

Isto usa uma API **interna/não documentada** do Credit Karma, acessando a sua
própria conta. Pode parar de funcionar se eles mudarem a API, e use por sua
conta e risco / conforme os termos de uso deles.

---

> **Nota:** não consegui testar contra a API ao vivo (precisa das suas
> credenciais do Credit Karma). A lógica de requisição/paginação foi replicada
> a partir do código do app web do Credit Karma e dos projetos acima. Se algo
> falhar na primeira execução, o erro reportado (NO_TOKEN / HASH_OUTDATED)
> diz exatamente o que ajustar.
