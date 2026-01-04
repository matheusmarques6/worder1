import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

// =====================================================
// ROUTE CONFIGURATION
// =====================================================

const publicRoutes = ['/', '/signup', '/login', '/register', '/forgot-password', '/reset-password', '/change-password'];
const publicApiRoutes = ['/api/auth', '/api/shopify', '/api/klaviyo', '/api/webhooks', '/api/public'];
const authRoutes = ['/', '/signup', '/login'];
const agentAllowedRoutes = ['/whatsapp', '/crm', '/profile', '/change-password', '/help'];
const adminOnlyRoutes = ['/dashboard', '/automations', '/integrations', '/settings', '/api-keys', '/analytics', '/shopify', '/email-marketing', '/facebook-ads', '/google-ads', '/tiktok-ads'];
const adminOnlyApis = ['/api/whatsapp/agents', '/api/whatsapp/numbers', '/api/api-keys', '/api/automations', '/api/integrations', '/api/settings', '/api/ai'];

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function isPublicRoute(pathname: string): boolean {
  return publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'));
}

function isPublicApiRoute(pathname: string): boolean {
  if (pathname.startsWith('/api/whatsapp/webhook')) return true;
  return publicApiRoutes.some(route => pathname.startsWith(route));
}

function isAuthRoute(pathname: string): boolean {
  return authRoutes.some(route => pathname === route);
}

function isAgentAllowedRoute(pathname: string): boolean {
  return agentAllowedRoutes.some(route => pathname.startsWith(route));
}

function isAdminOnlyRoute(pathname: string): boolean {
  return adminOnlyRoutes.some(route => pathname.startsWith(route));
}

function isAdminOnlyApi(pathname: string): boolean {
  return adminOnlyApis.some(route => pathname.startsWith(route));
}

// =====================================================
// MIDDLEWARE
// =====================================================

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip public routes and API routes
  if (isPublicRoute(pathname) && !isAuthRoute(pathname)) {
    return NextResponse.next();
  }

  if (isPublicApiRoute(pathname)) {
    return NextResponse.next();
  }

  // Create response to potentially modify cookies
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Create Supabase client using @supabase/ssr
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // Protected routes - verify auth
  if (!isPublicRoute(pathname) || isAuthRoute(pathname)) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        // Not authenticated
        if (pathname.startsWith('/api/')) {
          // Let API routes handle their own auth
          return response;
        }
        // Redirect to login
        return NextResponse.redirect(new URL('/', request.url));
      }

      // Authenticated - check if trying to access auth routes
      if (isAuthRoute(pathname)) {
        // Already logged in, redirect to dashboard
        const isAgent = user.user_metadata?.is_agent === true;
        return NextResponse.redirect(new URL(isAgent ? '/whatsapp' : '/dashboard', request.url));
      }

      // Role-based access control
      const isAgent = user.user_metadata?.is_agent === true;
      
      if (isAgent) {
        if (pathname.startsWith('/api/') && isAdminOnlyApi(pathname)) {
          return NextResponse.json(
            { error: 'Access denied. Insufficient permissions.' },
            { status: 403 }
          );
        }
        
        if (isAdminOnlyRoute(pathname)) {
          return NextResponse.redirect(new URL('/whatsapp', request.url));
        }
        
        if (pathname === '/' || pathname === '/dashboard') {
          return NextResponse.redirect(new URL('/whatsapp', request.url));
        }
        
        if (!pathname.startsWith('/api/') && !isAgentAllowedRoute(pathname)) {
          return NextResponse.redirect(new URL('/whatsapp', request.url));
        }
      } else {
        if (pathname === '/') {
          return NextResponse.redirect(new URL('/dashboard', request.url));
        }
      }

    } catch (error) {
      console.error('Middleware auth error:', error);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
