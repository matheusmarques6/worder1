import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin';
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
    const supabase = getSupabaseAdmin()
    const agentId = params.id

    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organization_id')

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
