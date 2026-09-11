-- =============================================
-- email_campaigns.error_message
--
-- Quatro caminhos do código escreviam esta coluna e ela não existia. O
-- PostgREST recusa a linha inteira quando não conhece um campo, então
-- nenhuma dessas escritas acontecia:
--
--   /api/email/campaigns/send        marcar a campanha como falha
--   /api/email/campaigns/send-batch  falha no despacho dos lotes
--   /api/email/campaigns/[id]/retry  limpar o erro ao voltar para rascunho
--
-- O efeito para o lojista: uma campanha que dava problema ficava presa em
-- "sending" para sempre — sem worker atrás dela, sem mensagem de erro — e
-- o botão de tentar de novo respondia "não está num estado que permite
-- retentativa", porque a própria escrita da retentativa era recusada.
--
-- Guardar o motivo da falha é o mínimo: é o que a tela mostra e o que
-- permite destravar.
-- =============================================

alter table if exists public.email_campaigns
  add column if not exists error_message text;

comment on column public.email_campaigns.error_message is
  'Motivo da última falha de envio (despacho de lotes, erro inesperado). Limpo ao voltar para rascunho.';
