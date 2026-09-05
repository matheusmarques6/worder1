// Configurações → Rastreamento.
// GET ?storeId → fontes (loja Shopify, Web Pixel, extensão do tema) e
//                eventos recebidos nas últimas 24 h.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-admin'
import { eventLabel, eventSummary } from '@/lib/tracking/event-labels'
export const dynamic = 'force-dynamic'

const PIXEL_SOURCES = ['worder_pixel', 'shopify_pixel', 'pixel', 'web_pixel']
const THEME_SOURCES = ['theme_ext', 'storefront', 'theme_app_extension']

export async function GET(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  const orgId = auth.user.organization_id
  const storeId = request.nextUrl.searchParams.get('storeId')
  try {
    let storeQ = supabaseAdmin.from('shopify_stores').select('id, shop_domain, shop_name, primary_domain, is_active, access_token, connection_type, pixel_installed, embed_installed, settings, last_sync_at, webhooks_registered').eq('organization_id', orgId)
    storeQ = storeId ? storeQ.eq('id', storeId) : storeQ.eq('is_active', true).order('created_at', { ascending: false })
    const { data: stores } = await storeQ.limit(1)
    const store = stores?.[0] || null

    const since = new Date(Date.now() - 86400_000).toISOString()
    const since30 = new Date(Date.now() - 30 * 86400_000).toISOString()
    const ev = (q: any) => (store ? q.eq('store_id', store.id) : q)
    const [{ count: total24 }, { count: pixel30 }, { count: theme30 }, { count: shopify30 }, { data: recent }] = await Promise.all([
      ev(supabaseAdmin.from('contact_events').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).gte('occurred_at', since)),
      ev(supabaseAdmin.from('contact_events').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).gte('occurred_at', since30).in('event_source', PIXEL_SOURCES)),
      ev(supabaseAdmin.from('contact_events').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).gte('occurred_at', since30).in('event_source', THEME_SOURCES)),
      ev(supabaseAdmin.from('contact_events').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).gte('occurred_at', since30).in('event_source', ['shopify_webhook', 'shopify', 'shopify_sync'])),
      ev(supabaseAdmin.from('contact_events').select('id, event_type, event_source, properties, monetary_value, currency, occurred_at').eq('organization_id', orgId).gte('occurred_at', since).order('occurred_at', { ascending: false }).limit(12)),
    ])

    const connected = !!store && !!store.access_token && store.access_token !== 'manual' && !!store.shop_domain && !store.shop_domain.endsWith('.worder.local') && store.is_active !== false
    const pixel = !!store?.pixel_installed || (pixel30 || 0) > 0
    const theme = !!store?.embed_installed || (theme30 || 0) > 0
    return NextResponse.json({
      store: store ? { id: store.id, domain: store.primary_domain || store.shop_domain, name: store.shop_name, last_sync_at: store.last_sync_at } : null,
      sources: {
        shopify: { ok: connected, count30: shopify30 || 0, webhooks: !!store?.webhooks_registered },
        pixel: { ok: pixel, count30: pixel30 || 0 },
        theme: { ok: theme, count30: theme30 || 0 },
      },
      total24: total24 || 0,
      events: (recent || []).map((e: any) => ({
        id: e.id,
        type: e.event_type,
        label: eventLabel(e.event_type),
        summary: eventSummary(e.event_type, e.properties, e.monetary_value, e.currency),
        source: e.event_source,
        at: e.occurred_at,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
