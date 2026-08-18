/**
 * Detector de entrada em segmento — o núcleo, fora da rota.
 *
 * A rota `/api/cron/detect-segment-changes` estourava os 60s da Vercel (504
 * recorrente nos logs de 17/08) por três razões que se somam, e todas moram
 * aqui agora para poderem ser provadas em teste:
 *
 *   1. **Sem orçamento de parede.** O laço percorria os 200 segmentos até o
 *      fim ou até a plataforma matar a função. Morrer no meio significa
 *      perder o trabalho já feito: o snapshot só era gravado por segmento
 *      completo, e nada registrava até onde a rodada chegou.
 *   2. **Rotação que não rotaciona.** A rota ordenava por `last_evaluated_at`
 *      e NUNCA escrevia essa coluna — quem escreve é o cron irmão
 *      (`recompute-segments`, lote de 500 na mesma cadência). O cursor era do
 *      vizinho: a ordem dos 200 dependia do lote do outro cron, e a cauda
 *      podia ficar sem detecção indefinidamente. Cursor próprio agora:
 *      `customer_segments.last_change_check_at`, escrito por segmento
 *      concluído (migration `20260817000005`).
 *   3. **Despacho serial por contato.** Um `await dispatchTrigger` por membro
 *      novo, um de cada vez. Um segmento com milhares de entradas consumia a
 *      rodada inteira sozinho.
 *
 * O contrato do progresso parcial é o que torna o corte seguro: um segmento
 * interrompido grava o snapshot como `anterior ∪ despachados` e **não** marca
 * o cursor. Assim ninguém é notificado duas vezes (o que já saiu está no
 * snapshot), ninguém é esquecido (o que não saiu continua "novo") e o
 * segmento volta na frente da fila na próxima rodada, por ser o mais velho.
 *
 * Dependências injetadas (relógio inclusive, disciplina do doc-fonte): o
 * teste roda o laço inteiro sem banco e sem cron.
 */

export type SegmentRef = {
  id: string;
  organization_id: string;
};

export type DetectDeps = {
  /** Segmentos candidatos, do mais velho para o mais novo pelo cursor. */
  listStaleSegments: (limit: number) => Promise<SegmentRef[]>;
  /** Membros atuais do segmento. */
  resolveMembers: (segment: SegmentRef) => Promise<string[]>;
  /** Snapshot anterior; `null` = segmento nunca observado. */
  loadSnapshot: (segment: SegmentRef) => Promise<string[] | null>;
  saveSnapshot: (segment: SegmentRef, contactIds: string[]) => Promise<void>;
  /** Dispara a automação de entrada para UM contato. */
  dispatchEntry: (segment: SegmentRef, contactId: string) => Promise<void>;
  /** Avança o cursor de rotação — só para segmento concluído. */
  markChecked: (segment: SegmentRef) => Promise<void>;
  now?: () => number;
  onError?: (scope: string, segment: SegmentRef | null, error: unknown) => void;
};

export type DetectOptions = {
  /** Segmentos lidos por rodada. */
  batchSize?: number;
  /** Orçamento de parede; abaixo do `maxDuration` da função, com folga. */
  budgetMs?: number;
  /** Despachos simultâneos dentro de um segmento. */
  dispatchConcurrency?: number;
  /** Teto de despachos na rodada — um segmento gigante não come o turno. */
  maxDispatchPerRun?: number;
};

export type DetectReport = {
  segmentsChecked: number;
  /** Primeira observação: retrato gravado, ninguém notificado. */
  segmentsSeeded: number;
  segmentsPartial: number;
  segmentsFailed: number;
  /** Segmentos do lote que nem começaram: acabou o orçamento ou o teto. */
  segmentsSkipped: number;
  entriesDispatched: number;
  entriesFailed: number;
  stoppedBy: 'drained' | 'budget' | 'dispatch_cap';
  durationMs: number;
};

export const DETECT_DEFAULTS = {
  batchSize: 200,
  // maxDuration da rota é 60s. 45s deixa espaço para a última gravação de
  // snapshot e para a resposta sair antes do corte da plataforma.
  budgetMs: 45_000,
  dispatchConcurrency: 5,
  maxDispatchPerRun: 2_000,
} as const;

export async function detectSegmentChanges(
  deps: DetectDeps,
  options: DetectOptions = {},
): Promise<DetectReport> {
  const now = deps.now ?? Date.now;
  const batchSize = options.batchSize ?? DETECT_DEFAULTS.batchSize;
  const budgetMs = options.budgetMs ?? DETECT_DEFAULTS.budgetMs;
  const concurrency = Math.max(1, options.dispatchConcurrency ?? DETECT_DEFAULTS.dispatchConcurrency);
  const maxDispatch = options.maxDispatchPerRun ?? DETECT_DEFAULTS.maxDispatchPerRun;

  const startedAt = now();
  const deadline = startedAt + budgetMs;

  const report: DetectReport = {
    segmentsChecked: 0,
    segmentsSeeded: 0,
    segmentsPartial: 0,
    segmentsFailed: 0,
    segmentsSkipped: 0,
    entriesDispatched: 0,
    entriesFailed: 0,
    stoppedBy: 'drained',
    durationMs: 0,
  };

  const segments = await deps.listStaleSegments(batchSize);

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    // O corte acontece ENTRE segmentos sempre que possível: o estado fica
    // limpo e o cursor conta a verdade sobre onde a rodada parou.
    if (now() >= deadline) {
      report.stoppedBy = 'budget';
      report.segmentsSkipped = segments.length - i;
      break;
    }
    if (report.entriesDispatched >= maxDispatch) {
      report.stoppedBy = 'dispatch_cap';
      report.segmentsSkipped = segments.length - i;
      break;
    }

    let outcome: SegmentOutcome;
    try {
      outcome = await processSegment(segment, deps, {
        now,
        deadline,
        concurrency,
        remainingDispatch: maxDispatch - report.entriesDispatched,
      });
    } catch (error) {
      // Falha de resolve/snapshot: o segmento não avança o cursor, então
      // volta na frente da fila. Um segmento quebrado não derruba a rodada.
      deps.onError?.('segment', segment, error);
      report.segmentsFailed++;
      continue;
    }

    report.entriesDispatched += outcome.dispatched;
    report.entriesFailed += outcome.failed;

    if (outcome.seeded) {
      report.segmentsSeeded++;
      continue;
    }

    if (outcome.interrupted) {
      report.segmentsPartial++;
      report.stoppedBy = outcome.interrupted;
      report.segmentsSkipped = segments.length - i - 1;
      break;
    }

    // Segmento percorrido até o fim mas com despacho falho: o cursor não
    // avança (o parcial já cuidou disso lá dentro) e a rodada SEGUE — um
    // contato problemático não pode bloquear os outros segmentos.
    if (outcome.failed > 0) report.segmentsPartial++;
    else report.segmentsChecked++;
  }

  report.durationMs = now() - startedAt;
  return report;
}

type SegmentOutcome = {
  dispatched: number;
  failed: number;
  /** `null` = percorreu todas as entradas; caso contrário, o motivo do corte. */
  interrupted: null | 'budget' | 'dispatch_cap';
  /** Primeira observação: só o retrato foi gravado. */
  seeded: boolean;
};

async function processSegment(
  segment: SegmentRef,
  deps: DetectDeps,
  ctx: { now: () => number; deadline: number; concurrency: number; remainingDispatch: number },
): Promise<SegmentOutcome> {
  const current = await deps.resolveMembers(segment);
  const previous = await deps.loadSnapshot(segment);

  // PRIMEIRA OBSERVAÇÃO — o retrato inicial é gravado e ninguém é notificado.
  //
  // "Entrou no segmento" é um evento de transição: quem já estava lá quando
  // começamos a olhar não entrou, só existia. Sem esta porta, ligar a
  // detecção num segmento de 21 mil membros dispararia 21 mil automações
  // retroativas — e mensagem enviada não volta.
  //
  // Não é hipótese: a tabela de snapshot nunca existiu no banco vivo
  // (migration 20260817000006), então TODO segmento da org está exatamente
  // neste estado. A `idempotencyKey` do dispatcher não protegeria — ela é a
  // trava do reenvio, não do primeiro envio, e só olha 24h para trás.
  //
  // Por isso `loadSnapshot` devolve `null` para "nunca observado" e `[]` para
  // "observado vazio": colapsar os dois é justamente o disparo em massa.
  if (previous === null) {
    await deps.saveSnapshot(segment, current);
    await deps.markChecked(segment);
    return { dispatched: 0, failed: 0, interrupted: null, seeded: true };
  }

  const previousSet = new Set(previous);
  const entries = current.filter((id) => !previousSet.has(id));

  const dispatched: string[] = [];
  let failed = 0;
  let interrupted: null | 'budget' | 'dispatch_cap' = null;

  for (let i = 0; i < entries.length; i += ctx.concurrency) {
    if (ctx.now() >= ctx.deadline) {
      interrupted = 'budget';
      break;
    }
    if (dispatched.length + failed >= ctx.remainingDispatch) {
      interrupted = 'dispatch_cap';
      break;
    }

    const chunk = entries.slice(i, i + ctx.concurrency);
    const settled = await Promise.allSettled(
      chunk.map((contactId) => deps.dispatchEntry(segment, contactId)),
    );

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        dispatched.push(chunk[index]);
      } else {
        // Contato que falhou fica FORA do snapshot: volta como novo na
        // próxima rodada. A `idempotencyKey` do dispatcher é quem garante
        // que uma entrega que passou pela metade não vire duplicata.
        failed++;
        deps.onError?.('dispatch', segment, result.reason);
      }
    });
  }

  // Falha de despacho conta como passe incompleto mesmo sem corte: gravar
  // `current` marcaria como notificado quem NÃO foi, e o contato sumiria
  // para sempre da detecção de entrada.
  if (!interrupted && failed === 0) {
    // Passe completo: o snapshot vira o retrato atual — é aqui que as
    // SAÍDAS somem da lista, e só aqui.
    await deps.saveSnapshot(segment, current);
    await deps.markChecked(segment);
  } else if (dispatched.length > 0) {
    // Passe parcial: guarda o que já saiu para ninguém receber duas vezes,
    // sem prometer que o retrato está completo. Cursor NÃO avança.
    await deps.saveSnapshot(segment, union(previousSet, dispatched));
  }

  return { dispatched: dispatched.length, failed, interrupted, seeded: false };
}

function union(base: Set<string>, extra: string[]): string[] {
  const merged = new Set(base);
  for (const id of extra) merged.add(id);
  return Array.from(merged);
}
