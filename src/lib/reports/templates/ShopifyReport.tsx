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
  formatNumber,
  truncateText,
  REPORT_LIMITS,
} from '../index'
import type { ShopifyReportData } from '../contracts'

interface ShopifyReportProps {
  data: ShopifyReportData
}

export function ShopifyReport({ data }: ShopifyReportProps) {
  return (
    <Document>
      <PageWrapper>
        <ReportHeader 
          title="RELATÓRIO SHOPIFY"
          subtitle={data.storeName || 'Loja Shopify'}
          period={data.period}
          generatedAt={data.generatedAt}
        />

        <Section title="VENDAS">
          <KPIRow>
            <KPICard 
              value={formatCurrency(data.kpis.vendasBrutas)} 
              label="Vendas Brutas"
              change={data.kpis.vendasBrutasChange}
            />
            <KPICard 
              value={formatCurrency(data.kpis.vendasLiquidas)} 
              label="Vendas Líquidas"
              change={data.kpis.vendasLiquidasChange}
            />
            <KPICard 
              value={formatNumber(data.kpis.pedidos)} 
              label="Pedidos"
              change={data.kpis.pedidosChange}
            />
          </KPIRow>
          <KPIRow>
            <KPICard 
              value={formatCurrency(data.kpis.ticketMedio)} 
              label="Ticket Médio"
              change={data.kpis.ticketMedioChange}
            />
            <KPICard 
              value={formatNumber(data.customers.novos)} 
              label="Novos Clientes"
              change={data.customers.novosChange}
            />
            <KPICard 
              value={formatNumber(data.customers.recorrentes)} 
              label="Clientes Recorrentes"
              change={data.customers.recorrentesChange}
            />
          </KPIRow>
        </Section>

        <Section title="DETALHAMENTO FINANCEIRO">
          <KPIRow>
            <KPICard 
              value={formatCurrency(data.financial.descontos)} 
              label="Descontos"
              change={data.financial.descontosChange}
            />
            <KPICard 
              value={formatCurrency(data.financial.devolucoes)} 
              label="Devoluções"
              change={data.financial.devolucoesChange}
            />
            <KPICard 
              value={formatCurrency(data.financial.frete)} 
              label="Frete"
              change={data.financial.freteChange}
            />
          </KPIRow>
        </Section>

        {data.topProducts.length > 0 && (
          <Section title="TOP PRODUTOS">
            <Table
              columns={[
                { header: 'Produto', width: '50%' },
                { header: 'Vendas', width: '25%', align: 'right' },
                { header: 'Qtd', width: '25%', align: 'right' },
              ]}
              rows={data.topProducts.slice(0, REPORT_LIMITS.TOP_N_PRODUCTS).map(p => [
                truncateText(p.name, 40),
                formatCurrency(p.vendas),
                formatNumber(p.quantidade),
              ])}
              zebra
            />
          </Section>
        )}

        {data.byChannel && data.byChannel.length > 0 && (
          <Section title="VENDAS POR CANAL">
            <Table
              columns={[
                { header: 'Canal', width: '40%' },
                { header: 'Vendas', width: '30%', align: 'right' },
                { header: 'Pedidos', width: '30%', align: 'right' },
              ]}
              rows={data.byChannel.map(c => [
                c.name,
                formatCurrency(c.vendas),
                formatNumber(c.pedidos),
              ])}
              zebra
            />
          </Section>
        )}
      </PageWrapper>
    </Document>
  )
}
