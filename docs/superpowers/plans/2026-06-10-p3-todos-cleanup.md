# P3 — Explicit TODOs Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar os TODOs explícitos deixados no código do Worder — implementando o que tem valor real agora, integrando com infraestrutura que já existe na branch (alerts, Resend, Storage), e substituindo promessas falsas por comportamento honesto onde a implementação completa não se justifica.

**Architecture:** Next.js 14 (App Router) + Supabase (Postgres com RLS por `organization_id`, Storage, service-role via `supabaseAdmin`). Email transacional via Resend (`src/lib/email/resend.ts`). Alertas WhatsApp via `sendAlert()`/`whatsapp_alerts` (`src/lib/whatsapp/alerts.ts`) com dedup e Slack opcional. Auth de rotas via `requireOrgFromAuth` (`src/lib/auth/require-org.ts`). Cada task é independente e commitável sozinha.

**Tech Stack:** TypeScript, Next.js 14.0.4, Supabase JS v2, Resend SDK v6, pdf-parse, mammoth, Vitest 1.x (`npx vitest run`), pnpm.

---

## Contexto e Análise de Impacto

### O que a leitura do código real revelou (difere do enunciado)

1. **Item 3 (quality drop)** — o TODO em `src/app/api/whatsapp/quality/route.ts:320` está **parcialmente obsoleto**: a branch já tem `checkAndAlertQualityRating()` (cron `whatsapp-quality-check`, 30min) que alerta a partir da coluna `quality_rating` de `whatsapp_business_accounts`. Mas a rota `/api/whatsapp/quality?action=check` consulta a Meta **ao vivo** e detecta a queda no momento em que acontece — antes do cron. A task correta é: detectou queda ao vivo → chamar `sendAlert()` (mesmo caminho do cron, com dedup embutido via `dedup_key`), manter o insert em `activity_logs`, remover o TODO. **Não duplicar lógica de email.**

2. **Item 6 (LGPD)** — o TODO em `src/app/api/lgpd/data-requests/route.ts:69` está **97% obsoleto**: o envio do email de verificação via Resend com token **já está implementado** logo abaixo do comentário (linhas 70–87), a tabela `lgpd_data_requests` tem `token UNIQUE` + `verified_at` (migration `20260415_lgpd_lists_stripe.sql`), e `verify/route.ts` existe e funciona. O que falta de verdade: (a) o email promete "válido por 72h" mas o verify **não checa expiração**; (b) se o Resend falhar, a API responde "email enviado" mesmo assim. Task reescopada para esse hardening.

3. **Item 8 (templates de relatório Fase 4)** — o TODO em `src/lib/reports/templates/index.ts:4` está **completamente obsoleto**: os 6 templates (`GeneralReport.tsx`, `SalesReport.tsx`, `ForecastReport.tsx`, `ShopifyReport.tsx`, `EmailReport.tsx`, `AdsReport.tsx`) **já existem** no diretório e são usados pelas rotas `src/app/api/reports/*/route.tsx`. A "Fase 4" já aconteceu; só o barrel `index.ts` ficou como placeholder `export {}`. Task vira limpeza de 5 minutos. **Não é preciso cortar — não há nada grande a implementar.**

4. **Item 7 (Ads)** — `getGoogleMetrics`/`getTikTokMetrics` em `src/lib/services/ads-metrics.ts` **já estão implementadas** (os TODOs das linhas 249/362 são stale), e as tabelas existem (`supabase/migrations/20260123_ads_and_help_tables.sql`, `supabase/ads-schema.sql`). O problema real: **só o Meta tem sync** populando `meta_insights` (`src/app/api/integrations/meta/route.ts`); Google/TikTok têm apenas OAuth callback (tokens), nenhum job escreve em `google_ads_insights`/`tiktok_insights`. Hoje essas funções retornam KPIs zerados — mentira visual ("gastei R$0") em vez de "não conectado". Task honesta: retornar `null` quando `hasAdsIntegration()` é falso, e ligar `marketingSpend` do dashboard ao `meta_insights` (que tem dados reais).

5. **Item 5 (NPS)** — módulo **embrionário**: nenhum `.tsx` no app chama `/api/nps` (zero frontend), e o `send_survey` tem um bug adicional — `total_sent: supabase.rpc('increment', ...)` dentro de `.update()` não funciona (passa um objeto builder como valor). Hoje a action retorna `success: true, sent_to: N` **sem enviar nada**. 

6. **Item 1 (anexos em notas)** — o backend (`inbox/contacts/[id]/notes/route.ts`) **já aceita e persiste** `attachments` (coluna jsonb em `whatsapp_contact_notes`); só falta o upload real. Existe padrão pronto a seguir: `inbox/conversations/[id]/media/route.ts` (validação MIME/tamanho/extensões perigosas + bucket `whatsapp-media` + signed URL 1h + endpoint GET de refresh).

7. **Item 4 (whatsapp-health)** — `/admin` **não está** nas listas `adminOnlyRoutes`/`adminOnlyApis` do `src/middleware.ts` (agentes conseguiriam acessar). `whatsapp_business_accounts` tem `quality_rating`, `messaging_limit`, `status`, `phone_number_id`; `subscribed_apps` precisa de chamada live à Graph API (helper `subscribeAppToWABA` já existe em `cloud-api.ts:870`); `last_webhook_at` = `max(received_at)` em `whatsapp_webhook_events` por `waba_phone_number_id`.

8. **Item 2 (welcome email)** — a rota de agents devolve a senha temporária **no JSON da resposta** (ok, admin vê uma vez). O fluxo de reset existe (`/api/auth` usa `resetPasswordForEmail`). O email deve conter **apenas** link de definição de senha via `adminClient.auth.admin.generateLink({ type: 'recovery' })` — nunca credenciais. Não há templates branded de email transacional em `src/lib/email` (os `emails/*.html` são templates do Supabase Auth); um builder HTML simples e testável basta.

9. **Item 9 (PDF/DOCX)** — `pdf-parse` e `mammoth` **não estão** no `package.json`. `next.config.js` já usa `serverComponentsExternalPackages: ['undici']` — basta acrescentar. Atenção: `pdf-parse` v1 tem bug de modo debug ao importar o index (tenta ler `./test/data/...`); importar `pdf-parse/lib/pdf-parse.js` evita.

10. **Item 10 (upload de fonte de conhecimento)** — nuance importante: o processamento **funciona sem storage** (o buffer vai em base64 para `/api/ai/process/document`). Os dois buracos reais: (a) `uploadError` é engolido e a fonte fica com `file_url: null` sem o cliente saber; (b) se o fetch de `processFileAsync` falhar, a fonte fica **presa em `pending` para sempre** (silêncio total). A correção certa não é 502 no upload (o fallback é legítimo), e sim: expor `storage_uploaded: false` na resposta e marcar a fonte como `error` quando o trigger de processamento falha.

### Itens CORTADOS / ADIADOS (decisão explícita)

| Item | Decisão | Justificativa |
|---|---|---|
| **NPS — envio real (item 5)** | **ADIAR** (vira follow-up). Task mínima: trocar o fake-success por `501 Not Implemented` honesto + remover o `increment` quebrado. | YAGNI: não existe **nenhuma** UI consumindo `/api/nps`. Implementar envio (mesmo só email) seria construir funcionalidade sem usuário, com custo por mensagem e exigência de opt-out — para um endpoint que ninguém chama. Quando o módulo NPS ganhar frontend, integrar primeiro com email (Resend, infra pronta) e só depois WhatsApp (template aprovado pela Meta + opt-in). |
| **Sync de Google Ads / TikTok Ads insights (parte do item 7)** | **CORTAR** deste pacote (projeto próprio). | Pipeline de sync = OAuth refresh + paginação de API + cron + normalização por plataforma. É um projeto por plataforma, não um TODO. Este pacote entrega leitura honesta: Meta com dados reais, Google/TikTok como "não conectado" (`null`). Documentado como follow-up no código. |
| **Botão "re-subscribe" automatizado com retry no whatsapp-health (item 4)** | **Incluído só na forma simples** (POST que chama `subscribeAppToWABA` uma vez). | Retry/backoff/auditoria é refinamento da Onda 5. |

### Tabelas / buckets / serviços tocados

| Recurso | Tasks | Quem mais toca |
|---|---|---|
| `whatsapp_alerts` + `sendAlert()` | T1 | crons `whatsapp-quality-check`, `whatsapp-messaging-limit-check`, `whatsapp-dead-alert`. Dedup por `dedup_key` já previne duplicação rota+cron. |
| `lgpd_data_requests` | T2 | `verify/route.ts`, `[id]/process/route.ts`, cron `lgpd-retention`. Sem migração (colunas já existem). |
| `ai_agent_sources` / bucket `ai-sources` | T5, T7 | `/api/ai/process/document`, rotas de sources. Mudanças retrocompatíveis (sem migração). |
| Resend (`sendEmail`) | T6 (+ T2 já usa) | campanhas de email (`send-campaign-email.ts`), LGPD. Welcome e LGPD são transacionais — sem exigência de opt-out, custo por envio desprezível (1 email por agente criado / por pedido LGPD). |
| Bucket **novo** `contact-attachments` + `whatsapp_contact_notes.attachments` | T8 | rota de notas (já persiste o jsonb). Bucket privado, acesso só por service-role + signed URLs. **Única migração do pacote.** |
| `meta_insights`, `google_ads_insights`, `tiktok_insights` | T9 | sync Meta (`/api/integrations/meta`), relatório Ads (`/api/reports/ads`). Só leitura — seguro em produção. |
| `whatsapp_business_accounts`, `whatsapp_webhook_events`, Graph API | T10 | webhook ingest, crons de quality. Só leitura + POST opcional de re-subscribe. |
| `src/middleware.ts` | T10 | todas as rotas — mudança é só adicionar `/admin` e `/api/admin` às listas admin-only. |

### Env vars (documentar em `.env.example` — feito na T6)

- `RESEND_API_KEY` — **já usada** pelo código, mas ausente do `.env.example`. Adicionar.
- `TRANSACTIONAL_FROM_EMAIL` — remetente de emails transacionais (welcome de agente). Fallback no código.
- `LGPD_FROM_EMAIL` — já usada em `lgpd/data-requests`, ausente do `.env.example`. Adicionar.

Nenhuma env var nova obrigatória; nada quebra em produção se ausentes (envio é best-effort com flag na resposta).

### Seguro em produção sem migração?

- **T1–T7, T9, T10**: sim — só código; tabelas/colunas já existem.
- **T8**: requer a migração do bucket `contact-attachments` **antes** do deploy do código (upload falharia com "bucket not found"; mesmo assim a rota retorna erro explícito, não corrompe nada).

### Priorização (impacto ÷ esforço)

| # | Task | Item | Esforço | Racional |
|---|---|---|---|---|
| T1 | Alert de quality drop via `sendAlert` | 3 | XS | Integra check ao vivo no sistema de alerts existente; risco ~zero. |
| T2 | LGPD: expiração 72h + flag de email | 6 | XS | Fecha promessa de segurança já feita ao usuário no email. |
| T3 | Barrel de templates de relatório | 8 | XS | Remove TODO morto; zero risco. |
| T4 | NPS: 501 honesto + fix do increment quebrado | 5 | XS | Para de mentir `success:true`; corrige bug real. |
| T5 | Upload de fonte: falha visível | 10 | S | Fontes presas em `pending` é perda silenciosa de dados do cliente. |
| T6 | Email de boas-vindas de atendente | 2 | S | Feature prometida na API (`send_welcome_email`) que hoje é no-op. |
| T7 | Extração real de PDF/DOCX | 9 | M | Qualidade do RAG dos agentes IA depende disso; fallback atual é quase inútil para PDF. |
| T8 | Anexos reais em notas do inbox | 1 | M | UI promete e descarta anexos hoje ("⚠️ Preview"). |
| T9 | Ads: `null` p/ não conectado + `marketingSpend` real | 7 | M | CAC/ROI do dashboard hoje são fixos em 0 mesmo com Meta conectado. |
| T10 | Painel admin whatsapp-health | 4 | M | Observabilidade operacional; depende de chamadas live à Meta. |

---

## File Structure

```
src/
  app/api/whatsapp/quality/route.ts                       # T1: modificar (sendAlert)
  app/api/lgpd/data-requests/route.ts                     # T2: modificar (flag email_sent, remover TODO)
  app/api/lgpd/data-requests/verify/route.ts              # T2: modificar (expiração 72h)
  lib/reports/templates/index.ts                          # T3: modificar (barrel real)
  app/api/nps/route.ts                                    # T4: modificar (501 + remover increment)
  app/api/ai/agents/[id]/sources/upload/route.ts          # T5: modificar (erros visíveis)
  lib/email/agent-welcome.ts                              # T6: criar (builder HTML + envio)
  lib/email/__tests__/agent-welcome.test.ts               # T6: criar
  app/api/whatsapp/agents/route.ts                        # T6: modificar (linha ~558)
  .env.example                                            # T6: modificar (RESEND_API_KEY etc.)
  lib/ai/processors/file-extractor.ts                     # T7: criar (pdf-parse/mammoth + fallback)
  lib/ai/processors/file-extractor.test.ts                # T7: criar
  app/api/ai/process/document/route.ts                    # T7: modificar (usar extractor)
  next.config.js                                          # T7: modificar (externalPackages)
  lib/inbox/note-attachment-validation.ts                 # T8: criar (validação pura)
  lib/inbox/note-attachment-validation.test.ts            # T8: criar
  app/api/whatsapp/inbox/contacts/[id]/notes/upload/route.ts  # T8: criar (endpoint upload)
  app/api/whatsapp/inbox/contacts/[id]/notes/route.ts     # T8: modificar (re-assinar URLs no GET)
  components/whatsapp/inbox/tabs/NotesTab.tsx             # T8: modificar (upload real)
  lib/services/ads-metrics.ts                             # T9: modificar (null p/ não conectado)
  app/api/dashboard/metrics/route.ts                      # T9: modificar (marketingSpend real)
  app/api/admin/whatsapp-health/route.ts                  # T10: criar (API org-scoped)
  app/(dashboard)/admin/whatsapp-health/page.tsx          # T10: reescrever (tabela + refresh)
  middleware.ts                                           # T10: modificar (proteger /admin)
supabase/migrations/
  20260610_contact_attachments_bucket.sql                 # T8: criar (única migração)
```

Worktree: `D:\worder1-fwrle` (branch `claude/debug-console-error-FWrLE`). Todos os comandos abaixo assumem cwd nesse diretório.

---

### Task 1: Alert real de queda de quality (item 3)

**Files:**
- Modify: `src/app/api/whatsapp/quality/route.ts` (função `checkAndNotifyQualityDrop`, linhas ~305-339)

- [ ] **Step 1: Integrar `sendAlert` na detecção ao vivo**

No topo do arquivo, adicionar import:

```ts
import { sendAlert } from '@/lib/whatsapp/alerts'
```

Substituir o bloco do TODO (linhas 320-321) dentro de `checkAndNotifyQualityDrop` — manter o insert em `activity_logs` e **adicionar antes dele**:

```ts
  if (previousScore > newScore && newScore > 0) {
    console.log(`⚠️ Quality dropped for ${instance.phone_number}: ${previousRating} → ${newRating}`)

    // Mesmo caminho dos crons (whatsapp_alerts + Slack), com dedup por waba.
    // checkAndAlertQualityRating (cron 30min) cobre o estado persistido;
    // aqui alertamos no momento da detecção ao vivo via Meta.
    await sendAlert({
      severity: newRating === 'RED' ? 'critical' : 'warning',
      type: 'quality_drop',
      title: `WhatsApp Quality caiu: ${previousRating} → ${newRating}`,
      message: `Número ${instance.phone_number || instance.phone_number_id} caiu de ${previousRating} para ${newRating}. Limite de envio: ${newQuality.messaging_limit_tier}.`,
      metadata: {
        phone_number_id: instance.phone_number_id,
        previous_rating: previousRating,
        new_rating: newRating,
        messaging_limit: newQuality.messaging_limit_tier,
      },
      organizationId: instance.organization_id,
      wabaId: instance.id,
    }).catch(() => { /* alert é best-effort, não derruba o check */ })

    // ... (insert em activity_logs permanece como está)
```

Remover as duas linhas do comentário `// TODO: Implementar notificação por email/webhook` / `// Por enquanto, apenas salvar no log`.

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit 2>&1 | grep "quality/route"`
Expected: nenhuma linha (sem erros novos nesse arquivo).

- [ ] **Step 3: Verificação manual (opcional, se houver conta de teste)**

`GET /api/whatsapp/quality?organization_id=<org>&action=check` com uma instância cujo `quality_rating` salvo seja maior que o atual da Meta → linha aparece em `whatsapp_alerts` (e Slack, se `SLACK_WEBHOOK_URL` setado). Repetir a chamada → sem duplicata (dedup `quality_drop:<wabaId>`).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/whatsapp/quality/route.ts
git commit -m "feat(whatsapp): alerta real de queda de quality via sendAlert (remove TODO)"
```

---

### Task 2: LGPD — expiração de 72h do token + resposta honesta (item 6)

O email já é enviado com token (TODO obsoleto). Falta cumprir o "válido por 72h" e não afirmar sucesso quando o Resend falha.

**Files:**
- Modify: `src/app/api/lgpd/data-requests/verify/route.ts`
- Modify: `src/app/api/lgpd/data-requests/route.ts` (linhas 69-93)

- [ ] **Step 1: Enforçar expiração no verify**

Em `verify/route.ts`, após o bloco `if (request.verified_at)` (linha 43), adicionar:

```ts
  // Token vale 72h (prometido no email de verificação)
  const TOKEN_TTL_MS = 72 * 60 * 60 * 1000
  if (Date.now() - new Date(request.created_at).getTime() > TOKEN_TTL_MS) {
    return new NextResponse(
      `<!doctype html><html><body style="font-family:sans-serif;max-width:500px;margin:40px auto;padding:20px;">
       <h1>Link expirado</h1>
       <p>Este link de confirmação expirou (válido por 72h). Por favor, faça um novo pedido LGPD.</p>
       </body></html>`,
      { status: 410, headers: { 'Content-Type': 'text/html' } }
    )
  }
```

- [ ] **Step 2: Resposta honesta no POST**

Em `data-requests/route.ts`: remover a linha `// TODO: enviar email de verificação...` (linha 69, substituir por comentário descritivo `// Envia email de verificação com token (válido 72h — enforced no verify)`). Trocar o bloco de envio para capturar o resultado:

```ts
    let emailSent = false
    try {
      const { sendEmail } = await import('@/lib/email/resend')
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
      const verifyLink = `${baseUrl}/api/lgpd/data-requests/verify?token=${token}`
      const fromEmail = process.env.LGPD_FROM_EMAIL || 'privacy@worder.app'

      await sendEmail({
        to: requester_email,
        from: fromEmail,
        subject: `Confirme seu pedido de ${request_type} - LGPD`,
        html: `...(html existente, inalterado)...`,
      })
      emailSent = true
    } catch (e: any) {
      console.warn('[lgpd/data-requests] email send failed:', e?.message)
    }

    return NextResponse.json({
      success: true,
      request_id: requestRow.id,
      email_sent: emailSent,
      message: emailSent
        ? 'Um email de confirmação foi enviado para ' + requester_email
        : 'Pedido registrado, mas o email de confirmação não pôde ser enviado. Contate o suporte.',
    })
```

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit 2>&1 | grep "lgpd"` — Expected: vazio.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/lgpd/data-requests/route.ts src/app/api/lgpd/data-requests/verify/route.ts
git commit -m "fix(lgpd): enforca expiracao 72h do token de verificacao e expoe falha de envio de email"
```

---

### Task 3: Barrel real dos templates de relatório (item 8 — TODO obsoleto)

Os 6 templates da "Fase 4" já existem em `src/lib/reports/templates/*.tsx`. Só o `index.ts` ficou como placeholder.

**Files:**
- Modify: `src/lib/reports/templates/index.ts`

- [ ] **Step 1: Confirmar ausência de ciclo de import**

Run: `grep -n "from './templates'" D:\worder1-fwrle\src\lib\reports\index.ts`
Expected: vazio (lib/reports/index.ts não importa o barrel — os templates importam `../index`, então o barrel pode exportá-los sem ciclo).

- [ ] **Step 2: Substituir o placeholder pelo barrel**

Conteúdo completo do novo `src/lib/reports/templates/index.ts`:

```ts
/**
 * Templates de Relatórios PDF (react-pdf)
 * Fase 4 concluída — templates implementados nos arquivos deste diretório.
 */
export { GeneralReport } from './GeneralReport'
export { SalesReport } from './SalesReport'
export { ForecastReport } from './ForecastReport'
export { ShopifyReport } from './ShopifyReport'
export { EmailReport } from './EmailReport'
export { AdsReport } from './AdsReport'
```

(Conferir o nome exato do export de cada arquivo antes — ex.: `grep -n "export function" src/lib/reports/templates/*.tsx`.)

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit 2>&1 | grep "reports/templates"` — Expected: vazio.
Run: `npx vitest run src/lib` — Expected: testes existentes continuam passando.

- [ ] **Step 4: Commit**

```bash
git add src/lib/reports/templates/index.ts
git commit -m "chore(reports): barrel real dos templates — remove TODO obsoleto da Fase 4"
```

---

### Task 4: NPS — parar de fingir envio (item 5, decisão: ADIAR envio real)

Sem nenhuma UI consumindo `/api/nps`, implementar envio agora é YAGNI. Trocar o fake-success por `501` e remover o `increment` quebrado (passar um query builder como valor de update não incrementa nada).

**Files:**
- Modify: `src/app/api/nps/route.ts` (action `send_survey`, linhas 203-231)

- [ ] **Step 1: Substituir o bloco `send_survey`**

```ts
    if (action === 'send_survey') {
      const { survey_id, contact_ids } = data

      if (!survey_id || !contact_ids?.length) {
        return NextResponse.json(
          { error: 'survey_id and contact_ids are required' },
          { status: 400 }
        )
      }

      // Envio real ainda não implementado (sem UI consumindo o módulo NPS).
      // Follow-up: integrar primeiro com email (Resend já disponível em
      // src/lib/email/resend.ts) e só depois WhatsApp (exige template
      // aprovado pela Meta + opt-in). Quando implementar, incrementar
      // total_sent com select+update ou RPC dedicada — NUNCA passando
      // supabase.rpc() como valor de coluna (bug removido aqui).
      return NextResponse.json(
        {
          error: 'Envio de pesquisas NPS ainda não está disponível',
          code: 'NOT_IMPLEMENTED',
        },
        { status: 501 }
      )
    }
```

(Remove integralmente o `update({ total_sent: supabase.rpc(...) })` e o `return { success: true, sent_to }`.)

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit 2>&1 | grep "api/nps"` — Expected: vazio.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/nps/route.ts
git commit -m "fix(nps): send_survey retorna 501 honesto em vez de fake-success; remove increment quebrado"
```

---

### Task 5: Upload de fonte de conhecimento — falhas visíveis (item 10)

Decisão de design (após análise do fluxo async): o fallback "processa sem storage" é **legítimo** — o buffer segue em base64 para `/api/ai/process/document`, e a fonte fica `ready` mesmo sem `file_url`. Os bugs reais: (a) cliente não sabe que o arquivo não foi arquivado; (b) se o trigger de processamento falhar, a fonte fica `pending` para sempre.

**Files:**
- Modify: `src/app/api/ai/agents/[id]/sources/upload/route.ts`

- [ ] **Step 1: Expor falha de storage na resposta**

Substituir o bloco das linhas 96-101 por:

```ts
    let storageUploaded = true
    if (uploadError) {
      storageUploaded = false
      console.error('[ai/sources/upload] Storage upload failed (bucket ai-sources):', uploadError.message)
      // Fallback explícito: o processamento abaixo usa o buffer em memória
      // (base64), então a fonte ainda será indexada — mas sem arquivo
      // arquivado (file_url = null). O cliente é informado via
      // storage_uploaded: false na resposta.
    }
```

E trocar o retorno final do POST:

```ts
    return NextResponse.json(
      {
        source,
        storage_uploaded: storageUploaded,
        ...(storageUploaded ? {} : {
          warning: 'Arquivo será indexado, mas não pôde ser arquivado no storage (bucket ai-sources indisponível). O download original não estará disponível.',
        }),
      },
      { status: 201 }
    )
```

- [ ] **Step 2: Marcar fonte como `error` quando o trigger de processamento falha**

Substituir `processFileAsync` inteira:

```ts
async function processFileAsync(
  sourceId: string,
  organizationId: string,
  fileBuffer: Buffer,
  mimeType: string
) {
  const supabase = getSupabase()
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const res = await fetch(`${baseUrl}/api/ai/process/document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_id: sourceId,
        organization_id: organizationId,
        file_content: fileBuffer.toString('base64'),
        mime_type: mimeType,
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error || `process/document respondeu ${res.status}`)
    }
  } catch (error: any) {
    console.error('Error triggering file processing:', error)
    // Sem isso a fonte ficaria presa em 'pending' para sempre (falha silenciosa).
    await supabase
      .from('ai_agent_sources')
      .update({
        status: 'error',
        error_message: `Falha ao iniciar processamento: ${error?.message || 'erro desconhecido'}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sourceId)
      .then(undefined, () => {})
  }
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit 2>&1 | grep "sources/upload"` — Expected: vazio.
Manual: subir um `.txt` com o dev server rodando → fonte fica `ready`. Derrubar `OPENAI_API_KEY` e subir outro → fonte fica `error` com `error_message` visível (o process/document já marca error; o novo caminho cobre falha do próprio fetch).

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/ai/agents/[id]/sources/upload/route.ts"
git commit -m "fix(ai-sources): falha de storage exposta na resposta e fonte marcada como error quando trigger de processamento falha"
```

---

### Task 6: Email de boas-vindas ao criar atendente (item 2)

Sem credenciais no email — apenas link de definição de senha gerado por `auth.admin.generateLink({ type: 'recovery' })`. Best-effort: falha de email não pode falhar a criação do agente.

**Files:**
- Create: `src/lib/email/agent-welcome.ts`
- Test: `src/lib/email/__tests__/agent-welcome.test.ts`
- Modify: `src/app/api/whatsapp/agents/route.ts` (linha ~558)
- Modify: `.env.example`

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/email/__tests__/agent-welcome.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildAgentWelcomeEmailHtml } from '../agent-welcome'

describe('buildAgentWelcomeEmailHtml', () => {
  const params = {
    agentName: 'Maria Silva',
    organizationName: 'Loja Acme',
    setPasswordLink: 'https://app.worder.com/auth/recovery?token=abc123',
    loginUrl: 'https://app.worder.com/login',
  }

  it('inclui o link de definição de senha', () => {
    const html = buildAgentWelcomeEmailHtml(params)
    expect(html).toContain(params.setPasswordLink)
  })

  it('inclui nome do atendente e da organização', () => {
    const html = buildAgentWelcomeEmailHtml(params)
    expect(html).toContain('Maria Silva')
    expect(html).toContain('Loja Acme')
  })

  it('NUNCA contém senha ou placeholder de senha', () => {
    const html = buildAgentWelcomeEmailHtml(params).toLowerCase()
    expect(html).not.toContain('senha:')
    expect(html).not.toContain('password:')
    expect(html).not.toContain('credencia')
  })

  it('escapa HTML em nomes (anti-injeção)', () => {
    const html = buildAgentWelcomeEmailHtml({
      ...params,
      agentName: '<script>alert(1)</script>',
    })
    expect(html).not.toContain('<script>')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/email/__tests__/agent-welcome.test.ts`
Expected: FAIL — `Cannot find module '../agent-welcome'`.

- [ ] **Step 3: Implementar `src/lib/email/agent-welcome.ts`**

```ts
// =============================================
// WORDER: Email de boas-vindas para atendente (agente humano)
// Sem credenciais no corpo — apenas link de definição de senha
// (generateLink type 'recovery', gerado pelo caller).
// =============================================

import { sendEmail } from './resend'

export interface AgentWelcomeParams {
  agentName: string
  organizationName: string
  setPasswordLink: string
  loginUrl: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildAgentWelcomeEmailHtml(params: AgentWelcomeParams): string {
  const name = escapeHtml(params.agentName)
  const org = escapeHtml(params.organizationName)
  return `<!doctype html>
<html><body style="font-family:sans-serif;max-width:520px;margin:40px auto;padding:24px;color:#1f2937;">
  <h1 style="font-size:20px;">Bem-vindo(a) à equipe, ${name}!</h1>
  <p>Você foi cadastrado(a) como atendente de <strong>${org}</strong> no Worder.</p>
  <p>Para acessar, primeiro defina sua senha pelo link abaixo (válido por tempo limitado):</p>
  <p style="margin:24px 0;">
    <a href="${params.setPasswordLink}"
       style="background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;">
      Definir minha senha
    </a>
  </p>
  <p>Depois é só entrar em <a href="${params.loginUrl}">${params.loginUrl}</a> com seu email.</p>
  <p style="color:#6b7280;font-size:12px;margin-top:32px;">
    Se você não esperava este email, ignore-o.
  </p>
</body></html>`
}

/** Best-effort: lança erro só para o caller logar — nunca contém credenciais. */
export async function sendAgentWelcomeEmail(opts: {
  to: string
  params: AgentWelcomeParams
}): Promise<void> {
  const from = process.env.TRANSACTIONAL_FROM_EMAIL || 'no-reply@worder.app'
  await sendEmail({
    to: opts.to,
    from,
    senderName: 'Worder',
    subject: `Bem-vindo(a) à equipe de ${opts.params.organizationName} no Worder`,
    html: buildAgentWelcomeEmailHtml(opts.params),
    tags: [{ name: 'category', value: 'agent-welcome' }],
  })
}
```

- [ ] **Step 4: Rodar testes — passar**

Run: `npx vitest run src/lib/email/__tests__/agent-welcome.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Integrar na rota de agents**

Em `src/app/api/whatsapp/agents/route.ts`, substituir o TODO (linhas 558-559) por (adaptar nomes de variáveis ao escopo real — `name`, `email`, `orgId`, `adminClient` já existem ali):

```ts
      // Email de boas-vindas (best-effort; nunca contém credenciais —
      // envia link de definição de senha via recovery link).
      let welcomeEmailSent = false
      if (send_welcome_email && email) {
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
          const { data: linkData, error: linkError } =
            await adminClient.auth.admin.generateLink({
              type: 'recovery',
              email,
              options: { redirectTo: `${baseUrl}/reset-password` },
            })
          if (linkError || !linkData?.properties?.action_link) {
            throw new Error(linkError?.message || 'generateLink não retornou action_link')
          }

          const { data: org } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', orgId)
            .maybeSingle()

          const { sendAgentWelcomeEmail } = await import('@/lib/email/agent-welcome')
          await sendAgentWelcomeEmail({
            to: email,
            params: {
              agentName: name,
              organizationName: org?.name || 'sua organização',
              setPasswordLink: linkData.properties.action_link,
              loginUrl: `${baseUrl}/login`,
            },
          })
          welcomeEmailSent = true
        } catch (e: any) {
          console.warn('[agents] welcome email failed:', e?.message)
        }
      }
```

E incluir `welcome_email_sent: welcomeEmailSent` no JSON de sucesso (linha ~561). **Antes de codar**: conferir com `grep -rn "redirectTo" src/app/api/auth/route.ts` qual rota de redirect o fluxo de reset existente usa, e usar a mesma (em vez de `/reset-password` chutado).

- [ ] **Step 6: Documentar env vars**

Adicionar ao `.env.example` (seção nova, após Supabase):

```
# ============================================
# Email transacional (Resend)
# ============================================
RESEND_API_KEY=
# Remetente de emails transacionais (welcome de atendente etc.)
TRANSACTIONAL_FROM_EMAIL=no-reply@worder.app
# Remetente dos emails de verificação LGPD
LGPD_FROM_EMAIL=privacy@worder.app
```

- [ ] **Step 7: Verificar e commitar**

Run: `npx vitest run src/lib/email` e `npx tsc --noEmit 2>&1 | grep -E "agents/route|agent-welcome"`
Expected: testes verdes; sem erros TS novos.

```bash
git add src/lib/email/agent-welcome.ts src/lib/email/__tests__/agent-welcome.test.ts src/app/api/whatsapp/agents/route.ts .env.example
git commit -m "feat(agents): email de boas-vindas com link de definicao de senha (sem credenciais no corpo)"
```

---

### Task 7: Extração real de PDF/DOCX com pdf-parse e mammoth (item 9)

**Files:**
- Create: `src/lib/ai/processors/file-extractor.ts`
- Test: `src/lib/ai/processors/file-extractor.test.ts`
- Modify: `src/app/api/ai/process/document/route.ts` (remover linhas 180-237, importar do novo módulo)
- Modify: `next.config.js`, `package.json`

- [ ] **Step 1: Instalar dependências**

Run: `pnpm add pdf-parse mammoth && pnpm add -D @types/pdf-parse`
Expected: deps adicionadas a `package.json`/`pnpm-lock.yaml`.

- [ ] **Step 2: Registrar como pacotes externos no Next**

Em `next.config.js` (linha 4):

```js
serverComponentsExternalPackages: ['undici', 'pdf-parse', 'mammoth'],
```

- [ ] **Step 3: Escrever testes que falham**

`src/lib/ai/processors/file-extractor.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dos parsers ANTES de importar o módulo (imports são dinâmicos
// dentro das funções, então vi.mock intercepta).
vi.mock('pdf-parse/lib/pdf-parse.js', () => ({
  default: vi.fn(async () => ({ text: 'texto extraído do pdf' })),
}))
vi.mock('mammoth', () => ({
  default: { extractRawText: vi.fn(async () => ({ value: 'texto extraído do docx' })) },
  extractRawText: vi.fn(async () => ({ value: 'texto extraído do docx' })),
}))

import { extractTextFromFile } from './file-extractor'

describe('extractTextFromFile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('texto plano: decodifica utf-8 direto', async () => {
    const b64 = Buffer.from('olá mundo', 'utf-8').toString('base64')
    expect(await extractTextFromFile(b64, 'text/plain')).toBe('olá mundo')
  })

  it('pdf: usa pdf-parse', async () => {
    const b64 = Buffer.from('%PDF-1.4 fake').toString('base64')
    expect(await extractTextFromFile(b64, 'application/pdf')).toBe('texto extraído do pdf')
  })

  it('docx: usa mammoth', async () => {
    const b64 = Buffer.from('PK fake zip').toString('base64')
    const out = await extractTextFromFile(
      b64,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    expect(out).toBe('texto extraído do docx')
  })

  it('pdf: cai no fallback regex se pdf-parse lançar', async () => {
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default as any
    pdfParse.mockRejectedValueOnce(new Error('corrupt'))
    // Conteúdo no formato que o fallback regex captura: (texto) entre parênteses
    const b64 = Buffer.from('stream (Hello) (World) endstream').toString('base64')
    const out = await extractTextFromFile(b64, 'application/pdf')
    expect(out).toContain('Hello')
    expect(out).toContain('World')
  })

  it('mime desconhecido: lança erro', async () => {
    await expect(
      extractTextFromFile(Buffer.from('x').toString('base64'), 'image/png')
    ).rejects.toThrow(/não suportado/)
  })
})
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run src/lib/ai/processors/file-extractor.test.ts`
Expected: FAIL — módulo `./file-extractor` não existe.

- [ ] **Step 5: Implementar `src/lib/ai/processors/file-extractor.ts`**

```ts
// =============================================
// Extração de texto de arquivos (PDF/DOCX/TXT/CSV)
// pdf-parse + mammoth com fallback regex (comportamento anterior)
// quando o parser falha em arquivo corrompido/atípico.
//
// NOTA: importar 'pdf-parse/lib/pdf-parse.js' (não 'pdf-parse') —
// o index do pacote tem código de debug que tenta ler um arquivo
// de teste local e quebra em produção.
// =============================================

export async function extractTextFromFile(
  base64Content: string,
  mimeType: string
): Promise<string> {
  const buffer = Buffer.from(base64Content, 'base64')

  if (mimeType === 'text/plain' || mimeType === 'text/csv') {
    return buffer.toString('utf-8')
  }
  if (mimeType === 'application/pdf') {
    return extractTextFromPDF(buffer)
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    return extractTextFromDOCX(buffer)
  }
  throw new Error(`Tipo de arquivo não suportado: ${mimeType}`)
}

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
    const result = await pdfParse(buffer)
    if (result?.text?.trim()) return result.text
    // PDF sem camada de texto (escaneado) — tenta fallback abaixo
  } catch (e: any) {
    console.warn('[file-extractor] pdf-parse falhou, usando fallback regex:', e?.message)
  }
  // Fallback: extração ingênua (comportamento anterior do route)
  const raw = buffer.toString('utf-8')
  const extracted = raw.match(/\(([^)]+)\)/g) || []
  const text = extracted.map((s) => s.slice(1, -1)).join(' ')
  if (!text.trim()) {
    throw new Error('Não foi possível extrair texto do PDF (sem camada de texto?)')
  }
  return text
}

export async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth')
    const extractRawText = (mammoth as any).extractRawText || (mammoth as any).default?.extractRawText
    const result = await extractRawText({ buffer })
    if (result?.value?.trim()) return result.value
  } catch (e: any) {
    console.warn('[file-extractor] mammoth falhou, usando fallback regex:', e?.message)
  }
  // Fallback: regex sobre o XML cru (comportamento anterior)
  const raw = buffer.toString('utf-8')
  const matches = raw.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []
  const text = matches.map((m) => m.replace(/<[^>]+>/g, '')).join(' ').trim()
  if (!text) {
    throw new Error('Não foi possível extrair texto do DOCX')
  }
  return text
}
```

- [ ] **Step 6: Rodar testes — passar**

Run: `npx vitest run src/lib/ai/processors/file-extractor.test.ts`
Expected: 5 passed.

- [ ] **Step 7: Usar no route e deletar as versões inline**

Em `src/app/api/ai/process/document/route.ts`: adicionar `import { extractTextFromFile } from '@/lib/ai/processors/file-extractor'` e **remover** as funções inline `extractTextFromFile`, `extractTextFromPDF`, `extractTextFromDOCX` (linhas 180-237). `crawlUrl` permanece.

- [ ] **Step 8: Teste de fumaça com fixture real (manual)**

Com o dev server rodando, subir um PDF pequeno real (1 página com texto) via UI de fontes do agente IA → fonte fica `ready` com `chunks_count > 0` e o conteúdo dos chunks é legível (verificar em `ai_agent_chunks.content`). Repetir com um `.docx` de uma frase.

- [ ] **Step 9: Verificar suite completa e commitar**

Run: `npx vitest run` — Expected: tudo verde.
Run: `npx tsc --noEmit 2>&1 | grep -E "file-extractor|process/document"` — Expected: vazio.

```bash
git add package.json pnpm-lock.yaml next.config.js src/lib/ai/processors/file-extractor.ts src/lib/ai/processors/file-extractor.test.ts src/app/api/ai/process/document/route.ts
git commit -m "feat(ai): extracao real de PDF/DOCX com pdf-parse e mammoth + fallback regex"
```

---

### Task 8: Upload real de anexos em notas do inbox (item 1)

Backend de notas já persiste `attachments` (jsonb). Falta: bucket, endpoint de upload (padrão do endpoint de mídia do inbox), re-assinatura de URLs no GET, e frontend real.

**Files:**
- Create: `supabase/migrations/20260610_contact_attachments_bucket.sql`
- Create: `src/lib/inbox/note-attachment-validation.ts`
- Test: `src/lib/inbox/note-attachment-validation.test.ts`
- Create: `src/app/api/whatsapp/inbox/contacts/[id]/notes/upload/route.ts`
- Modify: `src/app/api/whatsapp/inbox/contacts/[id]/notes/route.ts` (GET)
- Modify: `src/components/whatsapp/inbox/tabs/NotesTab.tsx`

- [ ] **Step 1: Migração do bucket (privado, service-role only)**

`supabase/migrations/20260610_contact_attachments_bucket.sql`:

```sql
-- Bucket privado para anexos de notas de contato (inbox).
-- Acesso exclusivamente via service-role (rotas API) + signed URLs.
-- Sem policies em storage.objects: o default-deny do RLS bloqueia
-- acesso direto de clientes anon/authenticated.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contact-attachments',
  'contact-attachments',
  false,
  10485760, -- 10MB (mesmo limite da UI atual)
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv'
  ]
)
on conflict (id) do nothing;
```

Aplicar no projeto Supabase (via MCP `apply_migration` ou dashboard) **antes** do deploy do código.

- [ ] **Step 2: Teste da validação pura (falha primeiro)**

`src/lib/inbox/note-attachment-validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateNoteAttachment } from './note-attachment-validation'

describe('validateNoteAttachment', () => {
  it('aceita imagem jpeg de 1MB', () => {
    expect(validateNoteAttachment({ name: 'a.jpg', type: 'image/jpeg', size: 1024 * 1024 }))
      .toEqual({ valid: true, kind: 'image' })
  })
  it('aceita pdf como document', () => {
    expect(validateNoteAttachment({ name: 'a.pdf', type: 'application/pdf', size: 1000 }))
      .toEqual({ valid: true, kind: 'document' })
  })
  it('rejeita arquivo acima de 10MB', () => {
    const r = validateNoteAttachment({ name: 'a.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 })
    expect(r.valid).toBe(false)
  })
  it('rejeita mime não permitido', () => {
    const r = validateNoteAttachment({ name: 'a.zip', type: 'application/zip', size: 100 })
    expect(r.valid).toBe(false)
  })
  it('rejeita extensão perigosa mesmo com mime permitido', () => {
    const r = validateNoteAttachment({ name: 'a.exe', type: 'image/png', size: 100 })
    expect(r.valid).toBe(false)
  })
})
```

Run: `npx vitest run src/lib/inbox/note-attachment-validation.test.ts` — Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar a validação**

`src/lib/inbox/note-attachment-validation.ts`:

```ts
// Validação de anexos de notas do inbox — espelha allowed_mime_types
// do bucket 'contact-attachments' e o padrão do endpoint de mídia
// (DANGEROUS_EXTENSIONS em inbox/conversations/[id]/media).

export const NOTE_ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024 // 10MB

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
]
const DANGEROUS_EXTENSIONS = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.jar', '.msi']

export type NoteAttachmentValidation =
  | { valid: true; kind: 'image' | 'document' }
  | { valid: false; error: string }

export function validateNoteAttachment(file: {
  name: string
  type: string
  size: number
}): NoteAttachmentValidation {
  if (file.size > NOTE_ATTACHMENT_MAX_SIZE) {
    return { valid: false, error: `Arquivo muito grande. Máximo: ${NOTE_ATTACHMENT_MAX_SIZE / 1024 / 1024}MB` }
  }
  if (DANGEROUS_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) {
    return { valid: false, error: 'Tipo de arquivo não permitido por segurança' }
  }
  if (IMAGE_TYPES.includes(file.type)) return { valid: true, kind: 'image' }
  if (DOCUMENT_TYPES.includes(file.type)) return { valid: true, kind: 'document' }
  return { valid: false, error: `Tipo de arquivo não suportado: ${file.type}` }
}
```

Run: `npx vitest run src/lib/inbox/note-attachment-validation.test.ts` — Expected: 5 passed. Commit parcial:

```bash
git add supabase/migrations/20260610_contact_attachments_bucket.sql src/lib/inbox/note-attachment-validation.ts src/lib/inbox/note-attachment-validation.test.ts
git commit -m "feat(inbox): bucket contact-attachments + validacao de anexos de notas"
```

- [ ] **Step 4: Endpoint de upload**

`src/app/api/whatsapp/inbox/contacts/[id]/notes/upload/route.ts` (segue o padrão de auth + escopo de org do `notes/route.ts` e o padrão de storage do `media/route.ts`):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
import { validateNoteAttachment } from '@/lib/inbox/note-attachment-validation'

export const dynamic = 'force-dynamic'

const SIGNED_URL_EXPIRY = 60 * 60 * 24 * 7 // 7 dias (GET de notas re-assina)

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const contactId = params.id

    // Contato pertence à org? (mesmo check duplo de notes/route.ts)
    const { data: contact } = await supabase
      .from('contacts').select('id')
      .eq('id', contactId).eq('organization_id', orgId).maybeSingle()
    if (!contact) {
      const { data: waContact } = await supabase
        .from('whatsapp_contacts').select('id')
        .eq('id', contactId).eq('organization_id', orgId).maybeSingle()
      if (!waContact) {
        return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 })
      }
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'file é obrigatório' }, { status: 400 })
    }

    const validation = validateNoteAttachment({ name: file.name, type: file.type, size: file.size })
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const sanitized = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const storagePath = `${orgId}/${contactId}/${uniqueId}_${sanitized}`

    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await supabase.storage
      .from('contact-attachments')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
        cacheControl: '3600',
      })
    if (upErr) {
      console.error('[notes/upload] storage error:', upErr)
      return NextResponse.json(
        { error: `Falha ao salvar anexo no storage: ${upErr.message}` },
        { status: 502 }
      )
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from('contact-attachments')
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY)
    if (signErr || !signed?.signedUrl) {
      return NextResponse.json({ error: 'Falha ao gerar URL do anexo' }, { status: 502 })
    }

    return NextResponse.json({
      attachment: {
        type: validation.kind,
        url: signed.signedUrl,
        storage_path: storagePath,
        name: file.name,
        size: file.size,
      },
    }, { status: 201 })
  } catch (error: any) {
    console.error('[notes/upload] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

- [ ] **Step 5: Re-assinar URLs no GET de notas**

Em `notes/route.ts` (GET), após buscar `notes`, antes do return:

```ts
    // Re-assina anexos do bucket privado (signed URLs expiram).
    const refreshed = await Promise.all((notes || []).map(async (note: any) => {
      if (!Array.isArray(note.attachments) || note.attachments.length === 0) return note
      const attachments = await Promise.all(note.attachments.map(async (att: any) => {
        if (!att?.storage_path) return att
        const { data: signed } = await supabase.storage
          .from('contact-attachments')
          .createSignedUrl(att.storage_path, 60 * 60 * 24 * 7)
        return signed?.signedUrl ? { ...att, url: signed.signedUrl } : att
      }))
      return { ...note, attachments }
    }))

    return NextResponse.json({ notes: refreshed })
```

- [ ] **Step 6: Frontend — upload real no NotesTab**

Em `NotesTab.tsx`:
1. Adicionar `storage_path?: string` à interface `NoteAttachment`.
2. Substituir `handleFileUpload` (linhas 96-130) — para cada arquivo: validar tamanho localmente (mantém o alert de 10MB), montar `FormData` com `file`, `fetch('/api/whatsapp/inbox/contacts/' + contactId + '/notes/upload', { method: 'POST', body: formData })`; em sucesso, `setAttachments(prev => [...prev, data.attachment])`; em erro, `alert(data.error)`. Remover `URL.createObjectURL` e o bloco de TODO comentado.
3. Em `handleSubmit` (linhas 62-88): remover toda a lógica de `hasBlobAttachments`/filtro de blob e o alert "Anexos ainda não são suportados" — enviar `attachments` direto.
4. Remover o badge "⚠️ Preview" (linhas 257-262) e os títulos "(preview local)" dos botões (linhas 222 e 240).
5. Em `removeAttachment`: só chamar `URL.revokeObjectURL` se a url começar com `blob:` (não vai mais acontecer, mas evita exception) — simplificar para apenas remover do array.

- [ ] **Step 7: Verificação manual (UI pura)**

Com dev server + migração aplicada:
1. Inbox → conversa → painel do contato → aba Notas.
2. Anexar uma imagem JPG < 10MB → aparece spinner, depois thumbnail (URL `https://<proj>.supabase.co/storage/v1/object/sign/...`, não `blob:`).
3. Enviar nota com texto + anexo → nota aparece na lista com a imagem clicável.
4. Recarregar a página → anexo continua visível (URL re-assinada pelo GET).
5. Tentar anexar um `.zip` → erro claro, nada adicionado.
6. Conferir no Supabase Storage: objeto em `contact-attachments/<orgId>/<contactId>/...`.

- [ ] **Step 8: Verificar e commitar**

Run: `npx vitest run src/lib/inbox` e `npx tsc --noEmit 2>&1 | grep -E "notes|NotesTab"` — Expected: verde / vazio.

```bash
git add "src/app/api/whatsapp/inbox/contacts/[id]/notes/upload/route.ts" "src/app/api/whatsapp/inbox/contacts/[id]/notes/route.ts" src/components/whatsapp/inbox/tabs/NotesTab.tsx
git commit -m "feat(inbox): upload real de anexos em notas via Supabase Storage (bucket contact-attachments)"
```

---

### Task 9: Ads honesto — `null` para plataformas não conectadas + `marketingSpend` real (item 7)

Decisão (verificada no código): tabelas existem, **sync só existe para Meta**. Não construir pipeline Google/TikTok aqui (cortado — follow-up). Mudanças: (a) `getGoogleMetrics`/`getTikTokMetrics` retornam `null` quando a org não tem a integração conectada (em vez de KPIs zerados que parecem dados reais); (b) `marketingSpend` do dashboard lê `meta_insights`.

**Files:**
- Modify: `src/lib/services/ads-metrics.ts` (linhas 247-250, 360-363 e corpo das duas funções)
- Modify: `src/app/api/dashboard/metrics/route.ts` (linhas ~805, ~841-845)
- Verify: `src/app/api/reports/ads/route.tsx` (como trata `metrics === null` — linha ~79)

- [ ] **Step 1: Gate por integração conectada**

Em `ads-metrics.ts`, substituir os doc-comments stale das linhas 247-250 e 360-363 por documentação honesta, e adicionar o gate no início de `getGoogleMetrics` e `getTikTokMetrics`:

```ts
/**
 * Métricas do Google Ads — leitura de google_ads_insights.
 * NOTA: ainda NÃO existe job de sync populando essa tabela (só o OAuth
 * callback salva tokens). Por isso, sem integração conectada retornamos
 * null (UI mostra "não conectado") em vez de KPIs zerados enganosos.
 * Follow-up: implementar sync de insights (projeto próprio).
 */
async function getGoogleMetrics(...): Promise<AdsMetrics | null> {
  const connected = await hasAdsIntegration(supabase, organizationId, 'google')
  if (!connected) return null
  // ... (restante inalterado)
```

(Mesma estrutura para `getTikTokMetrics` com `'tiktok'`. `hasAdsIntegration` já existe no mesmo arquivo — mover a declaração para antes do uso ou confiar no hoisting de `function`, que já cobre.)

- [ ] **Step 2: Conferir consumo de `null` no relatório**

Ler `src/app/api/reports/ads/route.tsx` (linhas 70-115): confirmar que `metrics === null` resulta em mensagem "não conectado"/erro amigável no PDF, não em crash. Ajustar se necessário (ex.: `if (!metrics) return ReportErrors.noData(...)` — seguir o helper de erro que o arquivo já usa).

- [ ] **Step 3: `marketingSpend` real no dashboard**

Em `src/app/api/dashboard/metrics/route.ts`, substituir a linha 841 (`const marketingSpend = 0; // TODO...`). Reusar as variáveis de range de data que o route já tem (verificar nomes no início da função — há um período calculado para `allOrders`):

```ts
    // Marketing spend real: meta_insights tem sync ativo
    // (/api/integrations/meta). Google/TikTok ainda sem sync — ficam de fora.
    let marketingSpend = 0
    const spendByDate = new Map<string, number>()
    try {
      const { data: metaSpend } = await supabase
        .from('meta_insights')
        .select('date, spend')
        .eq('organization_id', organizationId)
        .gte('date', /* início do período no formato YYYY-MM-DD */)
        .lte('date', /* fim do período */)
      for (const row of metaSpend || []) {
        const v = Number(row.spend) || 0
        marketingSpend += v
        spendByDate.set(row.date, (spendByDate.get(row.date) || 0) + v)
      }
    } catch { /* tabela ausente em algum ambiente: mantém 0 */ }
```

E no `chartData` (linha ~805), trocar `marketing: 0,` por `marketing: spendByDate.get(dateStr) || 0,`. **Atenção à ordem**: o bloco de spend precisa vir **antes** da construção do `chartData` — mover a construção ou o bloco conforme necessário. `cac`/`roi` (linhas 842-845) passam a usar o valor real sem mudança de fórmula.

- [ ] **Step 4: Verificação**

Run: `npx tsc --noEmit 2>&1 | grep -E "ads-metrics|dashboard/metrics"` — Expected: vazio.
Manual: org com Meta conectado → dashboard mostra `marketing > 0` e ROI/CAC calculados; relatório Ads de Google numa org sem Google → mensagem de "não conectado" (não zeros).

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/ads-metrics.ts src/app/api/dashboard/metrics/route.ts src/app/api/reports/ads/route.tsx
git commit -m "feat(ads): null honesto para Google/TikTok sem sync e marketingSpend real via meta_insights"
```

---

### Task 10: Painel admin whatsapp-health (item 4, Onda 4.5)

**Files:**
- Create: `src/app/api/admin/whatsapp-health/route.ts`
- Rewrite: `src/app/(dashboard)/admin/whatsapp-health/page.tsx`
- Modify: `src/middleware.ts` (linhas 70-93)

- [ ] **Step 1: Proteger a área /admin no middleware**

Em `src/middleware.ts`: adicionar `'/admin'` ao array `adminOnlyRoutes` (linha ~71) e `'/api/admin'` ao array `adminOnlyApis` (linha ~85). Isso bloqueia agentes (a proteção existente para esse perfil); owners/admins da org seguem com acesso.

- [ ] **Step 2: API org-scoped**

`src/app/api/admin/whatsapp-health/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
import { META_BASE_URL } from '@/lib/whatsapp/api-version'
import { getAccessToken } from '@/lib/whatsapp/account-loader'
import { subscribeAppToWABA } from '@/lib/whatsapp/cloud-api'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireOrgFromAuth(request)
  if (auth instanceof NextResponse) return auth
  const { orgId } = auth

  const { data: accounts, error } = await supabase
    .from('whatsapp_business_accounts')
    .select('id, waba_id, phone_number_id, display_phone_number, verified_name, quality_rating, messaging_limit, status, organization_id')
    .eq('organization_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = await Promise.all((accounts || []).map(async (acc) => {
    // last_webhook_at: max(received_at) dos eventos desse phone_number
    const { data: lastEvent } = await supabase
      .from('whatsapp_webhook_events')
      .select('received_at')
      .eq('waba_phone_number_id', acc.phone_number_id)
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // subscribed_apps + registered: live na Graph API (best-effort)
    let subscribedApps: boolean | null = null
    let registered: string | null = null
    try {
      const token = getAccessToken(acc as any)
      const [subRes, phoneRes] = await Promise.all([
        fetch(`${META_BASE_URL}/${acc.waba_id}/subscribed_apps`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${META_BASE_URL}/${acc.phone_number_id}?fields=platform_type,status,code_verification_status`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])
      if (subRes.ok) {
        const sub = await subRes.json()
        subscribedApps = Array.isArray(sub?.data) && sub.data.length > 0
      }
      if (phoneRes.ok) {
        const phone = await phoneRes.json()
        registered = phone?.status || null
      }
    } catch { /* token inválido/expirado: campos ficam null */ }

    return {
      id: acc.id,
      waba_id: acc.waba_id,
      phone_number_id: acc.phone_number_id,
      display_phone_number: acc.display_phone_number,
      verified_name: acc.verified_name,
      quality_rating: acc.quality_rating,
      messaging_limit: acc.messaging_limit,
      account_status: acc.status,
      subscribed_apps: subscribedApps,
      registered,
      last_webhook_at: lastEvent?.received_at || null,
    }
  }))

  return NextResponse.json({ accounts: rows, checked_at: new Date().toISOString() })
}

// POST { account_id } → re-subscribe do app na WABA
export async function POST(request: NextRequest) {
  const auth = await requireOrgFromAuth(request)
  if (auth instanceof NextResponse) return auth
  const { orgId } = auth

  const { account_id } = await request.json()
  if (!account_id) return NextResponse.json({ error: 'account_id required' }, { status: 400 })

  const { data: acc } = await supabase
    .from('whatsapp_business_accounts')
    .select('*')
    .eq('id', account_id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (!acc) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  try {
    await subscribeAppToWABA({ wabaId: acc.waba_id, accessToken: getAccessToken(acc) })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'subscribe failed' }, { status: 502 })
  }
}
```

(Conferir a assinatura real de `getAccessToken`/`WhatsAppAccountRow` em `src/lib/whatsapp/account-loader.ts` — pode exigir o select de colunas de token; ajustar o `select(...)` do GET para incluir as colunas que `getAccessToken` precisa, ex. `access_token_encrypted`.)

- [ ] **Step 3: Página com tabela + refresh 30s**

Reescrever `src/app/(dashboard)/admin/whatsapp-health/page.tsx` como client component: `useEffect` com fetch inicial + `setInterval(load, 30_000)` (cleanup no unmount); tabela com colunas Número / Nome / Quality (badge verde/amarelo/vermelho) / Tier / Registered / Webhooks (subscribed_apps: ✓ / ✗ + botão "Re-subscribe" quando `false`) / Último webhook (relativo, vermelho se > 1h ou null); indicador "Atualizado às HH:MM:SS" e botão de refresh manual. Sem dependências novas — seguir o estilo Tailwind das demais páginas do dashboard. Remover todo o bloco de comentários "STUB (Onda 4)".

- [ ] **Step 4: Verificação manual**

1. Logado como owner/admin: `/admin/whatsapp-health` lista as WABAs da org com quality e último webhook coerentes com o banco.
2. Aguardar 30s sem interagir → "Atualizado às" muda.
3. Logado como **agente**: acessar `/admin/whatsapp-health` → redirecionado/bloqueado pelo middleware.
4. (Se houver WABA sem subscription) clicar "Re-subscribe" → sucesso e ✓ no próximo refresh.

- [ ] **Step 5: Verificar e commitar**

Run: `npx tsc --noEmit 2>&1 | grep -E "whatsapp-health|middleware"` — Expected: vazio.

```bash
git add src/app/api/admin/whatsapp-health/route.ts "src/app/(dashboard)/admin/whatsapp-health/page.tsx" src/middleware.ts
git commit -m "feat(admin): painel whatsapp-health com subscribed_apps/registered live e last_webhook_at (Onda 4.5)"
```

---

## Verificação final do pacote

- [ ] `npx vitest run` — suite completa verde.
- [ ] `npx tsc --noEmit` — sem erros novos em relação à baseline da branch (capturar baseline antes da T1: `npx tsc --noEmit > baseline.txt` mental — não commitar arquivo).
- [ ] `grep -rn "TODO" src/app/api/nps src/app/api/lgpd/data-requests src/app/api/whatsapp/quality src/lib/reports/templates/index.ts src/lib/services/ads-metrics.ts src/components/whatsapp/inbox/tabs/NotesTab.tsx` — nenhum dos TODOs originais remanescente (apenas comentários de follow-up documentados).
- [ ] Migração `20260610_contact_attachments_bucket.sql` aplicada no ambiente antes do deploy.

### Critical Files for Implementation

- D:\worder1-fwrle\src\lib\whatsapp\alerts.ts (sistema de alerts a reusar — `sendAlert` com dedup)
- D:\worder1-fwrle\src\app\api\whatsapp\inbox\conversations\[id]\media\route.ts (padrão de validação + Storage + signed URL a seguir na T8)
- D:\worder1-fwrle\src\lib\email\resend.ts (wrapper de email para T2/T6)
- D:\worder1-fwrle\src\app\api\ai\process\document\route.ts (extração PDF/DOCX a substituir na T7)
- D:\worder1-fwrle\src\lib\auth\require-org.ts (auth padrão de todas as rotas novas — T8/T10)