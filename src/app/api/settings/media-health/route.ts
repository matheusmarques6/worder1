// =============================================
// GET /api/settings/media-health
//
// "As imagens dos meus e-mails estão carregando?" — a pergunta que só
// era respondida pelo destinatário, depois do envio.
//
// Pega a imagem mais recente que ESTA organização subiu para o editor e
// bate nos quatro caminhos possíveis (CDN×Supabase, render×object). A
// classificação mora em @/lib/media/probe, pura e testada.
// =============================================
import { NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { imagemMaisRecenteDaOrg, sondarMedia } from '@/lib/media/probe-run'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const orgId = auth.user.organization_id
  const admin = getSupabaseAdmin()

  try {
    const caminho = await imagemMaisRecenteDaOrg(admin, orgId)
    const { sondas, veredito, amostra } = await sondarMedia(caminho)
    return NextResponse.json({ ...veredito, amostra, sondas })
  } catch (e: any) {
    console.error('[MediaHealth] falhou:', e)
    return NextResponse.json({ error: e?.message || 'Falha ao verificar as imagens' }, { status: 500 })
  }
}
