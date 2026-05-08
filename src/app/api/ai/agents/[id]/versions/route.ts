// =============================================
// GET   /api/ai/agents/[id]/versions  → lista versões do agente (desc)
// POST  /api/ai/agents/[id]/versions  → cria snapshot manualmente {deploy_notes?}
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { snapshotAgent } from '@/lib/ai/versioning'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('ai_agent_versions')
    .select('id, version_number, deploy_notes, created_at, created_by_user_id, metrics_post_publish')
    .eq('organization_id', auth.user.organization_id)
    .eq('agent_id', params.id)
    .order('version_number', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Marca a versão atual
  const { data: agent } = await supabase
    .from('ai_agents')
    .select('current_version_id')
    .eq('id', params.id)
    .maybeSingle()

  return NextResponse.json({
    versions: (data ?? []).map((v) => ({
      ...v,
      is_current: v.id === agent?.current_version_id,
    })),
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({} as any))
  const deployNotes = typeof body.deploy_notes === 'string' ? body.deploy_notes : undefined

  try {
    const result = await snapshotAgent(params.id, auth.user.organization_id, {
      deployNotes,
      createdByUserId: auth.user.id,
    })
    return NextResponse.json({ version: result }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'erro desconhecido' },
      { status: 500 },
    )
  }
}
