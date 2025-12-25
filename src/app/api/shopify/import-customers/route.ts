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
// Helper: Buscar todas as tags E status de email marketing
// =============================================
async function fetchCustomerFilters(
  shopDomain: string,
  accessToken: string
): Promise<{
  tags: { tag: string; count: number }[];
  emailStatus: { status: string; label: string; count: number }[];
}> {
  const tagCounts = new Map<string, number>();
  const emailStatusCounts = new Map<string, number>();
  
  let nextPageUrl: string | null = 
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/customers.json?limit=250&fields=id,tags,email_marketing_consent`;
  
  let pageCount = 0;
  const maxPages = 100;
  let customersChecked = 0;
  
  console.log(`[Filters] Starting filter fetch for ${shopDomain}`);
  
  while (nextPageUrl && pageCount < maxPages) {
    const currentUrl: string = nextPageUrl;
    
    const response: Response = await fetch(currentUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[Filters] API error on page ${pageCount}: ${response.status}`);
      break;
    }

    const data = await response.json();
    const customers = data.customers || [];
    customersChecked += customers.length;
    
    for (const customer of customers) {
      // Processar tags
      if (customer.tags && typeof customer.tags === 'string' && customer.tags.trim()) {
        const tags = customer.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
        tags.forEach((tag: string) => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      }
      
      // Processar status de email marketing
      const emailConsent = customer.email_marketing_consent;
      let emailStatus = 'not_subscribed';
      
      if (emailConsent && emailConsent.state) {
        emailStatus = emailConsent.state;
      } else if (customer.accepts_marketing === true) {
        emailStatus = 'subscribed';
      } else if (customer.accepts_marketing === false) {
        emailStatus = 'not_subscribed';
      }
      
      emailStatusCounts.set(emailStatus, (emailStatusCounts.get(emailStatus) || 0) + 1);
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
    
    if (pageCount % 10 === 0) {
      console.log(`[Filters] Checked ${customersChecked} customers, found ${tagCounts.size} tags, ${emailStatusCounts.size} email statuses`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  
  console.log(`[Filters] Completed: ${customersChecked} customers, ${tagCounts.size} tags, ${emailStatusCounts.size} email statuses`);
  
  // Labels em português para status de email
  const emailStatusLabels: Record<string, string> = {
    'subscribed': 'Inscrito',
    'not_subscribed': 'Não inscrito',
    'unsubscribed': 'Inscrição cancelada',
    'pending': 'Pendente',
    'invalid': 'Inválido',
  };
  
  return {
    tags: Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count),
    emailStatus: Array.from(emailStatusCounts.entries())
      .map(([status, count]) => ({ 
        status, 
        label: emailStatusLabels[status] || status,
        count 
      }))
      .sort((a, b) => b.count - a.count),
  };
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
    
    // Se solicitado, buscar filtros (tags e email status)
    let availableTags: { tag: string; count: number }[] = [];
    let emailStatusOptions: { status: string; label: string; count: number }[] = [];
    
    if (includeTags) {
      try {
        const filters = await fetchCustomerFilters(store.shop_domain, store.access_token);
        availableTags = filters.tags;
        emailStatusOptions = filters.emailStatus;
      } catch (filterError) {
        console.error('Error fetching filters:', filterError);
      }
    }
    
    return jsonResponse({
      success: true,
      count: countData.count || 0,
      storeName: store.shop_name || store.shop_domain,
      availableTags,
      emailStatusOptions,
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
      filterByTags = [],
      filterByEmailStatus = []  // Status de email marketing para filtrar
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
    if (filterByEmailStatus.length > 0) {
      console.log(`[Import] Filtering by email status: ${filterByEmailStatus.join(', ')}`);
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
      customers = customers.filter(customer => {
        if (!customer.tags || typeof customer.tags !== 'string') return false;
        const customerTags = customer.tags.split(',').map((t: string) => t.trim().toLowerCase());
        return filterByTags.some((tag: string) => 
          customerTags.includes(tag.toLowerCase())
        );
      });
    }
    
    // Filtrar por status de email se especificado
    if (filterByEmailStatus.length > 0) {
      customers = customers.filter(customer => {
        const emailConsent = customer.email_marketing_consent;
        let emailStatus = 'not_subscribed';
        
        if (emailConsent && emailConsent.state) {
          emailStatus = emailConsent.state;
        } else if (customer.accepts_marketing === true) {
          emailStatus = 'subscribed';
        } else if (customer.accepts_marketing === false) {
          emailStatus = 'not_subscribed';
        }
        
        return filterByEmailStatus.includes(emailStatus);
      });
    }
    
    console.log(`[Import] Found ${allCustomers.length} total customers, ${customers.length} after filters`);

    const stats = {
      total: customers.length,
      totalInShopify: allCustomers.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      dealsCreated: 0,
      errorDetails: [] as string[],
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
        const firstName = customer.first_name?.trim() || null;
        const lastName = customer.last_name?.trim() || null;

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
          
          if (!existingContact.first_name && firstName) {
            updateData.first_name = firstName;
          }
          
          if (!existingContact.last_name && lastName) {
            updateData.last_name = lastName;
          }
          
          if (!existingContact.phone && phone) {
            updateData.phone = phone;
          }
          
          if (!existingContact.email && email) {
            updateData.email = email;
          }

          // Atualizar campos do Shopify
          updateData.shopify_customer_id = String(customer.id);
          updateData.total_orders = customer.orders_count || 0;
          updateData.total_spent = parseFloat(customer.total_spent || '0');

          // Merge tags
          const existingTags = existingContact.tags || [];
          updateData.tags = Array.from(new Set([...existingTags, ...contactTags]));

          const { error: updateError } = await supabase
            .from('contacts')
            .update(updateData)
            .eq('id', existingContact.id);

          if (updateError) {
            console.error('Error updating contact:', updateError);
            stats.errors++;
            stats.errorDetails.push(`Update: ${updateError.message}`);
            continue;
          }

          contactId = existingContact.id;
          stats.updated++;

        } else {
          // Criar novo contato
          const { data: newContact, error: insertError } = await supabase
            .from('contacts')
            .insert({
              organization_id: store.organization_id,
              first_name: firstName,
              last_name: lastName,
              email,
              phone,
              source: 'shopify',
              shopify_customer_id: String(customer.id),
              total_orders: customer.orders_count || 0,
              total_spent: parseFloat(customer.total_spent || '0'),
              tags: contactTags,
              custom_fields: {
                shopify_store: store.shop_domain,
                created_from_import: true,
                imported_at: new Date().toISOString(),
              },
            })
            .select('id')
            .single();

          if (insertError) {
            console.error('Error creating contact:', {
              message: insertError.message,
              details: insertError.details,
              hint: insertError.hint,
              code: insertError.code,
              customer_email: email,
              customer_phone: phone,
            });
            stats.errors++;
            stats.errorDetails.push(`Insert: ${insertError.message}`);
            continue;
          }

          contactId = newContact.id;
          stats.created++;
        }

        // Criar deal se solicitado
        if (createDeals && pipelineId && stageId && contactId) {
          const dealValue = parseFloat(customer.total_spent || '0');
          const dealName = [firstName, lastName].filter(Boolean).join(' ') || 'Cliente Shopify';
          
          const { error: dealError } = await supabase
            .from('deals')
            .insert({
              organization_id: store.organization_id,
              contact_id: contactId,
              pipeline_id: pipelineId,
              stage_id: stageId,
              title: `${dealName} - Shopify`,
              value: dealValue,
              currency: 'BRL',
              tags: ['shopify-import'],
            });
          
          if (!dealError) {
            stats.dealsCreated++;
          }
        }

      } catch (err: any) {
        console.error('Error processing customer:', customer.id, err.message);
        stats.errors++;
        stats.errorDetails.push(`Customer ${customer.id}: ${err.message}`);
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
