// =============================================
// POST /api/settings/2fa/enroll
//
// Inicia o enrollment de 2FA TOTP. Usa o MFA nativo do Supabase
// Auth — gera secret + URL otpauth, devolve o QR code (data URL)
// pra o app rendererizar e o usuário escanear no Google Authenticator
// / Authy / 1Password. O verify é uma segunda chamada
// (/api/settings/2fa/verify) que confirma o código TOTP digitado.
//
// Sem cron de cleanup; um factor unverified expira sozinho no
// Supabase após algumas horas se não confirmado.
// =============================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'

export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = createServerComponentClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Friendly name shown in the merchant's authenticator app.
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Worder · ${user.email || user.id.slice(0, 8)}`,
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({
    factorId: data.id,
    type: data.type,
    // The Supabase SDK returns totp.qr_code as a data URL (svg base64).
    // We surface both that and the raw URI so power users can paste
    // the otpauth:// into a different password manager.
    qrCode: (data as any).totp?.qr_code || null,
    uri: (data as any).totp?.uri || null,
    secret: (data as any).totp?.secret || null,
  })
}
