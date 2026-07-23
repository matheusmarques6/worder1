// =============================================
// GET /api/public/confirm-opt-in?token=<signed>
//
// Public confirmation landing for double opt-in flows. The subscriber
// clicks this link from the email we sent right after they submitted
// the popup with audience.doubleOptIn=true. Verifying the HMAC token
// flips the contact's email_consent from 'pending' to 'subscribed'
// (LGPD/GDPR compliant — no marketing email goes out until this).
//
// Always renders HTML so it works as an inbox-friendly link target.
// Idempotent: re-clicking after confirmation just shows the same
// success message.
// =============================================

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyOptInToken } from '@/lib/email/optin-token'

export const dynamic = 'force-dynamic'

function renderHtml(opts: {
  title: string
  heading: string
  body: string
  variant: 'success' | 'error'
}): string {
  const accent = opts.variant === 'success' ? '#F97316' : '#DC2626'
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${opts.title}</title>
<style>
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #FAFAFA; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 16px; padding: 40px 32px; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
  .icon { width: 48px; height: 48px; border-radius: 50%; background: ${accent}1A; color: ${accent}; display: inline-flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; margin-bottom: 16px; }
  h1 { font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 12px; letter-spacing: -0.02em; }
  p { font-size: 15px; color: #6B7280; margin: 0; line-height: 1.5; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${opts.variant === 'success' ? '✓' : '!'}</div>
    <h1>${opts.heading}</h1>
    <p>${opts.body}</p>
  </div>
</body>
</html>`
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || ''

  const payload = verifyOptInToken(token)
  if (!payload) {
    return new Response(
      renderHtml({
        title: 'Link inválido',
        heading: 'Link inválido ou expirado',
        body: 'Este link de confirmação não é válido ou já passou da data de validade. Inscreva-se novamente para receber um novo link.',
        variant: 'error',
      }),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  try {
    // Idempotent: flip pending → subscribed. If they're already
    // subscribed (re-click), we don't unset email_consent_at — keep
    // the original consent timestamp for audit.
    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('id, email, first_name, last_name, phone, email_consent, email_consent_at')
      .eq('id', payload.contactId)
      .eq('organization_id', payload.orgId)
      .maybeSingle()

    if (!contact) {
      return new Response(
        renderHtml({
          title: 'Contato não encontrado',
          heading: 'Não conseguimos confirmar',
          body: 'Não localizamos sua inscrição. Tente se inscrever novamente.',
          variant: 'error',
        }),
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      )
    }

    const alreadySubscribed =
      contact.email_consent === true ||
      contact.email_consent === 'subscribed' ||
      contact.email_consent === 'true'

    if (!alreadySubscribed) {
      // SCHEMA NOTE: migrations declare contacts.email_consent BOOLEAN
      // (20260330_shopify_graphql_cdp.sql) and every other writer uses
      // booleans; the old string write ('subscribed') failed silently on
      // a BOOLEAN column — DOI subscribers never got confirmed. Boolean
      // `true` survives both schemas (PostgREST casts it to 'true' on a
      // TEXT column, and every reader accepts true/'true'/'subscribed').
      // Error-checked with a legacy-string retry for exotic schemas.
      const updatePayload = {
        email_consent: true as boolean | string,
        email_consent_at: new Date().toISOString(),
        email_consent_source: `popup_form:${payload.formId}:double_optin`,
        status: 'qualified',
      }
      const { error: consentErr } = await supabaseAdmin
        .from('contacts')
        .update(updatePayload)
        .eq('id', contact.id)
      if (consentErr) {
        const { error: retryErr } = await supabaseAdmin
          .from('contacts')
          .update({ ...updatePayload, email_consent: 'subscribed' })
          .eq('id', contact.id)
        if (retryErr) {
          console.error('[confirm-opt-in] consent write failed:', consentErr.message, '| retry:', retryErr.message)
          throw retryErr
        }
      }

      // Welcome flow fires HERE for double opt-in popups — not at submit.
      // The subscriber has just confirmed, so consent is now granted and
      // the flow's email node will actually send (at submit the contact
      // was 'pending' and every email node correctly skipped it).
      // submit/route.ts defers trigger_popup_subscribed when
      // doubleOptInEnabled precisely so this is the single enrollment.
      try {
        const { data: form } = await supabaseAdmin
          .from('crm_forms')
          .select('id, name, form_type, store_id')
          .eq('id', payload.formId)
          .eq('organization_id', payload.orgId)
          .maybeSingle()
        if (form) {
          const { dispatchTrigger } = await import('@/lib/automation/trigger-dispatcher')
          await dispatchTrigger({
            organizationId: payload.orgId,
            storeId: (form as any).store_id || null,
            triggerType: 'trigger_popup_subscribed',
            contactId: contact.id,
            triggerData: {
              form_id: form.id,
              form_name: form.name,
              form_type: (form as any).form_type,
              email: contact.email || null,
              first_name: (contact as any).first_name || null,
              last_name: (contact as any).last_name || null,
              phone: (contact as any).phone || null,
              double_optin: true,
            },
            matchConfig: (cfg: any) => {
              if (cfg?.form_id && cfg.form_id !== form.id) return false
              return true
            },
            idempotencyKey: `popup_subscribed:doi:${form.id}:${contact.id}`,
          })
        }
      } catch (e: any) {
        console.warn('[confirm-opt-in] welcome dispatch failed:', e?.message)
      }
    }

    return new Response(
      renderHtml({
        title: 'Inscrição confirmada',
        heading: alreadySubscribed ? 'Você já está inscrito' : 'Inscrição confirmada!',
        body: alreadySubscribed
          ? 'Sua inscrição já estava ativa. Obrigado por confirmar.'
          : 'Pronto! A partir de agora você vai receber nossas comunicações por email.',
        variant: 'success',
      }),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  } catch (err: any) {
    console.error('[confirm-opt-in] error:', err?.message || err)
    return new Response(
      renderHtml({
        title: 'Erro ao confirmar',
        heading: 'Tente novamente em instantes',
        body: 'Tivemos um problema confirmando sua inscrição. Aguarde um momento e clique no link de novo.',
        variant: 'error',
      }),
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }
}
