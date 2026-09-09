# Retrato do esquema (`schema-snapshot.json`)

`schema-snapshot.json` é a lista de colunas de cada tabela e view do
schema `public` em produção, versionada junto do código. Ele existe por
um motivo bem prático: **o PostgREST recusa a linha inteira quando não
conhece um campo, e o erro não vira exceção.** A falha passa calada.

Foi assim que:

- nenhuma campanha de e-mail agendada saía (`error_message` não existia);
- nenhuma campanha de WhatsApp chegou a ser criada (dezesseis colunas);
- pausar campanha respondia "não está num estado que permita pausar"
  para qualquer campanha (`paused_at`);
- o gatilho de entregue/lido da Meta falhava em toda chamada.

Nada disso aparece no `tsc`: do lado do Supabase o payload é um objeto
qualquer.

## Como o retrato é usado

`src/test/schema-drift.test.ts` lê todo o código (`src/`, `worker/`),
extrai as colunas que ele pede a cada tabela (`src/lib/db/column-refs.ts`)
e compara com o retrato.

- coluna inexistente **nova** reprova o teste;
- a dívida antiga vive em `schema-drift-allowlist.json`, e um par que já
  foi consertado também reprova — pedindo para sair da lista. A dívida só
  encolhe.

## Como atualizar depois de uma migration

```sh
pnpm schema:snapshot
```

O comando precisa de `SUPABASE_DB_URL` (a string de conexão do projeto)
ou de `psql` já apontado para ele. Depois de atualizar, rode os testes: se
algum par da lista de dívida tiver sido resolvido pela migration, o teste
diz quais linhas tirar.

Sem o banco à mão, dá para editar o retrato na mão — é um JSON ordenado,
uma tabela por chave, colunas em ordem alfabética. O importante é que ele
descreva o banco de verdade, e não o que a gente gostaria que ele fosse.
