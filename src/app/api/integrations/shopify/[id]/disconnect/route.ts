// =============================================
// Disconnect Shopify Store
// POST /api/integrations/shopify/[id]/disconnect
//
// Deactivates the store, removes webhooks via GraphQL,
// and marks as disconnected. Does NOT delete imported data.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { shopifyGraphQL } from '@/lib/shopify/graphql-client';
import { WEBHOOK_SUBSCRIPTIONS_QUERY } from '@/lib/shopify/graphql-queries';
import { WEBHOOK_SUBSCRIPTION_DELETE, WEB_PIXEL_DELETE } from '@/lib/shopify/graphql-mutations';
import { WEB_PIXEL_QUERY } from '@/lib/shopify/graphql-queries';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const storeId = params.id;
    const supabase = getSupabaseAdmin();

    // Verify store belongs to user's org
    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('id', storeId)
      .eq('organization_id', auth.user.organization_id)
      .single();

    if (storeError || !store) {
      return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 });
    }

    const storeConfig = {
      id: store.id,
      organization_id: store.organization_id,
      shop_domain: store.shop_domain,
      access_token: store.access_token,
    };

    // Try to remove webhooks via GraphQL
    try {
      const webhooksResult = await shopifyGraphQL(storeConfig, WEBHOOK_SUBSCRIPTIONS_QUERY, { first: 50 });
      const webhooks = webhooksResult.data?.webhookSubscriptions?.nodes || [];

      for (const webhook of webhooks) {
        try {
          await shopifyGraphQL(storeConfig, WEBHOOK_SUBSCRIPTION_DELETE, { id: webhook.id });
        } catch {
          // Continue removing others even if one fails
        }
      }
      console.log(`[Disconnect] Removed ${webhooks.length} webhooks for ${store.shop_domain}`);
    } catch (err) {
      console.warn('[Disconnect] Failed to remove webhooks (token may be revoked):', err);
    }

    // Try to remove web pixel
    try {
      const pixelResult = await shopifyGraphQL(storeConfig, WEB_PIXEL_QUERY);
      const pixelId = pixelResult.data?.webPixel?.id;
      if (pixelId) {
        await shopifyGraphQL(storeConfig, WEB_PIXEL_DELETE, { id: pixelId });
        console.log(`[Disconnect] Removed web pixel for ${store.shop_domain}`);
      }
    } catch {
      console.warn('[Disconnect] Failed to remove pixel');
    }

    // Mark store as disconnected
    await supabase
      .from('shopify_stores')
      .update({
        is_active: false,
        connection_status: 'disconnected',
        status: 'disconnected',
        uninstalled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', storeId);

    return NextResponse.json({
      success: true,
      message: 'Loja desconectada. Dados importados foram mantidos.',
    });
  } catch (error: any) {
    console.error('[Disconnect] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
