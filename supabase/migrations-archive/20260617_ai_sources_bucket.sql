-- =============================================
-- Bucket de storage para arquivos de fontes de conhecimento dos
-- Agentes IA (ai_agent_sources com source_type='file').
--
-- NUNCA foi criado por migration — o codigo em
-- src/app/api/ai/agents/[id]/sources/upload/route.ts referencia
-- 'ai-sources' desde sempre e caia silenciosamente no fallback
-- "processa sem storage" quando o bucket nao existia.
--
-- PRIVADO: acesso exclusivamente server-side via service-role
-- (upload, download p/ reprocess, delete). Sem policies em
-- storage.objects: o default-deny do RLS bloqueia anon/authenticated.
-- O file_url gravado na fonte serve como referencia de path
-- (padrao ja usado pelo DELETE em sources/[sourceId]/route.ts).
-- =============================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-sources',
  'ai-sources',
  false,
  26214400, -- 25MB (mesmo MAX_FILE_SIZE do upload/route.ts)
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv'
  ]
)
on conflict (id) do nothing;
