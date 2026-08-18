/**
 * O inventário da limpeza, verificado por máquina (pacote F1).
 *
 * O dossiê classificou peças como "órfãs" navegando pela UI ("nenhuma tela
 * chega lá"). Navegação não é prova: `eval/`, `reports/`, `crawler.ts`,
 * `diff.ts`, `reports-metrics.ts` e o catálogo de ferramentas foram marcados
 * como órfãos e estão todos no caminho vivo. Este arquivo troca a opinião por
 * um grafo:
 *
 *   1. ALCANCE — a partir das entradas reais do Next (page/route/layout/
 *      middleware), quem é importado, transitivamente. Nada do conjunto de
 *      deleção pode aparecer aí.
 *   2. ROTAS — uma rota de API não tem importador; ela é chamada por URL.
 *      Para essas, a prova é textual: nenhum código VIVO cita a URL.
 *   3. TABELAS — o mesmo para o banco: nenhuma tabela marcada para drop pode
 *      ser consultada por módulo alcançável.
 *
 * Depois da deleção este arquivo continua verde (as listas apenas encolhem
 * junto com o código). Antes dela, ele é o único jeito de aprovar a LISTA em
 * vez do diff.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../../..');
const ROOT = path.resolve(SRC, '..');

// ---------------------------------------------------------------------------
// As três listas. Editá-las É a revisão do pacote F1.
// ---------------------------------------------------------------------------

/**
 * Órfãos confirmados: o editor antigo inteiro e o que só ele alcançava.
 * Prefixo = diretório inteiro.
 */
const DELETION_SET = [
  'src/components/agents/AIAgentEditor.tsx',
  'src/components/agents/AIAgentList.tsx',
  'src/components/agents/AgentPreview.tsx',
  'src/components/agents/PermissionsEditor.tsx',
  'src/components/agents/MaxTokensSlider.tsx',
  'src/components/agents/ModelSelector.tsx',
  'src/components/agents/tabs/',
  'src/components/agents/create/',
  'src/components/agents/playground/',
  'src/components/agents/dashboard/',
  'src/lib/ai/store-analyzer.ts',
];

/**
 * Rotas de API do mesmo conjunto. Não têm importador — a prova é que nenhum
 * código vivo cita a URL.
 */
const DELETION_SET_ROUTES = [
  'src/app/api/ai/analyze-store/route.ts',
];

/**
 * Segunda ordem: peças cujo ÚNICO sustentáculo é outra peça morta que só
 * sobrevive por um barril de re-export. Elas caem junto, mas exigem uma
 * decisão emparelhada (apagar o módulo E a linha do barril), então ficam numa
 * lista própria em vez de escorregar para dentro da leva principal.
 *
 * `useAgent.ts` é o caso: nenhum componente o usa, mas `hooks/index.ts` o
 * re-exporta, e é ele quem mantém `/api/ai/agents/[id]/test` "chamada".
 */
const DELETION_SET_PENDING = ['src/hooks/useAgent.ts'];
const DELETION_SET_PENDING_ROUTES = ['src/app/api/ai/agents/[id]/test/route.ts'];

/**
 * O contra-teste. Cada linha aqui é uma peça que o dossiê mandou apagar e que
 * a verificação provou VIVA — mais as peças que a limpeza passa perto.
 * Se alguma sumir do alcance, alguém quebrou a Atividade, o Conhecimento ou
 * a órbita sem perceber.
 */
const PROTECTED_MODULES = [
  // aba Atividade do hub (ai-hub/ActivityTab)
  'src/components/agents/reports/ReportsView.tsx',
  'src/components/agents/eval/EvalView.tsx',
  'src/components/agents/ui/AgentSelect.tsx',
  'src/components/agents/testrun/TestRunView.tsx',
  'src/lib/ai/test-runner.ts',
  'src/lib/ai/test-run-shared.ts',
  'src/lib/ai/proposals.ts',
  'src/lib/ai/evals.ts',
  'src/lib/ai/annotations.ts',
  'src/lib/ai/reports-metrics.ts',
  'src/lib/ai/activity.ts',
  // Conhecimento (ingestão) — o caminho que o pacote B vai mexer
  'src/components/agents/KnowledgeBasePanel.tsx',
  'src/lib/ai/crawler.ts',
  'src/lib/ai/embeddings.ts',
  // órbita: save, versionamento e o catálogo de ferramentas
  'src/lib/ai/agent-hub.ts',
  'src/lib/ai/versions.ts',
  'src/lib/ai/diff.ts',
  'src/lib/ai/tools/catalog.ts',
  // o que o F2/F3 vai tocar
  'src/lib/ai/conversation-ai-status.ts',
  'src/lib/ai/runtime-rollout.ts',
  'src/lib/whatsapp/webhook-processor.ts',
];

/** Rotas que precisam continuar sendo chamadas por código vivo. */
const PROTECTED_ROUTES = [
  'src/app/api/ai/activity/route.ts',
  'src/app/api/ai/process/document/route.ts',
  'src/app/api/ai/agents/[id]/evals/route.ts',
  'src/app/api/ai/agents/[id]/reports/route.ts',
  'src/app/api/ai/agents/[id]/sources/route.ts',
  'src/app/api/ai/agents/[id]/test-runs/route.ts',
];

/**
 * Tabelas liberadas para drop: nenhum módulo alcançável as cita. A lista
 * começa vazia de propósito — cada linha só entra depois de o teste provar.
 */
const TABLES_MARKED_FOR_DROP: string[] = [];

/**
 * Tabelas que NÃO podem ser dropadas: código vivo depende delas. `ai_budgets`
 * está aqui apesar de nunca ter existido no banco — `budget.ts` a consulta em
 * caminhos vivos e falha aberto. Enquanto essa consulta existir, um drop
 * formal muda o comportamento de erro; a peça a remover é o código, não a
 * tabela.
 */
const TABLES_STILL_READ_BY_LIVE_CODE = [
  'agent_traces',
  'agent_trace_annotations',
  'ai_eval_results',
  'ai_budgets',
];

// ---------------------------------------------------------------------------
// Grafo de imports
// ---------------------------------------------------------------------------

const CODE_EXT = ['.ts', '.tsx'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (CODE_EXT.includes(path.extname(entry))) out.push(full);
  }
  return out;
}

const ALL_FILES = walk(SRC).map((f) => rel(f));

function rel(abs: string): string {
  return path.relative(ROOT, abs).split(path.sep).join('/');
}

/** `from '…'`, `import('…')`, `require('…')` — só especificadores literais. */
const IMPORT_RE = /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g;

function importsOf(relPath: string): string[] {
  const text = readFileSync(path.join(ROOT, relPath), 'utf8');
  const out: string[] = [];
  for (const m of text.matchAll(IMPORT_RE)) out.push(m[1]);
  return out;
}

/** Especificador → arquivo do repo, ou null se for pacote externo. */
function resolveSpec(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(ROOT, path.dirname(fromFile), spec);
  else return null;

  const candidates = [
    base,
    ...CODE_EXT.map((e) => base + e),
    ...CODE_EXT.map((e) => path.join(base, 'index' + e)),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return rel(c);
  }
  return null;
}

function inSet(file: string, set: string[]): boolean {
  return set.some((p) => (p.endsWith('/') ? file.startsWith(p) : file === p));
}

/** Entradas do Next: tudo que o framework carrega sem ninguém importar. */
const ENTRYPOINT_RE = /^src\/(middleware\.ts|instrumentation\.ts|app\/.*\/(page|layout|route|template|default|loading|error|not-found)\.tsx?|app\/(page|layout)\.tsx?)$/;

const ALL_DOOMED = [
  ...DELETION_SET,
  ...DELETION_SET_ROUTES,
  ...DELETION_SET_PENDING,
  ...DELETION_SET_PENDING_ROUTES,
];

const ENTRYPOINTS = ALL_FILES.filter((f) => ENTRYPOINT_RE.test(f) && !inSet(f, ALL_DOOMED));

/** BFS a partir das entradas vivas. */
function reachableFromEntrypoints(): Set<string> {
  const seen = new Set<string>(ENTRYPOINTS);
  const queue = [...ENTRYPOINTS];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const spec of importsOf(current)) {
      const target = resolveSpec(spec, current);
      if (target && !seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return seen;
}

const REACHABLE = reachableFromEntrypoints();

// ---------------------------------------------------------------------------
// Rotas: prova textual (URL citada em código vivo)
// ---------------------------------------------------------------------------

/** `src/app/api/ai/agents/[id]/test/route.ts` → `/api/ai/agents/[id]/test` */
function routeUrl(routeFile: string): string {
  return '/' + routeFile.replace(/^src\/app\//, '').replace(/\/route\.tsx?$/, '');
}

/**
 * Regex que casa a URL da rota num literal de código: segmento dinâmico vira
 * curinga (`${id}`), e o fim é ancorado para `/x/test` não casar `/x/test-runs`.
 */
function urlMatcher(url: string): RegExp {
  const body = url
    .split('/')
    .filter(Boolean)
    .map((seg) =>
      /^\[.*\]$/.test(seg) ? '[^/\'"`\\s]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('/');
  return new RegExp('/' + body + '(?![-\\w/])');
}

/**
 * Quem cita a URL desta rota. Só conta arquivo ALCANÇÁVEL: um caller que já
 * está morto não mantém rota viva. `ignore` tira da conta os que vão embora
 * na mesma leva.
 */
function callersOf(routeFile: string, ignore: string[] = []): string[] {
  const re = urlMatcher(routeUrl(routeFile));
  return [...REACHABLE].filter((f) => {
    if (f === routeFile) return false;
    if (f.includes('__tests__') || /\.test\.tsx?$/.test(f)) return false;
    if (inSet(f, ignore)) return false;
    return re.test(readFileSync(path.join(ROOT, f), 'utf8'));
  }).sort();
}

// ---------------------------------------------------------------------------

describe('inventário da limpeza (F1) — as listas não apodreceram', () => {
  it('todo caminho listado existe no repo', () => {
    const missing = [...ALL_DOOMED, ...PROTECTED_MODULES, ...PROTECTED_ROUTES].filter(
      (p) => !existsSync(path.join(ROOT, p)),
    );
    expect(missing).toEqual([]);
  });

  it('o grafo foi construído (guarda contra um teste que passa por vacuidade)', () => {
    expect(ENTRYPOINTS.length).toBeGreaterThan(100);
    expect(REACHABLE.size).toBeGreaterThan(300);
  });

  it('nenhum caminho está nas duas listas ao mesmo tempo', () => {
    const conflito = PROTECTED_MODULES.filter((p) => inSet(p, DELETION_SET));
    expect(conflito).toEqual([]);
  });
});

describe('conjunto de deleção — inalcançável a partir de qualquer entrada do Next', () => {
  it('nenhum módulo do conjunto de deleção é importado por código vivo', () => {
    const vivos = ALL_FILES.filter((f) => inSet(f, DELETION_SET) && REACHABLE.has(f));
    expect(vivos).toEqual([]);
  });

  it('nenhuma rota do conjunto de deleção é chamada por código vivo', () => {
    const chamadas = DELETION_SET_ROUTES.flatMap((r) =>
      callersOf(r, ALL_DOOMED).map((c) => `${routeUrl(r)} ← ${c}`),
    );
    expect(chamadas).toEqual([]);
  });

  it('a leva de segunda ordem só é sustentada por ela mesma', () => {
    // Se algum dia um componente vivo passar a usar `useAgent`, esta lista
    // deixa de estar vazia e a decisão emparelhada volta para a mesa.
    const sustentada = DELETION_SET_PENDING_ROUTES.flatMap((r) =>
      callersOf(r, ALL_DOOMED).map((c) => `${routeUrl(r)} ← ${c}`),
    );
    expect(sustentada).toEqual([]);
  });
});

describe('superfícies vivas — o contra-teste da classificação errada', () => {
  it.each(PROTECTED_MODULES)('%s continua alcançável a partir de uma entrada', (mod) => {
    expect(REACHABLE.has(mod)).toBe(true);
  });

  it.each(PROTECTED_ROUTES)('%s continua sendo chamada por código vivo', (route) => {
    expect(callersOf(route, DELETION_SET).length).toBeGreaterThan(0);
  });
});

describe('tabelas — o que pode e o que não pode ser dropado', () => {
  function referencedBy(table: string): string[] {
    const re = new RegExp(`['"\`]${table}['"\`]`);
    return [...REACHABLE].filter(
      (f) => !f.includes('__tests__') && !/\.test\.tsx?$/.test(f) && re.test(readFileSync(path.join(ROOT, f), 'utf8')),
    );
  }

  it.each(TABLES_MARKED_FOR_DROP)('%s não é lida por nenhum módulo alcançável', (table) => {
    expect(referencedBy(table)).toEqual([]);
  });

  it.each(TABLES_STILL_READ_BY_LIVE_CODE)(
    '%s AINDA é lida por código vivo — renomear, nunca dropar',
    (table) => {
      expect(referencedBy(table).length).toBeGreaterThan(0);
    },
  );
});
