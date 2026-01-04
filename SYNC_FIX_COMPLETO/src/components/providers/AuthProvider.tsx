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
  const { user, setUser, setLoading } = useAuthStore();
  const initialized = useRef(false);

  useEffect(() => {
    // Evitar inicialização dupla
    if (initialized.current) return;
    initialized.current = true;

    // ==========================================
    // 1. INICIALIZAR USUÁRIO ATUAL
    // ==========================================
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

        // Buscar profile para pegar organization_id
        const { data: profile, error: profileError } = await supabaseClient
          .from('profiles')
          .select('organization_id, role, name')
          .eq('id', authUser.id)
          .single();

        if (profileError || !profile?.organization_id) {
          console.error('[AuthProvider] Profile error or no organization:', profileError?.message);
          // User existe mas não tem organization - pode ser onboarding incompleto
          setUser(null);
          setLoading(false);
          return;
        }

        console.log('[AuthProvider] User authenticated:', authUser.email, 'Org:', profile.organization_id);

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

    // ==========================================
    // 2. LISTENER PARA MUDANÇAS DE AUTH
    // ==========================================
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[AuthProvider] Auth state changed:', event);

        // SIGNED_OUT ou sessão inválida
        if (event === 'SIGNED_OUT' || !session) {
          console.log('[AuthProvider] User signed out - clearing all stores');
          
          // ✅ CRÍTICO: Limpar TODOS os stores
          setUser(null);
          useStoreStore.getState().clearStores();
          useCRMStore.getState().clearAll();
          useWhatsAppStore.getState().clearAll();
          useAutomationStore.getState().clearAll();
          useInboxStore.getState().clearAll();
          
          return;
        }

        // SIGNED_IN ou TOKEN_REFRESHED
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          try {
            // Re-buscar profile para garantir dados atualizados
            const { data: profile } = await supabaseClient
              .from('profiles')
              .select('organization_id, role, name')
              .eq('id', session.user.id)
              .single();

            if (profile?.organization_id) {
              console.log('[AuthProvider] User profile loaded:', session.user.email);
              
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
            console.error('[AuthProvider] Error loading profile:', error);
          }
        }
      }
    );

    // Cleanup
    return () => {
      subscription.unsubscribe();
    };
  }, [setUser, setLoading]);

  return <>{children}</>;
}
