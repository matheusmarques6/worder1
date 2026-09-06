import { NextRequest, NextResponse } from 'next/server';
import { assertDebugAllowed } from '@/lib/debug-guard';
import { requireStore } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';

const SHOPIFY_API_VERSION = '2026-04';

async function shopifyFetch(shopDomain: string, accessToken: string, endpoint: string) {
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) throw new Error(`Shopify API error: ${response.status}`);
  return response.json();
}

export async function GET(request: NextRequest) {
  // A loja vem pela URL e daqui sai o access_token dela para chamar a
  // Shopify. Sem esta cerca, um id de loja de outra organização bastava.
  const guard = await requireStore(request);
  if (!guard.ok) return guard.response;
  const { supabase, storeId, organizationId } = guard;
  const blocked = assertDebugAllowed(request); if (blocked) return blocked;
  try {
    const { searchParams } = new URL(request.url);
    const periodo = searchParams.get('periodo') || 'today';


    const { data: store } = await supabase
      .from('shopify_stores')
      .select('shop_domain, access_token')
      .eq('id', storeId)
      .eq('organization_id', organizationId)
      .single();

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Calcular datas
    const now = new Date();
    const brazilOffset = -3 * 60;
    const brazilTime = new Date(now.getTime() + (brazilOffset * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
    const today = brazilTime.toISOString().split('T')[0];
    
    let startDate: string;
    let endDate: string;
    
    if (periodo === 'yesterday') {
      const yesterday = new Date(brazilTime);
      yesterday.setDate(yesterday.getDate() - 1);
      startDate = yesterday.toISOString().split('T')[0];
      endDate = startDate;
    } else {
      startDate = today;
      endDate = today;
    }

    const startISO = `${startDate}T00:00:00-03:00`;
    const endISO = `${endDate}T23:59:59-03:00`;

    // Buscar pedidos
    const ordersData = await shopifyFetch(
      store.shop_domain,
      store.access_token,
      `/orders.json?status=any&created_at_min=${encodeURIComponent(startISO)}&created_at_max=${encodeURIComponent(endISO)}&limit=50`
    );

    const orders = ordersData.orders || [];

    // Analisar estrutura de line_items
    const productAnalysis: any[] = [];
    const rawLineItems: any[] = [];

    for (const order of orders) {
      if (order.test || order.cancelled_at) continue;
      
      for (const item of (order.line_items || [])) {
        // Guardar item raw para análise
        rawLineItems.push({
          order_id: order.id,
          order_name: order.name,
          product_title: item.title,
          variant_title: item.variant_title,
          quantity: item.quantity,
          price: item.price,
          total_discount: item.total_discount,
          discount_allocations: item.discount_allocations,
          pre_tax_price: item.pre_tax_price,
          pre_tax_price_set: item.pre_tax_price_set,
          // Campos calculados
          gross: parseFloat(item.price) * parseInt(item.quantity),
          has_discount_allocations: Array.isArray(item.discount_allocations) && item.discount_allocations.length > 0,
        });

        // Agregar por produto
        const key = item.title;
        let existing = productAnalysis.find(p => p.nome === key);
        if (!existing) {
          existing = {
            nome: key,
            quantidade: 0,
            gross_calculado: 0,
            total_discount_sum: 0,
            discount_allocations_sum: 0,
            pre_tax_price_sum: 0,
          };
          productAnalysis.push(existing);
        }

        const qty = parseInt(item.quantity) || 0;
        const price = parseFloat(item.price) || 0;
        
        existing.quantidade += qty;
        existing.gross_calculado += price * qty;
        existing.total_discount_sum += parseFloat(item.total_discount || 0);
        
        // Somar discount_allocations
        if (Array.isArray(item.discount_allocations)) {
          for (const alloc of item.discount_allocations) {
            existing.discount_allocations_sum += parseFloat(alloc.amount || 0);
          }
        }
        
        // pre_tax_price (pode ser o NET)
        if (item.pre_tax_price_set?.shop_money?.amount) {
          existing.pre_tax_price_sum += parseFloat(item.pre_tax_price_set.shop_money.amount);
        }
      }
    }

    // Calcular diferentes versões de "vendas"
    const comparacao = productAnalysis
      .sort((a, b) => b.gross_calculado - a.gross_calculado)
      .slice(0, 10)
      .map(p => ({
        nome: p.nome,
        quantidade: p.quantidade,
        // Diferentes formas de calcular
        v1_gross: Number(p.gross_calculado.toFixed(2)),
        v2_gross_minus_total_discount: Number((p.gross_calculado - p.total_discount_sum).toFixed(2)),
        v3_gross_minus_allocations: Number((p.gross_calculado - p.discount_allocations_sum).toFixed(2)),
        v4_pre_tax_price: Number(p.pre_tax_price_sum.toFixed(2)),
        // Detalhes
        _total_discount_sum: Number(p.total_discount_sum.toFixed(2)),
        _discount_allocations_sum: Number(p.discount_allocations_sum.toFixed(2)),
      }));

    return NextResponse.json({
      success: true,
      periodo: { startDate, endDate },
      total_pedidos: orders.length,
      total_line_items: rawLineItems.length,
      
      // Comparação de métodos de cálculo
      comparacao_metodos: comparacao,
      
      // Primeiros 5 line items raw para análise
      sample_line_items: rawLineItems.slice(0, 5),
      
      // Verificar se discount_allocations existe
      stats: {
        items_com_discount_allocations: rawLineItems.filter(i => i.has_discount_allocations).length,
        items_com_total_discount: rawLineItems.filter(i => parseFloat(i.total_discount || 0) > 0).length,
      }
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
