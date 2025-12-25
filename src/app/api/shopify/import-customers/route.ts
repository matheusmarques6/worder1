// =============================================
// API: Import Existing Customers from Shopify
// src/app/api/shopify/import-customers/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SHOPIFY_API_VERSION = '2024-10';

// =============================================
// Helper: Create Supabase client
// =============================================
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    return null;
  }
  
  return createClient(url, key);
}

// =============================================
// Helper: JSON Response
// =============================================
function jsonResponse(data: any, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// =============================================
// Helper: Buscar TODOS os clientes com paginação
// =============================================
async function fetchAllCustomers(
  shopDomain: string, 
  accessToken: string
): Promise<any[]> {
  const allCustomers: any[] = [];
  let nextPageUrl: string | null = 
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/customers.json?limit=250`;
  
  let pageCount = 0;
  const maxPages = 40;
  
  while (nextPageUrl && pageCount < maxPages) {
    const currentUrl: string = nextPageUrl;
    
    const response: Response = await fetch(currentUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Shopify API error:', response.status, errorText);
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();
    allCustomers.push(...(data.customers || []));
    
    const linkHeader: string | null = response.headers.get('Link');
    nextPageUrl = null;
    
    if (linkHeader) {
      const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        nextPageUrl = nextMatch[1];
      }
    }
    
    pageCount++;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return allCustomers;
}

// =============================================
// Helper: Buscar todas as tags únicas dos clientes COM CONTAGEM
// =============================================
async function fetchAllCustomerTags(
  shopDomain: string,
  accessToken: string
): Promise<{ tag: string; count: number }[]> {
  const tagCounts = new Map<string, number>();
  let nextPageUrl: string | null = 
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/customers.json?limit=250&fields=id,tags`;
  
  let pageCount = 0;
  const maxPages = 20;
  
  while (nextPageUrl && pageCount < maxPages) {
    const currentUrl: string = nextPageUrl;
    
    const response: Response = await fetch(currentUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      break;
    }

    const data = await response.json();
    
    for (const customer of (data.customers || [])) {
      if (customer.tags && typeof customer.tags === 'string') {
        const tags = customer.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
        tags.forEach((tag: string) => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      }
    }
    
    const linkHeader: string | null = response.headers.get('Link');
    nextPageUrl = null;
    
    if (linkHeader) {
      const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        nextPageUrl = nextMatch[1];
      }
    }
    
    pageCount++;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  // Converter Map para array e ordenar por contagem (maior primeiro)
  return Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

// =============================================
// Helper: Normalizar telefone
// =============================================
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length < 8) return null;
  
  if (digits.startsWith('55') && digits.length >= 12) {
    return `+${digits}`;
  }
  
  if (digits.length >= 10 && digits.length <= 11) {
    return `+55${digits}`;
  }
  
  return `+${digits}`;
}

// =============================================
// Helper: Construir nome do cliente
// =============================================
function buildCustomerName(customer: any): string {
  const parts = [
    customer.first_name,
    customer.last_name,
  ].filter(Boolean);
  
  return parts.join(' ').trim() || 'Cliente Shopify';
}

// =============================================
// GET: Buscar contagem de clientes e tags disponíveis
// =============================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    const includeTags = searchParams.get('includeTags') === 'true';

    if (!storeId) {
      return jsonResponse({ success: false, error: 'storeId required' }, 400);
    }

    const supabase = getSupabase();
    if (!supabase) {
      return jsonResponse({ success: false, error: 'Database not configured' }, 503);
    }

    const { data: store, error } = await supabase
      .from('shopify_stores')
      .select('shop_domain, access_token, shop_name')
      .eq('id', storeId)
      .single();

    if (error || !store) {
      console.error('Store lookup error:', error);
      return jsonResponse({ success: false, error: 'Store not found' }, 404);
    }

    if (!store.access_token) {
      return jsonResponse({ success: false, error: 'Store not configured' }, 400);
    }

    // Buscar contagem de clientes no Shopify
    const countResponse = await fetch(
      `https://${store.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/customers/count.json`,
      {
        headers: {
          'X-Shopify-Access-Token': store.access_token,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!countResponse.ok) {
      const errorText = await countResponse.text();
      console.error('Shopify count error:', countResponse.status, errorText);
      return jsonResponse({ 
        success: false, 
        error: `Erro ao conectar com Shopify: ${countResponse.status}` 
      }, 500);
    }

    const countData = await countResponse.json();
    
    // Se solicitado, buscar tags também
    let availableTags: { tag: string; count: number }[] = [];
    if (includeTags) {
      try {
        availableTags = await fetchAllCustomerTags(store.shop_domain, store.access_token);
      } catch (tagError) {
        console.error('Error fetching tags:', tagError);
        // Não falha se não conseguir buscar tags
      }
    }
    
    return jsonResponse({
      success: true,
      count: countData.count || 0,
      storeName: store.shop_name || store.shop_domain,
      availableTags,
    });

  } catch (error: any) {
    console.error('GET error:', error);
    return jsonResponse({ 
      success: false,
      error: error.message || 'Erro interno do servidor'
    }, 500);
  }
}

// =============================================
// POST: Executar importação de clientes
// =============================================
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return jsonResponse({ success: false, error: 'Database not configured' }, 503);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse({ success: false, error: 'Invalid request body' }, 400);
    }

    const { 
      storeId, 
      pipelineId, 
      stageId, 
      contactType = 'auto',
      createDeals = false,
      tags = [],
      filterByTags = []
    } = body;

    if (!storeId) {
      return jsonResponse({ success: false, error: 'storeId required' }, 400);
    }

    // Buscar configuração da loja
    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('id', storeId)
      .single();

    if (storeError || !store) {
      console.error('Store not found:', storeError);
      return jsonResponse({ success: false, error: 'Store not found' }, 404);
    }

    if (!store.access_token) {
      return jsonResponse({ success: false, error: 'Store access token not configured' }, 400);
    }

    console.log(`[Import] Starting import for store: ${store.shop_domain}`);
    if (filterByTags.length > 0) {
      console.log(`[Import] Filtering by tags: ${filterByTags.join(', ')}`);
    }

    // Buscar todos os clientes do Shopify
    let allCustomers: any[];
    try {
      allCustomers = await fetchAllCustomers(store.shop_domain, store.access_token);
    } catch (shopifyError: any) {
      console.error('Shopify fetch error:', shopifyError);
      return jsonResponse({ 
        success: false, 
        error: `Erro ao buscar clientes do Shopify: ${shopifyError.message}` 
      }, 500);
    }
    
    // Filtrar por tags se especificado
    let customers = allCustomers;
    if (filterByTags.length > 0) {
      customers = allCustomers.filter(customer => {
        if (!customer.tags || typeof customer.tags !== 'string') return false;
        const customerTags = customer.tags.split(',').map((t: string) => t.trim().toLowerCase());
        return filterByTags.some((tag: string) => 
          customerTags.includes(tag.toLowerCase())
        );
      });
    }
    
    console.log(`[Import] Found ${allCustomers.length} total customers, ${customers.length} after filter`);

    const stats = {
      total: customers.length,
      totalInShopify: allCustomers.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      dealsCreated: 0,
    };

    // Tags para os contatos
    const contactTags = Array.from(new Set([
      ...(store.auto_tags || ['shopify']),
      ...tags,
      'shopify-import'
    ]));

    // Processar cada cliente
    for (const customer of customers) {
      try {
        const email = customer.email?.toLowerCase().trim() || null;
        const phone = normalizePhone(customer.phone);
        const name = buildCustomerName(customer);

        if (!email && !phone) {
          stats.skipped++;
          continue;
        }

        // Determinar tipo de contato
        let finalContactType: 'lead' | 'customer' = 'lead';
        if (contactType === 'customer') {
          finalContactType = 'customer';
        } else if (contactType === 'auto') {
          finalContactType = (customer.orders_count || 0) > 0 ? 'customer' : 'lead';
        }

        // Verificar se contato já existe
        let existingContact = null;
        
        if (email) {
          const { data } = await supabase
            .from('contacts')
            .select('*')
            .eq('organization_id', store.organization_id)
            .ilike('email', email)
            .maybeSingle();
          
          if (data) existingContact = data;
        }
        
        if (!existingContact && phone) {
          const { data } = await supabase
            .from('contacts')
            .select('*')
            .eq('organization_id', store.organization_id)
            .eq('phone', phone)
            .maybeSingle();
          
          if (data) existingContact = data;
        }

        let contactId: string;

        if (existingContact) {
          // Atualizar contato existente
          const updateData: Record<string, any> = {
            updated_at: new Date().toISOString(),
          };
          
          if (!existingContact.name || existingContact.name === 'Cliente Shopify') {
            updateData.name = name;
          }
          
          if (!existingContact.phone && phone) {
            updateData.phone = phone;
          }
          
          if (!existingContact.email && email) {
            updateData.email = email;
          }

          if (existingContact.type === 'lead' && finalContactType === 'customer') {
            updateData.type = 'customer';
          }

          const existingTags = existingContact.tags || [];
          updateData.tags = Array.from(new Set([...existingTags, ...contactTags]));

          updateData.metadata = {
            ...(existingContact.metadata || {}),
            shopify_id: String(customer.id),
            shopify_store: store.shop_domain,
            orders_count: customer.orders_count || 0,
            total_spent: customer.total_spent || '0',
            last_shopify_import: new Date().toISOString(),
          };

          await supabase
            .from('contacts')
            .update(updateData)
            .eq('id', existingContact.id);

          contactId = existingContact.id;
          stats.updated++;

        } else {
          // Criar novo contato
          const { data: newContact, error: insertError } = await supabase
            .from('contacts')
            .insert({
              organization_id: store.organization_id,
              name,
              email,
              phone,
              type: finalContactType,
              source: 'shopify',
              tags: contactTags,
              metadata: {
                shopify_id: String(customer.id),
                shopify_store: store.shop_domain,
                orders_count: customer.orders_count || 0,
                total_spent: customer.total_spent || '0',
                created_from_import: true,
                imported_at: new Date().toISOString(),
              },
            })
            .select('id')
            .single();

          if (insertError) {
            console.error('Error creating contact:', insertError);
            stats.errors++;
            continue;
          }

          contactId = newContact.id;
          stats.created++;
        }

        // Criar deal se solicitado
        if (createDeals && pipelineId && stageId && contactId) {
          const dealValue = parseFloat(customer.total_spent || '0');
          
          const { error: dealError } = await supabase
            .from('deals')
            .insert({
              organization_id: store.organization_id,
              contact_id: contactId,
              pipeline_id: pipelineId,
              stage_id: stageId,
              title: `${name} - Shopify`,
              value: dealValue,
              currency: 'BRL',
              source: 'shopify_import',
              metadata: {
                shopify_customer_id: String(customer.id),
                orders_count: customer.orders_count || 0,
                imported_at: new Date().toISOString(),
              },
            });
          
          if (!dealError) {
            stats.dealsCreated++;
          }
        }

      } catch (err) {
        console.error('Error processing customer:', customer.id, err);
        stats.errors++;
      }
    }

    // Atualizar estatísticas da loja
    try {
      await supabase
        .from('shopify_stores')
        .update({
          total_customers_imported: (store.total_customers_imported || 0) + stats.created,
          last_import_at: new Date().toISOString(),
        })
        .eq('id', storeId);
    } catch (updateErr) {
      console.error('Error updating store stats:', updateErr);
    }

    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log(`[Import] Completed in ${duration}s:`, stats);

    return jsonResponse({
      success: true,
      stats,
      duration,
      message: `Importação concluída! ${stats.created} novos, ${stats.updated} atualizados.`
    });

  } catch (error: any) {
    console.error('POST error:', error);
    return jsonResponse({ 
      success: false, 
      error: error.message || 'Erro interno do servidor'
    }, 500);
  }
}
