// =============================================
// Shopify Client Credentials Token Manager
//
// Generates access tokens via grant_type=client_credentials.
// Tokens expire in 24h (86399s) and are auto-refreshed by the
// /api/cron/shopify-token-refresh cron every ~23h.
//
// Ref: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant
// =============================================

export interface ClientCredentialsResult {
  access_token: string;
  scope: string;
  expires_in: number;
}

/**
 * Exchange Client ID + Client Secret for a short-lived access token.
 * Throws a user-friendly error if credentials are invalid or the app
 * is not installed on the store.
 */
export async function getAccessTokenViaClientCredentials(
  shopDomain: string,
  clientId: string,
  clientSecret: string
): Promise<ClientCredentialsResult> {
  const url = `https://${shopDomain}/admin/oauth/access_token`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    let message = 'Erro ao gerar access token';
    if (response.status === 401 || response.status === 403) {
      message = 'Client ID ou Client Secret inválidos';
    } else if (error.includes('application_cannot_be_found')) {
      message =
        'App não encontrado. Verifique se o app está instalado na loja e se o Client ID está correto.';
    } else if (error) {
      message = `Shopify retornou ${response.status}: ${error.slice(0, 200)}`;
    }
    throw new Error(message);
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error('Resposta da Shopify não contém access_token');
  }

  return {
    access_token: data.access_token,
    scope: data.scope || '',
    expires_in: Number(data.expires_in) || 86399,
  };
}

/**
 * Convenience wrapper used by the cron — returns just the token.
 */
export async function refreshStoreToken(
  shopDomain: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const result = await getAccessTokenViaClientCredentials(
    shopDomain,
    clientId,
    clientSecret
  );
  return result.access_token;
}
