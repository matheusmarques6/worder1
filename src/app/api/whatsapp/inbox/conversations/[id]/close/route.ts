import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { requireOrgFromAuth } from '@/lib/auth/require-org';
import { resolveInboxConversation } from '@/lib/whatsapp/inbox-conversation-resolver';
export const dynamic = 'force-dynamic';

// POST /api/whatsapp/inbox/conversations/[id]/close
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId, userId: authUserId } = auth

    const { id } = params
    const body = await request.json()
    const { resolution } = body

    // Resolver a tabela base (cloud ou legacy) antes do UPDATE.
    const resolved = await resolveInboxConversation(supabase, id, orgId)
    if (!resolved) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const now = new Date().toISOString()
    // whatsapp_cloud_conversations nao tem resolved_at/resolved_by.
    const closeUpdates =
      resolved.table === 'whatsapp_cloud_conversations'
        ? { status: 'closed', updated_at: now }
        : { status: 'closed', resolved_at: now, resolved_by: authUserId, updated_at: now }

    const { data, error } = await supabase
      .from(resolved.table)
      .update(closeUpdates)
      .eq('id', id)
      .eq('organization_id', orgId)
      .select('*')
      .single()

    if (error) throw error

    // Registra atividade
    if (resolved.row.contact_id) {
      await supabase.from('contact_activities').insert({
        organization_id: orgId,
        contact_id: resolved.row.contact_id,
        conversation_id: id,
        activity_type: 'conversation_closed',
        title: 'Conversa fechada',
        description: resolution || null,
        created_by: authUserId
      })
    }

    return NextResponse.json({ conversation: data })

  } catch (error) {
    console.error('Error closing conversation:', error)
    return NextResponse.json({ error: 'Failed to close conversation' }, { status: 500 })
  }
}
