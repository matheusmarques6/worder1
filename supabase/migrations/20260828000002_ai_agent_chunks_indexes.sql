-- ============================================================================
-- Índice vetorial e índice de organização em ai_agent_chunks — item 08 da
-- auditoria de 28/08.
--
-- O achado: `order by c.embedding <=> ...` (knowledge.py, search_knowledge)
-- roda sem nenhum índice vetorial e sem nenhum índice em organization_id. O
-- docstring do repositório dizia casar com um HNSW "construído em S2" que
-- nunca existiu neste repo — grep por hnsw/ivfflat/vector_cosine em
-- supabase/ dava zero. Sem índice o plano é sempre seq scan + sort completo;
-- numa base que ainda vai crescer isso piora com cada chunk novo, e a
-- mentira do docstring escondia que o trabalho nunca tinha sido feito.
--
-- O índice serve A QUERY QUE EXISTE, não uma hipotética: search_knowledge
-- filtra por `embedding is not null`, `embedding_model = any(...)` e
-- `organization_id = current_app_organization_id()`, e ordena por
-- `embedding <=> :query`. Dois índices bastam:
--   1. HNSW com vector_cosine_ops em ai_agent_chunks.embedding — é a
--      classe de operador que casa com `<=>` (distância cosseno), a mesma
--      que search_knowledge usa tanto no ORDER BY quanto na similaridade
--      exposta (`1 - distância`). IVFFlat foi descartado: exige `lists`
--      calibrado ao volume da tabela e tem recall ruim quando a tabela é
--      pequena; HNSW não pede dado nenhum para ser construído — e a tabela
--      está vazia hoje.
--   2. btree em organization_id — serve o corte por tenant que toda leitura
--      desta tabela legada faz à mão (RLS está desligada aqui; ver FORK.md
--      item 6 e o comentário de search_knowledge).
--
-- Sem CONCURRENTLY: migration do Supabase roda em transação e CONCURRENTLY
-- não pode rodar dentro de uma. A tabela está vazia em produção — 0 chunks,
-- 0 fontes, mesma medição de 28/08 da migration anterior — então criar o
-- índice é instantâneo; o preço de estar errado seria travar escrita por
-- alguns segundos se alguma loja alimentar a base antes do deploy, não os
-- minutos que CONCURRENTLY existe para evitar.
--
-- Guardada por to_regclass pela mesma razão de sempre: o CI sobe um banco a
-- partir DESTAS migrations, e uma migration que assume uma tabela alheia
-- derruba o `supabase start` inteiro (item 0a da auditoria).
-- ============================================================================

do $$
begin
    if to_regclass('public.ai_agent_chunks') is null then
        raise notice 'ai_agent_chunks ausente — pulando índices de embedding/organização';
        return;
    end if;

    create index if not exists ai_agent_chunks_embedding_hnsw_idx
        on public.ai_agent_chunks
        using hnsw (embedding vector_cosine_ops);

    create index if not exists ai_agent_chunks_organization_id_idx
        on public.ai_agent_chunks (organization_id);
end $$;
