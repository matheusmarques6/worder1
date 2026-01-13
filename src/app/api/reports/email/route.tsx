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
    const storeId = searchParams.get('storeId')
    const period = searchParams.get('period') || '30d'
    const { startDate, endDate } = calculatePeriodDates(period)

    // 4. Buscar integração Klaviyo
    let integrationQuery = supabase
      .from('integrations')
      .select('id, config')
      .eq('organization_id', profile.organization_id)
      .eq('type', 'klaviyo')
      .eq('status', 'active')

    if (storeId) {
      integrationQuery = integrationQuery.eq('store_id', storeId)
    }

    const { data: integrations } = await integrationQuery
    const integration = integrations?.[0]

    // 5. Buscar métricas de email (tabela de cache ou API)
    // Por enquanto usando dados de exemplo
    const reportData = {
      period: formatReportPeriod(startDate, endDate),
      generatedAt: formatDateTime(new Date()),
      accountName: 'Klaviyo',
      kpis: {
        totalSent: 0,
        totalOpens: 0,
        totalClicks: 0,
        totalRevenue: 0,
        openRate: 0,
        clickRate: 0,
        conversionRate: 0,
        unsubscribeRate: 0,
      },
      campaigns: [] as Array<{
        name: string
        sent: number
        opens: number
        clicks: number
        revenue: number
        openRate: number
        clickRate: number
      }>,
    }

    // Se tiver integração, buscar dados reais
    if (integration) {
      // TODO: Buscar dados da API Klaviyo ou tabela de cache
      // Por enquanto mantém zeros
    }

    // 6. Gerar PDF
    const EmailReportDocument = (
      <Document>
        <PageWrapper>
          <ReportHeader 
            title="RELATÓRIO DE EMAIL"
            subtitle={reportData.accountName}
            period={reportData.period}
            generatedAt={reportData.generatedAt}
          />

          <Section title="MÉTRICAS GERAIS">
            <KPIRow>
              <KPICard 
                value={formatNumber(reportData.kpis.totalSent)} 
                label="Emails Enviados"
              />
              <KPICard 
                value={formatPercent(reportData.kpis.openRate)} 
                label="Taxa de Abertura"
              />
              <KPICard 
                value={formatPercent(reportData.kpis.clickRate)} 
                label="Taxa de Clique"
              />
            </KPIRow>
            <KPIRow>
              <KPICard 
                value={formatCurrency(reportData.kpis.totalRevenue)} 
                label="Receita Atribuída"
              />
              <KPICard 
                value={formatPercent(reportData.kpis.conversionRate)} 
                label="Taxa de Conversão"
              />
              <KPICard 
                value={formatPercent(reportData.kpis.unsubscribeRate)} 
                label="Taxa de Descadastro"
              />
            </KPIRow>
          </Section>

          {reportData.campaigns.length > 0 && (
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
                rows={reportData.campaigns.map(c => [
                  truncateText(c.name, 25),
                  formatNumber(c.sent),
                  formatNumber(c.opens),
                  formatNumber(c.clicks),
                  formatCurrency(c.revenue),
                  formatPercent(c.clickRate),
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
                rows={[['Integração Klaviyo não encontrada. Conecte sua conta para ver dados reais.']]}
              />
            </Section>
          )}
        </PageWrapper>
      </Document>
    )

    const pdfData = await generatePdf(EmailReportDocument)
    const filename = generateReportFilename('email')

    const duration = Date.now() - startTime
    console.log('[REPORT_EMAIL] Gerado com sucesso', {
      userId: user.id,
      orgId: profile.organization_id,
      storeId,
      period,
      duration: `${duration}ms`,
    })

    return pdfResponse(pdfData, filename)

  } catch (error) {
    console.error('[REPORT_EMAIL] Erro:', error)
    return ReportErrors.INTERNAL_ERROR(
      error instanceof Error ? error.message : 'Erro desconhecido'
    )
  }
}
