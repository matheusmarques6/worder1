# CLAUDE-MERGE-V3.md — Merge + Testar + Corrigir

## PROMPT:
```
NÃO faça perguntas. NÃO pare. Leia CLAUDE-MERGE-V3.md e execute TUDO.
```

## FASE 1 — MERGE
```bash
git fetch --all && git branch -r
git checkout main && git pull
git checkout -b v3/complete

git merge origin/v3/redesign-functional --no-edit || (git add . && git commit --no-edit)
git merge origin/v3/flows-settings-content --no-edit || (git add . && git commit --no-edit)
```
Conflitos: sidebar → combinar links. tailwind → manter mais completo. Visual → manter Klaviyo style (bg-white). Código → manter versão mais funcional.

## FASE 2 — FIX IMPORTS
```bash
grep -rn "from '@/lib/email\|from '@/lib/segments\|from '@/lib/analytics\|from '@/lib/tracking" src/ --include="*.ts" --include="*.tsx" | head -30
```
Para cada import quebrado: criar stub funcional.

## FASE 3 — VISUAL AUDIT
```bash
# Cards KPI com bg colorido (DEVE SER bg-white border)
grep -rn "bg-brand-[1-4]00\|bg-orange-[1-4]00\|bg-emerald-[1-4]00" src/app --include="*.tsx" | grep -v "text-\|border-\|badge\|hover:" | wc -l

# Backgrounds escuros
grep -rn "bg-dark\|bg-gray-900\|bg-gray-800" src/app --include="*.tsx" | grep -vi "sidebar\|tooltip\|modal" | wc -l

# Font DM Sans
grep -rn "DM.Sans\|DM_Sans" src/app/layout.tsx
```
Corrigir se necessário.

## FASE 4 — FUNCIONALIDADE AUDIT
```bash
# Email libs existem?
ls src/lib/email/*.ts 2>/dev/null
# Tracking endpoints?
find src/app/api/t -name "route.ts" 2>/dev/null
# Campaigns API?
ls src/app/api/email/campaigns/*/route.ts 2>/dev/null
# Segments resolver?
ls src/lib/segments/resolver.ts 2>/dev/null
# Tracker.js?
ls public/worder-tracker.js 2>/dev/null
# Total pages
find src/app -name "page.tsx" | wc -l
```
Se algo falta: criar com implementação funcional.

## FASE 5 — DADOS MOCK
```bash
grep -rn "mock\|Mock\|fake\|dummy\|hardcoded\|sampleData\|testData" src/app --include="*.tsx" | grep -v node_modules | head -20
```
Substituir por queries REAIS.

## FASE 6 — SIDEBAR FINAL
Verificar que a sidebar tem EXATAMENTE os itens do WORDER-ARCHITECTURE.md. Sem duplicatas. Sem links quebrados.

## FASE 7 — BUILD + PUSH
```bash
pnpm install && pnpm build
# Corrigir TUDO
git add -A && git commit -m "v3: complete platform - redesign + functional"
git push origin v3/complete
```
NÃO PARE.
