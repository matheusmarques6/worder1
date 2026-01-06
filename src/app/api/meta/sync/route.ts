/**
 * API: /api/meta/sync
 * 
 * POST - Resincroniza dados das contas Meta de uma loja
 * 
 * Body:
 * - store_id: UUID (obrigatório)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { MetaApiClient, MetaApiClientError, META_API_URL } from '@/lib/meta-api';

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  try {
    const body = await request.json();
    const { store_id } = body;

    if (!store_id) {
      return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
    }

    // Validar que a loja pertence à organização
    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('id, name')
      .eq('id', store_id)
      .eq('organization_id', organizationId)
      .single();

    if (storeError || !store) {
      return NextResponse.json(
        { error: 'Store not found or access denied' },
        { status: 403 }
      );
    }

    // Buscar todas as contas da loja
    const { data: accounts, error: accountsError } = await supabase
      .from('meta_accounts')
      .select('*')
      .eq('store_id', store_id);

    if (accountsError) {
      throw accountsError;
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        success: true,
        summary: {
          accounts: { total: 0, updated: 0, errors: 0 },
          pixels: { total: 0, updated: 0, new: 0 },
        },
        synced_at: new Date().toISOString(),
      });
    }

    // Resultados
    const summary = {
      accounts: { total: accounts.length, updated: 0, errors: 0, expired: 0 },
      pixels: { total: 0, updated: 0, new: 0 },
    };

    // Sincronizar cada conta
    for (const account of accounts) {
      try {
        const client = new MetaApiClient(account.access_token);
        
        // Verificar se o token ainda é válido buscando dados da conta
        const accountData = await client.get(`/act_${account.ad_account_id}`, {
          fields: 'id,name,currency,timezone_name,account_status,business'
        });

        // Token válido! Atualizar dados
        const { error: updateError } = await supabase
          .from('meta_accounts')
          .update({
            ad_account_name: accountData.name,
            currency: accountData.currency || 'BRL',
            timezone: accountData.timezone_name || 'America/Sao_Paulo',
            business_id: accountData.business?.id || null,
            business_name: accountData.business?.name || null,
            status: 'connected',
            last_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', account.id);

        if (!updateError) {
          summary.accounts.updated++;
        }

        // Buscar e atualizar pixels
        try {
          const businessesData = await client.get('/me/businesses', {
            fields: 'id,name,owned_pixels{id,name}'
          });

          if (businessesData.data) {
            for (const business of businessesData.data) {
              const pixels = business.owned_pixels?.data || [];
              
              for (const pixel of pixels) {
                summary.pixels.total++;
                
                // Verificar se pixel já existe
                const { data: existingPixel } = await supabase
                  .from('meta_pixels')
                  .select('id')
                  .eq('store_id', store_id)
                  .eq('pixel_id', pixel.id)
                  .single();

                const pixelData = {
                  organization_id: organizationId,
                  store_id: store_id,
                  meta_ad_account_id: account.id,
                  pixel_id: pixel.id,
                  pixel_name: pixel.name,
                  access_token: account.access_token,
                  is_active: true,
                  updated_at: new Date().toISOString(),
                };

                if (existingPixel) {
                  await supabase
                    .from('meta_pixels')
                    .update(pixelData)
                    .eq('id', existingPixel.id);
                  summary.pixels.updated++;
                } else {
                  await supabase
                    .from('meta_pixels')
                    .insert(pixelData);
                  summary.pixels.new++;
                }
              }
            }
          }
        } catch (pixelError) {
          // Pixels são opcionais, não falhar
          console.warn('Failed to sync pixels:', pixelError);
        }

      } catch (accountError) {
        console.error(`Error syncing account ${account.ad_account_id}:`, accountError);
        summary.accounts.errors++;

        // Se token expirado, marcar a conta
        if (accountError instanceof MetaApiClientError && accountError.needsReconnect) {
          await supabase
            .from('meta_accounts')
            .update({ 
              status: 'expired',
              updated_at: new Date().toISOString(),
            })
            .eq('id', account.id);
          summary.accounts.expired++;
        }
      }
    }

    // Atualizar meta_integrations
    await supabase.from('meta_integrations').upsert({
      organization_id: organizationId,
      last_sync_at: new Date().toISOString(),
      status: summary.accounts.expired === accounts.length ? 'expired' : 'connected',
    }, { onConflict: 'organization_id' });

    return NextResponse.json({
      success: true,
      summary,
      synced_at: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Error syncing meta accounts:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to sync accounts' },
      { status: 500 }
    );
  }
}
