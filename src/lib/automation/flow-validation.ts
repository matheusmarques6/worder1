// =============================================
// WORDER: Flow graph validation
// /src/lib/automation/flow-validation.ts
//
// Valida se um flow (nodes + edges) está pronto para publicar.
// Retorna lista de issues agrupadas por severidade.
// =============================================

export type Severity = 'error' | 'warning'

export interface FlowNode {
  id: string
  type: string
  data?: Record<string, any>
}

export interface FlowEdge {
  id?: string
  source: string
  target: string
  sourceHandle?: string | null
}

export interface FlowValidationIssue {
  severity: Severity
  code: string
  message: string
  nodeId?: string
  edgeId?: string
}

export interface FlowValidationResult {
  valid: boolean
  errors: FlowValidationIssue[]
  warnings: FlowValidationIssue[]
  issues: FlowValidationIssue[]
}

function isTriggerType(t: string): boolean {
  return t.startsWith('trigger_')
}
function isActionType(t: string): boolean {
  return t.startsWith('action_')
}
function isDelayType(t: string): boolean {
  return t.startsWith('control_delay')
}
function isConditionType(t: string): boolean {
  return t.startsWith('condition_') || t.startsWith('logic_')
}

export function validateFlow(
  nodes: FlowNode[],
  edges: FlowEdge[]
): FlowValidationResult {
  const issues: FlowValidationIssue[] = []

  // 1. Pelo menos 1 trigger
  const triggers = nodes.filter((n) => isTriggerType(n.type))
  if (triggers.length === 0) {
    issues.push({
      severity: 'error',
      code: 'NO_TRIGGER',
      message: 'O fluxo precisa de pelo menos um gatilho (trigger).',
    })
  }
  if (triggers.length > 1) {
    issues.push({
      severity: 'warning',
      code: 'MULTIPLE_TRIGGERS',
      message: 'Múltiplos triggers detectados. Apenas o primeiro será considerado.',
    })
  }

  // 2. Pelo menos 1 ação
  const actions = nodes.filter((n) => isActionType(n.type))
  if (actions.length === 0) {
    issues.push({
      severity: 'error',
      code: 'NO_ACTIONS',
      message: 'Adicione ao menos uma ação ao fluxo.',
    })
  }

  // 3. Delays com valores inválidos
  for (const n of nodes) {
    if (!isDelayType(n.type)) continue
    const d = n.data || {}
    const minutes = Number(d.minutes ?? d.delay ?? d.duration ?? 0)
    if (!isFinite(minutes) || minutes < 0) {
      issues.push({
        severity: 'error',
        code: 'NEGATIVE_DELAY',
        nodeId: n.id,
        message: `Delay inválido no nó "${n.id}" (${minutes} min).`,
      })
    }
    if (minutes > 60 * 24 * 365) {
      issues.push({
        severity: 'warning',
        code: 'TOO_LONG_DELAY',
        nodeId: n.id,
        message: `Delay maior que 1 ano no nó "${n.id}".`,
      })
    }
  }

  // 4. Edges referenciando node inexistente
  const nodeIds = new Set(nodes.map((n) => n.id))
  for (const e of edges) {
    if (!nodeIds.has(e.source)) {
      issues.push({
        severity: 'error',
        code: 'DANGLING_EDGE_SOURCE',
        edgeId: e.id,
        message: `Conexão parte de um nó inexistente: ${e.source}.`,
      })
    }
    if (!nodeIds.has(e.target)) {
      issues.push({
        severity: 'error',
        code: 'DANGLING_EDGE_TARGET',
        edgeId: e.id,
        message: `Conexão aponta para nó inexistente: ${e.target}.`,
      })
    }
  }

  // 5. Nodes órfãos (sem incoming, exceto triggers)
  const incoming = new Map<string, number>()
  for (const e of edges) {
    incoming.set(e.target, (incoming.get(e.target) || 0) + 1)
  }
  for (const n of nodes) {
    if (isTriggerType(n.type)) continue
    if ((incoming.get(n.id) || 0) === 0) {
      issues.push({
        severity: 'warning',
        code: 'ORPHAN_NODE',
        nodeId: n.id,
        message: `Nó "${n.id}" não está conectado a nada antes dele.`,
      })
    }
  }

  // 6. Condicionais sem branch true/false
  for (const n of nodes) {
    if (!isConditionType(n.type)) continue
    const outgoing = edges.filter((e) => e.source === n.id)
    const handles = new Set(outgoing.map((e) => String(e.sourceHandle || 'default')))
    if (n.type === 'logic_condition' || n.type === 'condition_field' || n.type === 'condition_has_tag' || n.type === 'condition_deal_value' || n.type === 'condition_order_value') {
      if (!handles.has('true') || !handles.has('false')) {
        issues.push({
          severity: 'warning',
          code: 'CONDITION_INCOMPLETE_BRANCHES',
          nodeId: n.id,
          message: `Condição "${n.id}" não possui as duas saídas (true/false) conectadas.`,
        })
      }
    }
  }

  // 7. Detecção de ciclos (DFS)
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, [])
    adj.get(e.source)!.push(e.target)
  }

  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map<string, number>()
  nodes.forEach((n) => color.set(n.id, WHITE))

  let cycleNode: string | null = null

  const dfs = (u: string): boolean => {
    color.set(u, GRAY)
    for (const v of adj.get(u) || []) {
      const c = color.get(v) ?? WHITE
      if (c === GRAY) {
        cycleNode = v
        return true
      }
      if (c === WHITE && dfs(v)) return true
    }
    color.set(u, BLACK)
    return false
  }

  for (const n of nodes) {
    if ((color.get(n.id) ?? WHITE) === WHITE) {
      if (dfs(n.id)) break
    }
  }

  if (cycleNode) {
    issues.push({
      severity: 'error',
      code: 'CYCLE_DETECTED',
      nodeId: cycleNode,
      message: `Loop infinito detectado passando por "${cycleNode}". Automação não pode ser publicada.`,
    })
  }

  // 8. Branches terminais sem saída (não é erro — pode ser fim legítimo)
  // Só marca como warning se nenhum path termina em ação.
  const hasAnyActionReachable = (() => {
    if (triggers.length === 0 || actions.length === 0) return false
    const actionSet = new Set(actions.map((a) => a.id))
    const visited = new Set<string>()
    const q: string[] = triggers.map((t) => t.id)
    while (q.length) {
      const u = q.shift()!
      if (visited.has(u)) continue
      visited.add(u)
      if (actionSet.has(u)) return true
      for (const v of adj.get(u) || []) q.push(v)
    }
    return false
  })()

  if (triggers.length > 0 && actions.length > 0 && !hasAnyActionReachable) {
    issues.push({
      severity: 'error',
      code: 'ACTIONS_UNREACHABLE',
      message: 'Nenhuma ação é acessível a partir do trigger. Verifique as conexões.',
    })
  }

  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    issues,
  }
}
