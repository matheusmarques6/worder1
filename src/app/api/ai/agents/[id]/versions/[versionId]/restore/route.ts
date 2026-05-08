// =============================================
// POST /api/ai/agents/[id]/versions/[versionId]/restore
// Aplica o snapshot da versão de volta ao agente. Não cria nova versão
// (usuário pode chamar /versions POST depois pra carimbar a restauração).
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/api-utils'
import { restoreVersion } from '@/lib/ai/versioning'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; versionId: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    await restoreVersion(params.id, params.versionId, auth.user.organization_id)
    return NextResponse.json({ ok: true, restored_to: params.versionId })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'erro desconhecido' },
      { status: 500 },
    )
  }
}
