// =============================================
// GET /api/automations/variables/discover?triggerType=trigger_order
//
// Walks recent contact_events for the given trigger type and returns
// every leaf path inside the event's properties + properties.raw.
// Used by the variable picker UI to show "Variáveis disponíveis no
// payload" alongside BASE_VARIABLES, so merchants can see EVERY field
// Shopify is sending and pick any one as a flow-template variable.
//
// Response:
//   {
//     trigger_type: 'trigger_order',
//     event_count_sampled: 12,
//     paths: [
//       { path: 'trigger.OrderId', sample: '6539396579517', type: 'string' },
//       { path: 'trigger.raw.order_number', sample: 65987, type: 'number' },
//       ...
//     ]
//   }
//
// Limits to 200 paths per discovery so the picker stays responsive.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const MAX_PATHS = 200;
const MAX_DEPTH = 6;
const MAX_ARRAY_SAMPLE = 1; // Only walk the first array element — they're homogeneous

// Map our trigger_type names to the event_type values we actually
// store on contact_events. Some triggers map 1:1, others map to many.
const TRIGGER_TO_EVENT_TYPES: Record<string, string[]> = {
  trigger_order: ['placed_order'],
  trigger_checkout_abandoned: ['checkout_started'],
  trigger_checkout_completed: ['checkout_completed'],
  trigger_fulfilled_order: ['fulfilled_order'],
  trigger_cancelled_order: ['cancelled_order'],
  trigger_refunded_order: ['refunded_order'],
  trigger_viewed_product: ['viewed_product'],
  trigger_added_to_cart: ['added_to_cart'],
  trigger_active_on_site: ['active_on_site'],
  trigger_browse_abandoned: ['viewed_product', 'page_viewed'],
  trigger_back_in_stock: ['back_in_stock'],
  trigger_form_submitted: ['form_submitted'],
};

function inferType(value: any): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return typeof value;
}

// Walk an object/array and emit every leaf path we encounter.
// Skips the obviously-noisy keys like _* internals and arrays beyond
// the first element (they're homogeneous in shape).
function walk(
  obj: any,
  prefix: string,
  out: Array<{ path: string; sample: any; type: string }>,
  depth: number
) {
  if (depth > MAX_DEPTH) return;
  if (out.length >= MAX_PATHS) return;
  if (obj === null || obj === undefined) return;

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      out.push({ path: prefix, sample: [], type: 'array' });
      return;
    }
    // Walk only first element (sample) but expose [0] in the path so
    // the picker hint shows realistic syntax.
    walk(obj[0], `${prefix}[0]`, out, depth + 1);
    // Also expose the array itself as an addressable variable.
    out.push({ path: prefix, sample: `[Array of ${obj.length} items]`, type: 'array' });
    return;
  }

  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      // Skip internal/noisy keys
      if (key.startsWith('_') && depth > 0) continue;
      const value = obj[key];
      const childPath = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === 'object') {
        walk(value, childPath, out, depth + 1);
      } else {
        out.push({
          path: childPath,
          sample: value,
          type: inferType(value),
        });
        if (out.length >= MAX_PATHS) return;
      }
    }
    return;
  }

  // Primitive at the root (rare)
  out.push({ path: prefix, sample: obj, type: inferType(obj) });
}

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const triggerType = request.nextUrl.searchParams.get('triggerType') || '';
  const eventTypeOverride = request.nextUrl.searchParams.get('eventType');
  const storeId = request.nextUrl.searchParams.get('storeId');

  const eventTypes = eventTypeOverride
    ? [eventTypeOverride]
    : (TRIGGER_TO_EVENT_TYPES[triggerType] || []);

  if (eventTypes.length === 0) {
    return NextResponse.json({
      trigger_type: triggerType,
      event_count_sampled: 0,
      paths: [],
      hint: 'Sem tipo de evento mapeado. Passe ?eventType=X para forçar.',
    });
  }

  const admin = getSupabaseAdmin();
  let q = admin
    .from('contact_events')
    .select('event_type, properties, occurred_at')
    .eq('organization_id', orgId)
    .in('event_type', eventTypes)
    .order('occurred_at', { ascending: false })
    .limit(20);
  if (storeId) q = q.eq('store_id', storeId);

  const { data: events } = await q;

  // Aggregate paths across multiple recent events — different orders
  // have different fields populated, so sampling several gives us the
  // union of all available paths.
  const seen = new Map<string, { sample: any; type: string }>();
  for (const ev of events || []) {
    const props = ev?.properties || {};
    const out: Array<{ path: string; sample: any; type: string }> = [];
    walk(props, 'trigger', out, 0);
    for (const p of out) {
      if (!seen.has(p.path)) seen.set(p.path, { sample: p.sample, type: p.type });
    }
  }

  // Sort: structured top-level first (no .raw), then raw paths
  const paths = Array.from(seen.entries())
    .map(([path, meta]) => ({ path, sample: meta.sample, type: meta.type }))
    .sort((a, b) => {
      const aRaw = a.path.includes('.raw.') ? 1 : 0;
      const bRaw = b.path.includes('.raw.') ? 1 : 0;
      if (aRaw !== bRaw) return aRaw - bRaw;
      return a.path.localeCompare(b.path);
    });

  return NextResponse.json({
    trigger_type: triggerType,
    event_types_sampled: eventTypes,
    event_count_sampled: (events || []).length,
    paths,
  });
}
