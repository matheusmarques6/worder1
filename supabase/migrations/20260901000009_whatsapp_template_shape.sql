-- ============================================================================
-- 20260901000009_whatsapp_template_shape.sql
-- Auditoria 2026-08-28, item 34 — templates com componentes e variáveis.
--
-- Achado: `channels/cloud_api.py` monta `{name, language}` e mais nada. Um
-- template APROVADO COM PARÂMETRO configurado como fallback de janela fechada
-- sai sem `components`, a Meta recusa, e o cliente não recebe nada — justo na
-- hora em que esse caminho existe. O runtime nem sabia perguntar: `grep
-- whatsapp_templates runtime/src` voltava vazio.
--
-- Esta porta é o que o runtime passa a perguntar: "a linha aprovada desta org
-- para este nome+idioma exige parâmetro?". A resposta sai CRUA — as colunas
-- de forma, do jeito que estão — porque `public.whatsapp_templates` guarda a
-- mesma coisa em DOIS formatos (o `components` JSONB da Meta e as colunas
-- achatadas `header_type`/`body_text`/`buttons`), e quem já sabe conciliar os
-- dois é o TS (`src/lib/whatsapp/template-components.ts:1-9`). O Python
-- espelha aquela lógica; o SQL não tem opinião nenhuma, no mesmo desenho de
-- `internal.active_whatsapp_business_account` (20260901000001), que devolve o
-- token nas duas colunas possíveis e deixa o Python escolher.
--
-- SECURITY DEFINER e não `grant select`: `public.whatsapp_templates` é LEGADA
-- e está SEM RLS (`relrowsecurity = false`, nenhuma policy — a tabela nasce em
-- 20260812000001:616-643 e nenhuma migration a ligou depois). Um `grant select`
-- direto ao `sender_role` entregaria a ele os templates de TODAS as orgs, que
-- é exatamente o vazamento que o item 20 fechou em
-- `whatsapp_business_accounts` e o item 30 fechou de novo. A função recusa
-- antes de ler qualquer coisa se a org pedida não for a org da sessão.
--
-- Sem filtro por `status`: a pergunta aqui é sobre a FORMA do template, não
-- sobre a aprovação dele — um template pendente que exige duas variáveis
-- continua exigindo duas. Quem decide enviar já decidiu antes (o preflight).
--
-- `order by synced_at desc nulls last, created_at desc`: a UNIQUE da tabela é
-- (waba_id, name, language), então uma org com duas contas WABA pode ter duas
-- linhas para o mesmo nome+idioma. A mais recentemente sincronizada é a que
-- descreve o que a Meta tem hoje.
-- ============================================================================

create function internal.whatsapp_template_shape(
    p_organization_id uuid,
    p_name text,
    p_language text
)
    returns table (
        components jsonb,
        header_type text,
        body_text text,
        buttons jsonb
    )
    language plpgsql
    stable
    security definer
    set search_path = pg_catalog, public
as $$
begin
    if p_organization_id is distinct from public.current_app_organization_id() then
        raise exception 'whatsapp_template_shape: org % não é a org da sessão',
            p_organization_id;
    end if;
    return query
        select t.components, t.header_type, t.body_text, t.buttons
          from public.whatsapp_templates t
         where t.organization_id = p_organization_id
           and t.name = p_name
           and t.language = p_language
         order by t.synced_at desc nulls last, t.created_at desc
         limit 1;
end
$$;

comment on function internal.whatsapp_template_shape(uuid, text, text) is
    'A forma do template aprovado de UMA org (nome+idioma) — recusa qualquer '
    'org que não seja a da sessão antes de ler. Colunas cruas, nos dois '
    'formatos possíveis: quem concilia é o Python (channels/template_components).';

-- Quem pergunta é o SENDER, no momento de montar o payload do envio — o mesmo
-- grant único de `active_whatsapp_business_account`.
revoke execute on function internal.whatsapp_template_shape(uuid, text, text) from public;
grant execute on function internal.whatsapp_template_shape(uuid, text, text) to sender_role;
