/**
 * API: /api/ads/status
 * 
 * PATCH - Altera o status de uma campanha, ad set ou anúncio
 * 
 * Body:
 * - object_id: string (ID do objeto no Meta)
 * - object_type: 'campaign' | 'adset' | 'ad'
 * - status: 'ACTIVE' | 'PAUSED'
 * - store_id: UUID (para validação)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { MetaApiClient, MetaApiClientError } from '@/lib/meta-api';

export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  try {
    const body = await request.json();
    const { object_id, object_type, status, store_id } = body;

    // Validação de parâmetros
    if (!object_id) {
      return NextResponse.json({ error: 'object_id is required' }, { status: 400 });
    }
    if (!object_type || !['campaign', 'adset', 'ad'].includes(object_type)) {
      return NextResponse.json({ error: 'object_type must be campaign, adset, or ad' }, { status: 400 });
    }
    if (!status || !['ACTIVE', 'PAUSED'].includes(status)) {
      return NextResponse.json({ error: 'status must be ACTIVE or PAUSED' }, { status: 400 });
    }
    if (!store_id) {
      return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
    }

    // Validar que a loja pertence à organização
    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('id')
      .eq('id', store_id)
      .eq('organization_id', organizationId)
      .single();

    if (storeError || !store) {
      return NextResponse.json(
        { error: 'Store not found or access denied' },
        { status: 403 }
      );
    }

    // Buscar todas as contas ativas da loja
    const { data: accounts, error: accountsError } = await supabase
      .from('meta_accounts')
      .select('*')
      .eq('store_id', store_id)
      .eq('is_active', true)
      .eq('status', 'connected');

    if (accountsError || !accounts || accounts.length === 0) {
      return NextResponse.json(
        { error: 'No active Meta accounts found' },
        { status: 404 }
      );
    }

    // Tentar atualizar o status em cada conta até conseguir
    let updated = false;
    let lastError: any = null;

    for (const account of accounts) {
      try {
        const client = new MetaApiClient(account.access_token);
        
        // Tentar atualizar o status
        await client.updateStatus(object_id, status);
        updated = true;
        break;

      } catch (error) {
        lastError = error;
        
        // Se for erro de token expirado, marcar a conta
        if (error instanceof MetaApiClientError && error.needsReconnect) {
          await supabase
            .from('meta_accounts')
            .update({ status: 'expired' })
            .eq('id', account.id);
        }
        
        // Se for erro de permissão ou objeto não encontrado, tentar próxima conta
        if (error instanceof MetaApiClientError && (error.code === 100 || error.code === 10)) {
          continue;
        }
        
        // Outros erros, parar de tentar
        break;
      }
    }

    if (!updated) {
      // Verificar tipo de erro
      if (lastError instanceof MetaApiClientError) {
        if (lastError.needsReconnect) {
          return NextResponse.json({
            success: false,
            error: 'token_expired',
            message: 'Token de acesso expirado. Reconecte sua conta Meta.',
            needs_reconnect: true,
          }, { status: 401 });
        }

        if (lastError.code === 100) {
          return NextResponse.json({
            success: false,
            error: 'not_found',
            message: `${object_type} não encontrado`,
          }, { status: 404 });
        }

        if (lastError.code === 10) {
          return NextResponse.json({
            success: false,
            error: 'permission_denied',
            message: 'Sem permissão para alterar este objeto',
          }, { status: 403 });
        }
      }

      return NextResponse.json({
        success: false,
        error: 'update_failed',
        message: lastError?.message || 'Falha ao atualizar status',
      }, { status: 500 });
    }

    // Sucesso!
    const statusLabel = status === 'ACTIVE' ? 'ativado' : 'pausado';
    const typeLabel = object_type === 'campaign' ? 'Campanha' 
      : object_type === 'adset' ? 'Conjunto de anúncios' 
      : 'Anúncio';

    return NextResponse.json({
      success: true,
      object_id,
      object_type,
      new_status: status,
      message: `${typeLabel} ${statusLabel} com sucesso`,
    });

  } catch (error: any) {
    console.error('Error updating ads status:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'internal_error',
        message: error.message || 'Falha ao atualizar status' 
      },
      { status: 500 }
    );
  }
}
