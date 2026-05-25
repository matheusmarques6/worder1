// =============================================
// WORDER: Schedule email campaign
// /src/app/api/email/campaigns/[id]/schedule/route.ts
//
// POST { scheduled_at } — agenda campanha para envio futuro (status=scheduled)
// DELETE — cancela agendamento (status=draft)
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params
  const auth = await getAuthClient()
  if (!auth) return authError()

  // RBAC: must have campaigns:send to schedule a campaign (this
  // commits the merchant to actually sending email at a future time).
  const { requireCapability } = await import('@/lib/auth/require-capability')
  const denied = await requireCapability(auth, 'campaigns:send')
  if (denied) return denied

  const body = await req.json()
  const { scheduled_at, send_time_optimization } = body
  if (!scheduled_at) {
    return NextResponse.json({ error: 'scheduled_at is required (ISO 8601)' }, { status: 400 })
  }

  const when = new Date(scheduled_at)
  if (isNaN(when.getTime())) {
    return NextResponse.json({ error: 'Invalid scheduled_at' }, { status: 400 })
  }
  // Não permite agendar no passado
  if (when.getTime() < Date.now() - 60_000) {
    return NextResponse.json({ error: 'scheduled_at cannot be in the past' }, { status: 400 })
  }

  // Validar que campanha pertence à org e está em draft/scheduled
  const { data: camp } = await supabaseAdmin
    .from('email_campaigns')
    .select('id, status')
    .eq('id', campaignId)
    .eq('organization_id', auth.user.organization_id)
    .maybeSingle()

  if (!camp) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (!['draft', 'scheduled'].includes(camp.status)) {
    return NextResponse.json(
      { error: `Cannot schedule campaign in status "${camp.status}"` },
      { status: 400 }
    )
  }

  const updatePayload: Record<string, any> = {
    status: 'scheduled',
    scheduled_at: when.toISOString(),
  }
  // Honor the smart-send-time toggle from the modal. When true, each
  // contact gets bumped to their personal best_send_hour (see
  // /api/email/campaigns/send/route.ts).
  if (typeof send_time_optimization === 'boolean') {
    updatePayload.send_time_optimization = send_time_optimization
  }

  const { data: updated, error } = await supabaseAdmin
    .from('email_campaigns')
    .update(updatePayload)
    .eq('id', campaignId)
    .eq('organization_id', auth.user.organization_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaign: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params
  const auth = await getAuthClient()
  if (!auth) return authError()

  const { data, error } = await supabaseAdmin
    .from('email_campaigns')
    .update({ status: 'draft', scheduled_at: null })
    .eq('id', campaignId)
    .eq('organization_id', auth.user.organization_id)
    .eq('status', 'scheduled')
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not scheduled' }, { status: 404 })
  return NextResponse.json({ campaign: data })
}
