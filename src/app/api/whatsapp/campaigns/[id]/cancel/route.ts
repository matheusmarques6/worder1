import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { requireOrgFromAuth } from '@/lib/auth/require-org';
export const dynamic = 'force-dynamic';

// POST /api/whatsapp/campaigns/[id]/cancel
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // A campanha vinha só pelo id, com a chave de serviço e sem sessão:
  // qualquer um cancelava a campanha de qualquer organização.
  const auth = await requireOrgFromAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { orgId } = auth;

  try {
    const { id } = params

    const { data: campaign } = await supabase
      .from('whatsapp_campaigns')
      .select('status')
      .eq('id', id)
      .eq('organization_id', orgId)
      .single()

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (!['scheduled', 'running', 'paused'].includes(campaign.status)) {
      return NextResponse.json({ error: 'Campaign cannot be cancelled in current status' }, { status: 400 })
    }

    const { data: updated, error } = await supabase
      .from('whatsapp_campaigns')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', orgId)
      .select('*')
      .single()

    if (error) throw error

    // Cancelar recipients pendentes
    await supabase
      .from('whatsapp_campaign_recipients')
      .update({ status: 'cancelled' })
      .eq('campaign_id', id)
      .in('status', ['pending', 'queued'])

    await supabase.from('whatsapp_campaign_logs').insert({
      campaign_id: id,
      organization_id: orgId,
      log_type: 'warning',
      message: 'Campanha cancelada'
    })

    return NextResponse.json({ campaign: updated })
  } catch (error) {
    console.error('Error cancelling campaign:', error)
    return NextResponse.json({ error: 'Failed to cancel campaign' }, { status: 500 })
  }
}
