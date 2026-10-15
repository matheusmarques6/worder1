# Comparação visual da aba IA com o protótipo

O protótipo é `docs/prototipo/Worder_Completo_offline_1.html`. Cada passo do
plano `docs/plano-ui-ia-prototipo-2026-10-15.html` termina rodando isto.

```bash
# 1. app em modo dev, com o desvio de login só desta comparação
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:59999 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x \
IA_UI_COMPARE=1 npx next dev -p 3100

# 2. fotos e relatório (ONLY=agentes,construtor limita as telas)
node scripts/ui-compare/run.mjs all http://localhost:3100
```

Saída em `scripts/ui-compare/out/` (fora do git). A API é simulada no
navegador por `mock-api.mjs`; os agregados de `fixtures/` foram gerados com
as funções puras reais. O desvio de login do middleware só existe com
`NODE_ENV=development` e `IA_UI_COMPARE=1`.
