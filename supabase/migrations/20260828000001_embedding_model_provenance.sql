-- ============================================================================
-- Procedência do vetor: todo chunk diz em que espaço vetorial foi escrito.
--
-- O TS gravava com `text-embedding-ada-002` (src/lib/ai/embeddings.ts) e o
-- runtime Python buscava com `text-embedding-3-small`
-- (agent_core/llm.py). Os dois têm 1536 dimensões, então o `vector(1536)`
-- aceita ambos, a distância cosseno calcula normalmente e a busca devolve
-- VIZINHOS ERRADOS sem erro nenhum. É a falha mais silenciosa da auditoria:
-- não há exceção, não há log, só respostas piores.
--
-- Sem coluna de proveniência não dá para saber o que foi escrito com quê, nem
-- detectar uma base meio-a-meio, nem verificar uma reindexação. O teste
-- `src/lib/ai/__tests__/hub-runtime-parity.test.ts` já prescrevia a ordem:
-- criar a coluna ANTES de trocar o modelo.
--
-- A restrição é um PAR, não um `not null`: procedência existe exatamente quando
-- o vetor existe. `not null` puro parecia mais rigoroso e era errado — um
-- upload já chunkado e ainda NÃO embedado (`embedding is null`, caso real em
-- tests/db/test_knowledge_retrieval.py) seria obrigado a mentir um espaço que
-- não tem. O CHECK cobra os dois lados: vetor sem procedência é o bug original;
-- procedência sem vetor é uma afirmação sobre nada.
--
-- Exigir agora sai de graça porque a tabela está VAZIA em produção — 0 chunks e
-- 0 fontes, medido em 28/08/2026. Depois do primeiro dado, o mesmo rigor
-- custaria backfill e janela.
--
-- O valor qualifica o PROVEDOR junto do modelo (`openai:text-embedding-3-small`)
-- porque as duas pontas chegam ao modelo por rotas diferentes: quem grava usa a
-- OpenAI direta com a chave da org, quem busca usa a OpenRouter com a chave de
-- plataforma. Se um dia a OpenRouter deixar de ser passagem pura, é esta coluna
-- que diz exatamente o que precisa ser reindexado.
--
-- Guardada por to_regclass pela mesma razão das migrations de 17/08: o CI sobe
-- um banco a partir DESTAS migrations, e uma migration que assume tabela alheia
-- derruba o `supabase start` inteiro (foi o item 0a da auditoria).
-- ============================================================================

do $$
begin
    if to_regclass('public.ai_agent_chunks') is null then
        raise notice 'ai_agent_chunks ausente — pulando procedência de embedding';
        return;
    end if;

    alter table public.ai_agent_chunks
        add column if not exists embedding_model text;

    -- A tabela está vazia em produção; se algum ambiente tiver linhas com vetor,
    -- elas vieram do caminho antigo e precisam dizer isso antes do CHECK.
    update public.ai_agent_chunks
       set embedding_model = 'openai:text-embedding-ada-002'
     where embedding is not null
       and embedding_model is null;

    alter table public.ai_agent_chunks
        drop constraint if exists ai_agent_chunks_embedding_provenance;
    alter table public.ai_agent_chunks
        add constraint ai_agent_chunks_embedding_provenance
        check ((embedding is null) = (embedding_model is null));
end $$;
