// =============================================
// POST /api/inbox/conversations/[id]/ai-toggle
// Pausa/despausa permanentemente a IA para um contato específico.
// Body: { paused: boolean, reason?: string, until?: ISO_DATE }
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json()
  const paused = !!body?.paused
  const reason = typeof body?.reason === 'string' ? body.reason : null
  const until = typeof body?.until === 'string' ? body.until : null

  const supabase = getSupabaseAdmin()
  const update = paused
    ? {
        ai_paused: true,
        ai_paused_reason: reason ?? 'manual',
        ai_paused_until: until,
        ai_paused_by_user_id: auth.user.id,
      }
    : {
        ai_paused: false,
        ai_paused_reason: null,
        ai_paused_until: null,
        ai_paused_by_user_id: null,
      }

  const { error } = await supabase
    .from('whatsapp_conversations')
    .update(update)
    .eq('id', params.id)
    .eq('organization_id', auth.user.organization_id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, paused })
}
