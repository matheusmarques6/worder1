// =============================================
// CRON: Shopify Import Worker (V2 - Otimizado)
// /src/app/api/cron/shopify-import-worker/route.ts
//
// Processa jobs de importação em lotes
// Chamado a cada 1 minuto pelo cron
//
// IMPORTANTE: NÃO carrega todos contatos em memória!
// Usa lookup por batch (shopify_customer_id IN (...))
// para escalar com lojas de 100k+ clientes.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 55; // 55 segundos (margem de segurança)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const SHOPIFY_API_VERSION = '2025-01';
const CUSTOMERS_PER_PAGE = 250;
const MAX_PAGES_PER_RUN = 6; // ~1500 clientes por execução
const MAX_EXECUTION_TIME_MS = 50000; // 50 segundos máximo

function jsonResponse(data: any, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// =============================================
// GET/POST: Processar jobs pendentes
// =============================================

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('[ImportWorker] Starting...');

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Buscar job pendente ou em andamento (mais antigo primeiro)
    const { data: job, error: jobError } = await supabase
      .from('shopify_import_jobs')
      .select('*')
      .in('status', ['pending', 'running'])
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (jobError || !job) {
      return jsonResponse({
        success: true,
        message: 'No pending jobs',
        duration: Date.now() - startTime,
      });
    }

    console.log(`[ImportWorker] Processing job ${job.id}, status: ${job.status}, progress: ${job.processed_count}/${job.total_customers}`);

    // Buscar store
    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('shop_domain, access_token, organization_id')
      .eq('id', job.store_id)
      .single();

    if (storeError || !store?.access_token) {
      await markJobFailed(supabase, job.id, 'Store não encontrada ou sem acesso');
      return jsonResponse({ success: false, error: 'Store not found' }, 404);
    }

    // Marcar como running
    if (job.status === 'pending') {
      await supabase
        .from('shopify_import_jobs')
        .update({ 
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .eq('id', job.id);
    }

    // Processar lotes
    const result = await processJobBatch(supabase, job, store, startTime);

    // Atualizar job
    const updateData: any = {
      processed_count: job.processed_count + result.processed,
      created_count: job.created_count + result.created,
      updated_count: job.updated_count + result.updated,
      skipped_count: job.skipped_count + result.skipped,
      error_count: job.error_count + result.errors,
      deals_created_count: job.deals_created_count + result.dealsCreated,
      current_page: job.current_page + result.pagesProcessed,
      last_cursor: result.nextCursor,
      last_processed_at: new Date().toISOString(),
    };

    if (result.isComplete) {
      updateData.status = 'completed';
      updateData.completed_at = new Date().toISOString();
    }

    // Log de execução
    const logEntry = {
      ts: new Date().toISOString(),
      pg: job.current_page + result.pagesProcessed,
      p: result.processed,
      c: result.created,
      u: result.updated,
      e: result.errors,
    };
    
    const currentLog = Array.isArray(job.processing_log) ? job.processing_log : [];
    updateData.processing_log = [...currentLog.slice(-30), logEntry];

    await supabase
      .from('shopify_import_jobs')
      .update(updateData)
      .eq('id', job.id);

    const duration = Date.now() - startTime;
    console.log(`[ImportWorker] Job ${job.id}: +${result.processed} processed, +${result.created} created, +${result.updated} updated, complete: ${result.isComplete}, ${duration}ms`);

    return jsonResponse({
      success: true,
      jobId: job.id,
      processed: result.processed,
      created: result.created,
      updated: result.updated,
      isComplete: result.isComplete,
      duration,
    });

  } catch (error: any) {
    console.error('[ImportWorker] Error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}

// =============================================
// Processar lote de clientes (OTIMIZADO)
// =============================================

async function processJobBatch(supabase: any, job: any, store: any, startTime: number) {
  const config = job.config || {};
  const result = {
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    dealsCreated: 0,
    pagesProcessed: 0,
    nextCursor: job.last_cursor as string | null,
    isComplete: false,
  };

  const contactTags = Array.from(new Set([...(config.tags || ['shopify']), 'shopify-import']));

  try {
    // Construir URL inicial ou continuar de onde parou
    let nextPageUrl: string | null = job.last_cursor 
      ? `https://${store.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/customers.json?limit=${CUSTOMERS_PER_PAGE}&page_info=${job.last_cursor}`
      : `https://${store.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/customers.json?limit=${CUSTOMERS_PER_PAGE}`;

    for (let page = 0; page < MAX_PAGES_PER_RUN && nextPageUrl; page++) {
      // Verificar tempo de execução
      if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
        console.log('[ImportWorker] Time limit reached, will continue next run');
        break;
      }

      console.log(`[ImportWorker] Page ${job.current_page + page + 1}...`);

      // Fetch da Shopify
      const response: Response = await fetch(nextPageUrl, {
        headers: {
          'X-Shopify-Access-Token': store.access_token,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After') || '2';
          console.warn(`[ImportWorker] Rate limited, waiting ${retryAfter}s`);
          await new Promise(r => setTimeout(r, parseInt(retryAfter) * 1000));
          continue;
        }
        throw new Error(`Shopify API error: ${response.status}`);
      }

      const data = await response.json();
      const customers = data.customers || [];

      if (customers.length === 0) {
        result.isComplete = true;
        break;
      }

      // Aplicar filtros se configurados
      let filteredCustomers = customers;
      if (config.filterTags?.length > 0) {
        filteredCustomers = filteredCustomers.filter((c: any) => {
          if (!c.tags) return false;
          const cTags = c.tags.split(',').map((t: string) => t.trim().toLowerCase());
          return config.filterTags.some((tag: string) => cTags.includes(tag.toLowerCase()));
        });
      }

      // =============================================
      // LOOKUP POR BATCH (não carrega tudo!)
      // =============================================
      const shopifyIds = filteredCustomers.map((c: any) => String(c.id));
      const emails = filteredCustomers
        .map((c: any) => normalizeEmail(c.email))
        .filter(Boolean) as string[];
      const phones = filteredCustomers
        .map((c: any) => normalizePhone(c.phone))
        .filter(Boolean) as string[];

      // Buscar existentes apenas para este batch
      const existingByShopifyId = new Map<string, any>();
      const existingByEmail = new Map<string, any>();
      const existingByPhone = new Map<string, any>();

      // Query 1: Por shopify_customer_id (mais preciso)
      if (shopifyIds.length > 0) {
        const { data: byShopify } = await supabase
          .from('contacts')
          .select('id, email, phone, first_name, last_name, tags, shopify_customer_id, store_id')
          .eq('organization_id', store.organization_id)
          .in('shopify_customer_id', shopifyIds);
        
        for (const c of (byShopify || [])) {
          if (c.shopify_customer_id) {
            existingByShopifyId.set(c.shopify_customer_id, c);
          }
        }
      }

      // Query 2: Por email (fallback para os que não bateram)
      const unmatchedEmails = emails.filter(e => {
        const cust = filteredCustomers.find((c: any) => normalizeEmail(c.email) === e);
        return cust && !existingByShopifyId.has(String(cust.id));
      });

      if (unmatchedEmails.length > 0) {
        const { data: byEmail } = await supabase
          .from('contacts')
          .select('id, email, phone, first_name, last_name, tags, shopify_customer_id, store_id')
          .eq('organization_id', store.organization_id)
          .in('email', unmatchedEmails);
        
        for (const c of (byEmail || [])) {
          if (c.email && !existingByShopifyId.has(c.shopify_customer_id)) {
            existingByEmail.set(c.email.toLowerCase(), c);
          }
        }
      }

      // Query 3: Por phone (fallback final)
      const unmatchedPhones = phones.filter(p => {
        const cust = filteredCustomers.find((c: any) => normalizePhone(c.phone) === p);
        if (!cust) return false;
        const email = normalizeEmail(cust.email);
        return !existingByShopifyId.has(String(cust.id)) && 
               (!email || !existingByEmail.has(email));
      });

      if (unmatchedPhones.length > 0) {
        const { data: byPhone } = await supabase
          .from('contacts')
          .select('id, email, phone, first_name, last_name, tags, shopify_customer_id, store_id')
          .eq('organization_id', store.organization_id)
          .in('phone', unmatchedPhones);
        
        for (const c of (byPhone || [])) {
          if (c.phone) {
            existingByPhone.set(c.phone, c);
          }
        }
      }

      // =============================================
      // Processar clientes
      // =============================================
      const toCreate: any[] = [];
      const toUpdate: { id: string; data: any }[] = [];
      const contactIdByShopifyId = new Map<string, string>();

      for (const customer of filteredCustomers) {
        const email = normalizeEmail(customer.email);
        const phone = normalizePhone(customer.phone);
        const firstName = sanitizeString(customer.first_name);
        const lastName = sanitizeString(customer.last_name);
        const shopifyId = String(customer.id);

        if (!email && !phone) {
          result.skipped++;
          continue;
        }

        // Encontrar contato existente (prioridade: shopify_id > email > phone)
        const existing = 
          existingByShopifyId.get(shopifyId) ||
          (email ? existingByEmail.get(email) : null) ||
          (phone ? existingByPhone.get(phone) : null);

        if (existing) {
          // Update
          const updateData: Record<string, any> = {
            updated_at: new Date().toISOString(),
            shopify_customer_id: shopifyId,
            total_orders: customer.orders_count || 0,
            total_spent: parseFloat(customer.total_spent || '0'),
            store_id: existing.store_id || job.store_id,
          };
          
          if (!existing.first_name && firstName) updateData.first_name = firstName;
          if (!existing.last_name && lastName) updateData.last_name = lastName;
          if (!existing.phone && phone) updateData.phone = phone;
          if (!existing.email && email) updateData.email = email;
          
          // Merge tags
          const newTags = Array.from(new Set([...(existing.tags || []), ...contactTags]));
          if (JSON.stringify(newTags.sort()) !== JSON.stringify((existing.tags || []).sort())) {
            updateData.tags = newTags;
          }

          toUpdate.push({ id: existing.id, data: updateData });
          contactIdByShopifyId.set(shopifyId, existing.id);
        } else {
          // Create
          toCreate.push({
            organization_id: store.organization_id,
            store_id: job.store_id,
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

      // =============================================
      // Bulk operations
      // =============================================
      
      // Insert novos
      if (toCreate.length > 0) {
        const { data: inserted, error: insertError } = await supabase
          .from('contacts')
          .insert(toCreate)
          .select('id, shopify_customer_id');

        if (insertError) {
          console.error('[ImportWorker] Insert error:', insertError.message);
          result.errors += toCreate.length;
        } else {
          result.created += inserted?.length || 0;
          for (const c of (inserted || [])) {
            if (c.shopify_customer_id) {
              contactIdByShopifyId.set(c.shopify_customer_id, c.id);
            }
          }
        }
      }

      // Update existentes (em paralelo com limite)
      if (toUpdate.length > 0) {
        const updatePromises = toUpdate.map(({ id, data }) => 
          supabase.from('contacts').update(data).eq('id', id)
        );
        
        const updateResults = await Promise.allSettled(updatePromises);
        for (const r of updateResults) {
          if (r.status === 'fulfilled' && !r.value.error) {
            result.updated++;
          } else {
            result.errors++;
          }
        }
      }

      // Criar deals se configurado
      if (config.createDeals && config.pipelineId && config.stageId && contactIdByShopifyId.size > 0) {
        const deals = Array.from(contactIdByShopifyId.entries()).map(([shopifyId, contactId]) => {
          const customer = filteredCustomers.find((c: any) => String(c.id) === shopifyId);
          const name = customer ? 
            [sanitizeString(customer.first_name), sanitizeString(customer.last_name)].filter(Boolean).join(' ') || 'Cliente Shopify' :
            'Cliente Shopify';
          
          return {
            organization_id: store.organization_id,
            store_id: job.store_id,
            contact_id: contactId,
            pipeline_id: config.pipelineId,
            stage_id: config.stageId,
            title: `${name} - Shopify`,
            value: parseFloat(customer?.total_spent || '0'),
            currency: 'BRL',
            tags: ['shopify-import'],
          };
        });

        if (deals.length > 0) {
          const { data: createdDeals, error: dealsError } = await supabase
            .from('deals')
            .insert(deals)
            .select('id');
          
          if (!dealsError) {
            result.dealsCreated += createdDeals?.length || 0;
          }
        }
      }

      result.processed += customers.length;
      result.pagesProcessed++;

      // Extrair cursor para próxima página
      const linkHeader = response.headers.get('Link');
      nextPageUrl = null;
      result.nextCursor = null;

      if (linkHeader) {
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (nextMatch) {
          nextPageUrl = nextMatch[1];
          const pageInfoMatch = nextPageUrl.match(/page_info=([^&]+)/);
          if (pageInfoMatch) {
            result.nextCursor = pageInfoMatch[1];
          }
        }
      }

      // Se não há próxima página, terminou
      if (!result.nextCursor) {
        result.isComplete = true;
        break;
      }

      // Delay entre páginas (respeitar rate limit)
      await new Promise(r => setTimeout(r, 100));
    }

  } catch (error: any) {
    console.error('[ImportWorker] Batch error:', error);
    result.errors++;
  }

  return result;
}

// =============================================
// Helpers
// =============================================

async function markJobFailed(supabase: any, jobId: string, error: string) {
  await supabase
    .from('shopify_import_jobs')
    .update({
      status: 'failed',
      last_error: error,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

function sanitizeString(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/<[^>]*>/g, '').replace(/[<>"'&]/g, '').trim().substring(0, 255);
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 11) return `+55${digits}`;
  return `+${digits}`;
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = email.toLowerCase().trim();
  if (!normalized.includes('@') || normalized.length > 255) return null;
  return normalized;
}
