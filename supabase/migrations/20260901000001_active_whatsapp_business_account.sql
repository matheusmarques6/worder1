-- ============================================================================
-- 20260901000001_active_whatsapp_business_account.sql
-- Auditoria 2026-08-28, item 20 — token Meta por conta no runtime.
--
-- Achado: `channels/cloud_api.py` autenticava contra a Meta com UM token
-- global (`AGENTS_META_ACCESS_TOKEN`), o mesmo para toda loja migrada. O
-- app já guarda um token POR conta em `whatsapp_business_accounts`
-- (`access_token_encrypted`, com `access_token` legado como transição —
-- `src/lib/whatsapp/account-loader.ts:25-33`, `getAccessToken`): uma loja
-- migrada falava com a Meta usando a credencial de outra. Revogada, todas
-- caem juntas; vazada, vazam todas.
--
-- A porta é a mesma de `internal.active_shopify_store`
-- (20260813000006_store_credentials_port.sql): SECURITY DEFINER que só
-- entrega a conta da PRÓPRIA org do chamador — a primeira coisa que faz é
-- recusar se a org pedida não é a org da sessão, antes de qualquer leitura.
-- `whatsapp_business_accounts` é legada, sem RLS (20260812000001), cheia de
-- token nas duas colunas: grant direto ao sender_role vazaria a credencial
-- de TODAS as orgs. O token sai como está armazenado, nas duas colunas —
-- quem escolhe qual coluna vale e quem decifra é o repository do runtime
-- (`repository/whatsapp_accounts.py`), com a mesma ENCRYPTION_KEY do app.
--
-- Conta "ativa" usa o MESMO critério que `internal.claim_outbox_batch`
-- (20260813000003) já usa para resolver `channel_external_id` quando a
-- outbox não amarrou a linha a uma conta específica: `status = 'active'`,
-- a mais antiga por org. Uma org com mais de uma conta ativa não é o caso
-- que este item resolve — é o mesmo desenho de "loja única" que
-- active_shopify_store já assume.
-- ============================================================================

create function internal.active_whatsapp_business_account(p_organization_id uuid)
    returns table (
        id uuid,
        phone_number_id text,
        access_token text,
        access_token_encrypted text
    )
    language plpgsql
    stable
    security definer
    set search_path = pg_catalog, public
as $$
begin
    if p_organization_id is distinct from public.current_app_organization_id() then
        raise exception 'active_whatsapp_business_account: org % não é a org da sessão',
            p_organization_id;
    end if;
    return query
        select w.id, w.phone_number_id, w.access_token, w.access_token_encrypted
          from public.whatsapp_business_accounts w
         where w.organization_id = p_organization_id
           and w.status = 'active'
         order by w.created_at
         limit 1;
end
$$;

comment on function internal.active_whatsapp_business_account(uuid) is
    'Credencial Meta da conta ativa de UMA org — recusa qualquer org que não '
    'seja a da sessão antes de ler. Token cru, nas duas colunas possíveis '
    '(cifrado ou legado em claro): quem decifra é o Python (secret_box).';

-- O caminho que hoje pede este token é o SENDER (`channels/cloud_api.py`),
-- nunca o worker: só sender_role recebe execute, no molde do grant único de
-- active_shopify_store para worker_role.
revoke execute on function internal.active_whatsapp_business_account(uuid) from public;
grant execute on function internal.active_whatsapp_business_account(uuid) to sender_role;
