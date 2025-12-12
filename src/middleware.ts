import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Routes that don't require authentication
const publicRoutes = ['/', '/signup', '/api/auth', '/api/shopify', '/api/klaviyo', '/api/whatsapp'];

// Routes that should redirect to dashboard if already authenticated
const authRoutes = ['/', '/signup'];

// Check if we're in dev mode
const isDevMode = process.env.NODE_ENV === 'development' || process.env.DEV_AUTH_BYPASS === 'true';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public API routes (webhooks)
  if (pathname.startsWith('/api/shopify') || pathname.startsWith('/api/klaviyo') || pathname.startsWith('/api/whatsapp')) {
    return NextResponse.next();
  }

  // Check for auth token
  const accessToken = request.cookies.get('sb-access-token')?.value;
  const refreshToken = request.cookies.get('sb-refresh-token')?.value;

  const isPublicRoute = publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'));
  const isAuthRoute = authRoutes.includes(pathname);

  // If accessing login page while authenticated, redirect to dashboard
  if (isAuthRoute && accessToken) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // If accessing protected route without auth, redirect to login
  if (!isPublicRoute && !accessToken) {
    const loginUrl = new URL('/', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Dev mode: allow dev tokens through
  if (accessToken === 'dev-access-token') {
    return NextResponse.next();
  }

  // Verify token is still valid (only for real tokens)
  if (accessToken && !isPublicRoute) {
    // Check if Supabase is configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('placeholder')) {
      // Supabase not configured, allow through if in dev mode
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
            // Refresh failed, redirect to login
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

        // No refresh token, redirect to login
        const response = NextResponse.redirect(new URL('/', request.url));
        response.cookies.delete('sb-access-token');
        response.cookies.delete('sb-refresh-token');
        return response;
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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
