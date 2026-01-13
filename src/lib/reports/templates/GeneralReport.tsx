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
  REPORT_LIMITS,
} from '../index'
import type { GeneralReportData } from '../contracts'

interface GeneralReportProps {
  data: GeneralReportData
}

export function GeneralReport({ data }: GeneralReportProps) {
  return (
    <Document>
      <PageWrapper>
        <ReportHeader 
          title="RELATÓRIO GERAL"
          period={data.period}
          generatedAt={data.generatedAt}
        />

        <Section title="VISÃO FINANCEIRA">
          <KPIRow>
            <KPICard 
              value={formatCurrency(data.kpis.receita)} 
              label="Receita Total"
              change={data.kpis.receitaChange}
            />
            <KPICard 
              value={formatCurrency(data.kpis.custos)} 
              label="Custos"
              change={data.kpis.custosChange}
            />
            <KPICard 
              value={formatCurrency(data.kpis.lucro)} 
              label="Lucro"
              change={data.kpis.lucroChange}
            />
          </KPIRow>
          <KPIRow>
            <KPICard 
              value={data.kpis.pedidos.toString()} 
              label="Total de Pedidos"
              change={data.kpis.pedidosChange}
            />
            <KPICard 
              value={formatCurrency(data.kpis.ticketMedio)} 
              label="Ticket Médio"
              change={data.kpis.ticketMedioChange}
            />
            <KPICard 
              value={formatPercent(data.kpis.margem)} 
              label="Margem"
              change={data.kpis.margemChange}
            />
          </KPIRow>
        </Section>

        {data.stores.length > 0 && (
          <Section title="PERFORMANCE POR LOJA">
            <Table
              columns={[
                { header: 'Loja', width: '30%' },
                { header: 'Pedidos', width: '15%', align: 'right' },
                { header: 'Receita', width: '20%', align: 'right' },
                { header: 'Custos', width: '15%', align: 'right' },
                { header: 'Lucro', width: '20%', align: 'right' },
              ]}
              rows={data.stores.map(store => [
                store.name,
                store.pedidos.toString(),
                formatCurrency(store.receita),
                formatCurrency(store.custos),
                formatCurrency(store.lucro),
              ])}
              zebra
              maxRows={REPORT_LIMITS.MAX_STORES}
            />
          </Section>
        )}
      </PageWrapper>
    </Document>
  )
}
