// Consumo de grant no pedido pago (Adendo §B, 9.2).
//
// O cupom que o offer_engine emitiu volta no webhook de pedido como
// discount_code — a RPC consome (uses++ → 'consumed' quando esgota) com
// dedup por (grant, pedido) DENTRO do banco: webhook reentregue recebe
// 'already' e nunca consome duas vezes. Cupom que não nasceu de grant
// (criado à mão na loja) responde 'not_found' e não é assunto nosso.
//
// Best-effort por contrato: consumo de grant JAMAIS derruba o processamento
// do pedido — o pedido pago é o fato; o ledger se acerta na reentrega.

import { supabaseAdmin } from '@/lib/supabase-admin';

export interface OrderLikePayload {
  id?: string | number;
  order_number?: string | number;
  discount_codes?: Array<{ code?: string | null } | null> | null;
}

export interface GrantConsumption {
  code: string;
  status: 'consumed' | 'already' | 'not_found' | 'error';
  grant_id?: string | null;
}

export async function consumeGrantsForOrder(
  organizationId: string,
  order: OrderLikePayload,
): Promise<GrantConsumption[]> {
  const codes = (order.discount_codes ?? [])
    .map((d) => (d?.code ?? '').trim())
    .filter(Boolean);
  if (codes.length === 0) return [];

  const orderRef = String(order.id ?? order.order_number ?? '').trim();
  if (!orderRef) return [];

  const results: GrantConsumption[] = [];
  for (const code of codes) {
    try {
      const { data, error } = await supabaseAdmin.rpc('consume_incentive_grant', {
        p_organization_id: organizationId,
        p_coupon_code: code,
        p_order_ref: orderRef,
      });
      if (error) {
        console.warn('[grant-consumption] RPC falhou (best-effort):', error.message);
        results.push({ code, status: 'error' });
        continue;
      }
      const row = Array.isArray(data) ? data[0] : data;
      results.push({
        code,
        status: (row?.status as GrantConsumption['status']) ?? 'error',
        grant_id: row?.grant_id ?? null,
      });
    } catch (e: any) {
      console.warn('[grant-consumption] exceção (best-effort):', e?.message);
      results.push({ code, status: 'error' });
    }
  }
  return results;
}
