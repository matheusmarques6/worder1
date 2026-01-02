// =============================================
// Contact Timeline & Enrichment API
// src/app/api/contacts/[id]/timeline/route.ts
//
// Retorna atividades, compras e dados enriquecidos
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return getSupabaseAdmin();
}

interface RouteParams {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const contactId = params.id;
  
  if (!contactId) {
    return NextResponse.json({ error: 'Contact ID required' }, { status: 400 });
  }
  
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '30');
  const offset = parseInt(searchParams.get('offset') || '0');
  const type = searchParams.get('type'); // Filtrar por tipo
  
  try {
    // 1. Buscar dados enriquecidos do contato
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select(`
        id,
        first_name,
        last_name,
        email,
        phone,
        company,
        avatar_url,
        source,
        shopify_customer_id,
        total_orders,
        total_spent,
        average_order_value,
        lifetime_value,
        first_order_at,
        last_order_at,
        last_order_id,
        last_order_value,
        last_order_number,
        last_order_products,
        favorite_products,
        last_viewed_products,
        last_seen_at,
        total_page_views,
        rfm_segment,
        rfm_recency_score,
        rfm_frequency_score,
        rfm_monetary_score,
        days_since_last_order,
        order_frequency_days,
        tags,
        custom_fields,
        created_at,
        updated_at
      `)
      .eq('id', contactId)
      .single();
    
    if (contactError || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }
    
    // 2. Buscar atividades
    let activitiesQuery = supabase
      .from('contact_activities')
      .select('*', { count: 'exact' })
      .eq('contact_id', contactId)
      .order('occurred_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (type) {
      activitiesQuery = activitiesQuery.eq('type', type);
    }
    
    const { data: activities, error: activitiesError, count: activitiesCount } = await activitiesQuery;
    
    // 3. Buscar últimas compras (produtos)
    const { data: purchases } = await supabase
      .from('contact_purchases')
      .select('*')
      .eq('contact_id', contactId)
      .order('order_date', { ascending: false })
      .limit(20);
    
    // 4. Buscar pedidos únicos (para histórico)
    const uniqueOrders = purchases?.reduce((acc: any[], purchase) => {
      if (!acc.find(o => o.order_id === purchase.order_id)) {
        acc.push({
          order_id: purchase.order_id,
          order_number: purchase.order_number,
          order_date: purchase.order_date,
          items: purchases?.filter(p => p.order_id === purchase.order_id) || [],
          total: purchases
            ?.filter(p => p.order_id === purchase.order_id)
            .reduce((sum, p) => sum + parseFloat(p.total_price || '0'), 0),
        });
      }
      return acc;
    }, []) || [];
    
    // 5. Buscar sessões de navegação (histórico de visitas)
    const { data: sessions } = await supabase
      .from('contact_sessions')
      .select('*')
      .eq('contact_id', contactId)
      .order('started_at', { ascending: false })
      .limit(10);
    
    // 6. Formatar resposta
    return NextResponse.json({
      contact: {
        ...contact,
        // Garantir que arrays existem
        last_order_products: contact.last_order_products || [],
        favorite_products: contact.favorite_products || [],
        last_viewed_products: contact.last_viewed_products || [],
        tags: contact.tags || [],
      },
      activities: activities || [],
      activitiesTotal: activitiesCount || 0,
      hasMoreActivities: (offset + limit) < (activitiesCount || 0),
      purchases: purchases || [],
      orders: uniqueOrders.slice(0, 10),
      sessions: sessions || [],
      meta: {
        limit,
        offset,
        type,
      },
    });
    
  } catch (error: any) {
    console.error('[Timeline API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Adicionar atividade manual
export async function POST(request: NextRequest, { params }: RouteParams) {
  const contactId = params.id;
  
  if (!contactId) {
    return NextResponse.json({ error: 'Contact ID required' }, { status: 400 });
  }
  
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  
  try {
    const body = await request.json();
    const { organizationId, type, title, description, metadata } = body;
    
    if (!organizationId || !type || !title) {
      return NextResponse.json(
        { error: 'organizationId, type and title are required' },
        { status: 400 }
      );
    }
    
    const { data, error } = await supabase
      .from('contact_activities')
      .insert({
        organization_id: organizationId,
        contact_id: contactId,
        type,
        title,
        description,
        metadata: metadata || {},
        source: 'manual',
        occurred_at: new Date(),
        created_at: new Date(),
      })
      .select()
      .single();
    
    if (error) {
      console.error('[Timeline API] Insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true, activity: data });
    
  } catch (error: any) {
    console.error('[Timeline API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
