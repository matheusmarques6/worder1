// =============================================
// Shopify Pixel Management API
// src/app/api/shopify/pixel/route.ts
//
// POST: Instalar pixel na loja
// GET: Verificar status do pixel
// DELETE: Remover pixel
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const SHOPIFY_API_VERSION = '2024-01';

// =============================================
// POST - Instalar pixel na loja Shopify
// =============================================
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  
  try {
    const { organizationId, storeId } = await request.json();
    
    if (!organizationId && !storeId) {
      return NextResponse.json({ error: 'organizationId or storeId required' }, { status: 400 });
    }
    
    // Buscar loja
    let query = supabase.from('shopify_stores').select('*');
    if (storeId) {
      query = query.eq('id', storeId);
    } else {
      query = query.eq('organization_id', organizationId).eq('is_active', true);
    }
    
    const { data: store, error: storeError } = await query.maybeSingle();
    
    if (storeError || !store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }
    
    if (!store.access_token) {
      return NextResponse.json({ error: 'Store has no access token' }, { status: 400 });
    }
    
    // URL do script de tracking
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const scriptUrl = `${appUrl}/api/shopify/track?shop=${store.shop_domain}`;
    
    // Verificar se já existe um script instalado
    const listResponse = await fetch(
      `https://${store.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/script_tags.json`,
      {
        headers: {
          'X-Shopify-Access-Token': store.access_token,
        },
      }
    );
    
    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      return NextResponse.json({ 
        error: 'Failed to list scripts',
        details: errorText,
      }, { status: 500 });
    }
    
    const { script_tags } = await listResponse.json();
    
    // Verificar se nosso script já está instalado
    const existingScript = script_tags?.find(
      (s: any) => s.src.includes('/api/shopify/track')
    );
    
    if (existingScript) {
      // Atualizar registro no banco
      await supabase
        .from('shopify_stores')
        .update({
          tracking_enabled: true,
          tracking_script_id: String(existingScript.id),
          updated_at: new Date().toISOString(),
        })
        .eq('id', store.id);
      
      return NextResponse.json({
        success: true,
        message: 'Pixel already installed',
        script_id: existingScript.id,
        script_url: existingScript.src,
      });
    }
    
    // Instalar novo script
    const createResponse = await fetch(
      `https://${store.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/script_tags.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': store.access_token,
        },
        body: JSON.stringify({
          script_tag: {
            event: 'onload',
            src: scriptUrl,
            display_scope: 'all', // Todas as páginas, incluindo checkout
          },
        }),
      }
    );
    
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      return NextResponse.json({
        error: 'Failed to install pixel',
        details: errorText,
      }, { status: 500 });
    }
    
    const { script_tag } = await createResponse.json();
    
    // Atualizar registro no banco
    await supabase
      .from('shopify_stores')
      .update({
        tracking_enabled: true,
        tracking_script_id: String(script_tag.id),
        updated_at: new Date().toISOString(),
      })
      .eq('id', store.id);
    
    return NextResponse.json({
      success: true,
      message: 'Pixel installed successfully',
      script_id: script_tag.id,
      script_url: script_tag.src,
    });
    
  } catch (error: any) {
    console.error('[Pixel] Error installing:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// GET - Verificar status do pixel
// =============================================
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  
  const organizationId = request.nextUrl.searchParams.get('organizationId');
  
  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
  }
  
  try {
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, access_token, tracking_enabled, tracking_script_id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle();
    
    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }
    
    // Se temos script_id, verificar se ainda existe no Shopify
    let isInstalled = false;
    let scriptDetails = null;
    
    if (store.tracking_script_id && store.access_token) {
      try {
        const response = await fetch(
          `https://${store.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/script_tags/${store.tracking_script_id}.json`,
          {
            headers: {
              'X-Shopify-Access-Token': store.access_token,
            },
          }
        );
        
        if (response.ok) {
          const { script_tag } = await response.json();
          isInstalled = true;
          scriptDetails = {
            id: script_tag.id,
            src: script_tag.src,
            created_at: script_tag.created_at,
          };
        }
      } catch (e) {
        // Script não existe mais
      }
    }
    
    return NextResponse.json({
      tracking_enabled: store.tracking_enabled,
      is_installed: isInstalled,
      script_id: store.tracking_script_id,
      script_details: scriptDetails,
    });
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// DELETE - Remover pixel
// =============================================
export async function DELETE(request: NextRequest) {
  const supabase = getSupabase();
  
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  
  try {
    const { organizationId } = await request.json();
    
    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
    }
    
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, access_token, tracking_script_id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle();
    
    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }
    
    // Remover script do Shopify
    if (store.tracking_script_id && store.access_token) {
      try {
        await fetch(
          `https://${store.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/script_tags/${store.tracking_script_id}.json`,
          {
            method: 'DELETE',
            headers: {
              'X-Shopify-Access-Token': store.access_token,
            },
          }
        );
      } catch (e) {
        // Ignorar erro se script já não existe
      }
    }
    
    // Atualizar banco
    await supabase
      .from('shopify_stores')
      .update({
        tracking_enabled: false,
        tracking_script_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', store.id);
    
    return NextResponse.json({
      success: true,
      message: 'Pixel removed successfully',
    });
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
