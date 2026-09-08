// =============================================================
// A fila durável — e o job que sumia.
//
// reserve() tirava o job do conjunto agendado e não o registrava em
// lugar nenhum. O worker roda com 60s de teto e reserva 20 jobs de
// uma vez; quando os envios demoravam, a função morria no meio do
// laço e os jobs já reservados evaporavam: fora do agendado, sem
// dead letter, sem erro. E-mails que simplesmente nunca saíam.
//
// Estes testes usam um Redis de mentira em memória e cobrem o ciclo
// inteiro: reservar, concluir, falhar, e o resgate do que ficou preso.
// =============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Redis mínimo em memória com só o que a fila usa.
class FakeRedis {
  kv = new Map<string, string>();
  zsets = new Map<string, Map<string, number>>();
  lists = new Map<string, string[]>();

  private z(key: string) {
    let s = this.zsets.get(key);
    if (!s) { s = new Map(); this.zsets.set(key, s); }
    return s;
  }

  async set(key: string, value: string, opts?: { nx?: boolean; ex?: number }) {
    if (opts?.nx && this.kv.has(key)) return null;
    this.kv.set(key, value);
    return 'OK';
  }
  async get<T = string>(key: string): Promise<T | null> {
    return (this.kv.get(key) ?? null) as any;
  }
  async del(key: string) { return this.kv.delete(key) ? 1 : 0; }
  async zadd(key: string, entry: { score: number; member: string }) {
    this.z(key).set(entry.member, entry.score);
    return 1;
  }
  async zrem(key: string, member: string) { return this.z(key).delete(member) ? 1 : 0; }
  async zcard(key: string) { return this.z(key).size; }
  async zrange(key: string, min: number, max: number, opts?: { byScore?: boolean; count?: number }) {
    const todos = [...this.z(key).entries()]
      .filter(([, score]) => score >= min && score <= max)
      .sort((a, b) => a[1] - b[1])
      .map(([m]) => m);
    return opts?.count ? todos.slice(0, opts.count) : todos;
  }
  async lpush(key: string, value: string) {
    const l = this.lists.get(key) || [];
    l.unshift(value);
    this.lists.set(key, l);
    return l.length;
  }
  async llen(key: string) { return (this.lists.get(key) || []).length; }
  async lrange(key: string, start: number, stop: number) {
    const l = this.lists.get(key) || [];
    return stop === -1 ? l.slice(start) : l.slice(start, stop + 1);
  }
  async lrem(key: string, _count: number, value: string) {
    const l = this.lists.get(key) || [];
    const i = l.indexOf(value);
    if (i === -1) return 0;
    l.splice(i, 1);
    return 1;
  }
}

let redis: FakeRedis;
vi.mock('@upstash/redis', () => ({
  Redis: class { constructor() { return redis as any; } },
}));

import { enqueue, reserve, complete, fail, stats, reclaimStale, peekDead } from '../durable-queue';

const FILA = 'test-queue';

beforeEach(() => {
  redis = new FakeRedis();
  process.env.UPSTASH_REDIS_REST_URL = 'https://fake';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fake';
});

describe('ciclo normal', () => {
  it('enfileira, reserva e conclui', async () => {
    await enqueue(FILA, { x: 1 }, { jobId: 'j1' });
    const jobs = await reserve(FILA, 10);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data).toEqual({ x: 1 });

    await complete(FILA, jobs[0].id);
    expect(await stats(FILA)).toEqual({ scheduled: 0, processing: 0, dead: 0 });
  });

  it('job com jobId repetido não duplica', async () => {
    expect(await enqueue(FILA, { x: 1 }, { jobId: 'mesmo' })).not.toBeNull();
    expect(await enqueue(FILA, { x: 2 }, { jobId: 'mesmo' })).toBeNull();
    expect((await stats(FILA)).scheduled).toBe(1);
  });

  it('job agendado para o futuro não é reservado antes da hora', async () => {
    await enqueue(FILA, { x: 1 }, { jobId: 'j1', delayMs: 60_000 });
    expect(await reserve(FILA, 10)).toHaveLength(0);
  });

  it('dois workers não pegam o mesmo job', async () => {
    await enqueue(FILA, { x: 1 }, { jobId: 'j1' });
    const [a, b] = await Promise.all([reserve(FILA, 10), reserve(FILA, 10)]);
    expect(a.length + b.length).toBe(1);
  });
});

describe('job reservado fica visível como em processamento', () => {
  it('sai do agendado e entra no processando', async () => {
    await enqueue(FILA, { x: 1 }, { jobId: 'j1' });
    await reserve(FILA, 10);
    const s = await stats(FILA);
    expect(s.scheduled).toBe(0);
    expect(s.processing).toBe(1);
  });

  it('concluir tira do processando', async () => {
    await enqueue(FILA, { x: 1 }, { jobId: 'j1' });
    const [job] = await reserve(FILA, 10);
    await complete(FILA, job.id);
    expect((await stats(FILA)).processing).toBe(0);
  });

  it('falhar tira do processando e reagenda', async () => {
    await enqueue(FILA, { x: 1 }, { jobId: 'j1' });
    const [job] = await reserve(FILA, 10);
    const r = await fail(FILA, job, 'boom');
    expect(r.retrying).toBe(true);
    const s = await stats(FILA);
    expect(s.processing).toBe(0);
    expect(s.scheduled).toBe(1);
  });
});

describe('resgate do que ficou preso', () => {
  it('devolve à fila o job cujo prazo de visibilidade estourou', async () => {
    await enqueue(FILA, { x: 1 }, { jobId: 'j1' });
    const [job] = await reserve(FILA, 10);
    // Simula o worker morto: o job ficou em processando e ninguém
    // reportou nada. Envelhecer a entrada é o equivalente a deixar o
    // prazo de visibilidade correr.
    expect((await stats(FILA)).processing).toBe(1);
    redis.zsets.get('wq:test-queue:processing')!.set('j1', Date.now() - 1000);

    const devolvidos = await reclaimStale(FILA);
    expect(devolvidos).toBe(1);

    const s = await stats(FILA);
    expect(s.processing).toBe(0);
    expect(s.scheduled).toBe(1);

    // E o job volta a ser reservável, com os mesmos dados.
    const denovo = await reserve(FILA, 10);
    expect(denovo[0].id).toBe(job.id);
    expect(denovo[0].data).toEqual({ x: 1 });
  });

  it('não devolve job ainda dentro do prazo', async () => {
    await enqueue(FILA, { x: 1 }, { jobId: 'j1' });
    await reserve(FILA, 10);
    expect(await reclaimStale(FILA, Date.now())).toBe(0);
    expect((await stats(FILA)).processing).toBe(1);
  });

  it('a própria reserva já resgata o que estava preso', async () => {
    await enqueue(FILA, { x: 1 }, { jobId: 'j1' });
    await reserve(FILA, 10);
    // Envelhece a entrada de processando à força.
    redis.zsets.get('wq:test-queue:processing')!.set('j1', Date.now() - 1000);

    const jobs = await reserve(FILA, 10);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe('j1');
  });

  it('job já concluído não ressuscita', async () => {
    await enqueue(FILA, { x: 1 }, { jobId: 'j1' });
    const [job] = await reserve(FILA, 10);
    await complete(FILA, job.id);
    redis.zsets.get("wq:test-queue:processing")?.set("j1", Date.now() - 1000);
    expect(await reclaimStale(FILA)).toBe(0);
  });

  it('job no dead letter não volta pelo resgate', async () => {
    await enqueue(FILA, { x: 1 }, { jobId: 'j1', maxAttempts: 1 });
    const [job] = await reserve(FILA, 10);
    const r = await fail(FILA, job, 'boom');
    expect(r.retrying).toBe(false);
    expect((await peekDead(FILA)).map((j) => j.id)).toContain('j1');
    redis.zsets.get("wq:test-queue:processing")?.set("j1", Date.now() - 1000);
    expect(await reclaimStale(FILA)).toBe(0);
    expect((await stats(FILA)).scheduled).toBe(0);
  });

  it('o resgate preserva as tentativas — job em laço termina no dead letter', async () => {
    await enqueue(FILA, { x: 1 }, { jobId: 'j1', maxAttempts: 2 });
    const [primeiro] = await reserve(FILA, 10);
    await fail(FILA, primeiro, 'erro 1');
    // Reagendado com backoff; força a hora de rodar.
    redis.zsets.get('wq:test-queue:scheduled')!.set('j1', Date.now() - 1);
    const [segundo] = await reserve(FILA, 10);
    expect(segundo.attempts).toBe(1);
    const r = await fail(FILA, segundo, 'erro 2');
    expect(r.retrying).toBe(false);
  });
});
