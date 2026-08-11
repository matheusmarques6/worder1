-- ============================================================================
-- 20260813000006_store_credentials_port.sql
-- O create_coupon precisa da credencial da loja (shopify_stores.access_token)
-- — e shopify_stores é legada, RLS desligada, cheia de token. Grant direto ao
-- worker vazaria a credencial de TODAS as orgs (a mesma classe de furo da
-- contacts, migration 0004), e ligar RLS numa tabela que o app inteiro usa
-- não é fatia desta migration.
--
-- A porta: SECURITY DEFINER que só entrega a loja da org do PRÓPRIO worker
-- (valida contra current_app_organization_id() — argumento nenhum abre org
-- alheia). O token sai como está armazenado (cifrado ou legado); quem abre é
-- o secret_box do runtime, com a mesma ENCRYPTION_KEY do app.
-- ============================================================================

create function internal.active_shopify_store(p_organization_id uuid)
    returns table (id uuid, shop_domain text, access_token text, currency text)
    language plpgsql
    stable
    security definer
    set search_path = pg_catalog, public
as $$
begin
    if p_organization_id is distinct from public.current_app_organization_id() then
        raise exception 'active_shopify_store: org % não é a org da sessão', p_organization_id;
    end if;
    return query
        select s.id, s.shop_domain, s.access_token, s.currency
          from public.shopify_stores s
         where s.organization_id = p_organization_id
         order by s.created_at
         limit 1;
end
$$;

revoke execute on function internal.active_shopify_store(uuid) from public;
grant execute on function internal.active_shopify_store(uuid) to worker_role;
