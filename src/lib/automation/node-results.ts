// =============================================================
// Snapshot dos resultados por nó de uma run.
//
// O motor executa uma run em SEGMENTOS: gatilho → Email 1 → Delay (pausa),
// depois o cron retoma: Email 2 → Delay (pausa), e assim por diante. Cada
// segmento nasce com um `nodeResults` vazio, então gravar
// `metadata.result.nodeResults = result.nodeResults` a cada retomada
// APAGAVA os nós dos segmentos anteriores — a run que já estava no Email 2
// perdia o registro de que o Email 1 tinha sido enviado. Era por isso que
// o histórico e o card de métricas do Email 1 zeravam assim que as runs
// avançavam no funil.
//
// Este helper funde o snapshot anterior com o segmento recém-executado.
// =============================================================

export type NodeResultSnapshot = Record<string, any>;

export function mergeNodeResults(
  previous: unknown,
  current: NodeResultSnapshot | null | undefined
): NodeResultSnapshot {
  const prev: NodeResultSnapshot =
    previous && typeof previous === 'object' && !Array.isArray(previous)
      ? { ...(previous as NodeResultSnapshot) }
      : {};
  if (!current || typeof current !== 'object') return prev;

  for (const [nodeId, result] of Object.entries(current)) {
    // Um "pulado" (poda de ramo / nó Sair) neste segmento não pode apagar um
    // resultado real que o nó produziu num segmento anterior.
    const before = prev[nodeId];
    if (result?.status === 'skipped' && before && before.status !== 'skipped') continue;
    prev[nodeId] = result;
  }
  return prev;
}
