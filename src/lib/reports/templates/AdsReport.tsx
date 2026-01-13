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
  formatROAS,
  truncateText,
  REPORT_LIMITS,
} from '../index'
import type { AdsReportData } from '../contracts'

interface AdsReportProps {
  data: AdsReportData
}

export function AdsReport({ data }: AdsReportProps) {
  const statusLabels: Record<string, string> = {
    active: 'Ativo',
    paused: 'Pausado',
    completed: 'Concluído',
    draft: 'Rascunho',
  }

  return (
    <Document>
      <PageWrapper>
        <ReportHeader 
          title={`RELATÓRIO ${data.platformLabel.toUpperCase()}`}
          subtitle={data.accountName}
          period={data.period}
          generatedAt={data.generatedAt}
        />

        <Section title="PERFORMANCE">
          <KPIRow>
            <KPICard 
              value={formatCurrency(data.kpis.spend)} 
              label="Investimento"
              change={data.kpis.spendChange}
            />
            <KPICard 
              value={formatNumber(data.kpis.impressions)} 
              label="Impressões"
              change={data.kpis.impressionsChange}
            />
            <KPICard 
              value={formatNumber(data.kpis.clicks)} 
              label="Cliques"
              change={data.kpis.clicksChange}
            />
          </KPIRow>
          <KPIRow>
            <KPICard 
              value={formatNumber(data.kpis.conversions)} 
              label="Conversões"
              change={data.kpis.conversionsChange}
            />
            <KPICard 
              value={formatCurrency(data.kpis.revenue)} 
              label="Receita"
              change={data.kpis.revenueChange}
            />
            <KPICard 
              value={formatROAS(data.kpis.roas)} 
              label="ROAS"
              change={data.kpis.roasChange}
            />
          </KPIRow>
        </Section>

        <Section title="MÉTRICAS CALCULADAS">
          <KPIRow>
            <KPICard 
              value={formatPercent(data.kpis.ctr)} 
              label="CTR"
              change={data.kpis.ctrChange}
            />
            <KPICard 
              value={formatCurrency(data.kpis.cpc)} 
              label="CPC"
              change={data.kpis.cpcChange}
            />
            <KPICard 
              value={formatCurrency(data.kpis.cpm)} 
              label="CPM"
              change={data.kpis.cpmChange}
            />
          </KPIRow>
        </Section>

        {data.campaigns.length > 0 && (
          <Section title="CAMPANHAS">
            <Table
              columns={[
                { header: 'Campanha', width: '25%' },
                { header: 'Status', width: '12%' },
                { header: 'Gasto', width: '15%', align: 'right' },
                { header: 'Cliques', width: '12%', align: 'right' },
                { header: 'Conv.', width: '12%', align: 'right' },
                { header: 'Receita', width: '14%', align: 'right' },
                { header: 'ROAS', width: '10%', align: 'right' },
              ]}
              rows={data.campaigns.slice(0, REPORT_LIMITS.TOP_N_CAMPAIGNS).map(c => [
                truncateText(c.name, 20),
                statusLabels[c.status] || c.status,
                formatCurrency(c.spend),
                formatNumber(c.clicks),
                formatNumber(c.conversions),
                formatCurrency(c.revenue),
                formatROAS(c.roas),
              ])}
              zebra
            />
          </Section>
        )}
      </PageWrapper>

      {data.adSets && data.adSets.length > 0 && (
        <PageWrapper>
          <Section title="CONJUNTOS DE ANÚNCIOS">
            <Table
              columns={[
                { header: 'Conjunto', width: '25%' },
                { header: 'Campanha', width: '20%' },
                { header: 'Gasto', width: '15%', align: 'right' },
                { header: 'Impr.', width: '13%', align: 'right' },
                { header: 'Cliques', width: '12%', align: 'right' },
                { header: 'CTR', width: '15%', align: 'right' },
              ]}
              rows={data.adSets.slice(0, 20).map(a => [
                truncateText(a.name, 20),
                truncateText(a.campaignName, 15),
                formatCurrency(a.spend),
                formatNumber(a.impressions),
                formatNumber(a.clicks),
                formatPercent(a.ctr),
              ])}
              zebra
            />
          </Section>
        </PageWrapper>
      )}

      {data.byDevice && data.byDevice.length > 0 && (
        <PageWrapper>
          <Section title="POR DISPOSITIVO">
            <Table
              columns={[
                { header: 'Dispositivo', width: '25%' },
                { header: 'Gasto', width: '20%', align: 'right' },
                { header: 'Impressões', width: '20%', align: 'right' },
                { header: 'Cliques', width: '17.5%', align: 'right' },
                { header: 'Conv.', width: '17.5%', align: 'right' },
              ]}
              rows={data.byDevice.map(d => [
                d.device,
                formatCurrency(d.spend),
                formatNumber(d.impressions),
                formatNumber(d.clicks),
                formatNumber(d.conversions),
              ])}
              zebra
            />
          </Section>
        </PageWrapper>
      )}
    </Document>
  )
}
