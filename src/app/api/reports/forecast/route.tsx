import { NextRequest } from 'next/server'
import { Document } from '@react-pdf/renderer'
import { getAuthClient, authError } from '@/lib/api-utils'
import { 
  generatePdf, 
  pdfResponse, 
  ReportErrors,
  generateReportFilename,
  formatCurrency,
  formatPercent,
  formatDateTime,
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
    // 1. Auth padronizada
    const auth = await getAuthClient()
    if (!auth) {
      return authError('Não autorizado', 401)
    }

    const { supabase, user } = auth
    const organizationId = user.organization_id

    // 2. Parâmetros
    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get('storeId')
    const pipelineId = searchParams.get('pipelineId')
    const period = searchParams.get('period') || 'month' // month ou quarter
    
    // 4. Calcular período do forecast
    const now = new Date()
    let periodLabel = ''
    let startDate: Date
    let endDate: Date

    if (period === 'quarter') {
      const quarter = Math.floor(now.getMonth() / 3) + 1
      periodLabel = `Q${quarter} ${now.getFullYear()}`
      startDate = new Date(now.getFullYear(), (quarter - 1) * 3, 1)
      endDate = new Date(now.getFullYear(), quarter * 3, 0)
    } else {
      periodLabel = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    }

    // 4. Buscar deals em aberto
    let dealsQuery = supabase
      .from('deals')
      .select(`
        id,
        title,
        value,
        probability,
        commit_level,
        stage_id,
        expected_close_date,
        contact:contacts(name, email)
      `)
      .eq('organization_id', organizationId)
      .eq('status', 'open')

    if (storeId) {
      dealsQuery = dealsQuery.eq('store_id', storeId)
    }
    if (pipelineId) {
      dealsQuery = dealsQuery.eq('pipeline_id', pipelineId)
    }

    const { data: deals } = await dealsQuery

    // 5. Buscar stages
    const { data: stages } = await supabase
      .from('pipeline_stages')
      .select('id, name, color, probability, position')
      .eq('organization_id', organizationId)
      .order('position')

    // 7. Calcular métricas
    const allDeals = deals || []
    const totalPipeline = allDeals.reduce((sum, d) => sum + (d.value || 0), 0)
    const weightedPipeline = allDeals.reduce((sum, d) => 
      sum + (d.value || 0) * ((d.probability || 0) / 100), 0
    )
    const avgDealValue = allDeals.length > 0 ? totalPipeline / allDeals.length : 0

    // Por commit level
    const byCommitLevel = {
      commit: allDeals.filter(d => d.commit_level === 'commit').reduce((sum, d) => sum + (d.value || 0), 0),
      bestCase: allDeals.filter(d => d.commit_level === 'best_case').reduce((sum, d) => sum + (d.value || 0), 0),
      pipeline: allDeals.filter(d => d.commit_level === 'pipeline').reduce((sum, d) => sum + (d.value || 0), 0),
      omit: allDeals.filter(d => d.commit_level === 'omit' || !d.commit_level).reduce((sum, d) => sum + (d.value || 0), 0),
    }

    // Por estágio
    const byStage = (stages || []).map(stage => {
      const stageDeals = allDeals.filter(d => d.stage_id === stage.id)
      const stageValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0)
      const weightedValue = stageDeals.reduce((sum, d) => 
        sum + (d.value || 0) * ((stage.probability || d.probability || 0) / 100), 0
      )
      return {
        id: stage.id,
        name: stage.name,
        color: stage.color,
        probability: stage.probability || 0,
        count: stageDeals.length,
        value: stageValue,
        weightedValue,
      }
    })

    // Top oportunidades
    const topDeals = [...allDeals]
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .slice(0, REPORT_LIMITS.TOP_N_DEALS)
      .map(d => ({
        title: d.title,
        value: d.value || 0,
        weightedValue: (d.value || 0) * ((d.probability || 0) / 100),
        stage: stages?.find(s => s.id === d.stage_id)?.name || '-',
        probability: d.probability || 0,
        commitLevel: d.commit_level || 'pipeline',
        contactName: (d.contact as { name?: string })?.name || '-',
      }))

    const reportData = {
      periodLabel,
      generatedAt: formatDateTime(new Date()),
    }

    // 8. Gerar PDF
    const ForecastReportDocument = (
      <Document>
        <PageWrapper>
          <ReportHeader 
            title="FORECAST DE VENDAS"
            subtitle={reportData.periodLabel}
            generatedAt={reportData.generatedAt}
          />

          <Section title="VISÃO GERAL DO PIPELINE">
            <KPIRow>
              <KPICard 
                value={formatCurrency(totalPipeline)} 
                label="Pipeline Total"
              />
              <KPICard 
                value={formatCurrency(weightedPipeline)} 
                label="Pipeline Ponderado"
              />
              <KPICard 
                value={allDeals.length.toString()} 
                label="Total de Deals"
              />
            </KPIRow>
            <KPIRow>
              <KPICard 
                value={formatCurrency(avgDealValue)} 
                label="Ticket Médio"
              />
              <KPICard 
                value={formatCurrency(byCommitLevel.commit)} 
                label="Comprometido"
              />
              <KPICard 
                value={formatCurrency(byCommitLevel.bestCase)} 
                label="Melhor Caso"
              />
            </KPIRow>
          </Section>

          <Section title="POR NÍVEL DE COMMIT">
            <Table
              columns={[
                { header: 'Nível', width: '30%' },
                { header: 'Deals', width: '15%', align: 'right' },
                { header: 'Valor', width: '27.5%', align: 'right' },
                { header: '% Pipeline', width: '27.5%', align: 'right' },
              ]}
              rows={[
                ['Comprometido', allDeals.filter(d => d.commit_level === 'commit').length.toString(), formatCurrency(byCommitLevel.commit), totalPipeline > 0 ? formatPercent((byCommitLevel.commit / totalPipeline) * 100) : '0%'],
                ['Melhor Caso', allDeals.filter(d => d.commit_level === 'best_case').length.toString(), formatCurrency(byCommitLevel.bestCase), totalPipeline > 0 ? formatPercent((byCommitLevel.bestCase / totalPipeline) * 100) : '0%'],
                ['Pipeline', allDeals.filter(d => d.commit_level === 'pipeline').length.toString(), formatCurrency(byCommitLevel.pipeline), totalPipeline > 0 ? formatPercent((byCommitLevel.pipeline / totalPipeline) * 100) : '0%'],
                ['Omitir', allDeals.filter(d => d.commit_level === 'omit' || !d.commit_level).length.toString(), formatCurrency(byCommitLevel.omit), totalPipeline > 0 ? formatPercent((byCommitLevel.omit / totalPipeline) * 100) : '0%'],
              ]}
              zebra
            />
          </Section>
        </PageWrapper>

        <PageWrapper>
          {byStage.length > 0 && (
            <Section title="POR ESTÁGIO">
              <Table
                columns={[
                  { header: 'Estágio', width: '25%' },
                  { header: 'Prob.', width: '15%', align: 'right' },
                  { header: 'Deals', width: '10%', align: 'right' },
                  { header: 'Valor', width: '25%', align: 'right' },
                  { header: 'Ponderado', width: '25%', align: 'right' },
                ]}
                rows={byStage.map(stage => [
                  stage.name,
                  formatPercent(stage.probability),
                  stage.count.toString(),
                  formatCurrency(stage.value),
                  formatCurrency(stage.weightedValue),
                ])}
                zebra
              />
            </Section>
          )}

          {topDeals.length > 0 && (
            <Section title="TOP OPORTUNIDADES">
              <Table
                columns={[
                  { header: 'Deal', width: '30%' },
                  { header: 'Valor', width: '20%', align: 'right' },
                  { header: 'Ponderado', width: '20%', align: 'right' },
                  { header: 'Estágio', width: '15%' },
                  { header: 'Prob.', width: '15%', align: 'right' },
                ]}
                rows={topDeals.map(deal => [
                  truncateText(deal.title, 25),
                  formatCurrency(deal.value),
                  formatCurrency(deal.weightedValue),
                  deal.stage,
                  formatPercent(deal.probability),
                ])}
                zebra
              />
            </Section>
          )}
        </PageWrapper>
      </Document>
    )

    const pdfData = await generatePdf(ForecastReportDocument)
    const filename = generateReportFilename('forecast')

    const duration = Date.now() - startTime
    console.log('[REPORT_FORECAST] Gerado com sucesso', {
      userId: user.id,
      orgId: organizationId,
      period,
      dealsCount: allDeals.length,
      duration: `${duration}ms`,
    })

    return pdfResponse(pdfData, filename)

  } catch (error) {
    console.error('[REPORT_FORECAST] Erro:', error)
    return ReportErrors.INTERNAL_ERROR(
      error instanceof Error ? error.message : 'Erro desconhecido'
    )
  }
}
