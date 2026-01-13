import { Document } from '@react-pdf/renderer'
import { 
  ReportHeader, 
  KPICard, 
  KPIRow, 
  Section, 
  Table,
  PageWrapper,
} from '../components'
import { 
  formatCurrency,
  formatPercent,
  truncateText,
  REPORT_LIMITS,
} from '../index'

interface StageData {
  name: string
  probability: number
  count: number
  value: number
  weightedValue: number
}

interface TopDeal {
  title: string
  value: number
  weightedValue: number
  stage: string
  probability: number
}

interface ForecastReportProps {
  data: {
    periodLabel: string
    generatedAt: string
    metrics: {
      totalPipeline: number
      weightedPipeline: number
      dealCount: number
      avgDealValue: number
    }
    byCommitLevel: {
      commit: number
      bestCase: number
      pipeline: number
      omit: number
    }
    countByCommitLevel: {
      commit: number
      bestCase: number
      pipeline: number
      omit: number
    }
    byStage: StageData[]
    topDeals: TopDeal[]
  }
}

export function ForecastReport({ data }: ForecastReportProps) {
  const totalPipeline = data.metrics.totalPipeline

  return (
    <Document>
      <PageWrapper>
        <ReportHeader 
          title="FORECAST DE VENDAS"
          subtitle={data.periodLabel}
          generatedAt={data.generatedAt}
        />

        <Section title="VISÃO GERAL DO PIPELINE">
          <KPIRow>
            <KPICard 
              value={formatCurrency(data.metrics.totalPipeline)} 
              label="Pipeline Total"
            />
            <KPICard 
              value={formatCurrency(data.metrics.weightedPipeline)} 
              label="Pipeline Ponderado"
            />
            <KPICard 
              value={data.metrics.dealCount.toString()} 
              label="Total de Deals"
            />
          </KPIRow>
          <KPIRow>
            <KPICard 
              value={formatCurrency(data.metrics.avgDealValue)} 
              label="Ticket Médio"
            />
            <KPICard 
              value={formatCurrency(data.byCommitLevel.commit)} 
              label="Comprometido"
            />
            <KPICard 
              value={formatCurrency(data.byCommitLevel.bestCase)} 
              label="Melhor Caso"
            />
          </KPIRow>
        </Section>

        <Section title="POR NÍVEL DE COMMIT">
          <Table
            columns={[
              { header: 'Nível', width: '30%' },
              { header: 'Deals', width: '15%', align: 'right' },
              { header: 'Valor', width: '27.5%', align: 'right' },
              { header: '% Pipeline', width: '27.5%', align: 'right' },
            ]}
            rows={[
              [
                'Comprometido', 
                data.countByCommitLevel.commit.toString(), 
                formatCurrency(data.byCommitLevel.commit), 
                totalPipeline > 0 ? formatPercent((data.byCommitLevel.commit / totalPipeline) * 100) : '0%'
              ],
              [
                'Melhor Caso', 
                data.countByCommitLevel.bestCase.toString(), 
                formatCurrency(data.byCommitLevel.bestCase), 
                totalPipeline > 0 ? formatPercent((data.byCommitLevel.bestCase / totalPipeline) * 100) : '0%'
              ],
              [
                'Pipeline', 
                data.countByCommitLevel.pipeline.toString(), 
                formatCurrency(data.byCommitLevel.pipeline), 
                totalPipeline > 0 ? formatPercent((data.byCommitLevel.pipeline / totalPipeline) * 100) : '0%'
              ],
              [
                'Omitir', 
                data.countByCommitLevel.omit.toString(), 
                formatCurrency(data.byCommitLevel.omit), 
                totalPipeline > 0 ? formatPercent((data.byCommitLevel.omit / totalPipeline) * 100) : '0%'
              ],
            ]}
            zebra
          />
        </Section>
      </PageWrapper>

      <PageWrapper>
        {data.byStage.length > 0 && (
          <Section title="POR ESTÁGIO">
            <Table
              columns={[
                { header: 'Estágio', width: '25%' },
                { header: 'Prob.', width: '15%', align: 'right' },
                { header: 'Deals', width: '10%', align: 'right' },
                { header: 'Valor', width: '25%', align: 'right' },
                { header: 'Ponderado', width: '25%', align: 'right' },
              ]}
              rows={data.byStage.map(stage => [
                stage.name,
                formatPercent(stage.probability),
                stage.count.toString(),
                formatCurrency(stage.value),
                formatCurrency(stage.weightedValue),
              ])}
              zebra
            />
          </Section>
        )}

        {data.topDeals.length > 0 && (
          <Section title="TOP OPORTUNIDADES">
            <Table
              columns={[
                { header: 'Deal', width: '30%' },
                { header: 'Valor', width: '20%', align: 'right' },
                { header: 'Ponderado', width: '20%', align: 'right' },
                { header: 'Estágio', width: '15%' },
                { header: 'Prob.', width: '15%', align: 'right' },
              ]}
              rows={data.topDeals.slice(0, REPORT_LIMITS.TOP_N_DEALS).map(deal => [
                truncateText(deal.title, 25),
                formatCurrency(deal.value),
                formatCurrency(deal.weightedValue),
                deal.stage,
                formatPercent(deal.probability),
              ])}
              zebra
            />
          </Section>
        )}
      </PageWrapper>
    </Document>
  )
}
