import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { requireOrgFromAuth } from '@/lib/auth/require-org';
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

    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .update({
        status: 'closed',
        resolved_at: new Date().toISOString(),
        resolved_by: authUserId,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', orgId)
      .select('*, contact:whatsapp_contacts(id, organization_id)')
      .single()

    if (error) throw error

    // Registra atividade
    if (data?.contact) {
      await supabase.from('contact_activities').insert({
        organization_id: data.contact.organization_id,
        contact_id: data.contact.id,
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
