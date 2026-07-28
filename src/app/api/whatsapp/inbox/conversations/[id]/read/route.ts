import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { requireOrgFromAuth } from '@/lib/auth/require-org';
import { resolveInboxConversation } from '@/lib/whatsapp/inbox-conversation-resolver';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const conversationId = params.id

    const resolved = await resolveInboxConversation(supabase, conversationId, orgId)
    if (!resolved) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const { error } = await supabase
      .from(resolved.table)
      .update({ unread_count: 0 })
      .eq('id', conversationId)
      .eq('organization_id', orgId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error marking as read:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
