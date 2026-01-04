// =============================================
// WORDER: Supabase Client Factory (Browser/Client)
// /src/lib/supabase-client.ts
// 
// ✅ CORRIGIDO: Usa createClientComponentClient do @supabase/auth-helpers-nextjs
//    para ler sessão dos cookies corretamente
// =============================================

'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';

let supabaseClientInstance: SupabaseClient | null = null;

/**
 * Retorna o cliente Supabase para uso no browser.
 * Usa createClientComponentClient que lê sessão dos cookies automaticamente.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClientInstance) {
    supabaseClientInstance = createClientComponentClient();
  }
  return supabaseClientInstance;
}

/**
 * Proxy que permite usar `supabaseClient` como se fosse um cliente normal,
 * mas só cria a conexão quando é realmente usado.
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
 * Verifica se o Supabase client está configurado
 */
export function isSupabaseClientConfigured(): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return !!(supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('placeholder'));
}
