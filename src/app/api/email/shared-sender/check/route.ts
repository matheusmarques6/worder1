// =============================================
// GET /api/email/shared-sender/check?local=based&storeId=<id>
//
// A tela de remetente pergunta, enquanto o lojista digita, se
// <local>@worder.email está livre. Devolve a primeira variação livre
// quando não está — a mesma regra que o PATCH aplica ao salvar.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError, validateStoreAccess } from '@/lib/api-utils';
import { checkLocalPartAvailability, sharedSenderDomain, slugifyLocalPart } from '@/lib/email/shared-sender';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  const local = String(request.nextUrl.searchParams.get('local') || '').trim().toLowerCase();
  const storeId = request.nextUrl.searchParams.get('storeId');
  if (!local) return NextResponse.json({ error: 'local required' }, { status: 400 });

  // A loja é só para não acusar conflito com o próprio endereço.
  let ownStoreId: string | null = null;
  if (storeId) {
    const access = await validateStoreAccess(auth.supabase as any, auth.user.organization_id, storeId, auth.user.id);
    if (!access.valid) return NextResponse.json({ error: access.error }, { status: access.status || 403 });
    ownStoreId = storeId;
  }

  const r = await checkLocalPartAvailability(local, ownStoreId);
  return NextResponse.json({
    domain: sharedSenderDomain(),
    local,
    available: r.available,
    suggestion: r.suggestion || (r.available ? undefined : slugifyLocalPart(local)),
    // Nunca dizemos QUAL loja usa o nome — pode ser de outra organização.
  });
}
