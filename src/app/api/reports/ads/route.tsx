/**
 * API Route: Relatório de Ads (Meta, Google, TikTok)
 * v2.1 - Auth padronizada + conversion_value + Map de campaigns + cache
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
  formatROAS,
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
import { getAdsMetrics, AdsPlatform } from '@/lib/services/ads-metrics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PLATFORM_LABELS: Record<AdsPlatform, string> = {
  meta: 'Meta Ads (Facebook/Instagram)',
  google: 'Google Ads',
  tiktok: 'TikTok Ads',
}

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
    const platform = (searchParams.get('platform') || 'meta') as AdsPlatform
    const period = searchParams.get('period') || '30d'
    const skipCache = shouldSkipCache(searchParams)
    const { startDate, endDate } = calculatePeriodDates(period)

    // Validar platform
    if (!['meta', 'google', 'tiktok'].includes(platform)) {
      return ReportErrors.BAD_REQUEST('Platform inválida. Use: meta, google ou tiktok')
    }

    // 3. Buscar métricas com cache
    const { data: reportData, fromCache } = await withReportCache(
      {
        type: 'ads',
        organizationId,
        platform,
        period,
        skipCache,
      },
      async () => {
        const metrics = await getAdsMetrics({
          supabase,
          organizationId,
          platform,
          startDate,
          endDate,
        })

        const hasData = metrics !== null && metrics.kpis.spend > 0

        return {
          period: formatReportPeriod(startDate, endDate),
          generatedAt: formatDateTime(new Date()),
          platform,
          platformLabel: PLATFORM_LABELS[platform],
          hasData,
          kpis: {
            spend: metrics?.kpis.spend || 0,
            impressions: metrics?.kpis.impressions || 0,
            clicks: metrics?.kpis.clicks || 0,
            conversions: metrics?.kpis.conversions || 0,
            revenue: metrics?.kpis.revenue || 0,
            ctr: metrics?.kpis.ctr || 0,
            cpc: metrics?.kpis.cpc || 0,
            cpm: metrics?.kpis.cpm || 0,
            roas: metrics?.kpis.roas || 0,
          },
          campaigns: metrics?.campaigns || [],
        }
      }
    )

    // 4. Gerar PDF
    const AdsReportDocument = (
      <Document>
        <PageWrapper>
          <ReportHeader 
            title="RELATÓRIO DE ADS"
            subtitle={reportData.platformLabel}
            period={reportData.period}
            generatedAt={reportData.generatedAt}
          />

          {!reportData.hasData ? (
            <Section title="SEM DADOS">
              <Table
                columns={[{ header: 'Informação', width: '100%' }]}
                rows={[
                  [`Nenhum dado encontrado para ${reportData.platformLabel} no período.`],
                  ['Verifique se a integração está configurada e sincronizada.'],
                ]}
              />
            </Section>
          ) : (
            <>
              <Section title="INVESTIMENTO E ALCANCE">
                <KPIRow>
                  <KPICard 
                    value={formatCurrency(reportData.kpis.spend)} 
                    label="Investimento"
                  />
                  <KPICard 
                    value={formatNumber(reportData.kpis.impressions)} 
                    label="Impressões"
                  />
                  <KPICard 
                    value={formatNumber(reportData.kpis.clicks)} 
                    label="Cliques"
                  />
                </KPIRow>
              </Section>

              <Section title="PERFORMANCE">
                <KPIRow>
                  <KPICard 
                    value={formatPercent(reportData.kpis.ctr)} 
                    label="CTR"
                  />
                  <KPICard 
                    value={formatCurrency(reportData.kpis.cpc)} 
                    label="CPC"
                  />
                  <KPICard 
                    value={formatCurrency(reportData.kpis.cpm)} 
                    label="CPM"
                  />
                </KPIRow>
              </Section>

              <Section title="CONVERSÕES">
                <KPIRow>
                  <KPICard 
                    value={formatNumber(reportData.kpis.conversions)} 
                    label="Conversões"
                  />
                  <KPICard 
                    value={formatCurrency(reportData.kpis.revenue)} 
                    label="Receita Atribuída"
                  />
                  <KPICard 
                    value={formatROAS(reportData.kpis.roas)} 
                    label="ROAS"
                  />
                </KPIRow>
              </Section>

              {reportData.campaigns.length > 0 && (
                <Section title="CAMPANHAS">
                  <Table
                    columns={[
                      { header: 'Campanha', width: '30%' },
                      { header: 'Invest.', width: '15%', align: 'right' },
                      { header: 'Cliques', width: '12%', align: 'right' },
                      { header: 'CTR', width: '12%', align: 'right' },
                      { header: 'Receita', width: '16%', align: 'right' },
                      { header: 'ROAS', width: '15%', align: 'right' },
                    ]}
                    rows={reportData.campaigns.slice(0, 15).map(c => [
                      truncateText(c.name, 25),
                      formatCurrency(c.spend),
                      formatNumber(c.clicks),
                      formatPercent(c.ctr),
                      formatCurrency(c.revenue),
                      formatROAS(c.roas),
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

    const pdfData = await generatePdf(AdsReportDocument)
    const filename = generateReportFilename(`ads-${platform}`)

    const duration = Date.now() - startTime
    console.log('[REPORT_ADS] Gerado com sucesso', {
      userId: user.id,
      orgId: organizationId,
      platform,
      period,
      fromCache,
      hasData: reportData.hasData,
      spend: reportData.kpis.spend,
      roas: reportData.kpis.roas,
      duration: `${duration}ms`,
    })

    const response = pdfResponse(pdfData, filename)
    return addCacheHeader(response, fromCache)

  } catch (error) {
    console.error('[REPORT_ADS] Erro:', error)
    return ReportErrors.INTERNAL_ERROR(
      error instanceof Error ? error.message : 'Erro desconhecido'
    )
  }
}
