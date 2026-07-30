// =============================================
// GET /api/whatsapp/inbox/conversations/[id]/ai-status
//
// Responde "o agente vai responder aqui?" ANTES de o cliente mandar mensagem.
// Existe porque o badge do inbox mostrava "Bot Ativo" olhando so ai_enabled,
// enquanto o silencio real vinha dos guards do cloud-runner — e o atendente
// nao tinha como saber a diferenca.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOrgFromAuth } from '@/lib/auth/require-org';
import { resolveConversationAiStatus } from '@/lib/ai/conversation-ai-status';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const resolved = await Promise.resolve(params as Promise<{ id: string }>);
    const conversationId = resolved.id;

    const auth = await requireOrgFromAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { orgId } = auth;

    const { data: conversation, error } = await supabaseAdmin
      .from('whatsapp_cloud_conversations')
      .select('id, waba_id, ai_enabled, ai_agent_id, ai_transferred_at')
      .eq('id', conversationId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (error) {
      console.error('[inbox/ai-status] DB error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    // Conversa legada (Evolution) nao tem linha cloud: nao ha agente para
    // avaliar, e devolver 404 faria o badge piscar erro a toa.
    if (!conversation) {
      return NextResponse.json({ status: null });
    }

    const status = await resolveConversationAiStatus({
      conversation,
      organizationId: orgId,
    });

    return NextResponse.json({ status });
  } catch (e: any) {
    console.error('[inbox/ai-status] unhandled:', e);
    return NextResponse.json(
      { error: 'Internal server error', details: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
