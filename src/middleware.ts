import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// =====================================================
// ROUTE CONFIGURATION
// =====================================================

// Routes that don't require authentication
const publicRoutes = ['/', '/signup', '/login', '/register', '/forgot-password', '/reset-password', '/change-password', '/embed', '/unsubscribe'];

// Public API routes (webhooks, etc)
const publicApiRoutes = [
  // Versão publicada (commit/branch) — sem dados sensíveis.
  '/api/health',
  '/api/auth',
  '/api/shopify',
  '/api/klaviyo',
  '/api/webhooks',
  '/api/public',
  '/api/cron',
  '/api/debug',
  '/api/dev',
  '/api/workers',
  '/api/track',
  '/api/t/',
  '/api/integrations/shopify/callback',
  // OAuth com app próprio (modelo agência): o clique final de
  // autorização pode vir do navegador do DONO da loja, sem sessão
  // Worder — o callback valida por state de uso único + HMAC.
  '/api/integrations/shopify/oauth-manual/callback',
  '/api/email/track',
  '/api/email/unsubscribe',
  '/api/email/view',
  '/api/email/campaigns/send-batch',
  '/api/lgpd/consents',
  '/api/lgpd/data-requests',
  '/api/unsubscribe',
  // ⬇ Public storefront-side endpoints — called from merchant Shopify
  // domains (different origin, no auth cookies). Without these here, the
  // middleware returns 401 and the pixel/loader never even reaches the
  // route handler.
  //   /api/pixel       — Custom Pixel JS file served to Shopify sandbox
  //   /api/identity    — identity resolver called by pixel on each boot
  //   /api/recommendations — public storefront recommendations endpoint
  //   /api/storefront  — popup loader.js for manual integrations
  '/api/pixel',
  '/api/identity',
  '/api/recommendations',
  '/api/storefront',
];

// Routes that should redirect to dashboard/inbox if already authenticated
const authRoutes = ['/', '/signup', '/login'];

// Routes allowed for agents
const agentAllowedRoutes = [
  '/whatsapp',
  '/crm',
  '/profile',
  '/change-password',
  '/help',
];

// API routes allowed for agents
const agentAllowedApis = [
  '/api/whatsapp/conversations',
  '/api/whatsapp/messages',
  '/api/profile',
  '/api/whatsapp/agents/status',
  '/api/whatsapp/agents/permissions',
  '/api/auth',
];

// Routes blocked for agents (admin/owner only)
const adminOnlyRoutes = [
  '/dashboard',
  '/automations',
  '/integrations',
  '/settings',
  '/api-keys',
  '/analytics',
  '/shopify',
  '/email-marketing',
  '/facebook-ads',
  '/google-ads',
  '/tiktok-ads',
];

// APIs blocked for agents
const adminOnlyApis = [
  '/api/whatsapp/agents',
  '/api/whatsapp/numbers',
  '/api/api-keys',
  '/api/automations',
  '/api/integrations',
  '/api/settings',
  '/api/ai',
];

// Check if we're in dev mode
const isDevMode = process.env.NODE_ENV === 'development' || process.env.DEV_AUTH_BYPASS === 'true';

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function isPublicRoute(pathname: string): boolean {
  return publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'));
}

function isPublicApiRoute(pathname: string): boolean {
  // WhatsApp webhooks precisam ser publicas — Meta nao envia cookie de sessao.
  // Cobre /api/whatsapp/cloud/webhook (canonica) e os forwarders legados
  // /api/whatsapp/webhook e /api/whatsapp/meta/webhook.
  if (/^\/api\/whatsapp\/(webhook|.*\/webhook)(\/|$|\?)/.test(pathname)) return true;
  return publicApiRoutes.some(route => pathname.startsWith(route));
}

function isAuthRoute(pathname: string): boolean {
  return authRoutes.includes(pathname);
}

function isAgentAllowedRoute(pathname: string): boolean {
  return agentAllowedRoutes.some(route => pathname.startsWith(route));
}

function isAgentAllowedApi(pathname: string): boolean {
  // Special case: status and permissions endpoints
  if (pathname.includes('/agents/status')) return true;
  if (pathname.includes('/agents/permissions')) return true;
  return agentAllowedApis.some(route => pathname.startsWith(route));
}

function isAdminOnlyRoute(pathname: string): boolean {
  return adminOnlyRoutes.some(route => pathname.startsWith(route));
}

function isAdminOnlyApi(pathname: string): boolean {
  // Check if it's an agent-allowed API first
  if (isAgentAllowedApi(pathname)) return false;
  return adminOnlyApis.some(route => pathname.startsWith(route));
}

// =====================================================
// MIDDLEWARE
// =====================================================

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public API routes (webhooks, etc)
  if (isPublicApiRoute(pathname)) {
    // Public popup/storefront endpoints are called cross-origin from the
    // merchant's Shopify domain. Each route handler is supposed to set
    // its own Access-Control-Allow-Origin header on every return path,
    // but the submit endpoint (and a few others) had early returns
    // missing the header — the browser then blocked the response body
    // and the popup looked frozen even though the server returned 200.
    // Stamp CORS at the middleware layer as a safety net so no return
    // path can leak past us without it.
    const corsTargets = ['/api/public/forms', '/api/storefront', '/api/track', '/api/pixel', '/api/identity'];
    const needsCors = corsTargets.some((p) => pathname.startsWith(p));
    if (needsCors) {
      // Preflight: short-circuit with a 204 + CORS so the route handler
      // never has to think about OPTIONS. Honors the requested headers
      // if the browser advertised them.
      if (request.method === 'OPTIONS') {
        const origin = request.headers.get('origin') || '*';
        const reqHeaders = request.headers.get('access-control-request-headers') || 'Content-Type';
        return new NextResponse(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': reqHeaders,
            'Access-Control-Max-Age': '86400',
            'Vary': 'Origin',
          },
        });
      }
      const res = NextResponse.next();
      const origin = request.headers.get('origin') || '*';
      res.headers.set('Access-Control-Allow-Origin', origin);
      res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
      res.headers.set('Vary', 'Origin');
      return res;
    }
    return NextResponse.next();
  }

  // Check for auth token
  const accessToken = request.cookies.get('sb-access-token')?.value;
  const refreshToken = request.cookies.get('sb-refresh-token')?.value;

  // If accessing login page while authenticated, redirect based on role
  if (isAuthRoute(pathname) && accessToken && accessToken !== 'dev-access-token') {
    // We need to check if user is agent to redirect properly
    // For now, redirect to dashboard (will be handled by the actual check below)
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // If accessing protected route without auth, redirect to login
  if (!isPublicRoute(pathname) && !accessToken) {
    // For API routes, return 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Dev mode: allow dev tokens through
  if (accessToken === 'dev-access-token') {
    return NextResponse.next();
  }

  // Verify token and check user role
  if (accessToken && !isPublicRoute(pathname)) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('placeholder')) {
      if (isDevMode) {
        return NextResponse.next();
      }
      return NextResponse.redirect(new URL('/', request.url));
    }

    try {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      });

      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        // Token expired or invalid, try to refresh
        if (refreshToken) {
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
            refresh_token: refreshToken,
          });

          if (refreshError || !refreshData.session) {
            const response = NextResponse.redirect(new URL('/', request.url));
            response.cookies.delete('sb-access-token');
            response.cookies.delete('sb-refresh-token');
            return response;
          }

          // Update cookies with new tokens
          const response = NextResponse.next();
          response.cookies.set('sb-access-token', refreshData.session.access_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7,
            path: '/',
          });
          response.cookies.set('sb-refresh-token', refreshData.session.refresh_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 30,
            path: '/',
          });
          return response;
        }

        const response = NextResponse.redirect(new URL('/', request.url));
        response.cookies.delete('sb-access-token');
        response.cookies.delete('sb-refresh-token');
        return response;
      }

      // =====================================================
      // ROLE-BASED ACCESS CONTROL
      // =====================================================
      
      const isAgent = user.user_metadata?.is_agent === true;
      
      if (isAgent) {
        // Agent trying to access admin-only API
        if (pathname.startsWith('/api/') && isAdminOnlyApi(pathname)) {
          return NextResponse.json(
            { error: 'Access denied. Insufficient permissions.' },
            { status: 403 }
          );
        }
        
        // Agent trying to access admin-only route
        if (isAdminOnlyRoute(pathname)) {
          return NextResponse.redirect(new URL('/whatsapp', request.url));
        }
        
        // Agent accessing root or non-allowed route
        if (pathname === '/' || pathname === '/dashboard') {
          return NextResponse.redirect(new URL('/whatsapp', request.url));
        }
        
        // Check if route is allowed for agents
        if (!pathname.startsWith('/api/') && !isAgentAllowedRoute(pathname)) {
          return NextResponse.redirect(new URL('/whatsapp', request.url));
        }
      } else {
        // Owner/Admin accessing root - redirect to dashboard
        if (pathname === '/') {
          return NextResponse.redirect(new URL('/dashboard', request.url));
        }
      }

    } catch (error) {
      console.error('Middleware auth error:', error);
      // On error, allow request to proceed (API routes will handle auth)
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
