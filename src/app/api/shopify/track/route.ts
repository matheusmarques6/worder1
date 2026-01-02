// =============================================
// Shopify Tracking Pixel API
// src/app/api/shopify/track/route.ts
//
// GET: Retorna o script de tracking para instalar na loja
// POST: Recebe eventos de navegação do pixel
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

function getSupabase() {
  return getSupabaseAdmin();
}

// =============================================
// GET - Retorna o script de tracking
// =============================================
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const shopDomain = searchParams.get('shop');
  
  if (!shopDomain) {
    return new NextResponse('// Shop domain required', {
      status: 400,
      headers: { 'Content-Type': 'application/javascript' },
    });
  }
  
  const apiUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://seudominio.com';
  
  // Script de tracking que será injetado na loja Shopify
  const trackingScript = `
(function() {
  'use strict';
  
  // Configuração
  var CONFIG = {
    apiUrl: '${apiUrl}/api/shopify/track',
    shopDomain: '${shopDomain}',
    debug: false
  };
  
  // Gerar IDs únicos
  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  // Obter ou criar visitor ID (persiste entre sessões)
  function getVisitorId() {
    var id = localStorage.getItem('_worder_vid');
    if (!id) {
      id = generateId();
      localStorage.setItem('_worder_vid', id);
    }
    return id;
  }
  
  // Obter ou criar session ID (expira ao fechar o navegador)
  function getSessionId() {
    var id = sessionStorage.getItem('_worder_sid');
    if (!id) {
      id = generateId();
      sessionStorage.setItem('_worder_sid', id);
    }
    return id;
  }
  
  // Extrair UTM parameters
  function getUtmParams() {
    var params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source'),
      utm_medium: params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign'),
      utm_term: params.get('utm_term'),
      utm_content: params.get('utm_content')
    };
  }
  
  // Detectar tipo de página
  function getPageType() {
    var path = window.location.pathname;
    if (path === '/') return 'home';
    if (path.includes('/products/')) return 'product';
    if (path.includes('/collections/')) return 'collection';
    if (path.includes('/cart')) return 'cart';
    if (path.includes('/checkout')) return 'checkout';
    if (path.includes('/account')) return 'account';
    if (path.includes('/search')) return 'search';
    if (path.includes('/pages/')) return 'page';
    if (path.includes('/blogs/')) return 'blog';
    return 'other';
  }
  
  // Extrair dados do produto da página
  function getProductData() {
    try {
      // Shopify expõe dados do produto em meta tags e variáveis globais
      var product = window.ShopifyAnalytics?.meta?.product || window.meta?.product;
      if (product) {
        return {
          product_id: product.id?.toString(),
          product_title: product.title,
          product_type: product.type,
          product_vendor: product.vendor,
          product_price: product.price,
          product_url: window.location.href,
          variant_id: product.variants?.[0]?.id?.toString()
        };
      }
      
      // Fallback: tentar extrair do JSON-LD
      var jsonLd = document.querySelector('script[type="application/ld+json"]');
      if (jsonLd) {
        var data = JSON.parse(jsonLd.textContent);
        if (data['@type'] === 'Product') {
          return {
            product_id: data.sku || data.productID,
            product_title: data.name,
            product_price: data.offers?.price,
            product_url: window.location.href
          };
        }
      }
    } catch (e) {
      if (CONFIG.debug) console.error('[WorderTrack] Error getting product data:', e);
    }
    return null;
  }
  
  // Extrair dados da coleção
  function getCollectionData() {
    try {
      var collection = window.ShopifyAnalytics?.meta?.collection;
      if (collection) {
        return {
          collection_id: collection.id?.toString(),
          collection_title: collection.title,
          collection_url: window.location.href
        };
      }
    } catch (e) {}
    return null;
  }
  
  // Obter email do cliente (se logado ou no checkout)
  function getCustomerEmail() {
    try {
      // Cliente logado
      if (window.ShopifyAnalytics?.meta?.page?.customerId) {
        return null; // Shopify não expõe email diretamente por segurança
      }
      
      // No checkout, pode estar no formulário
      var emailInput = document.querySelector('input[type="email"]');
      if (emailInput && emailInput.value) {
        return emailInput.value;
      }
      
      // Shopify customer object
      if (window.__st?.cid) {
        return null; // ID disponível mas não email
      }
    } catch (e) {}
    return null;
  }
  
  // Enviar evento para API
  function track(eventType, eventData) {
    var payload = {
      event_type: eventType,
      shop_domain: CONFIG.shopDomain,
      visitor_id: getVisitorId(),
      session_id: getSessionId(),
      page_url: window.location.href,
      page_title: document.title,
      page_type: getPageType(),
      referrer: document.referrer,
      user_agent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      utm: getUtmParams(),
      data: eventData || {}
    };
    
    // Tentar obter email
    var email = getCustomerEmail();
    if (email) payload.email = email;
    
    if (CONFIG.debug) {
      console.log('[WorderTrack] Event:', eventType, payload);
    }
    
    // Usar sendBeacon para não bloquear navegação
    if (navigator.sendBeacon) {
      navigator.sendBeacon(CONFIG.apiUrl, JSON.stringify(payload));
    } else {
      // Fallback para fetch
      fetch(CONFIG.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function() {});
    }
  }
  
  // =============================================
  // Event Listeners
  // =============================================
  
  // Page View
  function trackPageView() {
    var pageType = getPageType();
    var data = { page_type: pageType };
    
    if (pageType === 'product') {
      var product = getProductData();
      if (product) data.product = product;
    } else if (pageType === 'collection') {
      var collection = getCollectionData();
      if (collection) data.collection = collection;
    } else if (pageType === 'search') {
      var params = new URLSearchParams(window.location.search);
      data.search_query = params.get('q');
    }
    
    track('page_view', data);
  }
  
  // Add to Cart (interceptar cliques em botões de adicionar)
  function setupAddToCartTracking() {
    document.addEventListener('click', function(e) {
      var target = e.target;
      
      // Verificar se é botão de add to cart
      var isAddToCart = 
        target.matches('[name="add"], .add-to-cart, .product-form__submit, [data-add-to-cart]') ||
        target.closest('[name="add"], .add-to-cart, .product-form__submit, [data-add-to-cart]');
      
      if (isAddToCart) {
        var product = getProductData();
        
        // Tentar pegar quantidade
        var qtyInput = document.querySelector('input[name="quantity"]');
        var quantity = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
        
        // Tentar pegar variante selecionada
        var variantSelect = document.querySelector('select[name="id"], input[name="id"]:checked, input[name="id"]');
        var variantId = variantSelect ? variantSelect.value : null;
        
        track('add_to_cart', {
          product: product,
          quantity: quantity,
          variant_id: variantId
        });
      }
    }, true);
  }
  
  // Checkout Started
  function setupCheckoutTracking() {
    // Detectar quando entra no checkout
    if (getPageType() === 'checkout') {
      // Tentar pegar valor do carrinho
      var cartTotal = null;
      try {
        var totalEl = document.querySelector('.total-line__price .order-summary__emphasis');
        if (totalEl) cartTotal = totalEl.textContent;
      } catch (e) {}
      
      track('checkout_started', {
        cart_total: cartTotal
      });
    }
  }
  
  // Email Captured (no checkout)
  function setupEmailCapture() {
    document.addEventListener('blur', function(e) {
      if (e.target.type === 'email' && e.target.value) {
        track('email_captured', {
          email: e.target.value,
          page_type: getPageType()
        });
      }
    }, true);
  }
  
  // =============================================
  // Initialize
  // =============================================
  
  function init() {
    if (CONFIG.debug) console.log('[WorderTrack] Initializing...');
    
    // Track page view
    trackPageView();
    
    // Setup event listeners
    setupAddToCartTracking();
    setupCheckoutTracking();
    setupEmailCapture();
    
    // Track on history changes (SPA navigation)
    var pushState = history.pushState;
    history.pushState = function() {
      pushState.apply(history, arguments);
      setTimeout(trackPageView, 100);
    };
    
    window.addEventListener('popstate', function() {
      setTimeout(trackPageView, 100);
    });
    
    if (CONFIG.debug) console.log('[WorderTrack] Ready!');
  }
  
  // Iniciar quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Expor função de track para uso manual
  window.WorderTrack = { track: track };
  
})();
`;

  return new NextResponse(trackingScript, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=3600', // Cache por 1 hora
    },
  });
}

// =============================================
// POST - Recebe eventos do pixel
// =============================================
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  
  try {
    const body = await request.json();
    
    const {
      event_type,
      shop_domain,
      visitor_id,
      session_id,
      page_url,
      page_title,
      page_type,
      referrer,
      user_agent,
      timestamp,
      utm,
      email,
      data,
    } = body;
    
    if (!shop_domain || !event_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // 1. Buscar store pelo domínio
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('id, organization_id')
      .eq('shop_domain', shop_domain)
      .maybeSingle();
    
    if (!store) {
      // Loja não encontrada, ignorar silenciosamente
      return NextResponse.json({ ok: true, ignored: true });
    }
    
    // 2. Tentar encontrar contato por email (se disponível)
    let contactId = null;
    if (email) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', store.organization_id)
        .ilike('email', email)
        .maybeSingle();
      
      contactId = contact?.id;
    }
    
    // 3. Registrar atividade
    const activityData: any = {
      organization_id: store.organization_id,
      type: mapEventTypeToActivityType(event_type),
      title: generateActivityTitle(event_type, data, page_title),
      description: page_url,
      url: page_url,
      source: 'pixel',
      source_id: `${visitor_id}:${session_id}`,
      metadata: {
        event_type,
        page_type,
        visitor_id,
        session_id,
        referrer,
        utm,
        ...data,
      },
      occurred_at: timestamp || new Date().toISOString(),
    };
    
    if (contactId) {
      activityData.contact_id = contactId;
    }
    
    await supabase.from('contact_activities').insert(activityData);
    
    // 4. Atualizar ou criar sessão
    const { data: existingSession } = await supabase
      .from('contact_sessions')
      .select('id, contact_id, page_views, pages_visited, products_viewed')
      .eq('session_id', session_id)
      .eq('organization_id', store.organization_id)
      .maybeSingle();
    
    if (existingSession) {
      // Atualizar sessão existente
      const pagesVisited = existingSession.pages_visited || [];
      const productsViewed = existingSession.products_viewed || [];
      
      // Adicionar página visitada
      pagesVisited.push({
        url: page_url,
        title: page_title,
        type: page_type,
        timestamp,
      });
      
      // Adicionar produto visualizado (se for página de produto)
      if (event_type === 'page_view' && page_type === 'product' && data?.product) {
        productsViewed.push({
          ...data.product,
          viewed_at: timestamp,
        });
      }
      
      await supabase
        .from('contact_sessions')
        .update({
          contact_id: contactId || existingSession.contact_id,
          email: email || undefined,
          page_views: (existingSession.page_views || 0) + 1,
          pages_visited: pagesVisited.slice(-50), // Manter últimas 50
          products_viewed: productsViewed.slice(-20), // Manter últimos 20
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingSession.id);
    } else {
      // Criar nova sessão
      await supabase.from('contact_sessions').insert({
        organization_id: store.organization_id,
        contact_id: contactId,
        session_id,
        visitor_id,
        email,
        page_views: 1,
        pages_visited: [{
          url: page_url,
          title: page_title,
          type: page_type,
          timestamp,
        }],
        products_viewed: page_type === 'product' && data?.product ? [{ ...data.product, viewed_at: timestamp }] : [],
        utm_source: utm?.utm_source,
        utm_medium: utm?.utm_medium,
        utm_campaign: utm?.utm_campaign,
        referrer,
        user_agent,
        source: 'shopify',
        shop_domain,
      });
    }
    
    // 5. Se temos contato, atualizar last_seen e produtos vistos
    if (contactId && event_type === 'page_view' && page_type === 'product' && data?.product) {
      // Buscar produtos vistos atuais
      const { data: contact } = await supabase
        .from('contacts')
        .select('last_viewed_products, total_page_views')
        .eq('id', contactId)
        .single();
      
      if (contact) {
        const viewedProducts = contact.last_viewed_products || [];
        
        // Adicionar novo produto (evitar duplicatas recentes)
        const alreadyViewed = viewedProducts.find(
          (p: any) => p.product_id === data.product.product_id
        );
        
        if (!alreadyViewed) {
          viewedProducts.unshift({
            product_id: data.product.product_id,
            title: data.product.product_title,
            price: data.product.product_price,
            url: page_url,
            viewed_at: timestamp,
          });
        }
        
        await supabase
          .from('contacts')
          .update({
            last_seen_at: new Date().toISOString(),
            total_page_views: (contact.total_page_views || 0) + 1,
            last_viewed_products: viewedProducts.slice(0, 20), // Manter últimos 20
            updated_at: new Date().toISOString(),
          })
          .eq('id', contactId);
      }
    }
    
    return NextResponse.json({ ok: true });
    
  } catch (error: any) {
    console.error('[Pixel] Error processing event:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// Helpers
// =============================================

function mapEventTypeToActivityType(eventType: string): string {
  const mapping: Record<string, string> = {
    'page_view': 'page_view',
    'add_to_cart': 'add_to_cart',
    'checkout_started': 'checkout_started',
    'email_captured': 'email_captured',
  };
  return mapping[eventType] || 'page_view';
}

function generateActivityTitle(eventType: string, data: any, pageTitle: string): string {
  switch (eventType) {
    case 'page_view':
      if (data?.page_type === 'product' && data?.product?.product_title) {
        return `Visualizou: ${data.product.product_title}`;
      }
      if (data?.page_type === 'collection' && data?.collection?.collection_title) {
        return `Navegou em: ${data.collection.collection_title}`;
      }
      if (data?.page_type === 'search' && data?.search_query) {
        return `Buscou: "${data.search_query}"`;
      }
      return `Visitou: ${pageTitle || 'página'}`;
      
    case 'add_to_cart':
      const productName = data?.product?.product_title || 'Produto';
      const qty = data?.quantity || 1;
      return `Adicionou ao carrinho: ${productName} (${qty}x)`;
      
    case 'checkout_started':
      return `Iniciou checkout${data?.cart_total ? ` - ${data.cart_total}` : ''}`;
      
    case 'email_captured':
      return `Email capturado: ${data?.email || 'no checkout'}`;
      
    default:
      return eventType.replace(/_/g, ' ');
  }
}
