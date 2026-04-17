import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getAuthClient } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

async function getOrgIds() {
  const auth = await getAuthClient()
  if (!auth) return null
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', auth.user.id)
  const orgIds = [
    auth.user.organization_id,
    ...(memberships?.map((m: any) => m.organization_id) || []),
  ]
  return [...new Set(orgIds)]
}

// GET /api/whatsapp/campaigns/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orgIds = await getOrgIds()
    if (!orgIds) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = params

    const { data: campaign, error } = await supabase
      .from('whatsapp_campaigns')
      .select(`*`)
      .eq('id', id)
      .in('organization_id', orgIds)
      .single()

    if (error) throw error
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const { data: logs } = await supabase
      .from('whatsapp_campaign_logs')
      .select('*')
      .eq('campaign_id', id)
      .order('created_at', { ascending: false })
      .limit(50)

    const metrics = {
      deliveryRate: campaign.total_sent > 0 ? ((campaign.total_delivered / campaign.total_sent) * 100).toFixed(1) : 0,
      readRate: campaign.total_delivered > 0 ? ((campaign.total_read / campaign.total_delivered) * 100).toFixed(1) : 0,
      clickRate: campaign.total_delivered > 0 ? ((campaign.total_clicked / campaign.total_delivered) * 100).toFixed(1) : 0,
      replyRate: campaign.total_delivered > 0 ? ((campaign.total_replied / campaign.total_delivered) * 100).toFixed(1) : 0,
      failureRate: campaign.total_recipients > 0 ? ((campaign.total_failed / campaign.total_recipients) * 100).toFixed(1) : 0,
    }

    return NextResponse.json({ campaign, metrics, logs: logs || [] })
  } catch (error) {
    console.error('Error fetching campaign:', error)
    return NextResponse.json({ error: 'Failed to fetch campaign' }, { status: 500 })
  }
}

// PUT /api/whatsapp/campaigns/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orgIds = await getOrgIds()
    if (!orgIds) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = params
    const body = await request.json()

    const { data: existing } = await supabase
      .from('whatsapp_campaigns')
      .select('status, organization_id')
      .eq('id', id)
      .in('organization_id', orgIds)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (['running', 'completed'].includes(existing.status)) {
      return NextResponse.json({ error: 'Cannot edit a running or completed campaign' }, { status: 400 })
    }

    const allowedFields = ['name', 'description', 'template_id', 'template_name', 'template_variables',
      'media_url', 'media_type', 'audience_type', 'audience_tags', 'audience_segment_id',
      'audience_filters', 'scheduled_at', 'timezone', 'messages_per_second']

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    allowedFields.forEach(field => { if (body[field] !== undefined) updates[field] = body[field] })

    const { data: campaign, error } = await supabase
      .from('whatsapp_campaigns')
      .update(updates)
      .eq('id', id)
      .in('organization_id', orgIds)
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ campaign })
  } catch (error) {
    console.error('Error updating campaign:', error)
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
  }
}

// DELETE /api/whatsapp/campaigns/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orgIds = await getOrgIds()
    if (!orgIds) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = params

    const { data: existing } = await supabase
      .from('whatsapp_campaigns')
      .select('status')
      .eq('id', id)
      .in('organization_id', orgIds)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (existing.status === 'running') {
      return NextResponse.json({ error: 'Cannot delete a running campaign' }, { status: 400 })
    }

    const { error } = await supabase
      .from('whatsapp_campaigns')
      .delete()
      .eq('id', id)
      .in('organization_id', orgIds)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting campaign:', error)
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 })
  }
}
