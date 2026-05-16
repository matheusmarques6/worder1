// =============================================
// POST /api/settings/2fa/verify
//
// Confirma o código TOTP de 6 dígitos gerado pelo authenticator e
// promove o factor pra `verified=true`. A partir desse momento o
// login do Supabase exige o segundo fator. Body:
//   { factorId, code }
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createServerComponentClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { factorId, code } = await req.json()
  if (!factorId || !code) {
    return NextResponse.json({ error: 'factorId e code são obrigatórios' }, { status: 400 })
  }

  // Supabase MFA requires a challenge step before verify, so we
  // chain them here. The challenge id is short-lived; consuming it
  // immediately is the standard pattern.
  const { data: chal, error: chalErr } = await supabase.auth.mfa.challenge({ factorId })
  if (chalErr) {
    return NextResponse.json({ error: chalErr.message }, { status: 400 })
  }

  const { data, error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: chal.id,
    code,
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, factor: data })
}
