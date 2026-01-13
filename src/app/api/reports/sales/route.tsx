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
  formatDateTime,
  formatReportPeriod,
  formatDays,
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
  InsightCard,
  PageWrapper,
} from '@/lib/reports/components'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const supabase = createServerComponentClient({ cookies })
    
    // 1. Verificar autenticação
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('[REPORT_SALES] Auth error:', authError)
      return ReportErrors.UNAUTHORIZED()
    }

    // 2. Buscar perfil com organização
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id) {
      return ReportErrors.FORBIDDEN()
    }

    // 3. Extrair parâmetros
    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get('storeId')
    const pipelineId = searchParams.get('pipelineId')
    const period = searchParams.get('period') || '30d'
    
    // 4. Calcular datas do período
    const { startDate, endDate } = calculatePeriodDates(period)

    // 5. Buscar deals do período
    let dealsQuery = supabase
      .from('deals')
      .select(`
        id,
        title,
        value,
        status,
        probability,
        stage_id,
        created_at,
        closed_at,
        contact:contacts(name, email)
      `)
      .eq('organization_id', profile.organization_id)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    if (storeId) {
      dealsQuery = dealsQuery.eq('store_id', storeId)
    }
    if (pipelineId) {
      dealsQuery = dealsQuery.eq('pipeline_id', pipelineId)
    }

    const { data: deals } = await dealsQuery

    // 6. Buscar stages para funil
    let stagesQuery = supabase
      .from('pipeline_stages')
      .select('id, name, color, position, probability')
      .eq('organization_id', profile.organization_id)
      .order('position')

    if (pipelineId) {
      stagesQuery = stagesQuery.eq('pipeline_id', pipelineId)
    }

    const { data: stages } = await stagesQuery

    // 7. Calcular métricas
    const allDeals = deals || []
    const wonDeals = allDeals.filter(d => d.status === 'won')
    const lostDeals = allDeals.filter(d => d.status === 'lost')
    const openDeals = allDeals.filter(d => d.status === 'open')

    const wonValue = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0)
    const lostValue = lostDeals.reduce((sum, d) => sum + (d.value || 0), 0)
    const pipelineTotal = openDeals.reduce((sum, d) => sum + (d.value || 0), 0)
    const weightedTotal = openDeals.reduce((sum, d) => sum + (d.value || 0) * ((d.probability || 0) / 100), 0)

    const winRate = wonDeals.length + lostDeals.length > 0
      ? (wonDeals.length / (wonDeals.length + lostDeals.length)) * 100
      : 0

    const avgTicket = wonDeals.length > 0 
      ? wonValue / wonDeals.length 
      : 0

    // Calcular ciclo médio (dias entre criação e fechamento)
    const closedDeals = [...wonDeals, ...lostDeals].filter(d => d.closed_at)
    const avgCycleDays = closedDeals.length > 0
      ? closedDeals.reduce((sum, d) => {
          const created = new Date(d.created_at)
          const closed = new Date(d.closed_at)
          return sum + (closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
        }, 0) / closedDeals.length
      : 0

    // Montar funil
    const funnel = (stages || []).map(stage => {
      const stageDeals = allDeals.filter(d => d.stage_id === stage.id)
      const stageValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0)
      return {
        id: stage.id,
        name: stage.name,
        color: stage.color || '#6b7280',
        position: stage.position,
        dealCount: stageDeals.length,
        value: stageValue,
        conversionRate: allDeals.length > 0 ? (stageDeals.length / allDeals.length) * 100 : 0,
      }
    })

    // Top deals
    const topDeals = [...allDeals]
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .slice(0, REPORT_LIMITS.TOP_N_DEALS)
      .map(d => ({
        id: d.id,
        title: d.title,
        value: d.value || 0,
        stage: stages?.find(s => s.id === d.stage_id)?.name || '-',
        probability: d.probability || 0,
        contactName: (d.contact as { name?: string })?.name || '-',
      }))

    // Gerar insights automáticos
    const insights: Array<{ type: 'positive' | 'warning' | 'info'; title: string; description: string }> = []
    
    if (winRate >= 50) {
      insights.push({
        type: 'positive',
        title: 'Boa taxa de conversão',
        description: `Taxa de ${winRate.toFixed(1)}% está acima da média de mercado (30-40%).`,
      })
    } else if (winRate < 30) {
      insights.push({
        type: 'warning',
        title: 'Taxa de conversão baixa',
        description: `Taxa de ${winRate.toFixed(1)}% está abaixo da média. Revise o processo de qualificação.`,
      })
    }

    if (avgCycleDays > 60) {
      insights.push({
        type: 'warning',
        title: 'Ciclo de vendas longo',
        description: `Média de ${avgCycleDays.toFixed(0)} dias. Considere acelerar etapas do funil.`,
      })
    }

    if (openDeals.length > 0 && pipelineTotal > 0) {
      insights.push({
        type: 'info',
        title: 'Pipeline ativo',
        description: `${openDeals.length} deals em aberto com valor total de ${formatCurrency(pipelineTotal)}.`,
      })
    }

    const reportData = {
      period: formatReportPeriod(startDate, endDate),
      generatedAt: formatDateTime(new Date()),
    }

    // 8. Gerar PDF
    const SalesReportDocument = (
      <Document>
        <PageWrapper>
          <ReportHeader 
            title="RELATÓRIO DE VENDAS"
            subtitle="CRM Analytics"
            period={reportData.period}
            generatedAt={reportData.generatedAt}
          />

          <Section title="MÉTRICAS PRINCIPAIS">
            <KPIRow>
              <KPICard 
                value={formatCurrency(wonValue)} 
                label="Valor Ganho"
              />
              <KPICard 
                value={formatPercent(winRate)} 
                label="Taxa de Conversão"
              />
              <KPICard 
                value={formatCurrency(avgTicket)} 
                label="Ticket Médio"
              />
            </KPIRow>
            <KPIRow>
              <KPICard 
                value={formatDays(avgCycleDays)} 
                label="Ciclo Médio"
              />
              <KPICard 
                value={allDeals.length.toString()} 
                label="Total de Deals"
              />
              <KPICard 
                value={openDeals.length.toString()} 
                label="Deals em Aberto"
              />
            </KPIRow>
          </Section>

          {funnel.length > 0 && (
            <Section title="FUNIL DE VENDAS">
              <Table
                columns={[
                  { header: 'Estágio', width: '35%' },
                  { header: 'Deals', width: '15%', align: 'right' },
                  { header: 'Valor', width: '25%', align: 'right' },
                  { header: '% Funil', width: '25%', align: 'right' },
                ]}
                rows={funnel.map(stage => [
                  stage.name,
                  stage.dealCount.toString(),
                  formatCurrency(stage.value),
                  formatPercent(stage.conversionRate),
                ])}
              />
            </Section>
          )}
        </PageWrapper>

        {(topDeals.length > 0 || insights.length > 0) && (
          <PageWrapper>
            {topDeals.length > 0 && (
              <Section title="TOP DEALS">
                <Table
                  columns={[
                    { header: 'Deal', width: '35%' },
                    { header: 'Valor', width: '20%', align: 'right' },
                    { header: 'Estágio', width: '20%' },
                    { header: 'Prob.', width: '10%', align: 'right' },
                    { header: 'Contato', width: '15%' },
                  ]}
                  rows={topDeals.map(deal => [
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

            {insights.length > 0 && (
              <Section title="INSIGHTS E RECOMENDAÇÕES">
                {insights.slice(0, REPORT_LIMITS.MAX_INSIGHTS).map((insight, i) => (
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

    const pdfData = await generatePdf(SalesReportDocument)
    const filename = generateReportFilename('vendas')

    const duration = Date.now() - startTime
    console.log('[REPORT_SALES] Gerado com sucesso', {
      userId: user.id,
      orgId: profile.organization_id,
      storeId,
      pipelineId,
      period,
      dealsCount: allDeals.length,
      duration: `${duration}ms`,
    })

    return pdfResponse(pdfData, filename)

  } catch (error) {
    console.error('[REPORT_SALES] Erro:', error)
    return ReportErrors.INTERNAL_ERROR(
      error instanceof Error ? error.message : 'Erro desconhecido'
    )
  }
}
