// =============================================
// POST /api/shopify/sync-financials?store_id=X
//
// Sync customer-level lifetime financial metrics from Shopify into
// the contacts table (total_orders, total_spent, last_order_at, AOV).
// Also computes store-level totals into shopify_stores.
//
// Use this when:
//  - You just connected a store and want dashboards populated
//  - You want to refresh stale aggregates
//  - You added historical orders that webhooks didn't catch
//
// Manual integration friendly: only requires read_customers + read_orders.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { shopifyGraphQLPaginate } from '@/lib/shopify/graphql-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CUSTOMERS_FINANCIAL_QUERY = `
  query CustomersFinancial($first: Int!, $after: String, $sortKey: CustomerSortKeys) {
    customers(first: $first, after: $after, sortKey: $sortKey) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        legacyResourceId
        email
        phone
        firstName
        lastName
        createdAt
        updatedAt
        numberOfOrders
        amountSpent { amount currencyCode }
        lastOrder {
          id
          name
          createdAt
          totalPriceSet { shopMoney { amount } }
        }
        emailMarketingConsent { marketingState }
        smsMarketingConsent { marketingState }
        tags
        defaultAddress {
          city province country zip
        }
      }
    }
  }
`;

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const { searchParams } = request.nextUrl;
  const storeIdParam = searchParams.get('store_id') || searchParams.get('storeId');

  const supabase = getSupabaseAdmin();

  // Find target store
  let store: any;
  if (storeIdParam) {
    const { data } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('id', storeIdParam)
      .eq('organization_id', organizationId)
      .single();
    store = data;
  } else {
    const { data } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('installed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    store = data;
  }

  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }
  if (!store.access_token) {
    return NextResponse.json({ error: 'Store has no access token' }, { status: 400 });
  }

  const storeConfig = {
    id: store.id,
    organization_id: store.organization_id,
    shop_domain: store.shop_domain,
    access_token: store.access_token,
  };

  const startedAt = Date.now();
  let customersProcessed = 0;
  let contactsUpdated = 0;
  let contactsCreated = 0;
  let totalRevenue = 0;
  let totalOrders = 0;
  const errors: string[] = [];

  try {
    const { nodes } = await shopifyGraphQLPaginate(
      storeConfig,
      CUSTOMERS_FINANCIAL_QUERY,
      { sortKey: 'UPDATED_AT' },
      'customers',
      { first: 100, maxPages: 200 }
    );

    customersProcessed = nodes.length;

    for (const c of nodes) {
      try {
        const email = (c.email || '').toLowerCase().trim();
        const phone = c.phone || null;
        const numberOfOrders = parseInt(c.numberOfOrders || '0', 10);
        const totalSpent = parseFloat(c.amountSpent?.amount || '0');
        const currency = c.amountSpent?.currencyCode || store.currency || 'BRL';
        const lastOrderAt = c.lastOrder?.createdAt || null;
        const aov = numberOfOrders > 0 ? totalSpent / numberOfOrders : 0;

        if (!email && !phone) continue;

        // Find existing contact
        let existingContact: any = null;
        if (email) {
          const { data } = await supabase
            .from('contacts')
            .select('id, total_orders, total_spent')
            .eq('organization_id', organizationId)
            .ilike('email', email)
            .limit(1)
            .maybeSingle();
          existingContact = data;
        }
        if (!existingContact && phone) {
          const { data } = await supabase
            .from('contacts')
            .select('id, total_orders, total_spent')
            .eq('organization_id', organizationId)
            .eq('phone', phone)
            .limit(1)
            .maybeSingle();
          existingContact = data;
        }

        const contactPayload: any = {
          email: email || undefined,
          phone: phone || undefined,
          first_name: c.firstName || undefined,
          last_name: c.lastName || undefined,
          total_orders: numberOfOrders,
          total_spent: totalSpent,
          average_order_value: aov,
          last_order_at: lastOrderAt,
          shopify_customer_id: c.legacyResourceId,
          is_subscribed_email: c.emailMarketingConsent?.marketingState === 'SUBSCRIBED',
          is_subscribed_sms: c.smsMarketingConsent?.marketingState === 'SUBSCRIBED',
          city: c.defaultAddress?.city,
          state: c.defaultAddress?.province,
          country: c.defaultAddress?.country,
          updated_at: new Date().toISOString(),
        };

        if (existingContact) {
          await supabase
            .from('contacts')
            .update(contactPayload)
            .eq('id', existingContact.id);
          contactsUpdated++;
        } else if (email) {
          await supabase
            .from('contacts')
            .insert({
              ...contactPayload,
              organization_id: organizationId,
              store_id: store.id,
              source: 'shopify_sync_financials',
              created_at: c.createdAt || new Date().toISOString(),
            });
          contactsCreated++;
        }

        totalRevenue += totalSpent;
        totalOrders += numberOfOrders;
      } catch (perCustomerErr: any) {
        errors.push(`Customer ${c.email || c.id}: ${perCustomerErr?.message || 'unknown'}`);
      }
    }

    // Update store-level aggregates
    await supabase
      .from('shopify_stores')
      .update({
        total_revenue: totalRevenue,
        total_orders: totalOrders,
        total_customers: customersProcessed,
        last_sync_at: new Date().toISOString(),
      })
      .eq('id', store.id);

    return NextResponse.json({
      success: true,
      durationMs: Date.now() - startedAt,
      stats: {
        customersProcessed,
        contactsUpdated,
        contactsCreated,
        totalRevenue,
        totalOrders,
        currency: store.currency || 'BRL',
        avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      },
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err?.message || 'Sync failed',
      durationMs: Date.now() - startedAt,
      partialStats: {
        customersProcessed,
        contactsUpdated,
        contactsCreated,
      },
    }, { status: 500 });
  }
}
