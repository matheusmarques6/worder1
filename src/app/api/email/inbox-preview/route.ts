// =============================================
// POST /api/email/inbox-preview
//
// Renderiza o HTML final que o destinatário verá (após merge tags,
// imagem rewrites, tracking pixels, unsub link) e devolve em três
// shapes: subject + preheader + HTML do corpo. A UI da campanha
// exibe num iframe scoped — mobile (375px) e desktop (600px) lado
// a lado, igual Klaviyo/Omnisend.
//
// Não envia email; só renderiza. Sample data para merge tags vem
// do body (mergeData opcional) ou de defaults razoáveis.
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { prepareEmailHtml, renderMergeTags } from '@/lib/email/render'

export const dynamic = 'force-dynamic'

const SAMPLE_MERGE: Record<string, string> = {
  first_name: 'Ana',
  last_name: 'Silva',
  full_name: 'Ana Silva',
  email: 'ana@example.com',
  phone: '+55 11 98765-4321',
  store_name: 'Sua Loja',
  store_url: 'https://sualoja.com',
  store_email: 'oi@sualoja.com',
  unsubscribe_url: '#',
  checkout_url: 'https://sualoja.com/cart',
  'contact.first_name': 'Ana',
  'contact.email': 'ana@example.com',
  'account.name': 'Sua Loja',
}

export async function POST(req: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  const body = await req.json()
  const { campaignId, html: rawHtml, subject, preheader, mergeData } = body

  let finalHtml: string = rawHtml || ''
  let finalSubject: string = subject || ''
  let finalPreheader: string = preheader || ''
  let baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.worder.com.br'

  // When campaignId is provided pull the latest saved version.
  if (campaignId) {
    const { data: camp } = await supabaseAdmin
      .from('email_campaigns')
      .select('id, name, subject, preheader, html, organization_id')
      .eq('id', campaignId)
      .eq('organization_id', auth.user.organization_id)
      .maybeSingle()
    if (!camp) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }
    finalHtml = camp.html || rawHtml || ''
    finalSubject = camp.subject || subject || ''
    finalPreheader = camp.preheader || preheader || ''
  }

  if (!finalHtml) {
    return NextResponse.json({ error: 'HTML do email é obrigatório' }, { status: 400 })
  }

  const merge: Record<string, string> = { ...SAMPLE_MERGE, ...(mergeData || {}) }

  // Run the full prepare pipeline so the preview matches what the
  // recipient actually receives — merge tags, image CDN rewrites,
  // unsubscribe link, tracking pixel.
  const previewSendId = 'preview-' + Math.random().toString(36).slice(2, 9)
  const processedHtml = prepareEmailHtml({
    html: finalHtml,
    mergeData: merge,
    emailSendId: previewSendId,
    baseUrl,
    contactId: undefined,
    orgId: auth.user.organization_id,
    campaignId,
  })

  return NextResponse.json({
    subject: renderMergeTags(finalSubject, merge),
    preheader: renderMergeTags(finalPreheader, merge),
    html: processedHtml,
    sampleMergeData: merge,
  })
}
