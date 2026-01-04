import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * Cria cliente Supabase para Route Handlers.
 * Usa @supabase/ssr com cookies do Next.js.
 * 
 * ✅ Sessão funciona automaticamente
 * ✅ RLS funciona (usa anon key + JWT do usuário)
 * ✅ Não usa SERVICE_ROLE
 */
export function createSupabaseRouteClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // Ignore - can't set cookies in some contexts
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.delete(name);
          } catch (error) {
            try {
              cookieStore.set({ name, value: '', ...options });
            } catch {
              // Ignore
            }
          }
        },
      },
    }
  );
}

/**
 * Helper para buscar usuário autenticado + organization_id
 */
export async function getAuthUser(supabase: ReturnType<typeof createSupabaseRouteClient>) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return null;
  }

  // Buscar organization_id do profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    return null;
  }

  return {
    id: user.id,
    email: user.email || '',
    organization_id: profile.organization_id,
    role: profile.role,
    is_agent: user.user_metadata?.is_agent === true,
    agent_id: user.user_metadata?.agent_id,
  };
}

/**
 * Response de erro de autenticação
 */
export function unauthorizedResponse(message: string = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}
