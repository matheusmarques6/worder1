// =============================================
// DEPRECATED — substituído por queries em ai_executions (F3)
// Mantido como stub durante a F0. F3 reconstrói analytics agregando
// ai_executions + ai_costs_daily + classificações de outcome.
// =============================================

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  return NextResponse.json({
    summary: null,
    trends: null,
    agents: [],
    chartData: [],
    providerBreakdown: [],
    modelBreakdown: [],
    hourlyDistribution: [],
    performanceMetrics: null,
    qualityMetrics: null,
    errors: [],
    deprecated: true,
  })
}
