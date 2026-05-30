/**
 * Wrapper de fetch para chamadas autenticadas a rotas internas /api/*.
 *
 * O app autentica via cookies httpOnly (`sb-access-token`, `sb-refresh-token`)
 * gravados pelo /api/auth no login. JS do browser NAO pode ler cookies
 * httpOnly — entao authedFetch nao tenta montar Authorization header.
 *
 * Em vez disso, apenas garante `credentials: 'include'` pra fetch enviar os
 * cookies automaticamente, e o backend (`requireOrgFromAuth`) extrai o JWT
 * do cookie `sb-access-token`.
 *
 * Same-origin fetch ja envia cookies por default em chrome/firefox, mas
 * 'include' explicito evita surpresas em casos edge (subdominio, iframes,
 * algum SDK que sobrescreve default).
 */
export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(input, {
    credentials: 'include',
    ...init,
  })
}
