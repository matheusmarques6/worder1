/** Embedding writer/reader contract. Tool configuration parity is exercised
 * behaviorally by hub-configuration-parity.test.ts and the shared Python suite.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
describe('modelo de embedding — ingestão × busca (achado A8)', () => {
  const hubModel = /OPENAI_EMBEDDING_MODEL\s*=\s*'([^']+)'/.exec(read('src/lib/ai/embeddings.ts'))?.[1];
  const hubDims = /OPENAI_EMBEDDING_DIMENSIONS\s*=\s*(\d+)/.exec(read('src/lib/ai/embeddings.ts'))?.[1];
  const runtimeModel = /EMBEDDING_MODEL\s*=\s*"([^"]+)"/.exec(
    read('runtime/src/agents_runtime/agent_core/llm.py'),
  )?.[1];

  it('a extração funcionou (guarda anti-vacuidade)', () => {
    expect(hubModel).toBeTruthy();
    expect(runtimeModel).toBeTruthy();
    expect(hubDims).toBe('1536');
  });

  it('CONVERGIDO (28/08): quem grava o vetor e quem o busca usam o mesmo modelo', () => {
    // Era a divergência A8 — o hub gravava ada-002 enquanto o runtime buscava
    // 3-small. A troca saiu de graça porque a base estava vazia em produção.
    expect(hubModel).toBe('text-embedding-3-small');
    expect(runtimeModel).toContain(hubModel as string);
  });

  it('por que é silencioso: os dois modelos têm 1536 dimensões', () => {
    // Dimensão igual = o `vector(1536)` aceita os dois, a distância cosseno
    // calcula normalmente e a busca devolve vizinhos errados sem erro nenhum.
    expect(read('supabase/migrations/20260812000001_agents_baseline_prereqs.sql')).toContain(
      'vector(1536)',
    );
  });

  it('a proveniência existe e é cobrada pelo banco, não pela disciplina de quem escreve', () => {
    // A migration 20260828000001 fecha o buraco que este teste denunciava: sem
    // `embedding_model` não dava para saber o que foi escrito com quê, nem
    // detectar uma base meio-a-meio, nem verificar uma reindexação.
    //
    // A restrição é um PAR, não um `not null`: procedência existe exatamente
    // quando o vetor existe — um upload chunkado e ainda não embedado seria
    // obrigado a mentir um espaço que não tem.
    const migration = read('supabase/migrations/20260828000001_embedding_model_provenance.sql');
    expect(migration).toContain('add column if not exists embedding_model');
    expect(migration).toContain('check ((embedding is null) = (embedding_model is null))');
  });

  it('quem grava carimba o espaço, e o rótulo qualifica o provedor', () => {
    // As duas pontas chegam ao mesmo modelo por rotas diferentes: o hub pela
    // OpenAI direta com a chave da org, o runtime pela OpenRouter com a chave
    // de plataforma. O rótulo carrega o provedor para que uma divergência
    // futura seja detectável em vez de silenciosa.
    expect(read('src/lib/ai/embeddings.ts')).toContain(
      'export const EMBEDDING_SPACE = `openai:${OPENAI_EMBEDDING_MODEL}`',
    );
    for (const f of [
      'src/app/api/ai/process/document/route.ts',
      'src/app/api/ai/agents/[id]/integrations/[integrationId]/sync/route.ts',
    ]) {
      expect(read(f)).toContain('embedding_model: EMBEDDING_SPACE');
    }
  });

  it('quem busca declara os espaços que sabe ler', () => {
    // Sem o filtro, um chunk de outro espaço volta como vizinho — foi assim que
    // a divergência passou despercebida. A suposição de que a OpenRouter é
    // passagem pura vive nomeada nessa constante, não invisível no código.
    const llm = read('runtime/src/agents_runtime/agent_core/llm.py');
    expect(llm).toContain('SEARCHABLE_SPACES');
    expect(llm).toContain('openai:text-embedding-3-small');
    expect(read('runtime/src/agents_runtime/repository/knowledge.py')).toContain(
      'c.embedding_model = any(%(spaces)s)',
    );
  });

  it('todo caminho de ingestão passa pelo mesmo módulo (a troca do B é num lugar só)', () => {
    // Se aparecer um quarto escritor que não use embeddings.ts, a unificação
    // do B deixa um espaço vetorial órfão para trás.
    const escritores = [
      'src/app/api/ai/process/document/route.ts',
      'src/app/api/ai/agents/[id]/integrations/[integrationId]/sync/route.ts',
    ];
    for (const f of escritores) {
      expect(read(f)).toContain("from '@/lib/ai/embeddings'");
      expect(read(f)).toContain('ai_agent_chunks');
    }
  });
});
