/**
 * API Route: Relatório Shopify
 * v2.1 - Auth padronizada + query via shopify_stores + dados reais + cache
 */

import { NextRequest } from 'next/server'
import { Document } from '@react-pdf/renderer'
import { getAuthClient, authError } from '@/lib/api-utils'
import { 
  generatePdf, 
  pdfResponse, 
  ReportErrors,
  generateReportFilename,
  formatCurrency,
  formatNumber,
  formatDateTime,
  formatReportPeriod,
  calculatePeriodDates,
  truncateText,
  REPORT_LIMITS,
} from '@/lib/reports'
import { 
  ReportHeader, 
  KPICard, 
  KPIRow, 
  Section, 
  Table,
  PageWrapper,
} from '@/lib/reports/components'
import { withReportCache, shouldSkipCache, addCacheHeader } from '@/lib/reports/cache'
import { getShopifyMetrics } from '@/lib/services/shopify-metrics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // 1. Auth padronizada
    const auth = await getAuthClient()
    if (!auth) {
      return authError('Não autorizado', 401)
    }

    const { supabase, user } = auth
    const organizationId = user.organization_id

    // 2. Params
    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get('storeId') || undefined
    const period = searchParams.get('period') || '30d'
    const skipCache = shouldSkipCache(searchParams)
    const { startDate, endDate } = calculatePeriodDates(period)

    // 3. Buscar métricas com cache
    const { data: reportData, fromCache } = await withReportCache(
      {
        type: 'shopify',
        organizationId,
        storeId,
        period,
        skipCache,
      },
      async () => {
        const metrics = await getShopifyMetrics({
          supabase,
          organizationId,
          storeId,
          startDate,
          endDate,
        })

        return {
          period: formatReportPeriod(startDate, endDate),
          generatedAt: formatDateTime(new Date()),
          storeName: metrics?.storeName || 'Shopify',
          hasData: metrics !== null && metrics.orderCount > 0,
          kpis: {
            vendasBrutas: metrics?.kpis.vendasBrutas || 0,
            vendasLiquidas: metrics?.kpis.vendasLiquidas || 0,
            pedidos: metrics?.kpis.pedidos || 0,
            ticketMedio: metrics?.kpis.ticketMedio || 0,
          },
          financial: {
            descontos: metrics?.financial.descontos || 0,
            frete: metrics?.financial.frete || 0,
            tributos: metrics?.financial.tributos || 0,
          },
          topProducts: metrics?.topProducts || [],
        }
      }
    )

    // 4. Gerar PDF
    const ShopifyReportDocument = (
      <Document>
        <PageWrapper>
          <ReportHeader 
            title="RELATÓRIO SHOPIFY"
            subtitle={reportData.storeName}
            period={reportData.period}
            generatedAt={reportData.generatedAt}
          />

          {reportData.hasData ? (
            <>
              <Section title="VENDAS">
                <KPIRow>
                  <KPICard 
                    value={formatCurrency(reportData.kpis.vendasBrutas)} 
                    label="Vendas Brutas"
                  />
                  <KPICard 
                    value={formatCurrency(reportData.kpis.vendasLiquidas)} 
                    label="Vendas Líquidas"
                  />
                  <KPICard 
                    value={formatNumber(reportData.kpis.pedidos)} 
                    label="Pedidos"
                  />
                </KPIRow>
                <KPIRow>
                  <KPICard 
                    value={formatCurrency(reportData.kpis.ticketMedio)} 
                    label="Ticket Médio"
                  />
                  <KPICard 
                    value={formatCurrency(reportData.financial.descontos)} 
                    label="Descontos"
                  />
                  <KPICard 
                    value={formatCurrency(reportData.financial.frete)} 
                    label="Frete"
                  />
                </KPIRow>
              </Section>

              {reportData.topProducts.length > 0 && (
                <Section title="TOP PRODUTOS">
                  <Table
                    columns={[
                      { header: 'Produto', width: '50%' },
                      { header: 'Vendas', width: '25%', align: 'right' },
                      { header: 'Qtd', width: '25%', align: 'right' },
                    ]}
                    rows={reportData.topProducts.map(p => [
                      truncateText(p.name, 40),
                      formatCurrency(p.vendas),
                      formatNumber(p.quantidade),
                    ])}
                    zebra
                    maxRows={REPORT_LIMITS.TOP_N_PRODUCTS}
                  />
                </Section>
              )}
            </>
          ) : (
            <Section title="SEM DADOS">
              <Table
                columns={[{ header: 'Informação', width: '100%' }]}
                rows={[
                  ['Nenhum pedido encontrado no período selecionado.'],
                  ['Verifique se a integração Shopify está configurada e ativa.'],
                ]}
              />
            </Section>
          )}
        </PageWrapper>
      </Document>
    )

    const pdfData = await generatePdf(ShopifyReportDocument)
    const filename = generateReportFilename('shopify')

    const duration = Date.now() - startTime
    console.log('[REPORT_SHOPIFY] Gerado com sucesso', {
      userId: user.id,
      orgId: organizationId,
      storeId,
      period,
      fromCache,
      hasData: reportData.hasData,
      pedidos: reportData.kpis.pedidos,
      duration: `${duration}ms`,
    })

    const response = pdfResponse(pdfData, filename)
    return addCacheHeader(response, fromCache)

  } catch (error) {
    console.error('[REPORT_SHOPIFY] Erro:', error)
    return ReportErrors.INTERNAL_ERROR(
      error instanceof Error ? error.message : 'Erro desconhecido'
    )
  }
}
