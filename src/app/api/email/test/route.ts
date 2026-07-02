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
    let fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'
    let senderName = 'Worder'
    let organizationId: string | null = null

    if (auth) {
      organizationId = auth.user.organization_id
      try {
        const { getOrgSender } = await import('@/lib/email/sender')
        const sender = await getOrgSender(auth.user.organization_id)
        fromEmail = sender.fromEmail
        senderName = sender.senderName
      } catch { /* fallback */ }
    }

    const from = `${senderName} <${fromEmail}>`
    const { getAppBaseUrl } = await import('@/lib/app-url')
    const appUrl = getAppBaseUrl()

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
      store_name: senderName,
      store_url: 'https://example.com',
      store_email: fromEmail,
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
    finalHtml = prepareEmailHtml({
      html: finalHtml,
      mergeData,
      emailSendId: testSendId,
      baseUrl: appUrl,
      contactId: undefined,
      orgId: organizationId || undefined,
      campaignId: undefined,
    })

    const unsubUrl = buildUnsubscribeUrl(testSendId, appUrl, undefined, organizationId || undefined)
    const listUnsubHeaders = buildListUnsubscribeHeaders(unsubUrl)

    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    const { data, error } = await resend.emails.send({
      from,
      to: [testEmail],
      subject: `[TESTE] ${finalSubject}`,
      html: finalHtml,
      headers: listUnsubHeaders,
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

    return NextResponse.json({ success: true, id: data?.id, from })
  } catch (error: any) {
    console.error('[EmailTest] Error:', error)
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 })
  }
}
