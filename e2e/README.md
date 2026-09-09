# Testes de ponta a ponta

Os testes de unidade provam que cada peça está certa. Estes provam que o
lojista consegue fazer o trabalho dele: criar um popup a partir de um
modelo, publicar, ver o script servido na vitrine, receber a inscrição e
encontrar o resultado na tela.

## O que é preciso

Um ambiente configurado. Sem ele os testes não rodam — e não fingem que
rodaram:

```
cp .env.example .env.local     # preencha Supabase e o resto
E2E_EMAIL=lojista@exemplo.com  # uma conta de teste que já existe
E2E_PASSWORD=…
```

Use um projeto Supabase de teste. Estes testes criam e apagam popups.

## Rodando

```
pnpm e2e          # sobe a aplicação e roda tudo
pnpm e2e:ui       # modo interativo, para desenvolver um teste
E2E_BASE_URL=https://staging.exemplo.com pnpm e2e   # contra um ambiente no ar
```

O Chromium já vem no ambiente (`PLAYWRIGHT_BROWSERS_PATH`), então não é
preciso `playwright install`.

## O que cada arquivo cobre

| Arquivo | O caminho do lojista |
| --- | --- |
| `auth.setup.ts` | Entra uma vez e guarda a sessão para os demais. |
| `popup-lifecycle.spec.ts` | Modelo → editor → publicar → o script aparece na vitrine → analytics. |
| `sending-domain.spec.ts` | A tela de domínios: o endereço temporário aparece como temporário, o domínio próprio é o caminho principal. |

## Quando um teste falha

O relatório guarda rastro, captura de tela e vídeo de quem falhou:

```
npx playwright show-report
```
