// =====================================================
// TOOL: order_status — status de pedido Shopify (Fase 2c, GATED storeId)
// =====================================================
// Consulta `shopify_orders` por order_number OU email OU phone (phone vem de
// ctx.phone como fallback), filtrando pela loja (store_id) da conversa.
// `shopify_orders` NÃO tem organization_id — é escopado por store_id (FK ->
// shopify_stores). Usamos orgStoreSelect (tools/db.ts), que valida a posse da
// loja pela org antes de filtrar por store_id (isolamento multi-tenant).
//
// Gating: só exposta quando ctx.storeId existe (STORE_GATED_TOOLS). Defesa
// extra aqui (ok:false 'no_store').
//
// Colunas REAIS: order_number (INTEGER), name (#1001), email, phone,
// financial_status, fulfillment_status, total_price, currency, line_items,
// created_at, processed_at, cancelled_at.
//
// NOTA (plano): fulfillment_status pode vir NULL quando a transportadora está
// fora do Shopify. Tratamos NULL como "sem rastreio disponível" (não erro).
// Tracking explícito (código/url) não existe como coluna nesta tabela; se
// houver, vem dentro de line_items/metadata — best-effort, sem inventar.

import type { Tool, ToolContext, ToolResultPayload } from '../types'
import { orgStoreSelect, sanitizeOrValue } from '../db'

function digitsOnly(s: string): string {
  return (s || '').replace(/\D+/g, '')
}

function describeFulfillment(status: string | null | undefined): string {
  switch ((status || '').toLowerCase()) {
    case 'fulfilled':
      return 'Pedido enviado/concluído.'
    case 'partial':
      return 'Envio parcial.'
    case 'restocked':
      return 'Itens devolvidos ao estoque.'
    case '':
      return 'Sem rastreio disponível (ainda não enviado ou transportadora fora do Shopify).'
    default:
      return status as string
  }
}

export const orderStatusTool: Tool = {
  name: 'order_status',
  description:
    'Consulta o status de um pedido da loja (pagamento, envio/fulfillment). ' +
    'Use quando o cliente perguntar sobre o status, rastreio ou andamento de um ' +
    'pedido. Pode buscar por número do pedido ou e-mail; o telefone do cliente ' +
    'é usado automaticamente como fallback. Requer loja Shopify conectada.',
  inputSchema: {
    type: 'object',
    properties: {
      order_number: {
        type: 'string',
        description: 'Número do pedido (ex.: "1001" ou "#1001"), se o cliente informar.',
      },
      email: {
        type: 'string',
        description: 'E-mail usado na compra, se o cliente informar.',
      },
    },
    required: [],
  },
  async handler(
    ctx: ToolContext,
    args: { order_number?: string; email?: string },
  ): Promise<ToolResultPayload> {
    if (!ctx.storeId) {
      return { ok: false, error: 'no_store' }
    }

    const orderNumberRaw = (args?.order_number || '').trim()
    const orderNumber = digitsOnly(orderNumberRaw)
    const email = (args?.email || '').trim().toLowerCase()
    const phone = (ctx.phone || '').trim()
    const phoneDigits = digitsOnly(phone)

    if (!orderNumber && !email && !phoneDigits) {
      return { ok: false, error: 'informe número do pedido ou e-mail para localizar o pedido' }
    }

    try {
      const { builder, error: scopeErr } = await orgStoreSelect(
        'shopify_orders',
        ctx.organizationId,
        ctx.storeId,
        'order_number, name, email, phone, financial_status, fulfillment_status, ' +
          'total_price, currency, line_items, created_at, processed_at, cancelled_at',
      )
      if (!builder) {
        return { ok: false, error: scopeErr || 'no_store' }
      }

      let q = builder
      if (orderNumber) {
        // order_number é INTEGER no schema.
        const n = parseInt(orderNumber, 10)
        if (!Number.isNaN(n)) {
          q = q.eq('order_number', n)
        }
      } else if (email) {
        // email pode estar em email ou customer_email; usar OR.
        // Sanitiza contra injeção de filtro PostgREST (vírgula/parênteses).
        const safeEmail = sanitizeOrValue(email)
        if (safeEmail) {
          q = q.or(`email.ilike.${safeEmail},customer_email.ilike.${safeEmail}`)
        }
      } else if (phoneDigits) {
        // Telefone (fallback): a coluna pode estar formatada de várias formas.
        // Usamos os últimos 11 dígitos (número nacional completo c/ DDD) em vez
        // de 8 — isso reduz drasticamente a chance de colisão entre clientes
        // diferentes (privacidade: evita retornar pedido de outro cliente da
        // mesma loja). Continua escopado por store_id validado e limitado a 3.
        const tail = phoneDigits.slice(-11)
        q = q.ilike('phone', `%${tail}%`)
      }

      const { data, error } = await q
        .order('created_at', { ascending: false })
        .limit(3)

      if (error) return { ok: false, error: error.message }

      if (!data || data.length === 0) {
        return {
          ok: true,
          data: { found: false, message: 'Nenhum pedido encontrado com os dados informados.' },
        }
      }

      const orders = data.map((o: any) => ({
        order_number: o.name || (o.order_number != null ? `#${o.order_number}` : undefined),
        financial_status: o.financial_status || 'pending',
        fulfillment_status: o.fulfillment_status || null,
        fulfillment_description: describeFulfillment(o.fulfillment_status),
        total_price: o.total_price,
        currency: o.currency || 'BRL',
        created_at: o.created_at,
        cancelled: !!o.cancelled_at,
        items_count: Array.isArray(o.line_items) ? o.line_items.length : undefined,
      }))

      return { ok: true, data: { found: true, count: orders.length, orders } }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'erro ao consultar pedido' }
    }
  },
}
