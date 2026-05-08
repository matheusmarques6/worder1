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

    // Resolve organization_id do usuário.
    // Estratégia em camadas:
    //  1) profiles.organization_id (schema histórico do Worder, se existir)
    //  2) org_members(profile_id, org_id, is_active) — schema atual do banco
    //     (admin convertfy / projetos novos), priorizando role='owner'
    //  3) organization_members(user_id, organization_id) — schema legado
    //
    // Cada lookup é tolerante a coluna ausente (PGRST204 / 42703); nesse caso
    // simplesmente passa para a próxima camada.
    let organizationId: string | null = null;
    let role: string | undefined;

    {
      const { data: profile, error: profErr } = await admin
        .from('profiles')
        .select('organization_id, role')
        .eq('id', user.id)
        .maybeSingle();
      if (!profErr && profile?.organization_id) {
        organizationId = profile.organization_id as string;
        role = (profile.role as string | undefined) ?? undefined;
      } else if (!profErr && profile?.role) {
        role = profile.role as string;
      }
    }

    if (!organizationId) {
      const { data: membership } = await admin
        .from('org_members')
        .select('org_id, role')
        .eq('profile_id', user.id)
        .eq('is_active', true)
        .order('role', { ascending: false }) // owner > admin > member alphabetical-ish; bom o suficiente
        .limit(1)
        .maybeSingle();
      if (membership?.org_id) {
        organizationId = membership.org_id as string;
        role = role ?? ((membership.role as string | undefined) ?? undefined);
      }
    }

    if (!organizationId) {
      const { data: legacyMembership } = await admin
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (legacyMembership?.organization_id) {
        organizationId = legacyMembership.organization_id as string;
        role = role ?? ((legacyMembership.role as string | undefined) ?? undefined);
      }
    }

    if (!organizationId) {
      console.error('[Auth] No organization for user (profiles + org_members + organization_members all empty)');
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
        organization_id: organizationId,
        role,
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
 * ✅ CORRIGIDO: VALIDAÇÃO DE ACESSO À LOJA (Multi-tenant / Multi-org)
 * 
 * Verifica se o usuário tem acesso à loja através de:
 * 1. A loja pertence à org padrão do usuário, OU
 * 2. O usuário é MEMBRO da org da loja (via organization_members)
 * 
 * @param supabase - Cliente Supabase (mantido por compatibilidade)
 * @param userOrganizationId - Organization padrão do perfil do usuário
 * @param storeId - ID da loja a validar
 * @param userId - ID do usuário (necessário para verificar membership)
 * @returns objeto com valid, storeOrganizationId (se válido), ou error/status
 */
export async function validateStoreAccess(
  supabase: SupabaseClient,
  userOrganizationId: string,
  storeId: string | null | undefined,
  userId?: string
): Promise<{ valid: boolean; error?: string; status?: number; storeOrganizationId?: string }> {
  // Se não tem storeId, retornar erro
  if (!storeId) {
    return { valid: false, error: 'storeId é obrigatório', status: 400 };
  }

  // Usar admin client para queries sem RLS
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { valid: false, error: 'Database not configured', status: 503 };
  }

  try {
    // ✅ 1. Buscar a loja (SEM filtrar por org)
    const { data: store, error: storeError } = await admin
      .from('shopify_stores')
      .select('id, organization_id')
      .eq('id', storeId)
      .single();

    if (storeError || !store) {
      console.log(`[validateStoreAccess] Store not found: ${storeId}`);
      return { 
        valid: false, 
        error: 'Loja não encontrada', 
        status: 404 
      };
    }

    const storeOrgId = store.organization_id;

    // ✅ 2. Se a loja é da mesma organização do usuário, OK
    if (storeOrgId === userOrganizationId) {
      return { valid: true, storeOrganizationId: storeOrgId };
    }

    // ✅ 3. Verificar se o usuário é MEMBRO da organização da loja
    if (userId) {
      const { data: membership, error: memberError } = await admin
        .from('organization_members')
        .select('id, role')
        .eq('user_id', userId)
        .eq('organization_id', storeOrgId)
        .maybeSingle();

      if (membership && !memberError) {
        console.log(`[validateStoreAccess] User ${userId} is member of org ${storeOrgId} with role ${membership.role}`);
        return { valid: true, storeOrganizationId: storeOrgId };
      }
    }

    // ✅ 4. Usuário não tem acesso
    console.log(`[validateStoreAccess] Access denied: user org ${userOrganizationId}, store org ${storeOrgId}, userId ${userId}`);
    return { 
      valid: false, 
      error: 'Sem permissão de acesso a esta loja', 
      status: 403 
    };

  } catch (error) {
    console.error('[validateStoreAccess] Error:', error);
    return { valid: false, error: 'Erro ao validar acesso à loja', status: 500 };
  }
}

/**
 * ✅ HELPER: Extrai e valida storeId de query params
 * Retorna NextResponse de erro ou objeto com storeId e storeOrganizationId
 */
export async function requireStoreAccess(
  supabase: SupabaseClient,
  organizationId: string,
  storeId: string | null | undefined,
  userId?: string
): Promise<NextResponse | { storeId: string; storeOrganizationId: string }> {
  const validation = await validateStoreAccess(supabase, organizationId, storeId, userId);
  
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error },
      { status: validation.status || 400 }
    );
  }
  
  return { 
    storeId: storeId as string, 
    storeOrganizationId: validation.storeOrganizationId! 
  };
}
