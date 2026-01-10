/**
 * CRON: Check Abandoned Carts
 * Verifica carrinhos abandonados e emite eventos
 * Configurar no Vercel: executar a cada 5-15 minutos
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  // Verificar authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Buscar automações de carrinho abandonado ativas
    const { data: automations, error: autoError } = await supabase
      .from('automations')
      .select('id, organization_id, trigger_config')
      .eq('trigger_type', 'trigger_abandon')
      .eq('status', 'active');

    if (autoError) {
      throw autoError;
    }

    if (!automations || automations.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active abandoned cart automations',
        cartsProcessed: 0,
      });
    }

    let totalProcessed = 0;
    const results: any[] = [];

    // Para cada automação, buscar carrinhos que atendem aos critérios
    for (const automation of automations) {
      const config = automation.trigger_config || {};
      const abandonTime = config.abandonTime || 30;
      const abandonUnit = config.abandonUnit || 'minutes';
      const minValue = config.minValue;
      const storeId = config.storeId;
      const onlyWithEmail = config.onlyWithEmail;
      const excludeRecovered = config.excludeRecovered !== false;

      // Calcular threshold de tempo
      const intervalValue = abandonUnit === 'hours' ? abandonTime : abandonTime;
      const intervalUnit = abandonUnit === 'hours' ? 'hours' : 'minutes';
      
      // Construir query
      let query = supabase
        .from('abandoned_carts')
        .select('*')
        .eq('organization_id', automation.organization_id)
        .eq('status', 'abandoned')
        .is('notified_at', null) // Ainda não foi notificado
        .lt('abandoned_at', new Date(Date.now() - (abandonTime * (abandonUnit === 'hours' ? 3600000 : 60000))).toISOString());

      // Filtros opcionais
      if (storeId) {
        query = query.eq('store_id', storeId);
      }

      if (minValue) {
        query = query.gte('total_price', minValue);
      }

      if (onlyWithEmail) {
        query = query.not('customer_email', 'is', null);
      }

      if (excludeRecovered) {
        query = query.is('recovered_order_id', null);
      }

      const { data: carts, error: cartsError } = await query.limit(100);

      if (cartsError) {
        console.error(`[CRON:AbandonedCarts] Error fetching carts for automation ${automation.id}:`, cartsError);
        continue;
      }

      if (!carts || carts.length === 0) {
        continue;
      }

      // Criar eventos para cada carrinho
      for (const cart of carts) {
        // Verificar se já existe evento não processado para este carrinho
        const { data: existingEvent } = await supabase
          .from('event_logs')
          .select('id')
          .eq('organization_id', cart.organization_id)
          .eq('event_type', 'cart.abandoned')
          .eq('payload->cart_id', cart.id)
          .eq('processed', false)
          .single();

        if (existingEvent) {
          continue; // Já existe evento pendente
        }

        // Criar evento
        const { error: eventError } = await supabase
          .from('event_logs')
          .insert({
            organization_id: cart.organization_id,
            event_type: 'cart.abandoned',
            contact_id: cart.contact_id,
            payload: {
              cart_id: cart.id,
              external_id: cart.external_id,
              total_price: cart.total_price,
              customer_email: cart.customer_email,
              customer_name: cart.customer_name,
              store_id: cart.store_id,
              storeId: cart.store_id,
              checkout_url: cart.checkout_url,
              recovery_url: cart.recovery_url,
              line_items: cart.line_items,
              abandoned_at: cart.abandoned_at,
            },
            source: 'cron',
          });

        if (eventError) {
          console.error(`[CRON:AbandonedCarts] Error creating event for cart ${cart.id}:`, eventError);
          continue;
        }

        // Marcar carrinho como notificado
        await supabase
          .from('abandoned_carts')
          .update({
            notified_at: new Date().toISOString(),
            notification_count: (cart.notification_count || 0) + 1,
            last_notification_at: new Date().toISOString(),
          })
          .eq('id', cart.id);

        totalProcessed++;
      }

      results.push({
        automationId: automation.id,
        cartsFound: carts.length,
      });
    }

    // Processar eventos criados
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
    if (appUrl && totalProcessed > 0) {
      fetch(`${appUrl}/api/cron/process-events`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cronSecret}`,
        },
      }).catch(err => {
        console.error('[CRON:AbandonedCarts] Error triggering event processing:', err);
      });
    }

    console.log(`[CRON:AbandonedCarts] Processed ${totalProcessed} abandoned carts`);

    return NextResponse.json({
      success: true,
      cartsProcessed: totalProcessed,
      automationsChecked: automations.length,
      results,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('[CRON:AbandonedCarts] Exception:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}

// Suporte para POST também
export async function POST(request: NextRequest) {
  return GET(request);
}
