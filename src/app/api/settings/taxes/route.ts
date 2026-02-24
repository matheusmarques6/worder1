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

// GET - Buscar configurações
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const organizationId = await getUserOrganization(request);
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar configurações de taxa
    const { data: settings } = await supabase
      .from('organization_tax_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    // Buscar taxas customizadas
    const { data: customFees } = await supabase
      .from('custom_fees')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at');

    // Buscar taxas de câmbio mais recentes
    const { data: exchangeRates } = await supabase
      .from('exchange_rates')
      .select('*')
      .order('date', { ascending: false })
      .limit(10);

    // Se não tem configurações, retornar valores padrão
    const defaultSettings = {
      default_cost_percentage: 35,
      default_cost_currency: 'BRL',
      payment_gateway_fee: 0,
      payment_fixed_fee: 0,
      sales_tax_percentage: 0,
      marketplace_fee: 0,
      default_shipping_cost: 0,
      monthly_fixed_costs: 0,
    };

    return NextResponse.json({
      settings: settings || defaultSettings,
      customFees: customFees || [],
      exchangeRates: exchangeRates || [],
      currencies: ['BRL', 'USD', 'EUR', 'GBP', 'CNY'],
    });

  } catch (error: any) {
    console.error('Error fetching tax settings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Salvar configurações
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
      default_cost_percentage,
      default_cost_currency,
      payment_gateway_fee,
      payment_fixed_fee,
      sales_tax_percentage,
      marketplace_fee,
      default_shipping_cost,
      monthly_fixed_costs,
    } = body;

    // Upsert configurações
    const { data, error } = await supabase
      .from('organization_tax_settings')
      .upsert({
        organization_id: organizationId,
        default_cost_percentage: parseFloat(default_cost_percentage) || 35,
        default_cost_currency: default_cost_currency || 'BRL',
        payment_gateway_fee: parseFloat(payment_gateway_fee) || 0,
        payment_fixed_fee: parseFloat(payment_fixed_fee) || 0,
        sales_tax_percentage: parseFloat(sales_tax_percentage) || 0,
        marketplace_fee: parseFloat(marketplace_fee) || 0,
        default_shipping_cost: parseFloat(default_shipping_cost) || 0,
        monthly_fixed_costs: parseFloat(monthly_fixed_costs) || 0,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'organization_id',
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving settings:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, settings: data });

  } catch (error: any) {
    console.error('Error saving tax settings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Gerenciar taxas customizadas
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
    const { action, fee } = body; // action: 'create' | 'update' | 'delete'

    if (action === 'create' || action === 'update') {
      const { id, name, description, fee_type, fee_value, applies_to, per_order, is_active } = fee;

      if (!name || !fee_type || fee_value === undefined) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }

      if (id) {
        // Update
        const { data, error } = await supabase
          .from('custom_fees')
          .update({
            name,
            description,
            fee_type,
            fee_value: parseFloat(fee_value),
            applies_to: applies_to || 'revenue',
            per_order: per_order !== false,
            is_active: is_active !== false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('organization_id', organizationId)
          .select()
          .single();

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, fee: data });
      } else {
        // Create
        const { data, error } = await supabase
          .from('custom_fees')
          .insert({
            organization_id: organizationId,
            name,
            description,
            fee_type,
            fee_value: parseFloat(fee_value),
            applies_to: applies_to || 'revenue',
            per_order: per_order !== false,
            is_active: is_active !== false,
          })
          .select()
          .single();

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, fee: data });
      }
    } else if (action === 'delete') {
      const { id } = fee;

      if (!id) {
        return NextResponse.json({ error: 'Missing fee id' }, { status: 400 });
      }

      const { error } = await supabase
        .from('custom_fees')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error: any) {
    console.error('Error managing custom fee:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
