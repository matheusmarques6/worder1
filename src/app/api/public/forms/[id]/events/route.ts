// =============================================
// Form events endpoint (popup lifecycle beacon)
//
// POST /api/public/forms/{id}/events
//
// CLIENT CONTRACT (popup script beacon):
//   body: { type: 'impression' | 'dismissed' | 'engaged' | 'holdout' | 'step' | 'reward',
//           visitor_id?, session_id?, url?, referrer?, reason?,
//           bucket?: 'exposed' | 'holdout', step?: number, variant_id? }
//   (legacy `event_type` key still accepted)
//   → 200 { received: true }
//   errors: { success:false, error, code } with CORS on every status.
//
// 'submitted' NÃO vem do beacon: o submit grava o evento do lado do
// servidor, que é o único que sabe que a inscrição existiu de fato. Um
// beacon 'submitted' é aceito e descartado para não quebrar scripts
// antigos em cache.
//
// The organization is derived server-side from the form row (popups
// live in crm_forms — the previous version queried a nonexistent
// `forms` table and silently dropped every event). Each event is
// persisted in form_events for time-series analytics AND bumped into
// the crm_forms running counters atomically via the
// increment_crm_form_counter RPC.
// =============================================

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPopupOrigin } from '@/lib/forms/origin-gate';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { corsJson, corsError, corsPreflight } from '@/lib/forms/public-cors';
import { trafficTypeOrNull, pageKindOrNull } from '@/lib/popups/targeting';

export const dynamic = 'force-dynamic';

const ALLOWED_EVENTS = new Set(['impression', 'dismissed', 'submitted', 'engaged', 'holdout', 'step', 'reward']);
// Persistidos na série diária. 'submitted' fica de fora de propósito (ver
// contrato acima); 'engaged' segue só nos contadores.
const PERSISTED_EVENTS = new Set(['impression', 'dismissed', 'holdout', 'step', 'reward']);

function shortText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // sendBeacon may serialize as text/plain; tolerate
      try {
        const text = await req.text();
        body = text ? JSON.parse(text) : {};
      } catch {
        body = {};
      }
    }

    const eventType = String(body.type || body.event_type || '').toLowerCase();
    if (!ALLOWED_EVENTS.has(eventType)) {
      return corsError('invalid event type', 400, 'invalid_payload');
    }

    // Rate limit the beacon: 60/min per IP+form is far above what a
    // real visitor generates, and stops counter-inflation loops.
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`form-events:${params.id}:${ip}`, {
      limit: 60,
      windowSec: 60,
    });
    if (!rl.allowed) {
      return corsError('Muitas tentativas. Aguarde e tente novamente.', 429, 'rate_limited');
    }
    const rlGlobal = await checkRateLimit(`form-events:global:${ip}`, { limit: 240, windowSec: 60 });
    if (!rlGlobal.allowed) {
      return corsError('Muitas tentativas. Aguarde e tente novamente.', 429, 'rate_limited');
    }

    // Resolve form + org. Public endpoint — no auth, but we do verify
    // the form exists and is published. Popups live in crm_forms.
    const { data: form } = await supabaseAdmin
      .from('crm_forms')
      .select('id, organization_id, status, store_id')
      .eq('id', params.id)
      .maybeSingle();

    if (!form || form.status !== 'published') {
      // Don't 404 — just acknowledge so the beacon doesn't retry.
      return corsJson({ received: true, ignored: 'form not published' });
    }

    // De onde veio? Sem isto, quem lesse o id do popup no bundle de uma
    // loja podia injetar impressões e "holdout" na organização alheia —
    // contadores inflados e grupo de controle fabricado, que inverte a
    // leitura do teste. Reconhecemos o beacon sem gravar nada.
    const origin = await checkPopupOrigin(supabaseAdmin, req.headers, form as any, body.domain);
    if (!origin.ok) {
      return corsJson({ received: true, ignored: origin.reason });
    }

    const occurredAt = new Date().toISOString();
    const userAgent = req.headers.get('user-agent') || '';

    // 1) Persist the raw event for time-series analytics
    if (PERSISTED_EVENTS.has(eventType)) {
      try {
        const { countryFromHeaders, deviceClassFromUserAgent } = await import('@/lib/forms/consent');
        // O grupo vem do TIPO do evento: impressão é sempre do exposto,
        // 'holdout' é sempre do controle. Um beacon não escolhe o grupo.
        const bucket = eventType === 'holdout' ? 'holdout' : 'exposed';
        // variant_id só vale se for o próprio popup ou uma variante DELE:
        // um UUID inventado viraria uma "variante" no relatório e travaria
        // o teste (amostra nunca suficiente).
        let variantId: string | null = null;
        const rawVariant = shortText(body.variant_id, 64);
        if (rawVariant && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawVariant)) {
          if (rawVariant === params.id) variantId = rawVariant;
          else {
            const { data: v } = await supabaseAdmin.from('crm_forms').select('id').eq('id', rawVariant).eq('ab_parent_id', params.id).eq('organization_id', form.organization_id).maybeSingle();
            if (v?.id) variantId = v.id;
          }
        }
        const stepIdx = Number.isInteger(body.step) && body.step >= 0 && body.step < 100 ? body.step : null;
        const { error: insertErr } = await supabaseAdmin.from('form_events').insert({
          organization_id: form.organization_id,
          form_id: params.id,
          event_type: eventType,
          properties: {
            url: shortText(body.url, 2048),
            reason: shortText(body.reason, 64),
            visitor_id: shortText(body.visitor_id, 128),
            session_id: shortText(body.session_id, 128),
            variant_id: variantId,
            bucket,
            step: stepIdx,
            // O código do cupom não entra aqui — só o tipo. O código vive
            // no grant e na submissão.
            reward_kind: eventType === 'reward' ? shortText(body.kind, 32) : null,
            country: countryFromHeaders(req.headers),
            device: deviceClassFromUserAgent(userAgent),
            referrer: shortText(body.referrer, 2048),
            traffic: trafficTypeOrNull(body.traffic),
            page: pageKindOrNull(body.page),
            // Smart Triggering: o score no momento da exibição (calibração
            // futura) e se foi a segunda chance na sessão.
            propensity: Number.isFinite(Number(body.propensity)) ? Math.max(0, Math.min(100, Math.round(Number(body.propensity)))) : null,
            retrigger: body.retrigger === true,
          },
          occurred_at: occurredAt,
        });
        // Table may not exist on deployments that haven't applied the
        // 2026_07_02 migration yet — counters below still move.
        if (insertErr && insertErr.code !== '42P01') {
          console.warn('[FormEvents] insert failed (non-blocking):', insertErr);
        }
      } catch (insertErr: any) {
        console.warn('[FormEvents] insert threw (non-blocking):', insertErr?.message);
      }
    }

    // 2) Increment the per-form running counters so the list view stays
    //    accurate even without the events table. Atomic RPC
    //    (increment_crm_form_counter) with a read-then-write fallback
    //    for databases where the migration hasn't landed.
    // 'submitted' não bate contador aqui: o submit já bate (bumpFormCounters)
    // e um beacon duplicado inflaria a taxa de envio.
    const counterColumns: string[] =
      eventType === 'impression'
        ? ['views_count', 'impressions_count']
        : eventType === 'dismissed'
          ? ['dismissals_count']
          : [];

    for (const column of counterColumns) {
      const { error: rpcErr } = await supabaseAdmin.rpc('increment_crm_form_counter', {
        p_form_id: params.id,
        p_column: column,
      });
      if (rpcErr) {
        // RPC not deployed yet — best-effort SELECT-then-UPDATE.
        try {
          const { data: cur } = await supabaseAdmin
            .from('crm_forms')
            .select(column)
            .eq('id', params.id)
            .maybeSingle();
          await supabaseAdmin
            .from('crm_forms')
            .update({ [column]: ((cur as any)?.[column] || 0) + 1 })
            .eq('id', params.id);
        } catch (fallbackErr) {
          console.warn('[FormEvents] counter update failed:', fallbackErr);
        }
      }
    }

    return corsJson({ received: true });
  } catch (err: any) {
    console.error('[FormEvents] Error:', err);
    return corsError(err.message || 'Internal error', 500, 'server_error');
  }
}

// CORS preflight for sendBeacon from cross-origin storefronts
export async function OPTIONS() {
  return corsPreflight();
}
