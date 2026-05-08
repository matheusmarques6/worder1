// =============================================
// Built-in tools: implementações das funções que o agente pode chamar.
// Cada tool tem definition (schema p/ LLM) e handler (execução).
//
// Inclusas inicialmente:
//   - transfer_to_human: tira a IA da conversa, pausa e marca pra fila humana.
//   - send_coupon: gera código de cupom (loja precisa configurar prefix).
//   - shopify_get_product: stub que busca produto no shopify_products quando
//     a integração está conectada (delega pra getSupabaseAdmin).
//   - save_lead_field: salva info do lead no contacts.custom_fields.
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { ToolDefinition, ToolHandlerResult, ToolContext } from './types'

const transferToHuman: ToolDefinition = {
  type: 'transfer_to_human',
  name: 'transfer_to_human',
  description:
    'Transfere a conversa para um atendente humano. Use quando o cliente pedir explicitamente, demonstrar grande frustração ou quando a dúvida está fora do seu escopo.',
  parameters: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Motivo curto da transferência (ex: "cliente solicitou", "dúvida fora de escopo")',
      },
      priority: {
        type: 'string',
        enum: ['low', 'normal', 'high'],
        description: 'Prioridade do atendimento humano',
      },
    },
    required: ['reason'],
  },
  handler: async (args, ctx) => {
    const supabase = getSupabaseAdmin()
    await supabase
      .from('whatsapp_conversations')
      .update({
        ai_paused: true,
        status: 'pending_human',
        last_ai_paused_at: new Date().toISOString(),
        ai_paused_reason: String(args.reason || 'tool_transfer'),
      })
      .eq('id', ctx.conversationId)
    return {
      ok: true,
      data: { transferred: true, reason: args.reason, priority: args.priority || 'normal' },
      shouldStop: true,
      outcome: 'transferred',
    }
  },
}

const sendCoupon: ToolDefinition = {
  type: 'send_coupon',
  name: 'send_coupon',
  description:
    'Gera um código de cupom de desconto para o cliente. Use só quando autorizado pela loja e o cliente demonstrar hesitação no preço.',
  parameters: {
    type: 'object',
    properties: {
      discount_percent: {
        type: 'number',
        description: 'Percentual de desconto (1-50)',
      },
      reason: {
        type: 'string',
        description: 'Motivo da concessão do cupom',
      },
    },
    required: ['discount_percent', 'reason'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const supabase = getSupabaseAdmin()
    const discount = Math.min(50, Math.max(1, Number(args.discount_percent) || 5))
    const prefix = String(ctx.config.prefix || 'PROMO').toUpperCase()
    const code = `${prefix}${Math.floor(Math.random() * 9000 + 1000)}`
    // best-effort: erros aqui não devem quebrar o fluxo (cupons table pode não existir)
    try {
      await supabase.from('coupons').insert({
        organization_id: ctx.organizationId,
        code,
        discount_percent: discount,
        source: 'ai_agent',
        conversation_id: ctx.conversationId,
        reason: args.reason,
        created_at: new Date().toISOString(),
      })
    } catch {
      // ignora — não bloqueia o LLM
    }
    return {
      ok: true,
      data: { code, discount_percent: discount },
    }
  },
}

const saveLeadField: ToolDefinition = {
  type: 'save_lead_field',
  name: 'save_lead_field',
  description:
    'Salva uma informação coletada do cliente no perfil dele. Use para email, nome completo, endereço, CEP, data de aniversário, etc.',
  parameters: {
    type: 'object',
    properties: {
      field: {
        type: 'string',
        description: 'Nome do campo (email, full_name, address, cep, birthday, etc.)',
      },
      value: {
        type: 'string',
        description: 'Valor coletado',
      },
    },
    required: ['field', 'value'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    if (!ctx.contactId) {
      return { ok: false, error: 'contato_id ausente' }
    }
    const supabase = getSupabaseAdmin()
    const field = String(args.field).trim().toLowerCase()
    const value = String(args.value).trim()

    // Campos com colunas próprias na tabela contacts
    const directColumns = ['email', 'phone', 'whatsapp', 'first_name', 'last_name', 'full_name']
    if (directColumns.includes(field)) {
      await supabase.from('contacts').update({ [field]: value }).eq('id', ctx.contactId)
    } else {
      // Demais vão pra custom_fields jsonb
      const { data: contact } = await supabase
        .from('contacts')
        .select('custom_fields')
        .eq('id', ctx.contactId)
        .maybeSingle()
      const cf = ((contact?.custom_fields as Record<string, unknown>) ?? {})
      cf[field] = value
      await supabase.from('contacts').update({ custom_fields: cf }).eq('id', ctx.contactId)
    }
    return { ok: true, data: { saved: true, field, value } }
  },
}

const shopifyGetProduct: ToolDefinition = {
  type: 'shopify_get_product',
  name: 'shopify_get_product',
  description:
    'Busca informações de um produto na loja Shopify por nome, SKU ou variação. Use quando o cliente pedir preço, disponibilidade ou detalhes de um item específico.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Nome ou SKU do produto' },
    },
    required: ['query'],
  },
  handler: async (args, ctx): Promise<ToolHandlerResult> => {
    const supabase = getSupabaseAdmin()
    const q = String(args.query).trim()
    if (!q) return { ok: false, error: 'query vazia' }

    const { data, error } = await supabase
      .from('shopify_products')
      .select('id, title, handle, status, price, compare_at_price, image_url, sku, inventory_quantity')
      .eq('organization_id', ctx.organizationId)
      .or(`title.ilike.%${q}%,sku.ilike.%${q}%,handle.ilike.%${q}%`)
      .limit(3)
    if (error) return { ok: false, error: error.message }
    if (!data || data.length === 0) {
      return { ok: true, data: { found: false, message: 'Nenhum produto encontrado' } }
    }
    return { ok: true, data: { found: true, products: data } }
  },
}

export const BUILTIN_TOOLS: Record<string, ToolDefinition> = {
  transfer_to_human: transferToHuman,
  send_coupon: sendCoupon,
  save_lead_field: saveLeadField,
  shopify_get_product: shopifyGetProduct,
}

export function getBuiltinTool(type: string): ToolDefinition | undefined {
  return BUILTIN_TOOLS[type]
}
