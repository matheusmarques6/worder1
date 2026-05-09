/**
 * CRON: Check Abandoned Carts
 * Verifica carrinhos abandonados e emite eventos
 * Configurar no Vercel: executar a cada 5-15 minutos
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  // Verificar autorização
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const isInternal = request.headers.get('X-Internal-Request') === 'true';
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  const isAuthorized = isVercelCron || isInternal || 
    (cronSecret && authHeader === `Bearer ${cronSecret}`);

  if (!isAuthorized) {
    console.log('[CheckAbandonedCarts] Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[CheckAbandonedCarts] Starting check');

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // ============================================================
    // PART 1 — trigger_checkout_abandoned (Shopify checkouts table)
    // Klaviyo / Omnisend pattern: a checkout is "abandoned" only AFTER
    // the merchant-configured wait window expires without conversion.
    // We scan shopify_checkouts where status='pending' and created_at
    // is older than the threshold, then dispatch the trigger via
    // dispatchTrigger (idempotent per checkout id).
    // ============================================================
    const { data: checkoutAutos } = await supabase
      .from('automations')
      .select('id, organization_id, trigger_config')
      .eq('trigger_type', 'trigger_checkout_abandoned')
      .eq('status', 'active');

    let checkoutDispatched = 0;
    if (checkoutAutos && checkoutAutos.length > 0) {
      const { dispatchTrigger } = await import('@/lib/automation/trigger-dispatcher');
      // Group by org+threshold so we hit shopify_checkouts once per
      // (org, threshold) combination — different automations can have
      // different abandonTime windows in the same org.
      const orgsByThreshold = new Map<string, { orgId: string; minutes: number; automationIds: string[] }>();
      for (const a of checkoutAutos as any[]) {
        const cfg = a.trigger_config || {};
        // Default to 30 min like Omnisend; the merchant can drop to 5
        // via trigger_config.abandonTime.
        const minutes = (cfg.abandonUnit === 'hours' ? (cfg.abandonTime || 1) * 60 : (cfg.abandonTime || 30));
        const key = `${a.organization_id}:${minutes}`;
        const slot = orgsByThreshold.get(key) || { orgId: a.organization_id as string, minutes, automationIds: [] as string[] };
        slot.automationIds.push(a.id as string);
        orgsByThreshold.set(key, slot);
      }

      for (const slot of orgsByThreshold.values()) {
        const cutoff = new Date(Date.now() - slot.minutes * 60_000).toISOString();
        const { data: checkouts } = await supabase
          .from('shopify_checkouts')
          .select('id, organization_id, store_id, contact_id, email, phone, total_price, currency, line_items, recovery_url, abandoned_checkout_url, cart_token, checkout_token, shopify_checkout_id, created_at, status, customer_data')
          .eq('organization_id', slot.orgId)
          .eq('status', 'pending')
          .not('email', 'is', null)
          .lt('created_at', cutoff)
          .order('created_at', { ascending: true })
          .limit(200);

        for (const c of checkouts || []) {
          // Resolve contact from email if it isn't linked yet — the
          // tracking-debug shows contacts are vinculados, but the
          // checkout row sometimes lags. Look it up so the run carries
          // the contact_id from the start.
          let cid: string | null = c.contact_id || null;
          if (!cid && c.email) {
            const { data: existing } = await supabase
              .from('contacts')
              .select('id')
              .eq('organization_id', c.organization_id)
              .ilike('email', c.email)
              .maybeSingle();
            if (existing?.id) {
              cid = existing.id;
              // Backfill the checkout row so future runs don't repeat
              // this lookup.
              await supabase
                .from('shopify_checkouts')
                .update({ contact_id: cid })
                .eq('id', c.id);
            }
          }

          const lineItems = Array.isArray(c.line_items) ? c.line_items : [];
          const checkoutKey = String(c.shopify_checkout_id || c.checkout_token || c.id);

          await dispatchTrigger({
            organizationId: c.organization_id,
            triggerType: 'trigger_checkout_abandoned',
            contactId: cid,
            triggerData: {
              event_type: 'checkout_abandoned',
              CheckoutId: checkoutKey,
              CheckoutURL: c.recovery_url || c.abandoned_checkout_url || '',
              Value: parseFloat(String(c.total_price || 0)),
              Currency: c.currency || '',
              ItemCount: lineItems.length,
              Items: lineItems.map((item: any) => ({
                ProductID: item.product_id ? String(item.product_id) : undefined,
                ProductName: item.title || item.name,
                Quantity: item.quantity || 1,
                ItemPrice: parseFloat(item.price || '0'),
                RowTotal: parseFloat(item.price || '0') * (item.quantity || 1),
                ImageURL: item.product?.images?.[0]?.src || item.product?.image?.src || '',
                SKU: item.sku,
                VariantID: item.variant_id ? String(item.variant_id) : undefined,
                Brand: item.vendor,
              })),
              ItemNames: lineItems.map((item: any) => item.title || item.name),
              CustomerEmail: c.email,
              CustomerPhone: c.phone || null,
              cart_token: c.cart_token || null,
              checkout_token: c.checkout_token || null,
            },
            idempotencyKey: `trigger:checkout_abandoned:${checkoutKey}`,
          }).catch((e) => console.error('[CheckAbandonedCarts] dispatch failed:', e));
          checkoutDispatched++;
        }
      }
    }

    // ============================================================
    // PART 2 — Legacy trigger_abandon (abandoned_carts table)
    // ============================================================
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
      checkoutAbandonedDispatched: checkoutDispatched,
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
