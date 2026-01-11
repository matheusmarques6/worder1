import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export interface AuthResult {
  supabase: SupabaseClient;
  user: {
    id: string;
    email: string;
    organization_id: string;
    role?: string;
  };
}

// Cliente admin para validação de token
let supabaseAdmin: SupabaseClient | null = null;
function getSupabaseAdmin(): SupabaseClient | null {
  if (!supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key && !url.includes('placeholder')) {
      supabaseAdmin = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
  }
  return supabaseAdmin;
}

/**
 * ✅ RETORNA CLIENTE QUE RESPEITA RLS
 * Usa ANON_KEY + token do usuário = RLS funciona automaticamente
 */
export async function getAuthClient(): Promise<AuthResult | null> {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) {
      console.error('[Auth] Supabase not configured');
      return null;
    }

    const cookieStore = cookies();
    const accessToken = cookieStore.get('sb-access-token')?.value;
    
    if (!accessToken) {
      console.log('[Auth] No access token');
      return null;
    }
    
    // Validar token
    const { data: { user }, error } = await admin.auth.getUser(accessToken);
    if (error || !user) {
      console.log('[Auth] Invalid token');
      return null;
    }
    
    // Buscar org do perfil
    const { data: profile } = await admin
      .from('profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single();
    
    if (!profile?.organization_id) {
      console.error('[Auth] No organization for user');
      return null;
    }

    // ✅ CRIAR CLIENTE COM ANON_KEY + TOKEN = RLS FUNCIONA!
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    
    if (!anonKey) {
      console.error('[Auth] NEXT_PUBLIC_SUPABASE_ANON_KEY not set!');
      return null;
    }
    
    const supabase = createClient(url, anonKey, {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    
    return {
      supabase,
      user: {
        id: user.id,
        email: user.email || '',
        organization_id: profile.organization_id,
        role: profile.role,
      },
    };
  } catch (error) {
    console.error('[Auth] Error:', error);
    return null;
  }
}

export function authError(message: string = 'Unauthorized', status: number = 401) {
  return NextResponse.json({ error: message }, { status });
}

// Legacy - para webhooks e crons
let supabaseClient: SupabaseClient | null = null;
export function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key && !url.includes('placeholder')) {
      supabaseClient = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
  }
  return supabaseClient;
}

export function withSupabase<T extends any[]>(
  handler: (supabase: SupabaseClient, ...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    const client = getSupabaseClient();
    if (!client) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    return handler(client, ...args);
  };
}

export function errorResponse(message: string, status: number = 500) {
  return NextResponse.json({ error: message }, { status });
}

export function successResponse<T>(data: T, status: number = 200) {
  return NextResponse.json(data, { status });
}

export function validateParams(params: URLSearchParams, required: string[]): { valid: boolean; missing?: string } {
  for (const param of required) {
    if (!params.get(param)) return { valid: false, missing: param };
  }
  return { valid: true };
}

export function parseDateRange(startDate: string | null, endDate: string | null, period: string = '30d'): { start: Date; end: Date } {
  const end = endDate ? new Date(endDate) : new Date();
  let start: Date;
  if (startDate) {
    start = new Date(startDate);
  } else {
    start = new Date(end);
    switch (period) {
      case '7d': start.setDate(start.getDate() - 7); break;
      case '30d': start.setDate(start.getDate() - 30); break;
      case '90d': start.setDate(start.getDate() - 90); break;
      case '12m': start.setFullYear(start.getFullYear() - 1); break;
      default: start.setDate(start.getDate() - 30);
    }
  }
  return { start, end };
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * ✅ VALIDAÇÃO DE ACESSO À LOJA (Multi-tenant security)
 * Verifica se o storeId pertence à organização do usuário
 * @returns true se acesso permitido, false caso contrário
 */
export async function validateStoreAccess(
  supabase: SupabaseClient,
  organizationId: string,
  storeId: string | null | undefined
): Promise<{ valid: boolean; error?: string; status?: number }> {
  // Se não tem storeId, retornar erro
  if (!storeId) {
    return { valid: false, error: 'storeId é obrigatório', status: 400 };
  }

  try {
    // Verificar se a loja pertence à organização
    const { data: store, error } = await supabase
      .from('shopify_stores')
      .select('id, organization_id')
      .eq('id', storeId)
      .eq('organization_id', organizationId)
      .single();

    if (error || !store) {
      return { 
        valid: false, 
        error: 'Loja não encontrada ou sem permissão de acesso', 
        status: 403 
      };
    }

    return { valid: true };
  } catch (error) {
    console.error('[validateStoreAccess] Error:', error);
    return { valid: false, error: 'Erro ao validar acesso à loja', status: 500 };
  }
}

/**
 * ✅ HELPER: Extrai e valida storeId de query params
 * Retorna NextResponse de erro ou o storeId validado
 */
export async function requireStoreAccess(
  supabase: SupabaseClient,
  organizationId: string,
  storeId: string | null | undefined
): Promise<NextResponse | string> {
  const validation = await validateStoreAccess(supabase, organizationId, storeId);
  
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error },
      { status: validation.status || 400 }
    );
  }
  
  return storeId as string;
}
