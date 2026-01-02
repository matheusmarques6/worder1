// =============================================
// WORDER: Supabase Client Factory (Admin/Server)
// /src/lib/supabase-admin.ts
// 
// Este arquivo fornece um cliente Supabase admin
// que é criado de forma lazy (só quando usado),
// evitando erros durante o build do Next.js.
//
// ⚠️  ATENÇÃO: Este arquivo usa SERVICE_ROLE_KEY
//     e só deve ser usado em código server-side!
// =============================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// =============================================
// PROTEÇÃO: Impedir uso no cliente
// =============================================
if (typeof window !== 'undefined') {
  throw new Error(
    '🚨 SECURITY ERROR: supabase-admin.ts não pode ser importado no cliente!\n' +
    'Use supabase-client.ts para código client-side.\n' +
    'O SERVICE_ROLE_KEY nunca deve ser exposto no browser.'
  );
}

let supabaseAdminInstance: SupabaseClient | null = null;

/**
 * Retorna o cliente Supabase admin (service role).
 * Cria o cliente apenas na primeira chamada (lazy initialization).
 * 
 * @throws Error se as variáveis de ambiente não estiverem configuradas
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (supabaseAdminInstance) {
    return supabaseAdminInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Missing Supabase environment variables. ' +
      'Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  supabaseAdminInstance = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseAdminInstance;
}

/**
 * Proxy que permite usar `supabaseAdmin` como se fosse um cliente normal,
 * mas só cria a conexão quando é realmente usado.
 * 
 * Uso: import { supabaseAdmin } from '@/lib/supabase-admin'
 *      await supabaseAdmin.from('table').select()
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop: string) {
    const client = getSupabaseAdmin();
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

/**
 * Verifica se o Supabase está configurado (sem criar o cliente)
 */
export function isSupabaseConfigured(): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return !!(supabaseUrl && supabaseServiceKey && !supabaseUrl.includes('placeholder'));
}
