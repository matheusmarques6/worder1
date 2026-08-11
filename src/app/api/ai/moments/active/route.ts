import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 10.8 — os momentos ATIVOS pelo relógio, da view active_commercial_moments
// (a mesma verdade do resolver do runtime). Campanhas e o editor de Fluxos
// leem daqui para o banner "momento X ativo até Y".
export async function GET() {
  try {
    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { data, error } = await getSupabaseAdmin()
      .from('active_commercial_moments')
      .select('id, name, starts_at, ends_at, public_claim')
      .eq('organization_id', auth.user.organization_id)
      .order('ends_at', { ascending: true })
    if (error) throw new Error(error.message)

    return NextResponse.json({ moments: data ?? [] })
  } catch (error: any) {
    console.error('Error in GET /api/ai/moments/active:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
