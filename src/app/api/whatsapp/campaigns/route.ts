import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getAuthClient, authError } from '@/lib/api-utils'
export const dynamic = 'force-dynamic';

// Resolve every org the authenticated user actually belongs to. The
// caller can request `?organizationId=X` (or pass it in the body for
// POST), but the value is only honored if it's in this list. Otherwise
// we fall back to the primary org from the auth profile. This is what
// blocks the previous "pass any org id you want" auth bypass.
async function getUserOrgIds(userId: string, primaryOrgId: string): Promise<string[]> {
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
  const ids = new Set<string>([primaryOrgId])
  for (const m of memberships || []) {
    if (m.organization_id) ids.add(m.organization_id)
  }
  return Array.from(ids)
}

// GET /api/whatsapp/campaigns - Listar campanhas
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const orgIds = await getUserOrgIds(auth.user.id, auth.user.organization_id)

    const { searchParams } = new URL(request.url)
    const requested = searchParams.get('organizationId') || searchParams.get('organization_id')
    const organizationId =
      requested && orgIds.includes(requested) ? requested : auth.user.organization_id

    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const search = searchParams.get('search')
    const storeId = searchParams.get('storeId')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    let query = supabase
      .from('whatsapp_campaigns')
      .select(`*`, { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (storeId) query = query.eq('store_id', storeId)
    if (status) query = query.eq('status', status)
    if (type) query = query.eq('type', type)
    if (search) query = query.ilike('name', `%${search}%`)

    const { data, error, count } = await query
    if (error) throw error

    // Métricas agregadas — scoped to the same store when storeId is
    // provided so a multi-store org sees its own per-store totals
    // instead of org-wide bleed.
    let metricsQuery = supabase
      .from('whatsapp_campaigns')
      .select('total_sent, total_delivered, total_read, total_replied')
      .eq('organization_id', organizationId)
    if (storeId) metricsQuery = metricsQuery.eq('store_id', storeId)
    const { data: metricsData } = await metricsQuery

    const metrics = {
      totalCampaigns: count || 0,
      totalSent: metricsData?.reduce((sum, c) => sum + (c.total_sent || 0), 0) || 0,
      totalDelivered: metricsData?.reduce((sum, c) => sum + (c.total_delivered || 0), 0) || 0,
      totalRead: metricsData?.reduce((sum, c) => sum + (c.total_read || 0), 0) || 0,
    }

    return NextResponse.json({
      campaigns: data || [],
      total: count || 0,
      page, limit,
      hasMore: (count || 0) > offset + limit,
      metrics
    })
  } catch (error) {
    console.error('Error fetching campaigns:', error)
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
  }
}

// POST /api/whatsapp/campaigns - Criar campanha
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const orgIds = await getUserOrgIds(auth.user.id, auth.user.organization_id)

    const body = await request.json()
    const requestedOrg = body.organizationId || body.organization_id
    // Body's org is honored only if it matches user membership.
    // Otherwise we fall back to the primary org so this can't be
    // used to plant a campaign into a foreign tenant.
    const organizationId =
      requestedOrg && orgIds.includes(requestedOrg) ? requestedOrg : auth.user.organization_id

    const {
      name, description, type = 'broadcast',
      template_id, template_name, template_variables, media_url, media_type,
      audience_type = 'all', audience_tags, audience_segment_id, audience_phonebook_id, audience_filters,
      imported_contacts, scheduled_at, timezone = 'America/Sao_Paulo',
      messages_per_second = 10, created_by, created_by_name,
      store_id: requestedStoreId,
    } = body

    if (!name) {
      return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 })
    }

    // Validate the requested store_id (if any) belongs to the
    // resolved org. Without this, a merchant could set any UUID and
    // the campaign would later try to send against a foreign store.
    let storeId: string | null = null
    if (requestedStoreId) {
      const { data: storeRow } = await supabase
        .from('shopify_stores')
        .select('id')
        .eq('id', requestedStoreId)
        .eq('organization_id', organizationId)
        .maybeSingle()
      storeId = storeRow?.id || null
    }

    // Calcular audiência
    let audienceCount = 0
    if (audience_type === 'all') {
      const { count } = await supabase
        .from('whatsapp_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .or('is_blocked.is.null,is_blocked.eq.false')
      audienceCount = count || 0
    } else if (audience_type === 'tags' && audience_tags?.length > 0) {
      const { count } = await supabase
        .from('whatsapp_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .or('is_blocked.is.null,is_blocked.eq.false')
        .overlaps('tags', audience_tags)
      audienceCount = count || 0
    } else if (audience_type === 'phonebook' && audience_phonebook_id) {
      // Phonebook must belong to the same org, otherwise we'd count
      // (and later send to) contacts from a foreign tenant.
      const { data: pb } = await supabase
        .from('phonebooks')
        .select('id')
        .eq('id', audience_phonebook_id)
        .eq('organization_id', organizationId)
        .maybeSingle()
      if (!pb) {
        return NextResponse.json({ error: 'Phonebook not found in this organization' }, { status: 404 })
      }
      const { count } = await supabase
        .from('phonebook_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('phonebook_id', audience_phonebook_id)
      audienceCount = count || 0
    } else if (audience_type === 'import' && imported_contacts) {
      audienceCount = imported_contacts.length
    }

    const costPerMessage = 0.05
    const totalCost = audienceCount * costPerMessage

    const { data: campaign, error } = await supabase
      .from('whatsapp_campaigns')
      .insert({
        organization_id: organizationId,
        store_id: storeId,
        name, description, type,
        status: scheduled_at ? 'scheduled' : 'draft',
        template_id, template_name, template_variables: template_variables || {},
        media_url, media_type, audience_type, audience_tags, audience_segment_id,
        audience_phonebook_id, audience_filters: audience_filters || {}, imported_contacts,
        audience_count: audienceCount, scheduled_at, timezone, messages_per_second,
        total_recipients: audienceCount, cost_per_message: costPerMessage,
        total_cost: totalCost, created_by, created_by_name
      })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ campaign })
  } catch (error) {
    console.error('Error creating campaign:', error)
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }
}
