import { NextRequest } from 'next/server'
import { Document } from '@react-pdf/renderer'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { 
  generatePdf, 
  pdfResponse, 
  ReportErrors,
  generateReportFilename,
  formatCurrency,
  formatPercent,
  formatNumber,
  formatDateTime,
  formatReportPeriod,
  formatROAS,
  calculatePeriodDates,
  truncateText,
  REPORT_LIMITS,
  ADS_PLATFORMS,
  type AdsPlatform,
} from '@/lib/reports'
import { PLATFORM_LABELS } from '@/lib/reports/contracts/ads'
import { 
  ReportHeader, 
  KPICard, 
  KPIRow, 
  Section, 
  Table,
  PageWrapper,
} from '@/lib/reports/components'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const supabase = createServerComponentClient({ cookies })
    
    // 1. Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return ReportErrors.UNAUTHORIZED()
    }

    // 2. Profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id) {
      return ReportErrors.FORBIDDEN()
    }

    // 3. Params
    const searchParams = request.nextUrl.searchParams
    const platformParam = searchParams.get('platform') || 'meta'
    const storeId = searchParams.get('storeId')
    const period = searchParams.get('period') || '30d'

    // Validar plataforma
    const platform = ADS_PLATFORMS.includes(platformParam as AdsPlatform) 
      ? platformParam as AdsPlatform 
      : 'meta'

    const platformLabel = PLATFORM_LABELS[platform]
    const { startDate, endDate } = calculatePeriodDates(period)

    // 4. Buscar integração da plataforma
    const integrationType = platform === 'meta' ? 'facebook_ads' : `${platform}_ads`
    
    let integrationQuery = supabase
      .from('integrations')
      .select('id, config')
      .eq('organization_id', profile.organization_id)
      .eq('type', integrationType)
      .eq('status', 'active')

    if (storeId) {
      integrationQuery = integrationQuery.eq('store_id', storeId)
    }

    const { data: integrations } = await integrationQuery
    const integration = integrations?.[0]

    // 5. Buscar métricas de ads
    // Por enquanto usando dados de exemplo
    const reportData = {
      platform,
      platformLabel,
      period: formatReportPeriod(startDate, endDate),
      generatedAt: formatDateTime(new Date()),
      kpis: {
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        cpa: 0,
        roas: 0,
      },
      campaigns: [] as Array<{
        name: string
        status: string
        spend: number
        impressions: number
        clicks: number
        conversions: number
        revenue: number
        ctr: number
        roas: number
      }>,
    }

    // Se tiver integração, buscar dados reais
    if (integration) {
      // TODO: Buscar dados da API da plataforma ou tabela de cache
    }

    // 6. Gerar PDF
    const AdsReportDocument = (
      <Document>
        <PageWrapper>
          <ReportHeader 
            title={`RELATÓRIO ${platformLabel.toUpperCase()}`}
            period={reportData.period}
            generatedAt={reportData.generatedAt}
          />

          <Section title="PERFORMANCE">
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
            <KPIRow>
              <KPICard 
                value={formatNumber(reportData.kpis.conversions)} 
                label="Conversões"
              />
              <KPICard 
                value={formatCurrency(reportData.kpis.revenue)} 
                label="Receita"
              />
              <KPICard 
                value={formatROAS(reportData.kpis.roas)} 
                label="ROAS"
              />
            </KPIRow>
          </Section>

          <Section title="MÉTRICAS CALCULADAS">
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

          {reportData.campaigns.length > 0 && (
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
                rows={reportData.campaigns.map(c => [
                  truncateText(c.name, 20),
                  c.status,
                  formatCurrency(c.spend),
                  formatNumber(c.clicks),
                  formatNumber(c.conversions),
                  formatCurrency(c.revenue),
                  formatROAS(c.roas),
                ])}
                zebra
                maxRows={REPORT_LIMITS.TOP_N_CAMPAIGNS}
              />
            </Section>
          )}

          {!integration && (
            <Section title="AVISO">
              <Table
                columns={[{ header: 'Informação', width: '100%' }]}
                rows={[[`Integração ${platformLabel} não encontrada. Conecte sua conta para ver dados reais.`]]}
              />
            </Section>
          )}
        </PageWrapper>
      </Document>
    )

    const pdfData = await generatePdf(AdsReportDocument)
    const filename = generateReportFilename(`ads-${platform}`)

    const duration = Date.now() - startTime
    console.log('[REPORT_ADS] Gerado com sucesso', {
      userId: user.id,
      orgId: profile.organization_id,
      platform,
      storeId,
      period,
      duration: `${duration}ms`,
    })

    return pdfResponse(pdfData, filename)

  } catch (error) {
    console.error('[REPORT_ADS] Erro:', error)
    return ReportErrors.INTERNAL_ERROR(
      error instanceof Error ? error.message : 'Erro desconhecido'
    )
  }
}
