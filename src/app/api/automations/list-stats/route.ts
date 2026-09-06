import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// Métricas da tabela de fluxos em /automations: enviados, taxa de
// abertura, taxa de clique e receita por linha.
//
// A soma acontece no banco. Antes esta rota puxava CADA envio e contava
// em JavaScript — e o PostgREST devolve no máximo mil linhas. Com 1488
// envios, a conta parava em mil e o corte caía no maior fluxo: a série
// de boas-vindas aparecia com 803 quando tinha 1103, e os oito fluxos
// da tela somavam exatos 1000. Nada avisava; o número só estava errado,
// e ficava mais errado a cada envio novo.
export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  const storeId =
    request.nextUrl.searchParams.get('storeId') ||
    request.nextUrl.searchParams.get('store_id');

  type Stat = { sent: number; opened: number; clicked: number; revenue: number };
  const stats: Record<string, Stat> = {};

  try {
    const { data, error } = await supabaseAdmin.rpc('automation_email_stats', {
      org: organizationId,
      p_store_id: storeId || null,
    });

    if (!error && Array.isArray(data)) {
      for (const row of data as any[]) {
        if (!row?.automation_id) continue;
        stats[row.automation_id] = {
          sent: Number(row.sent) || 0,
          opened: Number(row.opened) || 0,
          clicked: Number(row.clicked) || 0,
          revenue: Number(row.revenue) || 0,
        };
      }
      return NextResponse.json({ stats });
    }

    // Banco sem a função ainda: lê os envios paginando. Mais lento, mas
    // paginado — o defeito era justamente ler sem paginar.
    let automationsQuery = supabase
      .from('automations')
      .select('id')
      .eq('organization_id', organizationId);
    if (storeId) automationsQuery = automationsQuery.eq('store_id', storeId);
    const { data: automations } = await automationsQuery;

    const ids: string[] = (automations || []).map((a: any) => a.id).filter(Boolean);
    for (const id of ids) stats[id] = { sent: 0, opened: 0, clicked: 0, revenue: 0 };
    if (ids.length === 0) return NextResponse.json({ stats });

    const PAGE = 1000;
    const MAX_PAGES = 100;
    const CHUNK = 200;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      for (let page = 0; page < MAX_PAGES; page++) {
        const from = page * PAGE;
        const { data: rows } = await supabase
          .from('email_sends')
          .select('automation_id, sent_at, opened_at, clicked_at, conversion_value')
          .eq('organization_id', organizationId)
          .in('automation_id', chunk)
          .range(from, from + PAGE - 1);
        const list = rows || [];
        for (const row of list) {
          const aid = (row as any).automation_id;
          if (!aid || !stats[aid]) continue;
          if ((row as any).sent_at) stats[aid].sent++;
          if ((row as any).opened_at) stats[aid].opened++;
          if ((row as any).clicked_at) stats[aid].clicked++;
          const cv = Number((row as any).conversion_value);
          if (Number.isFinite(cv) && cv > 0) stats[aid].revenue += cv;
        }
        if (list.length < PAGE) break;
      }
    }

    return NextResponse.json({ stats });
  } catch (error: any) {
    return NextResponse.json({ stats: {}, error: error?.message || 'Unknown error' });
  }
}
