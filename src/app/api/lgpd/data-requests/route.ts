// =============================================
// WORDER: LGPD data requests (export/delete/rectification)
// /src/app/api/lgpd/data-requests/route.ts
//
// POST público (sem auth):   cria pedido + envia email de verificação
// GET  autenticado:          lista pedidos da org
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const VALID_TYPES = ['export', 'delete', 'rectification', 'portability', 'object', 'restrict']

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const rl = await checkRateLimit(`lgpd-req:${ip}`, { limit: 5, windowSec: 3600 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const { organization_id, requester_email, request_type, reason, payload } = await req.json()

    if (!organization_id || !requester_email || !request_type) {
      return NextResponse.json(
        { error: 'organization_id, requester_email, request_type required' },
        { status: 400 }
      )
    }
    if (!VALID_TYPES.includes(request_type)) {
      return NextResponse.json({ error: 'Invalid request_type' }, { status: 400 })
    }

    // Tenta achar contato (não obrigatório — pode ser pedido anônimo)
    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('organization_id', organization_id)
      .ilike('email', requester_email)
      .maybeSingle()

    const token = crypto.randomBytes(32).toString('hex')

    const { data: requestRow, error } = await supabaseAdmin
      .from('lgpd_data_requests')
      .insert({
        organization_id,
        contact_id: contact?.id || null,
        requester_email,
        request_type,
        reason,
        payload: payload || {},
        token,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      console.error('[lgpd/data-requests] insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // TODO: enviar email de verificação (se Resend configurado, envia agora)
    try {
      const { sendEmail } = await import('@/lib/email/resend')
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
      const verifyLink = `${baseUrl}/api/lgpd/data-requests/verify?token=${token}`
      const fromEmail = process.env.LGPD_FROM_EMAIL || 'privacy@worder.app'

      await sendEmail({
        to: requester_email,
        from: fromEmail,
        subject: `Confirme seu pedido de ${request_type} - LGPD`,
        html: `
          <p>Recebemos seu pedido de <strong>${request_type}</strong> de dados pessoais.</p>
          <p>Para confirmar, clique no link abaixo (válido por 72h):</p>
          <p><a href="${verifyLink}">${verifyLink}</a></p>
          <p>Se não foi você, ignore este email.</p>
        `,
      }).catch((e) => console.warn('[lgpd/data-requests] email send failed:', e?.message))
    } catch { /* silent */ }

    return NextResponse.json({
      success: true,
      request_id: requestRow.id,
      message: 'Um email de confirmação foi enviado para ' + requester_email,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  let q = supabaseAdmin
    .from('lgpd_data_requests')
    .select('*')
    .eq('organization_id', auth.user.organization_id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: data || [] })
}
