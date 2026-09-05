// Configurações → Notificações (o que receber e por onde).
// GET → { notifications, phone, events } · PUT → { notifications }

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-admin'
import { NOTIFICATION_EVENTS, normalizeNotifications } from '@/lib/settings/notifications'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ notifications: normalizeNotifications(null), phone: null, events: NOTIFICATION_EVENTS })
  const { data: prof } = await supabaseAdmin.from('profiles').select('preferences, phone').eq('id', auth.user.id).single()
  return NextResponse.json({
    notifications: normalizeNotifications(prof?.preferences?.notifications),
    phone: prof?.phone || null,
    events: NOTIFICATION_EVENTS,
  })
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  const body = await request.json().catch(() => ({}))
  const next = normalizeNotifications(body?.notifications)
  const { data: prof } = await supabaseAdmin.from('profiles').select('preferences, phone').eq('id', auth.user.id).single()
  const wantsWhatsapp = Object.values(next).some((c) => c.whatsapp)
  const { error } = await supabaseAdmin.from('profiles')
    .update({ preferences: { ...(prof?.preferences || {}), notifications: next }, updated_at: new Date().toISOString() })
    .eq('id', auth.user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    notifications: next,
    warning: wantsWhatsapp && !prof?.phone ? 'Cadastre seu telefone em Perfil para receber avisos por WhatsApp.' : null,
  })
}
