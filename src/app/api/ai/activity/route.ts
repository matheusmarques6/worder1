import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { listRuntimeActivity, runtimeConversationDetail } from '@/lib/ai/activity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/ai/activity — a trilha única (9.4): conversas do runtime com
// missão dona, custo e último veredito do Judge, escopadas pela org da
// sessão. ?conversation_id= devolve o detalhe (chamadas + tools) — só se a
// conversa for da org.
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const organizationId = auth.user.organization_id
    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const conversationId = request.nextUrl.searchParams.get('conversation_id')

    if (conversationId) {
      const detail = await runtimeConversationDetail(supabase, organizationId, conversationId)
      if (!detail) {
        return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
      }
      return NextResponse.json(detail)
    }

    const conversations = await listRuntimeActivity(supabase, organizationId)
    return NextResponse.json({ conversations })
  } catch (error: any) {
    console.error('Error in GET /api/ai/activity:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
