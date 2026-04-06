/**
 * API: Abandoned Cart Worker
 * Detects abandoned carts by checking for checkout_started events
 * that were not followed by a placed_order event within 4 hours.
 * Runs every 10 minutes via Vercel Cron.
 *
 * GET /api/workers/abandoned-cart
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ============================================
// GET - Detect abandoned carts
// ============================================

export async function GET(request: NextRequest) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';

  if (!isVercelCron && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find checkout_started events older than 4 hours that haven't been processed
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

    const { data: checkouts, error: queryError } = await supabase
      .from('contact_events')
      .select('*')
      .eq('event_type', 'checkout_started')
      .lt('created_at', fourHoursAgo)
      .or('metadata->abandoned_cart_processed.is.null,metadata->>abandoned_cart_processed.eq.false')
      .limit(100);

    if (queryError) {
      console.error('[AbandonedCart] Query error:', queryError);
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    let processed = 0;

    for (const checkout of checkouts || []) {
      try {
        // Check if there's a placed_order event from the same contact after the checkout
        const { data: orders, error: orderError } = await supabase
          .from('contact_events')
          .select('id')
          .eq('contact_id', checkout.contact_id)
          .eq('event_type', 'placed_order')
          .gt('created_at', checkout.created_at)
          .limit(1);

        if (orderError) {
          console.error(`[AbandonedCart] Error checking orders for checkout ${checkout.id}:`, orderError);
          continue;
        }

        if (!orders || orders.length === 0) {
          // No order found — this is an abandoned cart
          await supabase
            .from('contact_events')
            .insert({
              contact_id: checkout.contact_id,
              organization_id: checkout.organization_id,
              event_type: 'abandoned_cart',
              metadata: {
                source_checkout_id: checkout.id,
                checkout_data: checkout.metadata || {},
                checkout_created_at: checkout.created_at,
              },
              created_at: new Date().toISOString(),
            });

          processed++;
        }

        // Mark the original checkout as processed regardless of outcome
        await supabase
          .from('contact_events')
          .update({
            metadata: {
              ...(checkout.metadata || {}),
              abandoned_cart_processed: true,
            },
          })
          .eq('id', checkout.id);
      } catch (err: any) {
        console.error(`[AbandonedCart] Error processing checkout ${checkout.id}:`, err.message);
      }
    }

    console.log(`[AbandonedCart] Processed ${processed} abandoned carts`);

    return NextResponse.json({
      processed,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[AbandonedCart] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
