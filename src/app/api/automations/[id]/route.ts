// =============================================================
// Uma automação, pela organização de quem pede.
//
// As telas do fluxo liam `automations` direto do browser, com a chave
// pública e sem sessão — o app guarda o token num cookie httpOnly, que
// o JS não lê, então aquelas consultas iam como anônimas. Funcionavam
// só porque a RLS estava desligada, e traziam a automação de qualquer
// organização pelo id. Esta rota é o caminho com sessão.
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const { data: automation, error } = await supabaseAdmin
    .from('automations')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!automation) {
    return NextResponse.json({ error: 'Automação não encontrada' }, { status: 404 });
  }

  return NextResponse.json({ automation });
}
