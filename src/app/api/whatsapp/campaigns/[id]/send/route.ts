import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { getAuthClient, authError } from '@/lib/api-utils'
import { campaignProcessor } from '@/lib/whatsapp/campaign-processor'
import { ensureCampaignTemplateApproved } from '@/lib/whatsapp/template-approval'
export const dynamic = 'force-dynamic';

// POST /api/whatsapp/campaigns/[id]/send - Iniciar envio
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // P0: rota era pública — agora exige usuário autenticado e a campanha
    // precisa pertencer a uma org do usuário (mesmo padrão de [id]/route.ts).
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', auth.user.id)
    const orgIds = [...new Set([
      auth.user.organization_id,
      ...(memberships?.map((m: any) => m.organization_id) || []),
    ])]

    const { data: campaign } = await supabase
      .from('whatsapp_campaigns')
      .select('id, organization_id, template_id, template_name')
      .eq('id', id)
      .in('organization_id', orgIds)
      .maybeSingle()

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // P0: bloquear envio com template não-APPROVED (draft pendente é
    // permitido na criação; envio não).
    const tplCheck = await ensureCampaignTemplateApproved(campaign)
    if (!tplCheck.ok) {
      return NextResponse.json({ error: tplCheck.reason, code: 'TEMPLATE_NOT_APPROVED' }, { status: 400 })
    }

    const result = await campaignProcessor.startCampaign(id)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: 'Campaign queued for processing',
      totalRecipients: result.totalRecipients,
      totalBatches: result.totalBatches,
    })
  } catch (error: any) {
    console.error('Error sending campaign:', error)
    return NextResponse.json({ error: error.message || 'Failed to send campaign' }, { status: 500 })
  }
}
