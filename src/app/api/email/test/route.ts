import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { html, testEmail, subject } = await req.json()

    if (!testEmail || !testEmail.includes('@')) {
      return NextResponse.json({ error: 'Email válido é obrigatório' }, { status: 400 })
    }

    // Import Resend dynamically to handle missing API key gracefully
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'RESEND_API_KEY não configurada. Adicione nas variáveis de ambiente.' }, { status: 500 })
    }

    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Worder <onboarding@resend.dev>',
      to: [testEmail],
      subject: `[TESTE] ${subject || 'Email de teste'}`,
      html: html || '<h1>Email de teste</h1><p>Este é um email de teste enviado pelo Worder.</p>',
    })

    if (error) {
      console.error('[EmailTest] Resend error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: data?.id })
  } catch (error: any) {
    console.error('[EmailTest] Error:', error)
    return NextResponse.json({ error: error.message || 'Erro ao enviar email de teste' }, { status: 500 })
  }
}
