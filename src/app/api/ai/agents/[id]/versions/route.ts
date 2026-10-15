import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { listVersions } from '@/lib/ai/versions'

export const dynamic = 'force-dynamic'

// Plano IA M4 passo 25 — o painel Versões: mais nova primeiro, com resumo
// por área, nota da avaliação, casos graves e origem de restauração.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  try {
    const versions = await listVersions(getSupabaseAdmin(), params.id, auth.user.organization_id)
    return NextResponse.json({ versions })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
