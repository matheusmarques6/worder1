// =============================================
// Cron: verifica domínios de envio pendentes a cada 15 min e avisa a
// organização por e-mail quando um domínio fica verificado (o lojista
// não precisa ficar com o assistente aberto esperando a propagação).
// =============================================

export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyEmailDomain } from '@/lib/email/domain-dns-check'

function authorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const since = new Date(Date.now() - 30 * 86400_000).toISOString()
  const { data: pending } = await supabaseAdmin
    .from('email_domains')
    .select('*')
    .eq('status', 'pending')
    .eq('is_system', false)
    .not('resend_domain_id', 'is', null)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(40)

  const results: any[] = []
  for (const d of pending || []) {
    try {
      const r = await verifyEmailDomain(d, { trigger: true })
      results.push({ domain: d.domain, status: r.status })
      if (r.status === 'verified') await notifyVerified(d)
    } catch (e: any) {
      results.push({ domain: d.domain, error: e?.message })
    }
  }
  return NextResponse.json({ checked: results.length, results })
}

async function notifyVerified(d: any) {
  try {
    if (!process.env.RESEND_API_KEY) return
    const { data: org } = await supabaseAdmin.from('organizations').select('name, company_name, billing_email').eq('id', d.organization_id).single()
    const { data: owner } = await supabaseAdmin.from('profiles').select('email').eq('organization_id', d.organization_id).eq('role', 'owner').limit(1).maybeSingle()
    const to = owner?.email || org?.billing_email
    if (!to) return
    const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.worder.com.br').replace(/\/$/, '')
    const { sendEmail } = await import('@/lib/email/resend')
    await sendEmail({
      to,
      from: process.env.RESEND_FROM_EMAIL || 'noreply@worder.email',
      senderName: 'Worder',
      subject: `${d.domain} está verificado`,
      html: `<!doctype html><html><body style="margin:0;background:#F4F5F7;font-family:Helvetica,Arial,sans-serif;color:#0F1114">
<div style="max-width:520px;margin:32px auto;background:#fff;border:1px solid #E8EAEE;border-radius:12px;padding:32px">
<p style="margin:0 0 6px;font-size:13px;color:#7E8792">Worder</p>
<h1 style="margin:0 0 12px;font-size:20px">${d.domain} está verificado</h1>
<p style="font-size:14px;line-height:1.6;color:#525A64">Os registros DNS de <b>${d.domain}</b> foram encontrados e o domínio já pode enviar e-mails da ${org?.company_name || org?.name || 'sua loja'}. Defina um remetente @${d.domain} em Configurações → Domínios e remetente.</p>
<p style="margin:24px 0"><a href="${base}/settings/email" style="display:inline-block;background:#FE5A1D;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px">Abrir Domínios e remetente</a></p>
</div></body></html>`,
      tags: [{ name: 'type', value: 'domain_verified' }],
    })
  } catch (e) {
    console.warn('[verify-email-domains] aviso não enviado:', (e as any)?.message)
  }
}
