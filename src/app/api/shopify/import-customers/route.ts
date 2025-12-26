// =============================================
// API: Import Existing Customers from Shopify
// VERSÃO OTIMIZADA - Baseada em pesquisa de melhores práticas
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutos - Vercel Pro

const SHOPIFY_API_VERSION = '2024-10';

// =============================================
// Configurações de Performance
// =============================================
const CONFIG = {
  // Shopify permite 2 req/s (40 requests por 20 segundos)
  // Usamos 150ms para ficar seguro e maximizar throughput
  SHOPIFY_DELAY_MS: 150,
  
  // Batch sizes otimizados para Supabase REST API (limite 5MB payload)
  BATCH_INSERT_SIZE: 500,    // Bulk insert de novos contatos
  BATCH_UPDATE_SIZE: 50,     // Updates paralelos
  BATCH_DEAL_SIZE: 100,      // Bulk insert de deals
  
  // Limites de paginação
  MAX_SHOPIFY_PAGES: 100,    // ~25.000 clientes
  MAX_FILTER_PAGES: 15,      // ~3.750 clientes para amostragem de filtros
  
  // Concorrência para operações paralelas
  PARALLEL_UPDATES: 50,
};

// =============================================
// Helper: Create Supabase client
// =============================================
function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) return null;
  
  return createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: 'public' }
  });
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
// Helper: Sanitizar strings (prevenir XSS)
// =============================================
function sanitizeString(value: string | null | undefined): string | null {
  if (!value) return null;
  
  // Remove tags HTML e caracteres perigosos
  return value
    .replace(/<[^>]*>/g, '')           // Remove HTML tags
    .replace(/[<>"'&]/g, '')           // Remove caracteres perigosos
    .trim()
    .substring(0, 255);                // Limita tamanho
}

// =============================================
// Helper: Normalizar telefone (formato E.164)
// =============================================
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length < 8) return null;
  
  // Brasil: adiciona +55 se necessário
  if (digits.startsWith('55') && digits.length >= 12) {
    return `+${digits}`;
  }
  
  if (digits.length >= 10 && digits.length <= 11) {
    return `+55${digits}`;
  }
  
  return `+${digits}`;
}

// =============================================
// Helper: Normalizar email
// =============================================
function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  
  const normalized = email.toLowerCase().trim();
  
  // Validação básica de email
  if (!normalized.includes('@') || normalized.length > 255) {
    return null;
  }
  
  return normalized;
}

// =============================================
// Helper: Buscar clientes do Shopify com paginação otimizada
// =============================================
async function fetchShopifyCustomers(
  shopDomain: string, 
  accessToken: string,
  options: {
    maxPages?: number;
    fields?: string;
  } = {}
): Promise<any[]> {
  const { maxPages = CONFIG.MAX_SHOPIFY_PAGES, fields } = options;
  const allCustomers: any[] = [];
  
  let nextPageUrl: string | null = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/customers.json?limit=250${fields ? `&fields=${fields}` : ''}`;
  
  let pageCount = 0;
  
  console.log(`[Shopify] Starting fetch from ${shopDomain}`);
  
  while (nextPageUrl && pageCount < maxPages) {
    const response: Response = await fetch(nextPageUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // Verificar se é rate limit
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || '2';
        console.warn(`[Shopify] Rate limited, waiting ${retryAfter}s`);
        await new Promise(r => setTimeout(r, parseInt(retryAfter) * 1000));
        continue; // Retry same page
      }
      
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();
    allCustomers.push(...(data.customers || []));
    
    // Parse Link header para próxima página
    const linkHeader: string | null = response.headers.get('Link');
    nextPageUrl = null;
    
    if (linkHeader) {
      const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        nextPageUrl = nextMatch[1];
      }
    }
    
    pageCount++;
    
    // Log progresso a cada 10 páginas
    if (pageCount % 10 === 0) {
      console.log(`[Shopify] Fetched ${allCustomers.length} customers (${pageCount} pages)`);
    }
    
    // Delay para respeitar rate limit
    await new Promise(r => setTimeout(r, CONFIG.SHOPIFY_DELAY_MS));
  }
  
  console.log(`[Shopify] Completed: ${allCustomers.length} customers in ${pageCount} pages`);
  
  return allCustomers;
}

// =============================================
// Helper: Buscar filtros disponíveis (tags + email status)
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
  
  // Busca otimizada - apenas campos necessários
  const customers = await fetchShopifyCustomers(shopDomain, accessToken, {
    maxPages: CONFIG.MAX_FILTER_PAGES,
    fields: 'id,tags,email_marketing_consent,accepts_marketing'
  });
  
  for (const customer of customers) {
    // Processar tags
    if (customer.tags && typeof customer.tags === 'string') {
      const tags = customer.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
      tags.forEach((tag: string) => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    }
    
    // Processar status de email
    let emailStatus = 'not_subscribed';
    const consent = customer.email_marketing_consent;
    
    if (consent?.state) {
      emailStatus = consent.state;
    } else if (customer.accepts_marketing === true) {
      emailStatus = 'subscribed';
    }
    
    emailStatusCounts.set(emailStatus, (emailStatusCounts.get(emailStatus) || 0) + 1);
  }
  
  const emailStatusLabels: Record<string, string> = {
    'subscribed': 'Inscrito',
    'not_subscribed': 'Não inscrito',
    'unsubscribed': 'Inscrição cancelada',
    'pending': 'Pendente',
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
// Helper: Pré-carregar contatos existentes (1 query vs N)
// =============================================
async function loadExistingContacts(
  supabase: SupabaseClient,
  organizationId: string
): Promise<{
  byEmail: Map<string, any>;
  byPhone: Map<string, any>;
  byShopifyId: Map<string, any>;
}> {
  console.log(`[DB] Loading existing contacts for org ${organizationId}`);
  
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, email, phone, first_name, last_name, tags, shopify_customer_id')
    .eq('organization_id', organizationId);
  
  if (error) {
    console.error('[DB] Error loading contacts:', error);
    throw error;
  }
  
  // Criar Maps para lookup O(1)
  const byEmail = new Map<string, any>();
  const byPhone = new Map<string, any>();
  const byShopifyId = new Map<string, any>();
  
  for (const contact of (contacts || [])) {
    if (contact.email) {
      byEmail.set(contact.email.toLowerCase(), contact);
    }
    if (contact.phone) {
      byPhone.set(contact.phone, contact);
    }
    if (contact.shopify_customer_id) {
      byShopifyId.set(contact.shopify_customer_id, contact);
    }
  }
  
  console.log(`[DB] Loaded ${contacts?.length || 0} existing contacts`);
  
  return { byEmail, byPhone, byShopifyId };
}

// =============================================
// Helper: Bulk insert com retry
// =============================================
async function bulkInsertContacts(
  supabase: SupabaseClient,
  contacts: any[],
  batchSize: number = CONFIG.BATCH_INSERT_SIZE
): Promise<{ inserted: any[]; errors: string[] }> {
  const inserted: any[] = [];
  const errors: string[] = [];
  
  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize);
    
    try {
      const { data, error } = await supabase
        .from('contacts')
        .insert(batch)
        .select('id, shopify_customer_id');
      
      if (error) {
        console.error(`[DB] Batch insert error (${i}-${i + batchSize}):`, error.message);
        errors.push(`Batch ${i / batchSize}: ${error.message}`);
      } else {
        inserted.push(...(data || []));
      }
    } catch (err: any) {
      errors.push(`Batch ${i / batchSize}: ${err.message}`);
    }
    
    // Log progresso
    if ((i + batchSize) % 1000 === 0 || i + batchSize >= contacts.length) {
      console.log(`[DB] Inserted ${Math.min(i + batchSize, contacts.length)}/${contacts.length}`);
    }
  }
  
  return { inserted, errors };
}

// =============================================
// Helper: Parallel updates
// =============================================
async function parallelUpdateContacts(
  supabase: SupabaseClient,
  updates: { id: string; data: any }[],
  concurrency: number = CONFIG.PARALLEL_UPDATES
): Promise<{ updated: number; errors: string[] }> {
  let updated = 0;
  const errors: string[] = [];
  
  for (let i = 0; i < updates.length; i += concurrency) {
    const batch = updates.slice(i, i + concurrency);
    
    const promises = batch.map(({ id, data }) =>
      supabase.from('contacts').update(data).eq('id', id)
    );
    
    const results = await Promise.allSettled(promises);
    
    for (const result of results) {
      if (result.status === 'fulfilled' && !result.value.error) {
        updated++;
      } else {
        const errMsg = result.status === 'rejected' 
          ? result.reason?.message 
          : result.value?.error?.message;
        if (errMsg) errors.push(errMsg);
      }
    }
    
    // Log progresso
    if ((i + concurrency) % 500 === 0 || i + concurrency >= updates.length) {
      console.log(`[DB] Updated ${Math.min(i + concurrency, updates.length)}/${updates.length}`);
    }
  }
  
  return { updated, errors };
}

// =============================================
// Helper: Bulk insert deals
// =============================================
async function bulkInsertDeals(
  supabase: SupabaseClient,
  deals: any[],
  batchSize: number = CONFIG.BATCH_DEAL_SIZE
): Promise<number> {
  let inserted = 0;
  
  for (let i = 0; i < deals.length; i += batchSize) {
    const batch = deals.slice(i, i + batchSize);
    
    const { data, error } = await supabase
      .from('deals')
      .insert(batch)
      .select('id');
    
    if (!error) {
      inserted += data?.length || 0;
    }
  }
  
  return inserted;
}

// =============================================
// GET: Buscar contagem e filtros disponíveis
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

    if (error || !store?.access_token) {
      return jsonResponse({ success: false, error: 'Store not found or not configured' }, 404);
    }

    // Buscar contagem total
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
      return jsonResponse({ 
        success: false, 
        error: `Shopify error: ${countResponse.status}` 
      }, 500);
    }

    const countData = await countResponse.json();
    
    // Buscar filtros se solicitado
    let availableTags: { tag: string; count: number }[] = [];
    let emailStatusOptions: { status: string; label: string; count: number }[] = [];
    
    if (includeTags) {
      try {
        const filters = await fetchCustomerFilters(store.shop_domain, store.access_token);
        availableTags = filters.tags;
        emailStatusOptions = filters.emailStatus;
      } catch (err) {
        console.error('[Filters] Error:', err);
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
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// =============================================
// POST: Executar importação otimizada
// =============================================
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return jsonResponse({ success: false, error: 'Database not configured' }, 503);
    }

    // Parse body com validação
    let body;
    try {
      body = await request.json();
    } catch {
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
      filterByEmailStatus = []
    } = body;

    if (!storeId) {
      return jsonResponse({ success: false, error: 'storeId required' }, 400);
    }

    // Buscar loja
    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('id', storeId)
      .single();

    if (storeError || !store?.access_token) {
      return jsonResponse({ success: false, error: 'Store not found' }, 404);
    }

    console.log(`[Import] Starting for ${store.shop_domain}`);
    console.log(`[Import] Filters - Tags: ${filterByTags.length}, Email: ${filterByEmailStatus.length}`);

    // =============================================
    // FASE 1: Buscar clientes do Shopify
    // =============================================
    const allCustomers = await fetchShopifyCustomers(store.shop_domain, store.access_token);
    
    // Aplicar filtros
    let customers = allCustomers;
    
    if (filterByTags.length > 0) {
      customers = customers.filter(c => {
        if (!c.tags) return false;
        const cTags = c.tags.split(',').map((t: string) => t.trim().toLowerCase());
        return filterByTags.some((tag: string) => cTags.includes(tag.toLowerCase()));
      });
    }
    
    if (filterByEmailStatus.length > 0) {
      customers = customers.filter(c => {
        let status = 'not_subscribed';
        if (c.email_marketing_consent?.state) {
          status = c.email_marketing_consent.state;
        } else if (c.accepts_marketing === true) {
          status = 'subscribed';
        }
        return filterByEmailStatus.includes(status);
      });
    }

    console.log(`[Import] ${allCustomers.length} total -> ${customers.length} after filters`);

    // Stats
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

    if (customers.length === 0) {
      return jsonResponse({
        success: true,
        stats,
        duration: Math.round((Date.now() - startTime) / 1000),
        message: 'Nenhum cliente encontrado com os filtros selecionados'
      });
    }

    // =============================================
    // FASE 2: Pré-carregar contatos existentes (1 query!)
    // =============================================
    const existingContacts = await loadExistingContacts(supabase, store.organization_id);

    // =============================================
    // FASE 3: Separar novos vs existentes
    // =============================================
    const contactTags = Array.from(new Set([
      ...(store.auto_tags || ['shopify']),
      ...tags,
      'shopify-import'
    ]));

    const toCreate: any[] = [];
    const toUpdate: { id: string; data: any }[] = [];
    const shopifyIdToContactId = new Map<string, string>();

    for (const customer of customers) {
      // Sanitizar dados
      const email = normalizeEmail(customer.email);
      const phone = normalizePhone(customer.phone);
      const firstName = sanitizeString(customer.first_name);
      const lastName = sanitizeString(customer.last_name);
      const shopifyId = String(customer.id);

      // Pular se não tem email nem telefone
      if (!email && !phone) {
        stats.skipped++;
        continue;
      }

      // Lookup O(1) - muito mais rápido que query individual
      const existing = 
        existingContacts.byShopifyId.get(shopifyId) ||
        (email ? existingContacts.byEmail.get(email) : null) ||
        (phone ? existingContacts.byPhone.get(phone) : null);

      if (existing) {
        // Preparar update
        const updateData: Record<string, any> = {
          updated_at: new Date().toISOString(),
          shopify_customer_id: shopifyId,
          total_orders: customer.orders_count || 0,
          total_spent: parseFloat(customer.total_spent || '0'),
        };
        
        if (!existing.first_name && firstName) updateData.first_name = firstName;
        if (!existing.last_name && lastName) updateData.last_name = lastName;
        if (!existing.phone && phone) updateData.phone = phone;
        if (!existing.email && email) updateData.email = email;

        // Merge tags
        const existingTags = existing.tags || [];
        updateData.tags = Array.from(new Set([...existingTags, ...contactTags]));

        toUpdate.push({ id: existing.id, data: updateData });
        shopifyIdToContactId.set(shopifyId, existing.id);
        
      } else {
        // Preparar insert
        toCreate.push({
          organization_id: store.organization_id,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          source: 'shopify',
          shopify_customer_id: shopifyId,
          total_orders: customer.orders_count || 0,
          total_spent: parseFloat(customer.total_spent || '0'),
          tags: contactTags,
          custom_fields: {
            shopify_store: store.shop_domain,
            imported_at: new Date().toISOString(),
          },
        });
      }
    }

    console.log(`[Import] To create: ${toCreate.length}, To update: ${toUpdate.length}`);

    // =============================================
    // FASE 4: Bulk insert novos contatos
    // =============================================
    if (toCreate.length > 0) {
      const { inserted, errors } = await bulkInsertContacts(supabase, toCreate);
      stats.created = inserted.length;
      stats.errorDetails.push(...errors);
      stats.errors += errors.length;
      
      // Mapear IDs criados para deals
      for (const contact of inserted) {
        if (contact.shopify_customer_id) {
          shopifyIdToContactId.set(contact.shopify_customer_id, contact.id);
        }
      }
    }

    // =============================================
    // FASE 5: Parallel updates
    // =============================================
    if (toUpdate.length > 0) {
      const { updated, errors } = await parallelUpdateContacts(supabase, toUpdate);
      stats.updated = updated;
      stats.errorDetails.push(...errors);
      stats.errors += errors.length;
    }

    // =============================================
    // FASE 6: Bulk insert deals
    // =============================================
    if (createDeals && pipelineId && stageId) {
      const dealsToCreate: any[] = [];
      
      for (const customer of customers) {
        const shopifyId = String(customer.id);
        const contactId = shopifyIdToContactId.get(shopifyId);
        
        if (contactId) {
          const firstName = sanitizeString(customer.first_name) || '';
          const lastName = sanitizeString(customer.last_name) || '';
          const dealName = [firstName, lastName].filter(Boolean).join(' ') || 'Cliente Shopify';
          
          dealsToCreate.push({
            organization_id: store.organization_id,
            contact_id: contactId,
            pipeline_id: pipelineId,
            stage_id: stageId,
            title: `${dealName} - Shopify`,
            value: parseFloat(customer.total_spent || '0'),
            currency: 'BRL',
            tags: ['shopify-import'],
          });
        }
      }
      
      if (dealsToCreate.length > 0) {
        stats.dealsCreated = await bulkInsertDeals(supabase, dealsToCreate);
        console.log(`[Import] Created ${stats.dealsCreated} deals`);
      }
    }

    // =============================================
    // FASE 7: Atualizar estatísticas da loja
    // =============================================
    await supabase
      .from('shopify_stores')
      .update({
        total_customers_imported: (store.total_customers_imported || 0) + stats.created,
        last_import_at: new Date().toISOString(),
      })
      .eq('id', storeId);

    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log(`[Import] Completed in ${duration}s:`, {
      created: stats.created,
      updated: stats.updated,
      skipped: stats.skipped,
      errors: stats.errors
    });

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
