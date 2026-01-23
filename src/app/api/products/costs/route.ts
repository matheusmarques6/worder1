import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key && !url.includes('placeholder')) {
    return createClient(url, key);
  }
  return null;
}

async function getUserOrganization(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const accessToken = request.cookies.get('sb-access-token')?.value;
  if (!accessToken) return null;

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  return profile?.organization_id || null;
}

// Buscar taxa de câmbio
async function getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
  if (fromCurrency === toCurrency) return 1;

  const supabase = getSupabaseAdmin();
  if (!supabase) return 1;

  // Buscar taxa mais recente
  const { data } = await supabase
    .from('exchange_rates')
    .select('rate')
    .eq('from_currency', fromCurrency)
    .eq('to_currency', toCurrency)
    .order('date', { ascending: false })
    .limit(1)
    .single();

  return data?.rate || 1;
}

// POST - Criar ou atualizar custo
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const organizationId = await getUserOrganization(request);
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      store_id,
      shopify_product_id,
      shopify_variant_id,
      product_title,
      variant_title,
      sku,
      cost_amount,
      cost_currency = 'BRL',
    } = body;

    if (!shopify_product_id || cost_amount === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Calcular custo em BRL
    const exchangeRate = await getExchangeRate(cost_currency, 'BRL');
    const costInBrl = parseFloat(cost_amount) * exchangeRate;

    // Upsert custo
    const { data, error } = await supabase
      .from('product_costs')
      .upsert({
        organization_id: organizationId,
        store_id,
        shopify_product_id: shopify_product_id.toString(),
        shopify_variant_id: shopify_variant_id?.toString() || null,
        product_title,
        variant_title,
        sku,
        cost_amount: parseFloat(cost_amount),
        cost_currency,
        cost_in_brl: costInBrl,
        exchange_rate: exchangeRate,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'organization_id,store_id,shopify_product_id,shopify_variant_id',
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving cost:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, cost: data });

  } catch (error: any) {
    console.error('Error saving product cost:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Atualização em massa
export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const organizationId = await getUserOrganization(request);
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { costs } = body; // Array de custos

    if (!Array.isArray(costs) || costs.length === 0) {
      return NextResponse.json({ error: 'No costs provided' }, { status: 400 });
    }

    const results = [];
    const errors = [];

    for (const cost of costs) {
      const exchangeRate = await getExchangeRate(cost.cost_currency || 'BRL', 'BRL');
      const costInBrl = parseFloat(cost.cost_amount) * exchangeRate;

      const { data, error } = await supabase
        .from('product_costs')
        .upsert({
          organization_id: organizationId,
          store_id: cost.store_id,
          shopify_product_id: cost.shopify_product_id.toString(),
          shopify_variant_id: cost.shopify_variant_id?.toString() || null,
          product_title: cost.product_title,
          variant_title: cost.variant_title,
          sku: cost.sku,
          cost_amount: parseFloat(cost.cost_amount),
          cost_currency: cost.cost_currency || 'BRL',
          cost_in_brl: costInBrl,
          exchange_rate: exchangeRate,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'organization_id,store_id,shopify_product_id,shopify_variant_id',
        })
        .select()
        .single();

      if (error) {
        errors.push({ product_id: cost.shopify_product_id, error: error.message });
      } else {
        results.push(data);
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      saved: results.length,
      errors: errors.length,
      details: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('Error bulk saving costs:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Remover custo
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const organizationId = await getUserOrganization(request);
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const costId = searchParams.get('id');
    const productId = searchParams.get('productId');
    const variantId = searchParams.get('variantId');

    if (costId) {
      // Deletar por ID
      const { error } = await supabase
        .from('product_costs')
        .delete()
        .eq('id', costId)
        .eq('organization_id', organizationId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (productId) {
      // Deletar por produto/variante
      let query = supabase
        .from('product_costs')
        .delete()
        .eq('organization_id', organizationId)
        .eq('shopify_product_id', productId);

      if (variantId) {
        query = query.eq('shopify_variant_id', variantId);
      }

      const { error } = await query;

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: 'Missing id or productId' }, { status: 400 });
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Error deleting cost:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
