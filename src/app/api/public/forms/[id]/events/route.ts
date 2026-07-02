// =============================================
// Form events endpoint (popup lifecycle beacon)
//
// POST /api/public/forms/{id}/events
//
// CLIENT CONTRACT (popup script beacon):
//   body: { type: 'impression' | 'dismissed' | 'submitted' | 'engaged',
//           visitor_id?, url?, referrer?, reason? }
//   (legacy `event_type` key still accepted)
//   → 200 { received: true }
//   errors: { success:false, error, code } with CORS on every status.
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
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { corsJson, corsError, corsPreflight } from '@/lib/forms/public-cors';

export const dynamic = 'force-dynamic';

const ALLOWED_EVENTS = new Set(['impression', 'dismissed', 'submitted', 'engaged']);

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

    // Resolve form + org. Public endpoint — no auth, but we do verify
    // the form exists and is published. Popups live in crm_forms.
    const { data: form } = await supabaseAdmin
      .from('crm_forms')
      .select('id, organization_id, status')
      .eq('id', params.id)
      .maybeSingle();

    if (!form || form.status !== 'published') {
      // Don't 404 — just acknowledge so the beacon doesn't retry.
      return corsJson({ received: true, ignored: 'form not published' });
    }

    const occurredAt = new Date().toISOString();
    const userAgent = req.headers.get('user-agent') || '';

    // 1) Persist the raw event for time-series analytics
    try {
      const { error: insertErr } = await supabaseAdmin.from('form_events').insert({
        organization_id: form.organization_id,
        form_id: params.id,
        event_type: eventType,
        properties: {
          url: body.url || null,
          reason: body.reason || null,
          visitor_id: body.visitor_id || null,
          user_agent: userAgent,
          ip_address: ip,
          referrer: body.referrer || null,
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

    // 2) Increment the per-form running counters so the list view stays
    //    accurate even without the events table. Atomic RPC
    //    (increment_crm_form_counter) with a read-then-write fallback
    //    for databases where the migration hasn't landed.
    const counterColumns: string[] =
      eventType === 'impression'
        ? ['views_count', 'impressions_count']
        : eventType === 'submitted'
          ? ['submissions_count']
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
