import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/api-utils'

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

    // Buscar remetente configurado da org do usuário
    const auth = await getAuthClient()
    let fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'
    let senderName = 'Worder'

    if (auth) {
      try {
        const { getOrgSender } = await import('@/lib/email/sender')
        const sender = await getOrgSender(auth.user.organization_id)
        fromEmail = sender.fromEmail
        senderName = sender.senderName
      } catch { /* fallback */ }
    }

    const from = `${senderName} <${fromEmail}>`

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.worder.com.br'

    let finalHtml = html || '<h1>Email de teste</h1><p>Este é um email de teste enviado pelo Worder.</p>'
    finalHtml = finalHtml.replace(/\{\{countdown_base_url\}\}/g, appUrl)
    finalHtml = finalHtml.replace(/\{\{first_name\}\}/g, 'Cliente')
    finalHtml = finalHtml.replace(/\{\{last_name\}\}/g, 'Teste')
    finalHtml = finalHtml.replace(/\{\{email\}\}/g, testEmail)
    finalHtml = finalHtml.replace(/\{\{store_name\}\}/g, senderName)
    finalHtml = finalHtml.replace(/\{\{store_url\}\}/g, '#')
    finalHtml = finalHtml.replace(/\{\{unsubscribe_url\}\}/g, '#')
    finalHtml = finalHtml.replace(/\{\{coupon_code\}\}/g, 'TESTE10')
    finalHtml = finalHtml.replace(/\{\{coupon_expiry\}\}/g, '31/12/2026')

    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    const { data, error } = await resend.emails.send({
      from,
      to: [testEmail],
      subject: `[TESTE] ${subject || 'Email de teste'}`,
      html: finalHtml,
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
