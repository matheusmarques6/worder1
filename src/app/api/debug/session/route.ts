import { NextResponse } from 'next/server';
import { getAuthClient } from '@/lib/api-utils';

/**
 * Debug endpoint para verificar sessão
 * 
 * USE PARA COMPARAR ENTRE DISPOSITIVOS:
 * - Se userId/orgId diferem → problema de sessão
 * - Se iguais mas stores diferem → problema de fetch/RLS
 */
export async function GET() {
  const auth = await getAuthClient();
  
  const debugInfo = {
    timestamp: new Date().toISOString(),
    authenticated: !!auth,
    userId: auth?.user?.id || null,
    email: auth?.user?.email || null,
    organizationId: auth?.user?.organization_id || null,
    role: auth?.user?.role || null,
  };

  // Se autenticado, buscar contagem de stores para comparar
  if (auth) {
    try {
      const { data: stores, error } = await auth.supabase
        .from('shopify_stores')
        .select('id, shop_name')
        .eq('organization_id', auth.user.organization_id);

      Object.assign(debugInfo, {
        storesCount: stores?.length || 0,
        storeNames: stores?.map(s => s.shop_name) || [],
        storesError: error?.message || null,
      });
    } catch (e: any) {
      Object.assign(debugInfo, {
        storesCount: 0,
        storesError: e.message,
      });
    }
  }

  return NextResponse.json(debugInfo);
}
