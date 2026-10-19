import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { changePasswordWithReauthentication } from '@/lib/auth/change-password'
import { jwtSessionId } from '@/lib/settings/request-meta'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const body = await request.json().catch(() => ({}))
  if (!body.current_password || !body.new_password) {
    return NextResponse.json({ error: 'current_password and new_password are required' }, { status: 400 })
  }
  const result = await changePasswordWithReauthentication(supabaseAdmin, auth.user,
    String(body.current_password), String(body.new_password), jwtSessionId(request.cookies.get('sb-access-token')?.value))
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status })
  const { error } = await supabaseAdmin.from('profiles').update({ must_change_password: false, updated_at: new Date().toISOString() }).eq('id', auth.user.id)
  if (error) return NextResponse.json({ error: 'Senha alterada, mas falhou a atualização do perfil.' }, { status: 503 })
  return NextResponse.json({ success: true, message: 'Senha alterada com sucesso' })
}
