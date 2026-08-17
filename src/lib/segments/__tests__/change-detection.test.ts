import { describe, it, expect, vi } from 'vitest';
import {
  detectSegmentChanges,
  type DetectDeps,
  type SegmentRef,
} from '@/lib/segments/change-detection';

type World = {
  saved: Record<string, string[]>;
  checked: string[];
  dispatched: string[];
  clock: { t: number };
  inFlight: { now: number; max: number };
};

function seg(id: string): SegmentRef {
  return { id, organization_id: `org-${id}` };
}

/**
 * Mundo falso: relógio manual (cada despacho/resolve avança o tempo em
 * passos declarados), simultaneidade medida e falhas plantáveis por
 * contato ou por segmento. O laço inteiro roda sem banco e sem cron.
 */
function makeWorld(spec: {
  segments: SegmentRef[];
  members: Record<string, string[]>;
  snapshots?: Record<string, string[]>;
  msPerDispatch?: number;
  msPerResolve?: number;
  failDispatch?: (contactId: string) => boolean;
  failResolve?: (segmentId: string) => boolean;
}): { world: World; deps: DetectDeps } {
  const snapshots = spec.snapshots ?? {};
  const world: World = {
    saved: {},
    checked: [],
    dispatched: [],
    clock: { t: 1_000 },
    inFlight: { now: 0, max: 0 },
  };

  const deps: DetectDeps = {
    now: () => world.clock.t,
    listStaleSegments: async (limit) => spec.segments.slice(0, limit),
    resolveMembers: async (s) => {
      world.clock.t += spec.msPerResolve ?? 0;
      if (spec.failResolve?.(s.id)) throw new Error(`resolve boom ${s.id}`);
      return spec.members[s.id] ?? [];
    },
    loadSnapshot: async (s) => (s.id in snapshots ? snapshots[s.id] : null),
    saveSnapshot: async (s, ids) => {
      world.saved[s.id] = ids;
    },
    markChecked: async (s) => {
      world.checked.push(s.id);
    },
    dispatchEntry: async (s, contactId) => {
      world.inFlight.now++;
      world.inFlight.max = Math.max(world.inFlight.max, world.inFlight.now);
      await Promise.resolve();
      world.clock.t += spec.msPerDispatch ?? 0;
      world.inFlight.now--;
      if (spec.failDispatch?.(contactId)) throw new Error(`dispatch boom ${contactId}`);
      world.dispatched.push(contactId);
    },
  };

  return { world, deps };
}

describe('detectSegmentChanges — passe completo', () => {
  it('despacha só quem entrou e grava o retrato atual', async () => {
    const { world, deps } = makeWorld({
      segments: [seg('a')],
      members: { a: ['c1', 'c2', 'c3'] },
      snapshots: { a: ['c1'] },
    });

    const report = await detectSegmentChanges(deps);

    expect(world.dispatched).toEqual(['c2', 'c3']);
    expect(report.entriesDispatched).toBe(2);
    expect(report.segmentsChecked).toBe(1);
    expect(report.stoppedBy).toBe('drained');
    // O snapshot completo é o retrato atual — é ele que faz a SAÍDA sumir.
    expect(world.saved.a).toEqual(['c1', 'c2', 'c3']);
    expect(world.checked).toEqual(['a']);
  });

  it('membro que saiu some do snapshot sem virar entrada', async () => {
    const { world, deps } = makeWorld({
      segments: [seg('a')],
      members: { a: ['c1'] },
      snapshots: { a: ['c1', 'c2'] },
    });

    const report = await detectSegmentChanges(deps);

    expect(report.entriesDispatched).toBe(0);
    expect(world.saved.a).toEqual(['c1']);
  });

  it('segmento nunca observado trata todo membro como entrada', async () => {
    const { world, deps } = makeWorld({
      segments: [seg('a')],
      members: { a: ['c1', 'c2'] },
    });

    const report = await detectSegmentChanges(deps);

    expect(report.entriesDispatched).toBe(2);
    expect(world.saved.a).toEqual(['c1', 'c2']);
  });

  it('snapshot vazio NÃO é o mesmo que ausência de snapshot', async () => {
    const { deps } = makeWorld({
      segments: [seg('a')],
      members: { a: ['c1'] },
      snapshots: { a: [] },
    });

    const report = await detectSegmentChanges(deps);

    // Mesmo número de entradas dos dois lados, por caminhos distintos: aqui
    // o conjunto anterior EXISTE e está vazio. A distinção precisa
    // sobreviver ao adaptador da rota, senão `maybeSingle()` sem linha e
    // segmento realmente vazio viram o mesmo estado.
    expect(report.entriesDispatched).toBe(1);
    expect(report.segmentsChecked).toBe(1);
  });
});

describe('detectSegmentChanges — rotação (o bug do cursor do vizinho)', () => {
  it('marca o cursor de CADA segmento concluído', async () => {
    const { world, deps } = makeWorld({
      segments: [seg('a'), seg('b'), seg('c')],
      members: { a: ['c1'], b: [], c: ['c9'] },
    });

    await detectSegmentChanges(deps);

    expect(world.checked).toEqual(['a', 'b', 'c']);
  });

  it('segmento interrompido NÃO avança o cursor', async () => {
    const { world, deps } = makeWorld({
      segments: [seg('a')],
      members: { a: ['c1', 'c2', 'c3', 'c4'] },
      msPerDispatch: 40,
    });

    const report = await detectSegmentChanges(deps, {
      budgetMs: 100,
      dispatchConcurrency: 1,
    });

    expect(report.segmentsPartial).toBe(1);
    expect(report.stoppedBy).toBe('budget');
    expect(world.checked).toEqual([]);
  });
});

describe('detectSegmentChanges — orçamento de parede', () => {
  it('corta ENTRE segmentos e conta o que ficou para trás', async () => {
    const { world, deps } = makeWorld({
      segments: [seg('a'), seg('b'), seg('c')],
      members: { a: ['c1'], b: ['c2'], c: ['c3'] },
      msPerDispatch: 60,
    });

    const report = await detectSegmentChanges(deps, {
      budgetMs: 100,
      dispatchConcurrency: 1,
    });

    // a e b cabem; c nem começa — o corte é checado antes de cada segmento.
    expect(report.segmentsChecked).toBe(2);
    expect(report.segmentsSkipped).toBe(1);
    expect(report.stoppedBy).toBe('budget');
    expect(world.saved.c).toBeUndefined();
  });

  it('parcial guarda o que já saiu — anterior ∪ despachados', async () => {
    const { world, deps } = makeWorld({
      segments: [seg('a')],
      members: { a: ['c1', 'c2', 'c3', 'c4'] },
      snapshots: { a: ['c1'] },
      msPerDispatch: 40,
    });

    await detectSegmentChanges(deps, { budgetMs: 80, dispatchConcurrency: 1 });

    // c2 e c3 saíram; c4 não. O snapshot parcial impede que c2/c3 sejam
    // notificados de novo e deixa c4 como novo na próxima rodada.
    expect(world.dispatched).toEqual(['c2', 'c3']);
    expect(world.saved.a).toEqual(['c1', 'c2', 'c3']);
    expect(world.checked).toEqual([]);
  });

  it('resolve lento que come o orçamento não escreve nada', async () => {
    const { world, deps } = makeWorld({
      segments: [seg('a')],
      members: { a: ['c1', 'c2'] },
      snapshots: { a: [] },
      msPerResolve: 150,
    });

    const report = await detectSegmentChanges(deps, { budgetMs: 100 });

    // Entrou no segmento, o resolve estourou o orçamento, nenhum despacho
    // aconteceu: snapshot intocado e cursor parado. O segmento volta
    // inteiro na próxima rodada, sem ter mentido no banco.
    expect(report.entriesDispatched).toBe(0);
    expect(report.segmentsPartial).toBe(1);
    expect(world.saved.a).toBeUndefined();
    expect(world.checked).toEqual([]);
  });
});

describe('detectSegmentChanges — teto de despacho', () => {
  it('um segmento gigante não come a rodada inteira', async () => {
    const many = Array.from({ length: 50 }, (_, i) => `c${i}`);
    const { world, deps } = makeWorld({
      segments: [seg('a'), seg('b')],
      members: { a: many, b: ['z1'] },
    });

    const report = await detectSegmentChanges(deps, {
      maxDispatchPerRun: 10,
      dispatchConcurrency: 5,
    });

    expect(report.entriesDispatched).toBe(10);
    expect(report.stoppedBy).toBe('dispatch_cap');
    expect(report.segmentsSkipped).toBe(1);
    expect(world.saved.b).toBeUndefined();
    // O progresso do gigante fica gravado: a próxima rodada continua do 10.
    expect(world.saved.a).toHaveLength(10);
  });
});

describe('detectSegmentChanges — falhas', () => {
  it('segmento que quebra no resolve não derruba os outros', async () => {
    const onError = vi.fn();
    const { world, deps } = makeWorld({
      segments: [seg('a'), seg('b')],
      members: { a: ['c1'], b: ['c2'] },
      failResolve: (id) => id === 'a',
    });

    const report = await detectSegmentChanges({ ...deps, onError });

    expect(report.segmentsFailed).toBe(1);
    expect(report.segmentsChecked).toBe(1);
    expect(world.checked).toEqual(['b']);
    expect(onError).toHaveBeenCalledWith(
      'segment',
      expect.objectContaining({ id: 'a' }),
      expect.any(Error),
    );
  });

  it('contato que falha fica FORA do snapshot e volta na próxima rodada', async () => {
    const { world, deps } = makeWorld({
      segments: [seg('a')],
      members: { a: ['c1', 'c2', 'c3'] },
      snapshots: { a: [] },
      failDispatch: (id) => id === 'c2',
    });

    const report = await detectSegmentChanges(deps, { dispatchConcurrency: 3 });

    expect(report.entriesDispatched).toBe(2);
    expect(report.entriesFailed).toBe(1);
    // Passe com falha é parcial: cursor parado e c2 ausente do snapshot.
    // Gravar `current` aqui marcaria c2 como notificado — ele sumiria da
    // detecção de entrada para sempre.
    expect(report.segmentsPartial).toBe(1);
    expect(report.segmentsChecked).toBe(0);
    expect(world.checked).toEqual([]);
    expect(world.saved.a).toEqual(['c1', 'c3']);
  });

  it('falha de despacho não interrompe a rodada', async () => {
    const { world, deps } = makeWorld({
      segments: [seg('a'), seg('b')],
      members: { a: ['c1'], b: ['c2'] },
      failDispatch: (id) => id === 'c1',
    });

    const report = await detectSegmentChanges(deps);

    expect(report.segmentsSkipped).toBe(0);
    expect(report.stoppedBy).toBe('drained');
    expect(world.checked).toEqual(['b']);
    // Nada saiu em `a`, então nem snapshot parcial ele escreve.
    expect(world.saved.a).toBeUndefined();
  });
});

describe('detectSegmentChanges — concorrência', () => {
  it('respeita o teto de despachos simultâneos', async () => {
    const { world, deps } = makeWorld({
      segments: [seg('a')],
      members: { a: Array.from({ length: 20 }, (_, i) => `c${i}`) },
    });

    await detectSegmentChanges(deps, { dispatchConcurrency: 4 });

    expect(world.inFlight.max).toBe(4);
    expect(world.inFlight.now).toBe(0);
  });

  it('concorrência 0 degrada para serial em vez de travar', async () => {
    const { world, deps } = makeWorld({
      segments: [seg('a')],
      members: { a: ['c1', 'c2'] },
    });

    const report = await detectSegmentChanges(deps, { dispatchConcurrency: 0 });

    expect(report.entriesDispatched).toBe(2);
    expect(world.inFlight.max).toBe(1);
  });
});

describe('detectSegmentChanges — lote', () => {
  it('pede ao banco exatamente o batchSize', async () => {
    const { deps } = makeWorld({ segments: [], members: {} });
    const spy = vi.fn(async () => []);

    await detectSegmentChanges({ ...deps, listStaleSegments: spy }, { batchSize: 25 });

    expect(spy).toHaveBeenCalledWith(25);
  });
});
