import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/api-utils'

// Test send endpoint runs the same render pipeline as a real send so
// the merchant sees in their inbox exactly what their recipients
// will receive — image-rewrite, [[var]] normalisation, click +
// open tracking, List-Unsubscribe headers. Without that, mail-tester
// flags a dozen broken links / missing headers that don't actually
// exist in the production send and the merchant chases ghosts.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { html, testEmail, subject } = body

    if (!testEmail || !testEmail.includes('@')) {
      return NextResponse.json({ error: 'Email válido é obrigatório' }, { status: 400 })
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'RESEND_API_KEY não configurada' }, { status: 500 })
    }

    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const organizationId: string = auth.user.organization_id

    // A LOJA do teste: a que o editor mandou, ou a única da organização.
    // O remetente, o {{store_name}} e o reply-to saem dela. Antes o teste
    // usava o remetente da organização — numa organização com várias
    // lojas, a identidade de outra loja.
    let storeId: string | null = null
    let storeRow: { id: string; shop_name: string | null; shop_email: string | null; shop_domain: string | null; primary_domain: string | null } | null = null
    try {
      const { getSupabaseAdmin } = await import('@/lib/supabase-admin')
      const admin = getSupabaseAdmin()
      const { data: memberships } = await admin.from('organization_members').select('organization_id').eq('user_id', auth.user.id)
      const orgIds = [...new Set([organizationId, ...((memberships || []).map((m: any) => m.organization_id))])]
      const { pickStore } = await import('@/lib/stores/pick-store')
      const picked = await pickStore<any>(admin, {
        orgIds, storeId: body.storeId || body.store_id || null,
        select: 'id, organization_id, shop_name, shop_email, shop_domain, primary_domain',
      })
      if (picked.store) { storeRow = picked.store; storeId = picked.store.id }
      else if (picked.reason === 'ambiguous' || picked.reason === 'not_found') {
        // Várias lojas e nenhuma selecionada: o teste não pode sair com a
        // identidade da organização (que é a de outra loja).
        return NextResponse.json({
          error: 'Selecione a loja antes de enviar o teste: a organização tem mais de uma loja e o remetente é por loja.',
          code: 'store_required',
        }, { status: 400 })
      }
    } catch { /* sem loja: segue com o remetente neutro/organização */ }

    const { getStoreSender } = await import('@/lib/email/sender')
    const sender = await getStoreSender(storeRow ? ((storeRow as any).organization_id || organizationId) : organizationId, storeId)
    const fromEmail = sender.fromEmail
    const senderName = sender.senderName
    const replyTo = sender.replyTo

    const from = sender.from
    const { getAppBaseUrl } = await import('@/lib/app-url')
    const appUrl = getAppBaseUrl()
    const { publicStoreUrl } = await import('@/lib/shopify/store-url')
    const storeUrl = publicStoreUrl(storeRow) || 'https://example.com'

    // Sample merge data so {{ first_name }}, {{ store_name }} etc.
    // resolve in the test instead of leaking into the inbox as raw
    // tags. Mirrors the keys send-campaign-email builds for real
    // sends so the test email shape matches production. Seeded with the
    // full sample set (flat + event.* + canonical un-prefixed tags),
    // then overridden with the route-specific values below.
    const { getSampleMergeData } = await import('@/lib/email/merge-tags')
    const mergeData: Record<string, string> = {
      ...getSampleMergeData(),
      first_name: 'Cliente',
      last_name: 'Teste',
      full_name: 'Cliente Teste',
      email: testEmail,
      phone: '',
      store_name: storeRow?.shop_name || senderName,
      store_url: storeUrl,
      store_email: storeRow?.shop_email || replyTo || fromEmail,
      coupon_code: 'TESTE10',
      coupon_expiry: '31/12/2026',
      checkout_url: 'https://example.com/checkout',
      order_number: '#1001',
      'event.CheckoutURL': 'https://example.com/checkout',
      'event.OrderNumber': '#1001',
      'event.Value': '99.90',
      'event.Currency': 'BRL',
      'event.ItemCount': '1',
      countdown_base_url: appUrl,
      unsubscribe_url: '#',
    }

    let finalHtml = html || '<h1>Email de teste</h1><p>Este é um email de teste enviado pelo Worder.</p>'
    let finalSubject = subject || 'Email de teste'

    // Mock trigger payload so {{ trigger.* }} smart tags AND the canonical
    // un-prefixed tags ({{ CheckoutURL }}, {{ Customer.Email }},
    // {{ Tracking.Number }}, ...) resolve. The resolver expects the same
    // shape produced by the Shopify webhook handler.
    try {
      const { resolveTriggerSmartTags } = await import('@/lib/email/merge-tags')
      const mockEvent = {
        CheckoutURL: 'https://example.com/checkout/abc',
        CheckoutID: '987654',
        OrderNumber: '1001',
        OrderID: '4567890',
        OrderStatusURL: 'https://example.com/orders/abc',
        Items: [{
          ProductName: 'Produto Demo',
          ProductURL: 'https://example.com/produto',
          ImageURL: 'https://via.placeholder.com/300',
          ItemPrice: 99.9,
          Quantity: 1,
        }],
        Currency: 'BRL',
        TotalPrice: 99.9,
        SubtotalPrice: 89.9,
        ItemCount: 1,
        FinancialStatus: 'paid',
        FulfillmentStatus: 'fulfilled',
        DiscountCodes: ['TESTE10'],
        Customer: {
          Email: testEmail,
          FirstName: 'Cliente',
          LastName: 'Teste',
          FullName: 'Cliente Teste',
          Phone: '+5531999999999',
          TotalOrders: 5,
          TotalSpent: 1250,
        },
        Tracking: {
          Number: 'BR123456789',
          URL: 'https://rastreio.correios.com.br/BR123456789',
        },
        BillingAddress: { City: 'São Paulo' },
        ShippingAddress: { City: 'São Paulo' },
      }
      // HTML context → escape substituted values (XSS parity with prod).
      finalHtml = resolveTriggerSmartTags(finalHtml, mockEvent, undefined, { escapeHtml: true })
      // SUBJECT goes through the same pipeline as production sends
      // (resolveTriggerSmartTags + renderMergeTags below) instead of raw.
      finalSubject = resolveTriggerSmartTags(finalSubject, mockEvent)
    } catch { /* non-blocking */ }

    try {
      const { renderMergeTags } = await import('@/lib/email/render')
      // escape:false — subject is text/plain (no &amp; in the inbox).
      finalSubject = renderMergeTags(finalSubject, mergeData, { escape: false })
    } catch { /* non-blocking */ }

    // Full prepare pipeline = renderMergeTags ([[var]] normalised),
    // image-rewrite (Supabase /object/public → CDN /render/image),
    // unsubscribe link, click rewrite, open pixel. We synthesise a
    // plausible emailSendId so tracking endpoints respond without
    // 404 (and so List-Unsubscribe header has a real URL).
    const testSendId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const { prepareEmailHtml, buildUnsubscribeUrl, buildListUnsubscribeHeaders } = await import('@/lib/email/render')

    // UTM + identificação como no envio real (configuração da loja do
    // teste), para o lojista ver no inbox exatamente o link que sai.
    let linkParams: any = null
    try {
      const { getUtmSettings } = await import('@/lib/tracking/utm-settings')
      const { makeLinkParamsResolver } = await import('@/lib/tracking/link-params')
      const { settings } = await getUtmSettings(organizationId, storeId)
      const fc = body.flowContext || {}
      linkParams = makeLinkParamsResolver(settings, fc.automationId || fc.automationName
        ? {
            channel: 'email', messageType: 'automation',
            automationName: fc.automationName || 'Automação (teste)', automationId: fc.automationId || null,
            messageName: fc.nodeLabel || 'Email (teste)', messageId: fc.nodeId || null,
            emailSubject: finalSubject, sendId: testSendId, storeName: mergeData.store_name, storeDomain: storeUrl, extra: mergeData,
          }
        : {
            channel: 'email', messageType: 'campaign',
            campaignName: body.campaignName || 'Campanha (teste)', campaignId: body.campaignId || 'teste',
            emailSubject: finalSubject, sendId: testSendId, storeName: mergeData.store_name, storeDomain: storeUrl, extra: mergeData,
          })
    } catch { /* teste segue sem UTM no href */ }

    finalHtml = prepareEmailHtml({
      html: finalHtml,
      mergeData,
      emailSendId: testSendId,
      baseUrl: appUrl,
      contactId: undefined,
      orgId: organizationId || undefined,
      campaignId: undefined,
      storeId: storeId || undefined,
      linkParams,
    })

    const unsubUrl = buildUnsubscribeUrl(testSendId, appUrl, undefined, organizationId || undefined, undefined, storeId || undefined)
    const listUnsubHeaders = buildListUnsubscribeHeaders(unsubUrl)

    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    const { data, error } = await resend.emails.send({
      from,
      to: [testEmail],
      subject: `[TESTE] ${finalSubject}`,
      html: finalHtml,
      headers: listUnsubHeaders,
      ...(replyTo ? { replyTo } : {}),
    })

    if (error) {
      console.error('[EmailTest] Resend error:', JSON.stringify(error))
      const hint = error.message?.includes('not a verified')
        ? 'O domínio do remetente não está verificado. Vá em Configurações → E-mail & Domínios e verifique seu domínio.'
        : error.message?.includes('not allowed')
        ? 'No plano gratuito do Resend, só é possível enviar para o email do dono da conta. Verifique um domínio próprio para enviar para qualquer email.'
        : undefined
      return NextResponse.json({
        error: `${error.message}`,
        hint,
        from,
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      id: data?.id,
      from,
      senderSource: sender.source,
      hint: sender.source === 'platform' && storeId
        ? 'Esta loja ainda não tem remetente configurado. Defina em Configurações → E-mail & Domínios para enviar com a identidade dela.'
        : undefined,
    })
  } catch (error: any) {
    console.error('[EmailTest] Error:', error)
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 })
  }
}
