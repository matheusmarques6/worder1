/**
 * API: /api/meta/accounts
 * 
 * GET - Lista contas Meta de uma loja
 * DELETE - Remove vínculo de uma conta com a loja
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

// GET - Listar contas de uma loja
export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  const storeId = request.nextUrl.searchParams.get('store_id');

  if (!storeId) {
    return NextResponse.json(
      { error: 'store_id is required' },
      { status: 400 }
    );
  }

  try {
    // Validar que a loja pertence à organização
    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('id, name')
      .eq('id', storeId)
      .eq('organization_id', organizationId)
      .single();

    if (storeError || !store) {
      return NextResponse.json(
        { error: 'Store not found or access denied' },
        { status: 403 }
      );
    }

    // Buscar contas vinculadas à loja
    const { data: accounts, error: accountsError } = await supabase
      .from('meta_accounts')
      .select(`
        id,
        ad_account_id,
        ad_account_name,
        currency,
        timezone,
        is_active,
        status,
        meta_user_id,
        meta_user_name,
        business_id,
        business_name,
        last_sync_at,
        connected_at,
        token_expires_at,
        created_at
      `)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (accountsError) {
      throw accountsError;
    }

    // Verificar se alguma conta tem token expirando em breve (7 dias)
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const accountsWithWarnings = (accounts || []).map(account => {
      const tokenExpires = account.token_expires_at ? new Date(account.token_expires_at) : null;
      const isExpiringSoon = tokenExpires && tokenExpires < sevenDaysFromNow;
      const isExpired = tokenExpires && tokenExpires < now;

      return {
        ...account,
        warnings: {
          token_expiring_soon: isExpiringSoon && !isExpired,
          token_expired: isExpired,
        }
      };
    });

    return NextResponse.json({
      accounts: accountsWithWarnings,
      total: accountsWithWarnings.length,
      store: {
        id: store.id,
        name: store.name,
      }
    });

  } catch (error: any) {
    console.error('Error fetching meta accounts:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch accounts' },
      { status: 500 }
    );
  }
}

// DELETE - Remover vínculo de conta
export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  try {
    const body = await request.json();
    const { account_id, store_id } = body;

    if (!account_id || !store_id) {
      return NextResponse.json(
        { error: 'account_id and store_id are required' },
        { status: 400 }
      );
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

    // Verificar se a conta existe e pertence à loja
    const { data: account, error: accountError } = await supabase
      .from('meta_accounts')
      .select('id, ad_account_name')
      .eq('id', account_id)
      .eq('store_id', store_id)
      .single();

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // Opção 1: Soft delete (marcar como inativa)
    const { error: updateError } = await supabase
      .from('meta_accounts')
      .update({ 
        is_active: false, 
        status: 'disconnected',
        updated_at: new Date().toISOString()
      })
      .eq('id', account_id);

    // Opção 2: Hard delete (descomente se preferir deletar de vez)
    // const { error: deleteError } = await supabase
    //   .from('meta_accounts')
    //   .delete()
    //   .eq('id', account_id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      message: `Conta "${account.ad_account_name}" desconectada com sucesso`
    });

  } catch (error: any) {
    console.error('Error disconnecting meta account:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to disconnect account' },
      { status: 500 }
    );
  }
}

// PATCH - Atualizar configurações de uma conta
export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  try {
    const body = await request.json();
    const { account_id, store_id, is_active } = body;

    if (!account_id || !store_id) {
      return NextResponse.json(
        { error: 'account_id and store_id are required' },
        { status: 400 }
      );
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

    // Atualizar conta
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (typeof is_active === 'boolean') {
      updateData.is_active = is_active;
    }

    const { data: updatedAccount, error: updateError } = await supabase
      .from('meta_accounts')
      .update(updateData)
      .eq('id', account_id)
      .eq('store_id', store_id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      account: updatedAccount
    });

  } catch (error: any) {
    console.error('Error updating meta account:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update account' },
      { status: 500 }
    );
  }
}
