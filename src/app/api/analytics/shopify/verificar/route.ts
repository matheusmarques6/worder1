import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// VERSÃO DO CÓDIGO - Atualizar a cada deploy
const CODE_VERSION = 'v8-senior-2024-10-14';

const SHOPIFY_API_VERSION = '2024-10';

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
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  // Se não passar storeId, retorna apenas versão
  if (!storeId) {
    return NextResponse.json({
      success: true,
      code_version: CODE_VERSION,
      timestamp: new Date().toISOString(),
      message: 'Passe ?storeId=XXX para testar cálculos'
    });
  }

  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const { data: store } = await supabase
      .from('shopify_stores')
      .select('shop_domain, access_token')
      .eq('id', storeId)
      .single();

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Buscar pedidos de ontem
    const now = new Date();
    const brazilOffset = -3 * 60;
    const brazilTime = new Date(now.getTime() + (brazilOffset * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
    const yesterday = new Date(brazilTime);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    const startISO = `${dateStr}T00:00:00-03:00`;
    const endISO = `${dateStr}T23:59:59-03:00`;

    const ordersData = await shopifyFetch(
      store.shop_domain,
      store.access_token,
      `/orders.json?status=any&created_at_min=${encodeURIComponent(startISO)}&created_at_max=${encodeURIComponent(endISO)}&limit=100`
    );

    const orders = ordersData.orders || [];
    const validOrders = orders.filter((o: any) => !o.test && !o.cancelled_at);

    // Calcular produtos com os 3 métodos
    const productCalcs: any[] = [];

    for (const order of validOrders) {
      for (const item of (order.line_items || [])) {
        const nome = item.title;
        let existing = productCalcs.find(p => p.nome === nome);
        if (!existing) {
          existing = {
            nome,
            qty: 0,
            gross: 0,
            total_discount: 0,
            discount_allocations: 0,
          };
          productCalcs.push(existing);
        }

        const qty = parseInt(item.quantity) || 0;
        const price = parseFloat(item.price) || 0;
        
        existing.qty += qty;
        existing.gross += price * qty;
        existing.total_discount += parseFloat(item.total_discount || 0);
        
        // Somar discount_allocations
        if (Array.isArray(item.discount_allocations)) {
          for (const alloc of item.discount_allocations) {
            existing.discount_allocations += parseFloat(alloc.amount || 0);
          }
        }
      }
    }

    // Ordenar por gross e pegar top 5
    const top5 = productCalcs
      .sort((a, b) => b.gross - a.gross)
      .slice(0, 5)
      .map(p => ({
        nome: p.nome,
        quantidade: p.qty,
        metodo_1_gross: Number(p.gross.toFixed(2)),
        metodo_2_gross_minus_total_discount: Number((p.gross - p.total_discount).toFixed(2)),
        metodo_3_gross_minus_allocations: Number((p.gross - p.discount_allocations).toFixed(2)),
        _discount_allocations: Number(p.discount_allocations.toFixed(2)),
      }));

    return NextResponse.json({
      success: true,
      code_version: CODE_VERSION,
      timestamp: new Date().toISOString(),
      periodo: `Ontem (${dateStr})`,
      total_pedidos: orders.length,
      pedidos_validos: validOrders.length,
      
      // TOP 5 PRODUTOS COM 3 MÉTODOS DE CÁLCULO
      produtos_comparacao: top5,
      
      // Instrução
      instrucao: 'Compare metodo_3_gross_minus_allocations com o dashboard Shopify. Se bater, o problema é que a API principal não está usando este método.'
    });

  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message,
      code_version: CODE_VERSION 
    }, { status: 500 });
  }
}
