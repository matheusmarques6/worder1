// =============================================
// WORDER: LGPD verify + process data request
// GET /api/lgpd/data-requests/verify?token=...
//
// Valida token → marca verified_at → enfileira processamento.
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 })
  }

  const { data: request, error } = await supabaseAdmin
    .from('lgpd_data_requests')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (error || !request) {
    return new NextResponse(
      `<!doctype html><html><body style="font-family:sans-serif;max-width:500px;margin:40px auto;padding:20px;">
       <h1>Link inválido ou expirado</h1>
       <p>Por favor, solicite um novo pedido LGPD.</p>
       </body></html>`,
      { status: 404, headers: { 'Content-Type': 'text/html' } }
    )
  }

  // ✅ Token válido por 72h (conforme informado no email). Rejeita se expirado.
  const createdAt = request.created_at ? new Date(request.created_at).getTime() : 0
  const ageMs = Date.now() - createdAt
  const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000
  if (!createdAt || ageMs > SEVENTY_TWO_HOURS_MS) {
    return new NextResponse(
      `<!doctype html><html><body style="font-family:sans-serif;max-width:500px;margin:40px auto;padding:20px;">
       <h1>Link expirado</h1>
       <p>Este link de confirmação era válido por 72 horas. Por favor, solicite um novo pedido LGPD.</p>
       </body></html>`,
      { status: 410, headers: { 'Content-Type': 'text/html' } }
    )
  }

  if (request.verified_at) {
    return new NextResponse(
      `<!doctype html><html><body style="font-family:sans-serif;max-width:500px;margin:40px auto;padding:20px;">
       <h1>Pedido já confirmado</h1>
       <p>Seu pedido <strong>${request.request_type}</strong> está ${request.status}.</p>
       </body></html>`,
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    )
  }

  // Marca como verificado e agenda processamento (status=processing)
  await supabaseAdmin
    .from('lgpd_data_requests')
    .update({
      verified_at: new Date().toISOString(),
      status: 'processing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', request.id)

  // Dispara processamento imediato (fire-and-forget)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  fetch(`${baseUrl}/api/lgpd/data-requests/${request.id}/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal': 'true',
      Authorization: `Bearer ${process.env.CRON_SECRET || ''}`,
    },
  }).catch(() => {})

  return new NextResponse(
    `<!doctype html><html><body style="font-family:sans-serif;max-width:500px;margin:40px auto;padding:20px;">
     <h1>Pedido confirmado ✓</h1>
     <p>Seu pedido de <strong>${request.request_type}</strong> foi confirmado e está sendo processado.</p>
     <p>Você receberá um email em até 15 dias úteis.</p>
     </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  )
}
