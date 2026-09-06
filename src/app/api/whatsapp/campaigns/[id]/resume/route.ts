import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { requireOrgFromAuth } from '@/lib/auth/require-org';
export const dynamic = 'force-dynamic';

// POST /api/whatsapp/campaigns/[id]/resume
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // A campanha vinha só pelo id, com a chave de serviço e sem sessão:
  // qualquer um retomava a campanha de qualquer organização.
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

    if (campaign.status !== 'paused') {
      return NextResponse.json({ error: 'Only paused campaigns can be resumed' }, { status: 400 })
    }

    const { data: updated, error } = await supabase
      .from('whatsapp_campaigns')
      .update({
        status: 'running',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', orgId)
      .select('*')
      .single()

    if (error) throw error

    await supabase.from('whatsapp_campaign_logs').insert({
      campaign_id: id,
      organization_id: orgId,
      log_type: 'info',
      message: 'Campanha retomada'
    })

    return NextResponse.json({ campaign: updated })
  } catch (error) {
    console.error('Error resuming campaign:', error)
    return NextResponse.json({ error: 'Failed to resume campaign' }, { status: 500 })
  }
}
