// =============================================================
// Quanto da base tem fuso conhecido
//
// Sem este número, "enviar no fuso de cada contato" é fé: se 94% dos
// contatos não têm fuso, todos caem no da loja e o recurso vira um
// agendamento fixo com nome bonito. A tela de agendamento mostra a
// cobertura ANTES de o lojista escolher o modo.
// =============================================================

import { NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  try {
    const contar = (aplica: (q: any) => any) =>
      aplica(
        supabaseAdmin
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
      );

    // 'browser' é o fuso que a própria pessoa informou navegando;
    // 'country' é dedução pelo endereço. A tela distingue os dois
    // porque a confiança é diferente.
    const [total, comFuso, doNavegador] = await Promise.all([
      contar((q: any) => q),
      contar((q: any) => q.not('timezone', 'is', null)),
      contar((q: any) => q.eq('timezone_source', 'browser')),
    ]);

    const totalCount = total.count || 0;
    const comFusoCount = comFuso.count || 0;

    return NextResponse.json({
      total: totalCount,
      withTimezone: comFusoCount,
      fromBrowser: doNavegador.count || 0,
      fromCountry: Math.max(comFusoCount - (doNavegador.count || 0), 0),
      coverage: totalCount > 0 ? Math.round((comFusoCount / totalCount) * 100) : 0,
    });
  } catch (err: any) {
    // A cobertura é informativa: se falhar, a tela some com o aviso em
    // vez de impedir o agendamento.
    console.error('[timezone-coverage]', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  }
}
