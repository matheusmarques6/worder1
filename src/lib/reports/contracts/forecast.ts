/**
 * Contrato de dados para Relatório de Forecast
 */

export interface ForecastReportData {
  period: string // 'month' | 'quarter'
  periodLabel: string // "Janeiro 2026" ou "Q1 2026"
  generatedAt: string
  
  // Métricas gerais
  metrics: {
    totalPipeline: number
    weightedPipeline: number
    dealCount: number
    avgDealValue: number
  }
  
  // Por nível de commit
  byCommitLevel: {
    omit: number
    pipeline: number
    bestCase: number
    commit: number
  }
  
  // Contagem por nível de commit
  countByCommitLevel: {
    omit: number
    pipeline: number
    bestCase: number
    commit: number
  }
  
  // Por estágio
  byStage: Array<{
    id: string
    name: string
    color: string
    probability: number
    count: number
    value: number
    weightedValue: number
  }>
  
  // Performance
  performance: {
    won: {
      count: number
      value: number
    }
    lost: {
      count: number
      value: number
    }
    winRate: number
  }
  
  // Comparativo vs período anterior
  vsPrevious: {
    previousWonValue: number
    changePercent: number
  }
  
  // Velocidade por estágio
  velocity: Array<{
    stageId: string
    stageName: string
    avgTimeHours: number
    avgTimeDays: number
    dealsCount: number
  }>
  
  // Top oportunidades
  topDeals: Array<{
    id: string
    title: string
    value: number
    weightedValue: number
    stage: string
    probability: number
    commitLevel: string
    contact?: {
      name: string
      email?: string
    }
  }>
}

/**
 * Labels para níveis de commit
 */
export const COMMIT_LEVEL_LABELS: Record<string, string> = {
  omit: 'Omitir',
  pipeline: 'Pipeline',
  bestCase: 'Melhor Caso',
  best_case: 'Melhor Caso',
  commit: 'Comprometido',
}

/**
 * Cores para níveis de commit
 */
export const COMMIT_LEVEL_COLORS: Record<string, string> = {
  omit: '#9ca3af',      // Cinza
  pipeline: '#3b82f6',  // Azul
  bestCase: '#eab308',  // Amarelo
  best_case: '#eab308', // Amarelo
  commit: '#22c55e',    // Verde
}

/**
 * Valores padrão para quando não há dados
 */
export const DEFAULT_FORECAST_REPORT: ForecastReportData = {
  period: 'month',
  periodLabel: '',
  generatedAt: '',
  metrics: {
    totalPipeline: 0,
    weightedPipeline: 0,
    dealCount: 0,
    avgDealValue: 0,
  },
  byCommitLevel: {
    omit: 0,
    pipeline: 0,
    bestCase: 0,
    commit: 0,
  },
  countByCommitLevel: {
    omit: 0,
    pipeline: 0,
    bestCase: 0,
    commit: 0,
  },
  byStage: [],
  performance: {
    won: { count: 0, value: 0 },
    lost: { count: 0, value: 0 },
    winRate: 0,
  },
  vsPrevious: {
    previousWonValue: 0,
    changePercent: 0,
  },
  velocity: [],
  topDeals: [],
}
