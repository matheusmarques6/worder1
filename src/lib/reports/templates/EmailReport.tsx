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
  formatNumber,
  truncateText,
  REPORT_LIMITS,
} from '../index'
import type { EmailReportData } from '../contracts'

interface EmailReportProps {
  data: EmailReportData
}

export function EmailReport({ data }: EmailReportProps) {
  return (
    <Document>
      <PageWrapper>
        <ReportHeader 
          title="RELATÓRIO DE EMAIL"
          subtitle={data.accountName || 'Klaviyo'}
          period={data.period}
          generatedAt={data.generatedAt}
        />

        <Section title="MÉTRICAS GERAIS">
          <KPIRow>
            <KPICard 
              value={formatNumber(data.kpis.totalSent)} 
              label="Emails Enviados"
              change={data.kpis.totalSentChange}
            />
            <KPICard 
              value={formatPercent(data.kpis.openRate)} 
              label="Taxa de Abertura"
              change={data.kpis.openRateChange}
            />
            <KPICard 
              value={formatPercent(data.kpis.clickRate)} 
              label="Taxa de Clique"
              change={data.kpis.clickRateChange}
            />
          </KPIRow>
          <KPIRow>
            <KPICard 
              value={formatCurrency(data.kpis.totalRevenue)} 
              label="Receita Atribuída"
              change={data.kpis.totalRevenueChange}
            />
            <KPICard 
              value={formatPercent(data.kpis.conversionRate)} 
              label="Taxa de Conversão"
              change={data.kpis.conversionRateChange}
            />
            <KPICard 
              value={formatPercent(data.kpis.unsubscribeRate)} 
              label="Taxa de Descadastro"
            />
          </KPIRow>
        </Section>

        {data.campaigns.length > 0 && (
          <Section title="CAMPANHAS">
            <Table
              columns={[
                { header: 'Campanha', width: '30%' },
                { header: 'Enviados', width: '12%', align: 'right' },
                { header: 'Aberturas', width: '12%', align: 'right' },
                { header: 'Cliques', width: '12%', align: 'right' },
                { header: 'Receita', width: '17%', align: 'right' },
                { header: 'CTR', width: '17%', align: 'right' },
              ]}
              rows={data.campaigns.slice(0, REPORT_LIMITS.TOP_N_CAMPAIGNS).map(c => [
                truncateText(c.name, 25),
                formatNumber(c.sent),
                formatNumber(c.opens),
                formatNumber(c.clicks),
                formatCurrency(c.revenue),
                formatPercent(c.clickRate),
              ])}
              zebra
            />
          </Section>
        )}

        {data.flows && data.flows.length > 0 && (
          <Section title="AUTOMAÇÕES (FLOWS)">
            <Table
              columns={[
                { header: 'Flow', width: '35%' },
                { header: 'Status', width: '15%' },
                { header: 'Enviados', width: '15%', align: 'right' },
                { header: 'Receita', width: '20%', align: 'right' },
                { header: 'CTR', width: '15%', align: 'right' },
              ]}
              rows={data.flows.map(f => [
                truncateText(f.name, 30),
                f.status === 'active' ? 'Ativo' : f.status === 'paused' ? 'Pausado' : 'Rascunho',
                formatNumber(f.sent),
                formatCurrency(f.revenue),
                formatPercent(f.clickRate),
              ])}
              zebra
            />
          </Section>
        )}

        {data.listMetrics && (
          <Section title="MÉTRICAS DA LISTA">
            <KPIRow>
              <KPICard 
                value={formatNumber(data.listMetrics.totalSubscribers)} 
                label="Total de Inscritos"
              />
              <KPICard 
                value={formatNumber(data.listMetrics.newSubscribers)} 
                label="Novos Inscritos"
              />
              <KPICard 
                value={formatPercent(data.listMetrics.growthRate)} 
                label="Taxa de Crescimento"
              />
            </KPIRow>
          </Section>
        )}
      </PageWrapper>
    </Document>
  )
}
