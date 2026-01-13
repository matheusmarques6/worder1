/**
 * Shopify Metrics Service
 * v2.1 - Query correta via shopify_stores (não organization_id em orders)
 */

import { SupabaseClient } from '@supabase/supabase-js'

interface ShopifyMetricsParams {
  supabase: SupabaseClient
  organizationId: string
  storeId?: string // ID do shopify_stores (opcional)
  startDate: Date
  endDate: Date
}

interface ShopifyMetrics {
  storeName: string
  kpis: {
    vendasBrutas: number
    vendasLiquidas: number
    pedidos: number
    ticketMedio: number
  }
  financial: {
    descontos: number
    frete: number
    tributos: number
  }
  topProducts: Array<{
    name: string
    vendas: number
    quantidade: number
  }>
  orderCount: number
}

export async function getShopifyMetrics(
  params: ShopifyMetricsParams
): Promise<ShopifyMetrics | null> {
  const { supabase, organizationId, storeId, startDate, endDate } = params

  try {
    // 1. Buscar shopify_stores da organização
    let storesQuery = supabase
      .from('shopify_stores')
      .select('id, shop_domain, shop_name')
      .eq('organization_id', organizationId)

    if (storeId) {
      storesQuery = storesQuery.eq('id', storeId)
    }

    const { data: stores, error: storesError } = await storesQuery

    if (storesError) {
      console.error('[SHOPIFY_METRICS] Erro ao buscar stores:', storesError)
      return null
    }

    if (!stores || stores.length === 0) {
      console.log('[SHOPIFY_METRICS] Nenhuma store encontrada para a organização')
      return null
    }

    // 2. Extrair IDs das stores
    const storeIds = stores.map(s => s.id)
    const storeName = stores.length === 1 
      ? (stores[0].shop_name || stores[0].shop_domain || 'Loja')
      : `${stores.length} lojas`

    // 3. Buscar orders filtrando por store_id IN (...)
    const { data: orders, error: ordersError } = await supabase
      .from('shopify_orders')
      .select(`
        id,
        total_price,
        subtotal_price,
        total_discounts,
        total_tax,
        total_shipping,
        line_items,
        created_at
      `)
      .in('store_id', storeIds)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    if (ordersError) {
      console.error('[SHOPIFY_METRICS] Erro ao buscar orders:', ordersError)
      return null
    }

    if (!orders || orders.length === 0) {
      // Estado vazio real, não mock
      return {
        storeName,
        kpis: {
          vendasBrutas: 0,
          vendasLiquidas: 0,
          pedidos: 0,
          ticketMedio: 0,
        },
        financial: {
          descontos: 0,
          frete: 0,
          tributos: 0,
        },
        topProducts: [],
        orderCount: 0,
      }
    }

    // 4. Calcular métricas REAIS (sem *0.95 ou simulação)
    const totalOrders = orders.length
    const vendasBrutas = orders.reduce((sum, o) => sum + (Number(o.subtotal_price) || 0), 0)
    const vendasLiquidas = orders.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0)
    const totalDiscounts = orders.reduce((sum, o) => sum + (Number(o.total_discounts) || 0), 0)
    const totalTax = orders.reduce((sum, o) => sum + (Number(o.total_tax) || 0), 0)
    const totalShipping = orders.reduce((sum, o) => sum + (Number(o.total_shipping) || 0), 0)
    const ticketMedio = totalOrders > 0 ? vendasLiquidas / totalOrders : 0

    // 5. Top produtos (agregar line_items)
    const productSales: Record<string, { name: string; vendas: number; quantidade: number }> = {}

    for (const order of orders) {
      const lineItems = (order.line_items || []) as Array<{
        title?: string
        name?: string
        price?: number | string
        quantity?: number
      }>

      for (const item of lineItems) {
        const productName = item.title || item.name || 'Produto sem nome'
        const price = Number(item.price) || 0
        const quantity = item.quantity || 1

        if (!productSales[productName]) {
          productSales[productName] = { name: productName, vendas: 0, quantidade: 0 }
        }
        productSales[productName].vendas += price * quantity
        productSales[productName].quantidade += quantity
      }
    }

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.vendas - a.vendas)
      .slice(0, 10)

    return {
      storeName,
      kpis: {
        vendasBrutas,
        vendasLiquidas,
        pedidos: totalOrders,
        ticketMedio,
      },
      financial: {
        descontos: totalDiscounts,
        frete: totalShipping,
        tributos: totalTax,
      },
      topProducts,
      orderCount: totalOrders,
    }

  } catch (error) {
    console.error('[SHOPIFY_METRICS] Erro:', error)
    return null
  }
}

/**
 * Busca métricas do período anterior para cálculo de variação
 */
export async function getShopifyMetricsComparison(
  params: ShopifyMetricsParams
): Promise<{ current: ShopifyMetrics | null; previous: ShopifyMetrics | null }> {
  const { startDate, endDate, ...rest } = params

  // Calcular período anterior
  const periodDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  const previousEndDate = new Date(startDate)
  previousEndDate.setDate(previousEndDate.getDate() - 1)
  const previousStartDate = new Date(previousEndDate)
  previousStartDate.setDate(previousStartDate.getDate() - periodDays)

  const [current, previous] = await Promise.all([
    getShopifyMetrics({ ...rest, startDate, endDate }),
    getShopifyMetrics({ ...rest, startDate: previousStartDate, endDate: previousEndDate }),
  ])

  return { current, previous }
}
