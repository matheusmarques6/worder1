import { NextRequest, NextResponse } from 'next/server'
import { campaignProcessor } from '@/lib/whatsapp/campaign-processor'

// POST /api/whatsapp/campaigns/[id]/send - Iniciar envio (NOVA VERSÃO COM QUEUE)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Usar o novo processor com queue e rate limiting
    const result = await campaignProcessor.startCampaign(id)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ 
      success: true,
      message: 'Campaign queued for processing',
      totalRecipients: result.totalRecipients,
      totalBatches: result.totalBatches
    })
  } catch (error: any) {
    console.error('Error sending campaign:', error)
    return NextResponse.json({ error: error.message || 'Failed to send campaign' }, { status: 500 })
  }
}
