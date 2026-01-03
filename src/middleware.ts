import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// =====================================================
// ROUTE CONFIGURATION
// =====================================================

// Routes that don't require authentication
const publicRoutes = ['/', '/signup', '/login', '/register', '/forgot-password', '/reset-password', '/change-password'];

// Public API routes (APENAS webhooks e callbacks OAuth - ser ESPECÍFICO!)
// ⚠️ NUNCA adicione prefixos genéricos como '/api/shopify' ou '/api/klaviyo'
const publicApiRoutes = [
  '/api/auth',
  '/api/public',
  // Webhooks externos (recebem eventos de terceiros)
  '/api/webhooks',
  '/api/whatsapp/webhook',
  '/api/whatsapp/evolution/webhook',
  '/api/whatsapp/cloud/webhook',
  // OAuth callbacks (retorno de OAuth de terceiros)
  '/api/integrations/shopify/callback',
  '/api/integrations/meta/callback',
  '/api/integrations/tiktok/callback',
  '/api/integrations/google/callback',
  // Shopify webhooks específicos
  '/api/shopify/webhooks',
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
  // WhatsApp webhook needs to be public
  if (pathname.startsWith('/api/whatsapp/webhook')) return true;
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
