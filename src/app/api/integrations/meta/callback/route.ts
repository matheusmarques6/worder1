import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { consumeOAuthState, logOAuthAttempt } from '@/lib/oauth-security';

const META_API_VERSION = 'v19.0';
const META_API_URL = `https://graph.facebook.com/${META_API_VERSION}`;

// Helper to make Meta API calls
async function metaFetch(accessToken: string, endpoint: string, params: Record<string, string> = {}) {
  const url = new URL(`${META_API_URL}${endpoint}`);
  url.searchParams.set('access_token', accessToken);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  
  const response = await fetch(url.toString());
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error.message || 'Meta API error');
  }
  
  return data;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // URL base para redirecionamento
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;

  // 1. Verificar erro do Meta
  if (error) {
    logOAuthAttempt('meta', false, undefined, `meta_error: ${error}`);
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=integrations&error=meta_${error}`
    );
  }

  // 2. Verificar parâmetros obrigatórios
  if (!code || !state) {
    logOAuthAttempt('meta', false, undefined, 'missing_params');
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=integrations&error=missing_params`
    );
  }

  // 3. VALIDAR STATE (CRÍTICO!)
  const stateData = await consumeOAuthState(state, 'meta');
  
  if (!stateData) {
    logOAuthAttempt('meta', false, undefined, 'invalid_or_expired_state');
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=integrations&error=invalid_state`
    );
  }

  const { organizationId, userId, storeId } = stateData;

  try {
    // 4. Trocar code por access token
    const tokenUrl = new URL(`${META_API_URL}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', process.env.META_APP_ID!);
    tokenUrl.searchParams.set('client_secret', process.env.META_APP_SECRET!);
    tokenUrl.searchParams.set('redirect_uri', `${baseUrl}/api/integrations/meta/callback`);
    tokenUrl.searchParams.set('code', code);

    const tokenResponse = await fetch(tokenUrl.toString());
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(tokenData.error.message);
    }

    const shortLivedToken = tokenData.access_token;

    // 5. Obter long-lived token (60 dias)
    const longLivedUrl = new URL(`${META_API_URL}/oauth/access_token`);
    longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longLivedUrl.searchParams.set('client_id', process.env.META_APP_ID!);
    longLivedUrl.searchParams.set('client_secret', process.env.META_APP_SECRET!);
    longLivedUrl.searchParams.set('fb_exchange_token', shortLivedToken);

    const longLivedResponse = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedResponse.json();

    const accessToken = longLivedData.access_token || shortLivedToken;
    const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 dias

    // 6. Buscar dados do usuário Meta
    const userInfo = await metaFetch(accessToken, '/me', {
      fields: 'id,name,email'
    });

    // 7. Buscar TODAS as ad accounts
    const adAccountsData = await metaFetch(accessToken, '/me/adaccounts', {
      fields: 'id,account_id,name,currency,timezone_name,account_status,business',
      limit: '100'
    });

    if (!adAccountsData.data || adAccountsData.data.length === 0) {
      logOAuthAttempt('meta', false, organizationId, 'no_ad_accounts');
      return NextResponse.redirect(
        `${baseUrl}/settings?tab=integrations&error=no_ad_accounts`
      );
    }

    const supabase = getSupabaseAdmin();
    let savedAccounts = 0;
    let savedPixels = 0;

    // 8. Salvar TODAS as ad accounts
    for (const account of adAccountsData.data) {
      const accountData: any = {
        organization_id: organizationId,
        ad_account_id: account.account_id,
        ad_account_name: account.name,
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        currency: account.currency || 'BRL',
        timezone: account.timezone_name || 'America/Sao_Paulo',
        business_id: account.business?.id || null,
        business_name: account.business?.name || null,
        meta_user_id: userInfo.id,
        meta_user_name: userInfo.name,
        is_active: true,
        status: 'connected',
        connected_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
      };

      // Adicionar store_id se foi fornecido
      if (storeId) {
        accountData.store_id = storeId;
      }

      // Definir conflict key baseado em se tem store_id ou não
      const conflictKey = storeId 
        ? 'store_id,ad_account_id' 
        : 'organization_id,ad_account_id';

      const { error: upsertError } = await supabase
        .from('meta_accounts')
        .upsert(accountData, { 
          onConflict: conflictKey,
          ignoreDuplicates: false 
        });

      if (!upsertError) {
        savedAccounts++;
      } else {
        console.error('Error saving account:', account.account_id, upsertError);
      }
    }

    // 9. Buscar e salvar pixels (via Business Manager)
    try {
      const businessesData = await metaFetch(accessToken, '/me/businesses', {
        fields: 'id,name,owned_pixels{id,name}'
      });

      if (businessesData.data) {
        for (const business of businessesData.data) {
          const pixels = business.owned_pixels?.data || [];
          
          for (const pixel of pixels) {
            const pixelData: any = {
              organization_id: organizationId,
              pixel_id: pixel.id,
              pixel_name: pixel.name,
              access_token: accessToken,
              is_active: true,
            };

            if (storeId) {
              pixelData.store_id = storeId;
            }

            const { error: pixelError } = await supabase
              .from('meta_pixels')
              .upsert(pixelData, {
                onConflict: 'store_id,pixel_id',
                ignoreDuplicates: false
              });

            if (!pixelError) {
              savedPixels++;
            }
          }
        }
      }
    } catch (pixelError) {
      // Pixels são opcionais, não falhar se não conseguir buscar
      console.warn('Could not fetch pixels:', pixelError);
    }

    // 10. Atualizar/criar registro em meta_integrations
    await supabase.from('meta_integrations').upsert({
      organization_id: organizationId,
      status: 'connected',
      connected_by_user_id: userId,
      connected_by_name: userInfo.name,
      connected_by_email: userInfo.email,
      connected_at: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
    }, { onConflict: 'organization_id' });

    logOAuthAttempt('meta', true, organizationId);

    // Construir URL de sucesso
    const successUrl = new URL(`${baseUrl}/settings`);
    successUrl.searchParams.set('tab', 'integrations');
    successUrl.searchParams.set('success', 'meta_connected');
    successUrl.searchParams.set('accounts', savedAccounts.toString());
    if (savedPixels > 0) {
      successUrl.searchParams.set('pixels', savedPixels.toString());
    }
    if (storeId) {
      successUrl.searchParams.set('store_id', storeId);
    }

    return NextResponse.redirect(successUrl.toString());

  } catch (error: any) {
    console.error('Meta OAuth error:', error);
    logOAuthAttempt('meta', false, organizationId, error.message);
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=integrations&error=meta_oauth_failed&message=${encodeURIComponent(error.message)}`
    );
  }
}
