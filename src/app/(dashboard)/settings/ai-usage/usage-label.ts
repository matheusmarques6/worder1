export function costLabel(
  totals: { billableUnknownCostCalls?: number },
  budget: { hasUnknownCost?: boolean } | null | undefined,
) {
  return totals.billableUnknownCostCalls || budget?.hasUnknownCost
    ? 'Custo faturável conhecido da organização'
    : 'Custo faturável da organização'
}

export function platformCostLabel() {
  return 'Custo coberto pela plataforma'
}

interface BudgetNoticeInput {
  allowed: boolean
  budgetUsd: number | null
  spentUsd: number
  unknownReason?: 'lookup_error' | 'unpriced_model'
}

export function budgetNotice(budget: BudgetNoticeInput | null | undefined): string | null {
  if (!budget || budget.allowed) return null
  if (budget.unknownReason === 'lookup_error') {
    return 'Orçamento de IA indisponível — não foi possível verificar o gasto agora.'
  }
  if (budget.budgetUsd !== null && budget.spentUsd >= budget.budgetUsd) {
    return 'Orçamento de IA esgotado — os agentes pausam até o próximo ciclo ou até o limite ser aumentado.'
  }
  if (budget.unknownReason === 'unpriced_model') {
    return 'Custo faturável desconhecido — há uso ainda sem preço reconciliado.'
  }
  return null
}
