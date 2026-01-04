'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore, useStoreStore, useCRMStore, useWhatsAppStore, useAutomationStore } from '@/stores';
import { useInboxStore } from '@/stores/inboxStore';
import { supabaseClient } from '@/lib/supabase-client';

/**
 * AuthProvider - Gerencia estado de autenticação global
 * 
 * ✅ Responsabilidades:
 * 1. Inicializar usuário ao carregar app
 * 2. Escutar mudanças de sessão (login/logout)
 * 3. Limpar stores ao deslogar
 * 4. Re-popular user ao logar
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAuthStore();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const initAuth = async () => {
      try {
        console.log('[AuthProvider] Initializing auth...');
        
        const { data: { user: authUser }, error: authError } = await supabaseClient.auth.getUser();
        
        if (authError) {
          console.error('[AuthProvider] Auth error:', authError.message);
          setUser(null);
          setLoading(false);
          return;
        }

        if (!authUser) {
          console.log('[AuthProvider] No user logged in');
          setUser(null);
          setLoading(false);
          return;
        }

        const { data: profile, error: profileError } = await supabaseClient
          .from('profiles')
          .select('organization_id, role, name')
          .eq('id', authUser.id)
          .single();

        if (profileError || !profile?.organization_id) {
          console.error('[AuthProvider] Profile error:', profileError?.message);
          setUser(null);
          setLoading(false);
          return;
        }

        console.log('[AuthProvider] User authenticated:', authUser.email);

        setUser({
          id: authUser.id,
          email: authUser.email || '',
          name: profile.name || authUser.email?.split('@')[0] || '',
          organization_id: profile.organization_id,
          role: profile.role || 'admin',
          created_at: authUser.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      } catch (error) {
        console.error('[AuthProvider] Init error:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[AuthProvider] Auth state changed:', event);

        // ✅ FIX: Só limpar stores quando EXPLICITAMENTE faz logout
        // NÃO tratar INITIAL_SESSION sem session como logout!
        if (event === 'SIGNED_OUT') {
          console.log('[AuthProvider] User signed out - clearing stores');
          
          setUser(null);
          useStoreStore.getState().clearStores();
          useCRMStore.getState().clearAll();
          useWhatsAppStore.getState().clearAll();
          useAutomationStore.getState().clearAll();
          useInboxStore.getState().clearAll();
          
          return;
        }

        // ✅ FIX: Ignorar INITIAL_SESSION - deixar initAuth() cuidar disso
        if (event === 'INITIAL_SESSION') {
          console.log('[AuthProvider] Initial session event - skipping (handled by initAuth)');
          return;
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (!session) {
            console.warn('[AuthProvider] SIGNED_IN/TOKEN_REFRESHED but no session');
            return;
          }
          
          try {
            const { data: profile } = await supabaseClient
              .from('profiles')
              .select('organization_id, role, name')
              .eq('id', session.user.id)
              .single();

            if (profile?.organization_id) {
              setUser({
                id: session.user.id,
                email: session.user.email || '',
                name: profile.name || session.user.email?.split('@')[0] || '',
                organization_id: profile.organization_id,
                role: profile.role || 'admin',
                created_at: session.user.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }
          } catch (error) {
            console.error('[AuthProvider] Profile fetch error:', error);
          }
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [setUser, setLoading]);

  return <>{children}</>;
}

export default AuthProvider;
