import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthClient } from '@/lib/api-utils';
import { listVersions } from '@/lib/ai/versions'
export const dynamic = 'force-dynamic';

// =====================================================
// GET - LISTAR VERSÕES DO AGENTE (Bloco F1)
// =====================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // ✅ Validar autenticação (espelha o padrão endurecido de [id]/route.ts)
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin()
    const agentId = params.id

    // ✅ Escopo de org vem SEMPRE do usuário autenticado, nunca do cliente
    const organizationId = auth.user.organization_id

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    const versions = await listVersions(supabase, agentId, organizationId)

    return NextResponse.json({ versions })

  } catch (error: any) {
    console.error('Error in GET /api/ai/agents/[id]/versions:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
