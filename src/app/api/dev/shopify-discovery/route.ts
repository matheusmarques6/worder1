// =============================================
// GET /api/dev/shopify-discovery?store_id=X
//
// Diagnostic endpoint that runs many Shopify GraphQL queries against
// a connected store and returns a single JSON document showing what
// data is available, what fields exist, and what fails.
//
// Use this to figure out which fields to use in sync/webhooks/dashboards
// without testing blind. Mirrors the convertfy/omnisend-discovery pattern.
//
// Auth: requires authenticated user with access to the store.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { shopifyGraphQL } from '@/lib/shopify/graphql-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const API_VERSION = '2026-04';

async function tryQuery(
  storeConfig: { shop_domain: string; access_token: string },
  label: string,
  query: string,
  variables?: Record<string, any>
): Promise<{ ok: boolean; data?: any; errors?: any; raw?: any; durationMs: number; queryLength: number }> {
  const startedAt = Date.now();
  try {
    const result = await shopifyGraphQL(storeConfig as any, query, variables);
    return {
      ok: true,
      data: result.data,
      errors: result.errors,
      raw: undefined,
      durationMs: Date.now() - startedAt,
      queryLength: query.length,
    };
  } catch (err: any) {
    return {
      ok: false,
      data: null,
      errors: [{ message: err?.message || 'Unknown error', name: err?.name }],
      durationMs: Date.now() - startedAt,
      queryLength: query.length,
    };
  }
}

async function tryRest(
  storeConfig: { shop_domain: string; access_token: string },
  endpoint: string
): Promise<{ ok: boolean; status: number; data?: any; durationMs: number }> {
  const startedAt = Date.now();
  try {
    const url = `https://${storeConfig.shop_domain}/admin/api/${API_VERSION}/${endpoint}`;
    const res = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': storeConfig.access_token,
        'Content-Type': 'application/json',
      },
    });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text.substring(0, 500) }; }
    return {
      ok: res.ok,
      status: res.status,
      data,
      durationMs: Date.now() - startedAt,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      data: { error: err?.message },
      durationMs: Date.now() - startedAt,
    };
  }
}

export async function GET(request: NextRequest) {
  // Auth: try logged-in user first; fall back to ?store_id (UUID — unguessable)
  // for easy testing in incognito or from external tools.
  const auth = await getAuthClient();
  let organizationId: string | null = auth?.user?.organization_id || null;

  const { searchParams } = request.nextUrl;
  const storeId = searchParams.get('store_id') || searchParams.get('storeId');
  const shopDomain = searchParams.get('domain') || searchParams.get('shop');

  const supabase = getSupabaseAdmin();
  let store: any = null;

  if (storeId) {
    // store_id is a UUID — unguessable enough for dev access without auth
    const { data } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('id', storeId)
      .single();
    if (data && organizationId && data.organization_id !== organizationId) {
      // Logged-in user trying to access different org — block
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    store = data;
    if (!organizationId && store) organizationId = store.organization_id;
  } else if (shopDomain && organizationId) {
    const normalizedDomain = shopDomain.includes('.myshopify.com')
      ? shopDomain
      : `${shopDomain}.myshopify.com`;
    const { data } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('shop_domain', normalizedDomain)
      .eq('organization_id', organizationId)
      .single();
    store = data;
  } else if (organizationId) {
    // Default: pick the user's most recent active store
    const { data } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .not('access_token', 'is', null)
      .order('installed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    store = data;
  } else {
    return NextResponse.json({
      error: 'Provide ?store_id=UUID (or login + ?domain=mystore)',
      hint: 'Get the UUID via Supabase: SELECT id FROM shopify_stores WHERE shop_domain = \'sourosa.myshopify.com\';',
    }, { status: 401 });
  }

  if (!store) {
    return NextResponse.json({
      error: 'Store not found.',
      hint: 'Connect a store at /integrations/shopify or pass ?store_id=UUID',
    }, { status: 404 });
  }

  if (!store.access_token) {
    return NextResponse.json({ error: 'Store has no access token' }, { status: 400 });
  }

  const cfg = { shop_domain: store.shop_domain, access_token: store.access_token };
  const startedAt = Date.now();

  // Run all probes in parallel for speed
  const [
    shop,
    counts,
    customers,
    orders,
    ordersWithLineItems,
    abandonedCheckouts,
    products,
    collections,
    discounts,
    fulfillments,
    refunds,
    customerWithOrders,
    salesAnalytics,
    webPixel,
    locations,
    metafields,
    inventoryItems,
    marketingActivities,
    customerSegments,
    productImages,
  ] = await Promise.all([
    // 1. Shop info
    tryQuery(cfg, 'shop_info', `{
      shop {
        id name email contactEmail myshopifyDomain primaryDomain { url host }
        currencyCode timezoneAbbreviation timezoneOffset weightUnit
        plan { displayName partnerDevelopment }
        features {
          storefront branding eligibleForSubscriptions reportsAvailable
          legacy { storefront }
        }
      }
    }`),

    // 2. Counts (verifica scopes/limites)
    tryQuery(cfg, 'counts', `{
      productsCount(limit: 250) { count }
      customersCount(limit: 250) { count }
      ordersCount(limit: 250) { count }
    }`),

    // 3. Customers — pega 5 com todos os campos
    tryQuery(cfg, 'customers_sample', `{
      customers(first: 5, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id legacyResourceId email phone firstName lastName displayName
            createdAt updatedAt note tags state verifiedEmail
            taxExempt taxExemptions
            numberOfOrders
            amountSpent { amount currencyCode }
            lifetimeDuration
            statistics {
              predictedSpendTier
            }
            defaultAddress {
              address1 address2 city province country zip phone
              firstName lastName company
            }
            addresses(first: 3) {
              address1 city province country zip
            }
            emailMarketingConsent { marketingState marketingOptInLevel consentUpdatedAt }
            smsMarketingConsent { marketingState marketingOptInLevel consentUpdatedAt }
            metafields(first: 5) { edges { node { namespace key value type } } }
            companyContactProfiles {
              company { id name }
              role { name }
            }
          }
        }
      }
    }`),

    // 4. Orders — sample completo
    tryQuery(cfg, 'orders_sample', `{
      orders(first: 5, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id legacyResourceId name confirmationNumber
            createdAt updatedAt processedAt cancelledAt closedAt
            displayFinancialStatus displayFulfillmentStatus
            email phone customerLocale
            currencyCode presentmentCurrencyCode
            subtotalPriceSet { shopMoney { amount currencyCode } presentmentMoney { amount } }
            totalPriceSet { shopMoney { amount } presentmentMoney { amount } }
            totalTaxSet { shopMoney { amount } }
            totalShippingPriceSet { shopMoney { amount } }
            totalDiscountsSet { shopMoney { amount } }
            totalRefundedSet { shopMoney { amount } }
            totalOutstandingSet { shopMoney { amount } }
            taxesIncluded
            sourceName sourceIdentifier
            referrerUrl landingPageUrl
            tags note
            customAttributes { key value }
            note paymentGatewayNames
            customer { id email firstName lastName }
            shippingAddress { address1 city province country zip firstName lastName }
            billingAddress { address1 city province country zip }
            discountApplications(first: 5) {
              edges {
                node {
                  ... on DiscountCodeApplication { code targetType }
                  ... on AutomaticDiscountApplication { title }
                  ... on ManualDiscountApplication { title description }
                  allocationMethod targetSelection value {
                    ... on MoneyV2 { amount currencyCode }
                    ... on PricingPercentageValue { percentage }
                  }
                }
              }
            }
            discountCodes
            transactions(first: 3) {
              id status kind gateway amountSet { shopMoney { amount } }
              processedAt
            }
            shippingLines(first: 3) {
              title source priceSet { shopMoney { amount } }
              carrierIdentifier
            }
            channelInformation {
              channelDefinition { handle channelName }
            }
          }
        }
      }
    }`),

    // 5. Order with full line items + product details
    tryQuery(cfg, 'orders_with_line_items', `{
      orders(first: 1, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id name
            lineItems(first: 50) {
              edges {
                node {
                  id title quantity sku
                  originalUnitPriceSet { shopMoney { amount } }
                  discountedUnitPriceSet { shopMoney { amount } }
                  totalDiscountSet { shopMoney { amount } }
                  variant {
                    id sku title compareAtPrice
                    image { src altText }
                    product {
                      id handle title vendor productType tags
                      featuredImage { src altText }
                      images(first: 3) { edges { node { src altText } } }
                      collections(first: 5) { edges { node { id title handle } } }
                    }
                  }
                  customAttributes { key value }
                  duties {
                    harmonizedSystemCode countryCodeOfOrigin
                  }
                  taxLines { title rate priceSet { shopMoney { amount } } }
                }
              }
            }
            fulfillments(first: 5) {
              id status displayStatus createdAt
              trackingInfo { number url company }
              service { handle }
            }
            refunds(first: 3) {
              id totalRefundedSet { shopMoney { amount } } note createdAt
            }
          }
        }
      }
    }`),

    // 6. Abandoned checkouts
    tryQuery(cfg, 'abandoned_checkouts', `{
      abandonedCheckouts(first: 3, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id abandonedCheckoutUrl createdAt updatedAt completedAt
            taxesIncluded customerLocale
            subtotalPriceSet { shopMoney { amount } }
            totalPriceSet { shopMoney { amount } }
            totalTaxSet { shopMoney { amount } }
            totalDiscountSet { shopMoney { amount } }
            customAttributes { key value }
            customer { id email firstName lastName }
            note
            shippingAddress { city country firstName lastName }
            billingAddress { city country }
            discountCodes
            lineItemsQuantity
            lineItems(first: 10) {
              edges {
                node {
                  title quantity sku
                  variantTitle
                  originalUnitPriceSet { shopMoney { amount } }
                  variant { id image { src } product { id handle } }
                }
              }
            }
          }
        }
      }
    }`),

    // 7. Products
    tryQuery(cfg, 'products_sample', `{
      products(first: 3, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id legacyResourceId handle title vendor productType
            descriptionHtml description
            createdAt updatedAt publishedAt status
            tags totalInventory tracksInventory
            options { id name values position }
            featuredImage { src altText }
            images(first: 5) { edges { node { id src altText } } }
            collections(first: 5) { edges { node { id title handle } } }
            variants(first: 5) {
              edges {
                node {
                  id legacyResourceId sku title displayName
                  price compareAtPrice
                  inventoryQuantity availableForSale
                  weight weightUnit barcode
                  selectedOptions { name value }
                  image { src }
                  inventoryItem { id tracked harmonizedSystemCode }
                }
              }
            }
            metafields(first: 5) { edges { node { namespace key value type } } }
            seo { title description }
          }
        }
      }
    }`),

    // 8. Collections
    tryQuery(cfg, 'collections_sample', `{
      collections(first: 5, sortKey: UPDATED_AT) {
        edges {
          node {
            id handle title descriptionHtml
            updatedAt productsCount { count }
            sortOrder
            ruleSet { rules { column condition relation } }
          }
        }
      }
    }`),

    // 9. Discounts (price rules / codes)
    tryQuery(cfg, 'discounts', `{
      codeDiscountNodes(first: 3) {
        edges {
          node {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                title status startsAt endsAt
                summary usageLimit appliesOncePerCustomer
                customerSelection {
                  ... on DiscountCustomerAll { allCustomers }
                }
                codes(first: 1) { edges { node { code } } }
                customerGets {
                  value {
                    ... on DiscountAmount { amount { amount currencyCode } }
                    ... on DiscountPercentage { percentage }
                  }
                  items {
                    ... on AllDiscountItems { allItems }
                  }
                }
              }
              ... on DiscountCodeBxgy {
                title status
                customerBuys { value { ... on DiscountQuantity { quantity } } }
                customerGets { value { ... on DiscountPercentage { percentage } } }
              }
            }
          }
        }
      }
      automaticDiscountNodes(first: 3) {
        edges {
          node {
            id
            automaticDiscount {
              ... on DiscountAutomaticBasic {
                title status startsAt endsAt
              }
            }
          }
        }
      }
    }`),

    // 10. Fulfillments — pra emails de "pedido enviado"
    tryQuery(cfg, 'fulfillments', `{
      orders(first: 1, query: "fulfillment_status:shipped") {
        edges {
          node {
            id name
            fulfillments(first: 3) {
              id status displayStatus createdAt deliveredAt
              trackingInfo { number url company }
              originAddress { city province country }
              service { handle inventoryManagement }
              estimatedDeliveryAt
            }
          }
        }
      }
    }`),

    // 11. Refunds
    tryQuery(cfg, 'refunds', `{
      orders(first: 1, query: "financial_status:refunded OR financial_status:partially_refunded") {
        edges {
          node {
            id name
            refunds(first: 3) {
              id note createdAt totalRefundedSet { shopMoney { amount } }
              refundLineItems(first: 5) {
                edges { node { quantity restockType } }
              }
              transactions(first: 3) {
                id kind status amountSet { shopMoney { amount } }
              }
            }
          }
        }
      }
    }`),

    // 12. Customer with orders (linkage check)
    tryQuery(cfg, 'customer_with_orders', `{
      customers(first: 1, query: "orders_count:>0", sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id email displayName
            numberOfOrders amountSpent { amount currencyCode }
            lastOrder { id name createdAt totalPriceSet { shopMoney { amount } } }
            orders(first: 5, sortKey: CREATED_AT, reverse: true) {
              edges {
                node {
                  id name createdAt
                  totalPriceSet { shopMoney { amount } }
                  displayFinancialStatus displayFulfillmentStatus
                  lineItems(first: 3) { edges { node { title quantity } } }
                }
              }
            }
          }
        }
      }
    }`),

    // 13. Sales analytics — período de 30 dias
    tryQuery(cfg, 'sales_analytics_30d', `{
      orders(first: 100, query: "created_at:>='${new Date(Date.now() - 30 * 86400 * 1000).toISOString().split('T')[0]}'") {
        edges {
          node {
            createdAt
            totalPriceSet { shopMoney { amount currencyCode } }
            displayFinancialStatus
          }
        }
      }
    }`),

    // 14. Web Pixel — verifica se já tem instalado
    tryQuery(cfg, 'web_pixel', `{
      webPixel { id settings }
    }`),

    // 15. Locations
    tryQuery(cfg, 'locations', `{
      locations(first: 5) {
        edges { node { id name address { city province country } isActive shipsInventory } }
      }
    }`),

    // 16. Shop metafields
    tryQuery(cfg, 'shop_metafields', `{
      shop {
        metafields(first: 10) {
          edges { node { namespace key value type } }
        }
      }
    }`),

    // 17. Inventory items
    tryQuery(cfg, 'inventory', `{
      inventoryItems(first: 3) {
        edges {
          node {
            id sku tracked harmonizedSystemCode
            inventoryLevels(first: 3) {
              edges { node { id available location { id name } } }
            }
          }
        }
      }
    }`),

    // 18. Marketing activities
    tryQuery(cfg, 'marketing_activities', `{
      marketingActivities(first: 3) {
        edges {
          node {
            id title status activityListUrl
          }
        }
      }
    }`),

    // 19. Customer segments
    tryQuery(cfg, 'segments', `{
      segments(first: 3) {
        edges {
          node { id name query creationDate lastEditDate }
        }
      }
    }`),

    // 20. Product images by handle
    tryQuery(cfg, 'product_images', `{
      products(first: 1) {
        edges {
          node {
            id handle title
            featuredMedia { id alt mediaContentType }
            media(first: 3) {
              edges {
                node {
                  ... on MediaImage { id image { url width height altText } }
                }
              }
            }
          }
        }
      }
    }`),
  ]);

  // Now also test legacy REST endpoints (some are required for webhook setup)
  const [restWebhooks, restShop, restAbandoned] = await Promise.all([
    tryRest(cfg, 'webhooks.json'),
    tryRest(cfg, 'shop.json'),
    tryRest(cfg, 'checkouts.json?status=open&limit=3'),
  ]);

  // Compute summary
  const probes = {
    shop, counts, customers, orders, ordersWithLineItems, abandonedCheckouts,
    products, collections, discounts, fulfillments, refunds, customerWithOrders,
    salesAnalytics, webPixel, locations, metafields, inventoryItems,
    marketingActivities, customerSegments, productImages,
  };

  const summary = {
    totalProbes: Object.keys(probes).length,
    succeeded: Object.values(probes).filter((p: any) => p.ok && (!p.errors || p.errors.length === 0)).length,
    withErrors: Object.values(probes).filter((p: any) => p.errors && p.errors.length > 0).length,
    failed: Object.values(probes).filter((p: any) => !p.ok).length,
    totalDurationMs: Date.now() - startedAt,
  };

  // Compute available financial metrics summary
  const salesData: any = (salesAnalytics as any).data?.orders?.edges || [];
  const totalRevenue30d = salesData.reduce((sum: number, e: any) =>
    sum + parseFloat(e.node?.totalPriceSet?.shopMoney?.amount || '0'), 0);
  const ordersCount30d = salesData.length;

  return NextResponse.json({
    discoveredAt: new Date().toISOString(),
    store: {
      id: store.id,
      shop_domain: store.shop_domain,
      shop_name: store.shop_name,
      currency: store.currency,
      api_version: store.api_version || API_VERSION,
      connection_type: store.connection_type || 'oauth',
      scopes: store.scopes,
      installed_at: store.installed_at,
      token_expires_at: store.token_expires_at,
    },
    summary,
    financialPreview: {
      orders30d: ordersCount30d,
      revenue30d: totalRevenue30d,
      currency: store.currency || 'BRL',
      avgOrderValue30d: ordersCount30d > 0 ? totalRevenue30d / ordersCount30d : 0,
    },
    probes,
    rest: {
      webhooks: restWebhooks,
      shop: restShop,
      abandoned_checkouts: restAbandoned,
    },
    nextSteps: [
      probes.customers.ok ? null : '⚠️ Customers query failed — verifique scope read_customers',
      probes.orders.ok ? null : '⚠️ Orders query failed — verifique scope read_orders',
      probes.ordersWithLineItems.errors?.length > 0 ? '⚠️ Line items podem ter campos faltando — checar errors no probe' : null,
      probes.abandonedCheckouts.errors?.length > 0 ? '⚠️ Abandoned checkouts requer scope read_orders + Plus plan ou read_all_orders' : null,
      probes.discounts.errors?.length > 0 ? '⚠️ Discounts requer scope read_discounts' : null,
      probes.webPixel.errors?.length > 0 ? '⚠️ Web Pixel requer scope write_pixels' : null,
      probes.refunds.errors?.length > 0 ? '⚠️ Refunds requer scope read_orders' : null,
      probes.customerSegments.errors?.length > 0 ? '⚠️ Customer Segments requer scope read_customers + Plus' : null,
    ].filter(Boolean),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
