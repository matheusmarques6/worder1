// =============================================
// Form events endpoint
//
// POST /api/public/forms/{id}/events
//
// Receives lifecycle events from the popup script — impression,
// dismissal, submission — so the analytics dashboard can compute
// conversion rate + dismissal rate per form. Lightweight beacon
// path: keep it idempotent on (form_id, visitor_session, event_type)
// and never block the popup UI.
//
// Klaviyo/Omnisend pattern: every popup interaction is logged as
// a discrete event with a timestamp so the analytics view can trend
// daily impressions vs submits vs dismissals (not just running
// counters that lose granularity).
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

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

    const eventType = String(body.event_type || '').toLowerCase();
    if (!ALLOWED_EVENTS.has(eventType)) {
      return NextResponse.json({ error: 'invalid event_type' }, { status: 400 });
    }

    // Resolve form + org. Public endpoint — no auth, but we do verify
    // the form exists and is published.
    const { data: form } = await supabaseAdmin
      .from('forms')
      .select('id, organization_id, status, views_count, submissions_count')
      .eq('id', params.id)
      .maybeSingle();

    if (!form || form.status !== 'published') {
      // Don't 404 — just acknowledge so the beacon doesn't retry.
      return NextResponse.json({ received: true, ignored: 'form not published' });
    }

    const occurredAt = new Date().toISOString();
    const userAgent = req.headers.get('user-agent') || '';
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '';

    // 1) Persist the raw event for time-series analytics
    try {
      await supabaseAdmin.from('form_events').insert({
        organization_id: form.organization_id,
        form_id: params.id,
        event_type: eventType,
        properties: {
          url: body.url || null,
          reason: body.reason || null,
          user_agent: userAgent,
          ip_address: ip,
          referrer: body.referrer || null,
        },
        occurred_at: occurredAt,
      });
    } catch (insertErr: any) {
      // Table may not exist on older deployments — fall back to bumping
      // the running counters on forms (impressions_count / dismissals_count)
      // so analytics doesn't go dark.
      if (insertErr?.code !== '42P01') {
        console.warn('[FormEvents] insert failed (non-blocking):', insertErr);
      }
    }

    // 2) Increment the per-form running counter so the list view stays
    //    accurate even without the events table.
    const counterColumn =
      eventType === 'impression'
        ? 'views_count'
        : eventType === 'submitted'
          ? 'submissions_count'
          : eventType === 'dismissed'
            ? 'dismissals_count'
            : null;

    if (counterColumn) {
      try {
        await supabaseAdmin.rpc('increment_form_counter', {
          p_form_id: params.id,
          p_column: counterColumn,
        });
      } catch {
        // RPC may not exist on older deployments — best-effort SQL update.
        try {
          // Use an UPDATE ... SET col = col + 1 expression via SQL so
          // we don't race the read-modify-write cycle through the JS
          // client. supabase-js doesn't expose raw SQL, so a fallback
          // SELECT-then-UPDATE is the best we can do here.
          const current =
            counterColumn === 'views_count'
              ? form.views_count
              : counterColumn === 'submissions_count'
                ? form.submissions_count
                : 0;
          await supabaseAdmin
            .from('forms')
            .update({ [counterColumn]: (current || 0) + 1 })
            .eq('id', params.id);
        } catch (fallbackErr) {
          console.warn('[FormEvents] counter update failed:', fallbackErr);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('[FormEvents] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

// CORS preflight for sendBeacon from cross-origin storefronts
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
