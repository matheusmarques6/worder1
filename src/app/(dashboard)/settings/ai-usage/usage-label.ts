export function costLabel(
  totals: { unknownCostCalls?: number },
  budget: { hasUnknownCost?: boolean } | null | undefined,
) {
  return totals.unknownCostCalls || budget?.hasUnknownCost ? 'Custo conhecido' : 'Custo total'
}
