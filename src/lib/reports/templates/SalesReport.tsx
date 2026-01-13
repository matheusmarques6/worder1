import { Document } from '@react-pdf/renderer'
import { 
  ReportHeader, 
  KPICard, 
  KPIRow, 
  Section, 
  Table,
  InsightCard,
  PageWrapper,
} from '../components'
import { 
  formatCurrency,
  formatPercent,
  formatDays,
  truncateText,
  REPORT_LIMITS,
} from '../index'

interface SalesFunnel {
  name: string
  dealCount: number
  value: number
  conversionRate: number
}

interface TopDeal {
  title: string
  value: number
  stage: string
  probability: number
  contactName: string
}

interface Insight {
  type: 'positive' | 'warning' | 'info'
  title: string
  description: string
}

interface SalesReportProps {
  data: {
    period: string
    generatedAt: string
    kpis: {
      wonValue: number
      winRate: number
      avgTicket: number
      avgCycleDays: number
      totalDeals: number
      openDeals: number
    }
    funnel: SalesFunnel[]
    topDeals: TopDeal[]
    insights: Insight[]
  }
}

export function SalesReport({ data }: SalesReportProps) {
  return (
    <Document>
      <PageWrapper>
        <ReportHeader 
          title="RELATÓRIO DE VENDAS"
          subtitle="CRM Analytics"
          period={data.period}
          generatedAt={data.generatedAt}
        />

        <Section title="MÉTRICAS PRINCIPAIS">
          <KPIRow>
            <KPICard 
              value={formatCurrency(data.kpis.wonValue)} 
              label="Valor Ganho"
            />
            <KPICard 
              value={formatPercent(data.kpis.winRate)} 
              label="Taxa de Conversão"
            />
            <KPICard 
              value={formatCurrency(data.kpis.avgTicket)} 
              label="Ticket Médio"
            />
          </KPIRow>
          <KPIRow>
            <KPICard 
              value={formatDays(data.kpis.avgCycleDays)} 
              label="Ciclo Médio"
            />
            <KPICard 
              value={data.kpis.totalDeals.toString()} 
              label="Total de Deals"
            />
            <KPICard 
              value={data.kpis.openDeals.toString()} 
              label="Deals em Aberto"
            />
          </KPIRow>
        </Section>

        {data.funnel.length > 0 && (
          <Section title="FUNIL DE VENDAS">
            <Table
              columns={[
                { header: 'Estágio', width: '35%' },
                { header: 'Deals', width: '15%', align: 'right' },
                { header: 'Valor', width: '25%', align: 'right' },
                { header: '% Funil', width: '25%', align: 'right' },
              ]}
              rows={data.funnel.map(stage => [
                stage.name,
                stage.dealCount.toString(),
                formatCurrency(stage.value),
                formatPercent(stage.conversionRate),
              ])}
            />
          </Section>
        )}
      </PageWrapper>

      {(data.topDeals.length > 0 || data.insights.length > 0) && (
        <PageWrapper>
          {data.topDeals.length > 0 && (
            <Section title="TOP DEALS">
              <Table
                columns={[
                  { header: 'Deal', width: '35%' },
                  { header: 'Valor', width: '20%', align: 'right' },
                  { header: 'Estágio', width: '20%' },
                  { header: 'Prob.', width: '10%', align: 'right' },
                  { header: 'Contato', width: '15%' },
                ]}
                rows={data.topDeals.slice(0, REPORT_LIMITS.TOP_N_DEALS).map(deal => [
                  truncateText(deal.title, 30),
                  formatCurrency(deal.value),
                  deal.stage,
                  formatPercent(deal.probability),
                  truncateText(deal.contactName, 15),
                ])}
                zebra
              />
            </Section>
          )}

          {data.insights.length > 0 && (
            <Section title="INSIGHTS E RECOMENDAÇÕES">
              {data.insights.slice(0, REPORT_LIMITS.MAX_INSIGHTS).map((insight, i) => (
                <InsightCard
                  key={i}
                  type={insight.type}
                  title={insight.title}
                  description={insight.description}
                />
              ))}
            </Section>
          )}
        </PageWrapper>
      )}
    </Document>
  )
}
