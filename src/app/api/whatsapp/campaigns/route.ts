import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/whatsapp/campaigns - Listar campanhas
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId') || 'org-placeholder'
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    let query = supabase
      .from('whatsapp_campaigns')
      .select(`
        *,
        template:whatsapp_templates(id, name, category, status, body_text, buttons)
      `, { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) query = query.eq('status', status)
    if (type) query = query.eq('type', type)
    if (search) query = query.ilike('name', `%${search}%`)

    const { data, error, count } = await query
    if (error) throw error

    // Métricas agregadas
    const { data: metricsData } = await supabase
      .from('whatsapp_campaigns')
      .select('total_sent, total_delivered, total_read, total_replied')
      .eq('organization_id', organizationId)

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
    const body = await request.json()
    const {
      organizationId = 'org-placeholder', name, description, type = 'broadcast',
      template_id, template_name, template_variables, media_url, media_type,
      audience_type = 'all', audience_tags, audience_segment_id, audience_phonebook_id, audience_filters,
      imported_contacts, scheduled_at, timezone = 'America/Sao_Paulo',
      messages_per_second = 10, created_by, created_by_name
    } = body

    if (!name) {
      return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 })
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
        organization_id: organizationId, name, description, type,
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
