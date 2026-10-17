import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { validatePassword } from '@/lib/password-validation'

export async function verifyCurrentPassword(admin: SupabaseClient, user: { id: string; email: string }, password: string): Promise<boolean> {
  const verifier = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await verifier.auth.signInWithPassword({ email: user.email, password })
  try { return !error && data.user?.id === user.id } finally {
    if (data.session?.access_token) await admin.auth.admin.signOut(data.session.access_token, 'local').catch(() => {})
  }
}

/** An isolated password verification client must never replace the admin session. */
export async function changePasswordWithReauthentication(
  admin: SupabaseClient,
  user: { id: string; email: string },
  currentPassword: string,
  newPassword: string,
  keepSessionId: string | null,
): Promise<{ error?: string; status?: number }> {
  if (!currentPassword) return { error: 'Confirme sua senha atual.', status: 403 }
  if (!validatePassword(newPassword).isValid || newPassword === currentPassword) {
    return { error: 'A nova senha não atende aos requisitos.', status: 400 }
  }
  if (!await verifyCurrentPassword(admin, user, currentPassword)) return { error: 'Senha atual incorreta.', status: 403 }
  const { error: writeError } = await admin.auth.admin.updateUserById(user.id, { password: newPassword })
  if (writeError) return { error: 'Não foi possível alterar a senha.', status: 400 }
  const { error: revokeError } = await admin.rpc('revoke_other_auth_sessions', { p_user_id: user.id, p_keep_session_id: keepSessionId })
  if (revokeError) return { error: 'Senha alterada, mas não foi possível encerrar as outras sessões. Tente encerrar as sessões novamente.', status: 503 }
  return {}
}
