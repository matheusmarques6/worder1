import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

// Routes that don't require authentication
const publicRoutes = ['/', '/signup', '/login', '/register', '/forgot-password', '/reset-password', '/change-password'];
const publicApiRoutes = ['/api/auth', '/api/shopify', '/api/klaviyo', '/api/webhooks', '/api/public'];

// Routes blocked for agents
const adminOnlyRoutes = ['/dashboard', '/automations', '/integrations', '/settings', '/api-keys', '/analytics', '/shopify', '/email-marketing', '/facebook-ads', '/google-ads', '/tiktok-ads'];
const adminOnlyApis = ['/api/whatsapp/agents', '/api/whatsapp/numbers', '/api/api-keys', '/api/automations', '/api/integrations', '/api/settings', '/api/ai'];

function isPublicRoute(pathname: string): boolean {
  return publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'));
}

function isPublicApiRoute(pathname: string): boolean {
  if (pathname.startsWith('/api/whatsapp/webhook')) return true;
  return publicApiRoutes.some(route => pathname.startsWith(route));
}

function isAdminOnlyRoute(pathname: string): boolean {
  return adminOnlyRoutes.some(route => pathname.startsWith(route));
}

function isAdminOnlyApi(pathname: string): boolean {
  return adminOnlyApis.some(route => pathname.startsWith(route));
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // SEMPRE permitir rotas públicas e APIs públicas
  if (isPublicRoute(pathname) || isPublicApiRoute(pathname)) {
    return NextResponse.next();
  }

  // Para rotas protegidas, verificar auth
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  try {
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
              request: { headers: request.headers },
            });
            response.cookies.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            request.cookies.set({ name, value: '', ...options });
            response = NextResponse.next({
              request: { headers: request.headers },
            });
            response.cookies.set({ name, value: '', ...options });
          },
        },
      }
    );

    const { data: { user }, error } = await supabase.auth.getUser();

    // Não autenticado - redirecionar para login
    if (error || !user) {
      // Não redirecionar APIs - deixar elas retornarem 401
      if (pathname.startsWith('/api/')) {
        return response;
      }
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Autenticado - verificar role
    const isAgent = user.user_metadata?.is_agent === true;
    
    if (isAgent) {
      // Agente tentando acessar API de admin
      if (pathname.startsWith('/api/') && isAdminOnlyApi(pathname)) {
        return NextResponse.json(
          { error: 'Access denied. Insufficient permissions.' },
          { status: 403 }
        );
      }
      
      // Agente tentando acessar rota de admin
      if (isAdminOnlyRoute(pathname)) {
        return NextResponse.redirect(new URL('/whatsapp', request.url));
      }
    }

  } catch (error) {
    console.error('Middleware auth error:', error);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
