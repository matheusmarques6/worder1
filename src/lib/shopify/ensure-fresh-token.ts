// =============================================
// ensureFreshToken
//
// For a manual (Client Credentials Grant) Shopify store, always refresh
// the access token before doing user-triggered work. Reinstalling the
// custom app on Shopify revokes the previously issued access_token
// immediately, which leaves our cached token_expires_at lying — the cron
// only refreshes near expiry, so a reinstall would silently break sync.
//
// Doing a client_credentials exchange here costs one HTTP roundtrip and
// always yields a valid token, or surfaces a clear error.
//
// For OAuth stores this is a no-op: the saved long-lived token stays
// valid until the merchant uninstalls the app.
// =============================================
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { refreshStoreToken } from './client-credentials';

export async function ensureFreshToken(store: any): Promise<{ ok: true; store: any } | { ok: false; error: string }> {
  if (store.connection_type !== 'manual') return { ok: true, store };
  if (!store.client_id || !store.api_secret) return { ok: true, store };

  try {
    const newToken = await refreshStoreToken(store.shop_domain, store.client_id, store.api_secret);
    const newExpiresAt = new Date(Date.now() + 86399 * 1000).toISOString();
    const supabase = getSupabaseAdmin();
    await supabase
      .from('shopify_stores')
      .update({ access_token: newToken, token_expires_at: newExpiresAt })
      .eq('id', store.id);
    return { ok: true, store: { ...store, access_token: newToken, token_expires_at: newExpiresAt } };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Falha ao gerar access token',
    };
  }
}
