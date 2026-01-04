// =============================================
// WORDER: Supabase Client Factory (Browser/Client)
// /src/lib/supabase-client.ts
// 
// Este arquivo fornece um cliente Supabase para uso
// no browser (client-side) com a ANON_KEY pública.
// Criado de forma lazy para evitar erros no build.
//
// ✅ SEGURO para uso no cliente - usa apenas ANON_KEY
//    (chave pública que já é exposta no browser)
// =============================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClientInstance: SupabaseClient | null = null;

/**
 * Retorna o cliente Supabase para uso no browser.
 * Cria o cliente apenas na primeira chamada (lazy initialization).
 * 
 * @throws Error se as variáveis de ambiente não estiverem configuradas
 */
export function getSupabaseClient(): SupabaseClient {
  if (supabaseClientInstance) {
    return supabaseClientInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. ' +
      'Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  supabaseClientInstance = createClient(supabaseUrl, supabaseAnonKey);

  return supabaseClientInstance;
}

/**
 * Proxy que permite usar `supabaseClient` como se fosse um cliente normal,
 * mas só cria a conexão quando é realmente usado.
 * 
 * Uso: import { supabaseClient } from '@/lib/supabase-client'
 *      await supabaseClient.from('table').select()
 */
export const supabaseClient: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop: string) {
    const client = getSupabaseClient();
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

/**
 * Verifica se o Supabase client está configurado (sem criar o cliente)
 */
export function isSupabaseClientConfigured(): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return !!(supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('placeholder'));
}
