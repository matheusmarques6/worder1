// =============================================
// API: Import Existing Customers from Shopify
// src/app/api/shopify/import-customers/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutos para Vercel Pro

const SHOPIFY_API_VERSION = '2024-10';

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
  const maxPages = 40; // Safety limit - 10.000 clientes max
  
  while (nextPageUrl && pageCount < maxPages) {
    const currentUrl = nextPageUrl;
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
    
    // Verificar próxima página via Link header
    const linkHeader = response.headers.get('Link');
    nextPageUrl = null;
    
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        nextPageUrl = nextMatch[1];
      }
    }
    
    pageCount++;
    
    // Rate limiting - Shopify permite 2 req/seg
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return allCustomers;
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
// POST: Executar importação de clientes
// =============================================
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const body = await request.json();
    const { 
      storeId, 
      pipelineId, 
      stageId, 
      contactType = 'auto',
      createDeals = false,
      tags = []
    } = body;

    if (!storeId) {
      return NextResponse.json({ error: 'storeId required' }, { status: 400 });
    }

    // Buscar configuração da loja
    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('id', storeId)
      .single();

    if (storeError || !store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    console.log(`[Import] Starting import for store: ${store.shop_domain}`);

    // Buscar todos os clientes do Shopify
    const customers = await fetchAllCustomers(store.shop_domain, store.access_token);
    
    console.log(`[Import] Found ${customers.length} customers in Shopify`);

    const stats = {
      total: customers.length,
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
    ])); // Remover duplicatas

    // Processar cada cliente
    for (const customer of customers) {
      try {
        const email = customer.email?.toLowerCase().trim() || null;
        const phone = normalizePhone(customer.phone);
        const name = buildCustomerName(customer);

        // Verificar se tem email ou telefone
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
          
          // Atualizar nome se estava vazio
          if (!existingContact.name || existingContact.name === 'Cliente Shopify') {
            updateData.name = name;
          }
          
          // Atualizar telefone se estava vazio
          if (!existingContact.phone && phone) {
            updateData.phone = phone;
          }
          
          // Atualizar email se estava vazio
          if (!existingContact.email && email) {
            updateData.email = email;
          }

          // Converter lead -> customer se aplicável
          if (existingContact.type === 'lead' && finalContactType === 'customer') {
            updateData.type = 'customer';
          }

          // Merge tags
          const existingTags = existingContact.tags || [];
          updateData.tags = Array.from(new Set([...existingTags, ...contactTags]));

          // Atualizar metadata
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
    await supabase
      .from('shopify_stores')
      .update({
        total_customers_imported: (store.total_customers_imported || 0) + stats.created,
        last_import_at: new Date().toISOString(),
      })
      .eq('id', storeId);

    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log(`[Import] Completed in ${duration}s:`, stats);

    return NextResponse.json({
      success: true,
      stats,
      duration,
      message: `Importação concluída! ${stats.created} novos, ${stats.updated} atualizados.`
    });

  } catch (error: any) {
    console.error('Import error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}

// =============================================
// GET: Buscar contagem de clientes disponíveis
// =============================================
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const { data: store, error } = await supabase
      .from('shopify_stores')
      .select('shop_domain, access_token, shop_name')
      .eq('id', storeId)
      .single();

    if (error || !store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Buscar contagem de clientes no Shopify
    const response = await fetch(
      `https://${store.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/customers/count.json`,
      {
        headers: {
          'X-Shopify-Access-Token': store.access_token,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      count: data.count || 0,
      storeName: store.shop_name || store.shop_domain,
    });

  } catch (error: any) {
    console.error('Error fetching customer count:', error);
    return NextResponse.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
}
