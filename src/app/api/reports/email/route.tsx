/**
 * API Route: Relatório de Email Marketing (Klaviyo)
 * v2.1 - Auth padronizada + dados reais da API Klaviyo + cache
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
  formatPercent,
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
import { getKlaviyoMetrics } from '@/lib/services/klaviyo-metrics'

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
        type: 'email',
        organizationId,
        storeId,
        period,
        skipCache,
      },
      async () => {
        const metrics = await getKlaviyoMetrics({
          supabase,
          organizationId,
          storeId,
          startDate,
          endDate,
        })

        const hasIntegration = metrics !== null
        const hasData = hasIntegration && metrics.kpis.totalSent > 0

        return {
          period: formatReportPeriod(startDate, endDate),
          generatedAt: formatDateTime(new Date()),
          hasIntegration,
          hasData,
          kpis: {
            enviados: metrics?.kpis.totalSent || 0,
            aberturas: metrics?.kpis.totalOpens || 0,
            cliques: metrics?.kpis.totalClicks || 0,
            receita: metrics?.kpis.totalRevenue || 0,
            taxaAbertura: metrics?.kpis.openRate || 0,
            taxaClique: metrics?.kpis.clickRate || 0,
            taxaDescadastro: metrics?.kpis.unsubscribeRate || 0,
          },
          campaigns: metrics?.campaigns || [],
        }
      }
    )

    // 4. Gerar PDF
    const EmailReportDocument = (
      <Document>
        <PageWrapper>
          <ReportHeader 
            title="RELATÓRIO DE EMAIL MARKETING"
            subtitle="Klaviyo"
            period={reportData.period}
            generatedAt={reportData.generatedAt}
          />

          {!reportData.hasIntegration ? (
            <Section title="INTEGRAÇÃO NÃO CONFIGURADA">
              <Table
                columns={[{ header: 'Informação', width: '100%' }]}
                rows={[
                  ['Integração Klaviyo não encontrada ou inativa.'],
                  ['Configure a integração para visualizar métricas de email.'],
                ]}
              />
            </Section>
          ) : !reportData.hasData ? (
            <Section title="SEM DADOS">
              <Table
                columns={[{ header: 'Informação', width: '100%' }]}
                rows={[
                  ['Nenhuma campanha encontrada no período selecionado.'],
                ]}
              />
            </Section>
          ) : (
            <>
              <Section title="MÉTRICAS GERAIS">
                <KPIRow>
                  <KPICard 
                    value={formatNumber(reportData.kpis.enviados)} 
                    label="Emails Enviados"
                  />
                  <KPICard 
                    value={formatNumber(reportData.kpis.aberturas)} 
                    label="Aberturas"
                  />
                  <KPICard 
                    value={formatNumber(reportData.kpis.cliques)} 
                    label="Cliques"
                  />
                </KPIRow>
                <KPIRow>
                  <KPICard 
                    value={formatPercent(reportData.kpis.taxaAbertura)} 
                    label="Taxa de Abertura"
                  />
                  <KPICard 
                    value={formatPercent(reportData.kpis.taxaClique)} 
                    label="Taxa de Clique"
                  />
                  <KPICard 
                    value={formatCurrency(reportData.kpis.receita)} 
                    label="Receita Atribuída"
                  />
                </KPIRow>
              </Section>

              {reportData.campaigns.length > 0 && (
                <Section title="CAMPANHAS">
                  <Table
                    columns={[
                      { header: 'Campanha', width: '35%' },
                      { header: 'Enviados', width: '15%', align: 'right' },
                      { header: 'Aberturas', width: '15%', align: 'right' },
                      { header: 'Tx. Abertura', width: '15%', align: 'right' },
                      { header: 'Receita', width: '20%', align: 'right' },
                    ]}
                    rows={reportData.campaigns.slice(0, 15).map(c => [
                      truncateText(c.name, 30),
                      formatNumber(c.sent),
                      formatNumber(c.opens),
                      formatPercent(c.openRate),
                      formatCurrency(c.revenue),
                    ])}
                    zebra
                    maxRows={15}
                  />
                </Section>
              )}
            </>
          )}
        </PageWrapper>
      </Document>
    )

    const pdfData = await generatePdf(EmailReportDocument)
    const filename = generateReportFilename('email')

    const duration = Date.now() - startTime
    console.log('[REPORT_EMAIL] Gerado com sucesso', {
      userId: user.id,
      orgId: organizationId,
      storeId,
      period,
      fromCache,
      hasIntegration: reportData.hasIntegration,
      hasData: reportData.hasData,
      enviados: reportData.kpis.enviados,
      duration: `${duration}ms`,
    })

    const response = pdfResponse(pdfData, filename)
    return addCacheHeader(response, fromCache)

  } catch (error) {
    console.error('[REPORT_EMAIL] Erro:', error)
    return ReportErrors.INTERNAL_ERROR(
      error instanceof Error ? error.message : 'Erro desconhecido'
    )
  }
}
