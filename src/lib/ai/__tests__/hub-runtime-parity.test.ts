/**
 * Os dois vocabulários que o hub e o runtime precisam falar igual.
 *
 * Não há tipo compartilhado entre `src/` (TypeScript, Vercel) e
 * `runtime/` (Python, Docker): o contrato entre eles é um nome de ferramenta
 * gravado em `ai_agents.settings.tools.enabled` e um nome de modelo de
 * embedding gravado junto do vetor. Quando um lado muda e o outro não, nada
 * quebra — o comportamento só fica errado, em silêncio.
 *
 * Este arquivo fixa o estado ATUAL dos dois vocabulários, divergência
 * incluída. Ele é verde hoje de propósito: serve para (a) descrever o bug com
 * precisão, (b) falhar no instante em que alguém mexer num lado só. Quando o
 * pacote B unificar, cada expectativa vira uma linha mais curta — e a
 * divergência esperada some.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

// ---------------------------------------------------------------------------
// Lado TS: o que a órbita → Ferramentas oferece ao lojista
// ---------------------------------------------------------------------------

const catalogSource = read('src/lib/ai/tools/catalog.ts');
const CATALOG_NAMES = [...catalogSource.matchAll(/name:\s*'([a-z_]+)'/g)].map((m) => m[1]).sort();

// ---------------------------------------------------------------------------
// Lado Python: o que o runtime sabe executar
// ---------------------------------------------------------------------------

const TOOLS_DIR = 'runtime/src/agents_runtime/tools';
const RUNTIME_TOOL_NAMES = readdirSync(path.join(ROOT, TOOLS_DIR))
  .filter((f) => f.endsWith('.py'))
  .flatMap((f) => [...read(`${TOOLS_DIR}/${f}`).matchAll(/^\s*name\s*=\s*"([a-z_]+)"/gm)].map((m) => m[1]))
  .sort();

const responderSource = read('runtime/src/agents_runtime/agent_core/responder.py');

/**
 * Nomes que o responder realmente consulta em `settings.tools.enabled`. Uma
 * classe de tool existir não basta: `get_customer_context` está registrada e
 * nenhum código a oferece ao modelo (o bloco ESTADO já entrega esses dados).
 */
const RUNTIME_HONORED = RUNTIME_TOOL_NAMES.filter((n) =>
  new RegExp(`["']${n}["']\\s+(?:not\\s+)?in\\s+(?:enabled_tools|resolved\\.tools)`).test(responderSource),
).sort();

// ---------------------------------------------------------------------------

describe('vocabulário de ferramentas — órbita × runtime', () => {
  it('a extração funcionou nos dois lados (guarda anti-vacuidade)', () => {
    expect(CATALOG_NAMES.length).toBeGreaterThan(0);
    expect(RUNTIME_TOOL_NAMES.length).toBeGreaterThan(0);
    expect(RUNTIME_HONORED.length).toBeGreaterThan(0);
  });

  it('o runtime honra exatamente search_knowledge e create_coupon', () => {
    expect(RUNTIME_HONORED).toEqual(['create_coupon', 'search_knowledge']);
  });

  it('o único nome em comum entre painel e runtime é search_knowledge', () => {
    const comuns = CATALOG_NAMES.filter((n) => RUNTIME_HONORED.includes(n));
    expect(comuns).toEqual(['search_knowledge']);
  });

  it('DIVERGÊNCIA CONHECIDA: o painel oferece 6 ferramentas que o runtime ignora', () => {
    // Ligar qualquer uma destas na órbita não produz erro nem efeito: o
    // responder simplesmente nunca as procura. Some quando o catálogo for
    // reescrito para o runtime (pré-requisito do pacote B).
    const oferecidasEIgnoradas = CATALOG_NAMES.filter((n) => !RUNTIME_HONORED.includes(n));
    expect(oferecidasEIgnoradas).toEqual([
      'order_status',
      'product_lookup',
      'save_customer',
      'save_interests',
      'timeline',
      'transfer_to_human',
    ]);
  });

  it('BLOQUEIO DO PACOTE B: create_coupon não existe no painel, então não há como ligá-la', () => {
    // O pacote B diz "ligar no agente (órbita → Ferramentas): search_knowledge
    // e create_coupon". A segunda metade não é executável pela UI que o plano
    // nomeia. Inverter esta asserção é o primeiro passo do B.
    expect(CATALOG_NAMES).not.toContain('create_coupon');
    expect(RUNTIME_HONORED).toContain('create_coupon');
  });

  it('o painel e o runtime leem e escrevem a MESMA chave (a tubulação está certa)', () => {
    // O problema é de vocabulário, não de encanamento: quem grava e quem lê
    // concordam sobre onde o dado mora.
    expect(read('src/lib/ai/agent-hub.ts')).toMatch(/settings\.tools\s*=\s*\{[\s\S]*?enabled:/);
    expect(read('runtime/src/agents_runtime/repository/agent.py')).toMatch(
      /settings\.get\("tools"\)[\s\S]{0,40}?get\("enabled"\)/,
    );
  });
});

// ---------------------------------------------------------------------------

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

  it('DIVERGÊNCIA CONHECIDA: quem grava o vetor e quem o busca usam modelos diferentes', () => {
    // Quando o pacote B unificar, este teste vira:
    //   expect(runtimeModel).toContain(hubModel)
    expect(hubModel).toBe('text-embedding-ada-002');
    expect(runtimeModel).toBe('openai/text-embedding-3-small');
    expect(runtimeModel).not.toContain(hubModel as string);
  });

  it('por que é silencioso: os dois modelos têm 1536 dimensões', () => {
    // Dimensão igual = o `vector(1536)` aceita os dois, a distância cosseno
    // calcula normalmente e a busca devolve vizinhos errados sem erro nenhum.
    expect(read('supabase/migrations/20260812000001_agents_baseline_prereqs.sql')).toContain(
      'vector(1536)',
    );
  });

  it('não há coluna de proveniência: o re-embed do pacote B não é verificável', () => {
    // Sem `embedding_model` em ai_agent_chunks, não dá para saber o que já foi
    // reprocessado, nem detectar uma base meio-a-meio. A migration do B
    // precisa criar essa coluna ANTES de trocar o modelo.
    const chunksTable = /create table if not exists public\.ai_agent_chunks[\s\S]*?\);/.exec(
      read('supabase/migrations/20260812000001_agents_baseline_prereqs.sql'),
    )?.[0];
    expect(chunksTable).toBeTruthy();
    expect(chunksTable).not.toContain('embedding_model');
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
