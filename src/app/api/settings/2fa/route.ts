// =============================================
// GET /api/settings/2fa — lista os factors do usuário
// DELETE /api/settings/2fa?factorId=… — desinscrever um factor
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServerComponentClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({
    totp: data.totp || [],
    enabled: (data.totp || []).some((f: any) => f.status === 'verified'),
  })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerComponentClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const factorId = new URL(req.url).searchParams.get('factorId')
  if (!factorId) {
    return NextResponse.json({ error: 'factorId required' }, { status: 400 })
  }

  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
