// =====================================================
// TOOL: product_lookup — busca de produto Shopify (Fase 2c, GATED storeId)
// =====================================================
// Busca produtos por título (ilike) OU sku em `shopify_products`, filtrando pela
// loja (store_id) da conversa. `shopify_products` NÃO tem coluna
// organization_id — é escopado por store_id (FK -> shopify_stores). Por isso
// usamos orgStoreSelect (tools/db.ts), que PRIMEIRO valida que a loja pertence
// à org (via shopify_stores.organization_id) e só então filtra por store_id —
// preservando o isolamento multi-tenant sem furar RLS.
//
// Gating: a tool só é exposta quando ctx.storeId existe (STORE_GATED_TOOLS no
// registry). Mesmo assim defendemos aqui (ok:false 'no_store').
//
// Colunas REAIS retornadas: title, price, compare_at_price, sku,
// inventory_quantity, status, variants (JSONB). Disponibilidade derivada de
// status='active' && inventory_quantity > 0 (best-effort; estoque por variante
// fica nos variants).

import type { Tool, ToolContext, ToolResultPayload } from '../types'
import { orgStoreSelect, sanitizeOrValue } from '../db'

const MAX_RESULTS = 5

export const productLookupTool: Tool = {
  name: 'product_lookup',
  description:
    'Busca produtos da loja por nome ou SKU e retorna preço, disponibilidade/' +
    'estoque e variantes. Use quando o cliente perguntar sobre um produto, ' +
    'preço, disponibilidade ou tamanhos/variantes. Requer loja Shopify conectada.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Nome do produto (busca parcial) ou SKU exato a procurar.',
      },
    },
    required: ['query'],
  },
  async handler(ctx: ToolContext, args: { query?: string }): Promise<ToolResultPayload> {
    const query = (args?.query || '').trim()
    if (!query) {
      return { ok: false, error: 'query vazia' }
    }
    if (!ctx.storeId) {
      return { ok: false, error: 'no_store' }
    }

    try {
      const { builder, error: scopeErr } = await orgStoreSelect(
        'shopify_products',
        ctx.organizationId,
        ctx.storeId,
        'title, price, compare_at_price, sku, inventory_quantity, status, variants, image_url',
      )
      if (!builder) {
        return { ok: false, error: scopeErr || 'no_store' }
      }

      // Busca por título (ilike) OU sku (ilike). Limita resultados.
      // Sanitiza o input contra injeção de filtro PostgREST (vírgula/parênteses).
      const escaped = sanitizeOrValue(query)
      if (!escaped) {
        return {
          ok: true,
          data: { found: false, message: 'Nenhum produto encontrado para a busca.', products: [] },
        }
      }
      const { data, error } = await builder
        .or(`title.ilike.%${escaped}%,sku.ilike.%${escaped}%`)
        .limit(MAX_RESULTS)

      if (error) return { ok: false, error: error.message }

      if (!data || data.length === 0) {
        return {
          ok: true,
          data: { found: false, message: 'Nenhum produto encontrado para a busca.', products: [] },
        }
      }

      const products = data.map((p: any) => {
        const inv = typeof p.inventory_quantity === 'number' ? p.inventory_quantity : null
        const available = p.status === 'active' && (inv === null || inv > 0)
        // Variantes: extrair título/preço/estoque quando existirem no JSONB.
        const variants = Array.isArray(p.variants)
          ? p.variants.slice(0, 10).map((v: any) => ({
              title: v?.title ?? v?.option1 ?? undefined,
              sku: v?.sku ?? undefined,
              price: v?.price ?? undefined,
              available:
                typeof v?.inventory_quantity === 'number'
                  ? v.inventory_quantity > 0
                  : v?.available ?? undefined,
            }))
          : []

        return {
          title: p.title,
          price: p.price,
          compare_at_price: p.compare_at_price || undefined,
          sku: p.sku || undefined,
          inventory_quantity: inv ?? undefined,
          available,
          variants,
        }
      })

      return { ok: true, data: { found: true, count: products.length, products } }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'erro na busca de produto' }
    }
  },
}
