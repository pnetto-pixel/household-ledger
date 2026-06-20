# Exportar transações do Credit Karma pelo iPhone

O Credit Karma **não tem botão oficial de exportar transações**, mas funciona
como agregador (todas as suas contas e cartões estão conectados lá). Esta
ferramenta extrai as transações linha a linha direto da API interna do Credit
Karma e gera um CSV pronto para o **Import** do Household Ledger — tudo rodando
no iPhone, sem PC, sem extensão de Chrome e sem bookmarklet.

> **Por que não bookmarklet/extensão?** O Chrome no iOS não roda bookmarklets
> `javascript:` de forma confiável e o iOS não permite extensões de browser
> tipo desktop. A saída é o app **Scriptable**, que tem WebView + acesso a
> rede e arquivos.

## Como funciona

`creditkarma-export.scriptable.js` abre o Credit Karma numa WebView dentro do
Scriptable. Depois que você loga, ele executa o `fetch` da API GraphQL
**de dentro daquela página logada** — então a requisição sai com a origem
`www.creditkarma.com` e os cookies de sessão, exatamente como o site real faz
(CORS e autenticação funcionam). Ele usa duas operações que o próprio app web
do Credit Karma usa:

- `GetTransactionsList` — pega o grosso das transações recentes numa tacada.
- `GetTransactions` — pagina (via `afterCursor`) voltando no tempo até cobrir
  o período pedido.

O resultado vira um CSV cujas **5 primeiras colunas batem com o import do
ledger**: `date,description,amount,category,account` (mais `ck_category,type`
para ajudar você a ajustar o mapeamento).

## Setup (uma vez)

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
- **Conta**: vem o nome da conta como o Credit Karma reporta (ex.: "Sapphire
  Reserve"). Como você tem várias contas no mesmo banco, talvez precise
  renomear para os nomes do ledger ("Chase Reserve" etc.) — dá pra fazer no
  próprio Import (mapeamento) ou editando depois.
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
     substitua `TRANSACTIONS_QUERY_HASH` e `TRANSACTIONS_LIST_HASH` no topo do
     script.
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
