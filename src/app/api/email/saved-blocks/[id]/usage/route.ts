// Onde este conteúdo universal aparece. A tela pergunta isto antes de
// abrir a edição e antes de apagar — "alterar aqui muda 23 e-mails" só
// é um aviso útil se vier com a lista de quais.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { loadUsage } from '@/lib/email/universal-blocks'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getAuthClient()
  if (!auth) return authError()
  const usage = await loadUsage(auth.user.organization_id, params.id)
  return NextResponse.json(usage)
}
