-- =============================================
-- whatsapp_campaign_logs: registro de EVENTOS da campanha.
--
-- Esta tabela nasceu como log por destinatário (contact_mobile, status,
-- meta_message_id, delivery_time). Esse papel hoje é de
-- whatsapp_campaign_recipients, que tem tudo isso e mais — é onde o
-- processador e o webhook da Meta escrevem.
--
-- O que o código grava aqui é outra coisa: o histórico da campanha
-- ("pausada pelo lojista", "template não aprovado", "duplicada de X"),
-- com log_type / message / details. Nenhuma dessas três colunas existia,
-- e como o PostgREST recusa a linha inteira quando não conhece um campo,
-- NENHUM evento era registrado: pausar, retomar, cancelar, duplicar,
-- agendar e todo o rastro do processador caíam no vazio. A tela de
-- detalhe da campanha mostra esse histórico — e mostrava sempre vazio.
--
-- contact_mobile era NOT NULL: um evento da campanha não tem telefone.
--
-- A tabela está vazia em produção, então isto é ajuste de forma, não
-- migração de dado.
-- =============================================

do $$
begin
  if to_regclass('public.whatsapp_campaign_logs') is null then
    return;
  end if;

  alter table public.whatsapp_campaign_logs add column if not exists log_type varchar(16);
  alter table public.whatsapp_campaign_logs add column if not exists message text;
  alter table public.whatsapp_campaign_logs add column if not exists details jsonb;

  -- Evento de campanha não tem destinatário.
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='whatsapp_campaign_logs'
                and column_name='contact_mobile' and is_nullable='NO') then
    alter table public.whatsapp_campaign_logs alter column contact_mobile drop not null;
  end if;
end $$;

-- O histórico é sempre lido por campanha, do mais novo para o mais velho.
create index if not exists idx_wa_campaign_logs_campaign_created
  on public.whatsapp_campaign_logs (campaign_id, created_at desc);

comment on table public.whatsapp_campaign_logs is
  'Histórico de eventos da campanha (log_type/message/details). O estado por destinatário fica em whatsapp_campaign_recipients.';
