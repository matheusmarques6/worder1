import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { html, testEmail, subject } = body

    if (!testEmail || !testEmail.includes('@')) {
      return NextResponse.json({ error: 'Email válido é obrigatório' }, { status: 400 })
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        error: 'RESEND_API_KEY não configurada. Vá em Vercel → Settings → Environment Variables e adicione RESEND_API_KEY com sua chave do resend.com'
      }, { status: 500 })
    }

    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    // Use onboarding@resend.dev (always works) or custom domain
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Worder <onboarding@resend.dev>'

    console.log('[EmailTest] Sending to:', testEmail, 'from:', fromEmail, 'subject:', subject)

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [testEmail],
      subject: `[TESTE] ${subject || 'Email de teste'}`,
      html: html || '<h1>Email de teste</h1><p>Este é um email de teste enviado pelo Worder.</p>',
    })

    if (error) {
      console.error('[EmailTest] Resend error:', JSON.stringify(error))
      return NextResponse.json({
        error: `Resend: ${error.message}. ${error.name === 'validation_error' ? 'Verifique o domínio do remetente.' : ''}`
      }, { status: 500 })
    }

    console.log('[EmailTest] Sent successfully, id:', data?.id)
    return NextResponse.json({ success: true, id: data?.id })
  } catch (error: any) {
    console.error('[EmailTest] Error:', error)
    return NextResponse.json({ error: error.message || 'Erro interno ao enviar email' }, { status: 500 })
  }
}
