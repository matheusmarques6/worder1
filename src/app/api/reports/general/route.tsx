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
  calculatePeriodDates,
  REPORT_LIMITS,
} from '@/lib/reports'
import { 
  ReportHeader, 
  ReportFooter, 
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
    
    // 1. Verificar autenticação
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('[REPORT_GENERAL] Auth error:', authError)
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
    const period = searchParams.get('period') || '30d'
    
    // 4. Calcular datas do período
    const { startDate, endDate } = calculatePeriodDates(period)

    // 5. Buscar lojas da organização
    let storesQuery = supabase
      .from('stores')
      .select('id, name, domain')
      .eq('organization_id', profile.organization_id)
      .order('name')
      .limit(REPORT_LIMITS.MAX_STORES)

    if (storeId) {
      storesQuery = storesQuery.eq('id', storeId)
    }

    const { data: stores } = await storesQuery

    // 6. Buscar métricas agregadas (exemplo simplificado)
    // Em produção, isso viria de uma view ou função agregadora
    const { data: deals } = await supabase
      .from('deals')
      .select('value, status, store_id')
      .eq('organization_id', profile.organization_id)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    // Calcular KPIs
    const wonDeals = deals?.filter(d => d.status === 'won') || []
    const totalRevenue = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0)
    const totalDeals = wonDeals.length
    const avgTicket = totalDeals > 0 ? totalRevenue / totalDeals : 0

    // Dados do relatório
    const reportData = {
      period: formatReportPeriod(startDate, endDate),
      generatedAt: formatDateTime(new Date()),
      kpis: {
        receita: totalRevenue,
        receitaChange: 0, // TODO: calcular vs período anterior
        pedidos: totalDeals,
        pedidosChange: 0,
        ticketMedio: avgTicket,
        ticketMedioChange: 0,
        lucro: totalRevenue * 0.3, // Placeholder
        lucroChange: 0,
        margem: 30,
        margemChange: 0,
        custos: totalRevenue * 0.5,
        custosChange: 0,
      },
      stores: (stores || []).map(store => {
        const storeDeals = wonDeals.filter(d => d.store_id === store.id)
        const storeRevenue = storeDeals.reduce((sum, d) => sum + (d.value || 0), 0)
        return {
          id: store.id,
          name: store.name,
          domain: store.domain,
          pedidos: storeDeals.length,
          receita: storeRevenue,
          custos: storeRevenue * 0.5,
          lucro: storeRevenue * 0.3,
          margem: 30,
        }
      }),
    }

    // 7. Gerar PDF
    const GeneralReportDocument = (
      <Document>
        <PageWrapper>
          <ReportHeader 
            title="RELATÓRIO GERAL"
            period={reportData.period}
            generatedAt={reportData.generatedAt}
          />

          <Section title="VISÃO FINANCEIRA">
            <KPIRow>
              <KPICard 
                value={formatCurrency(reportData.kpis.receita)} 
                label="Receita Total"
                change={reportData.kpis.receitaChange}
              />
              <KPICard 
                value={formatCurrency(reportData.kpis.custos)} 
                label="Custos"
                change={reportData.kpis.custosChange}
              />
              <KPICard 
                value={formatCurrency(reportData.kpis.lucro)} 
                label="Lucro"
                change={reportData.kpis.lucroChange}
              />
            </KPIRow>
            <KPIRow>
              <KPICard 
                value={reportData.kpis.pedidos.toString()} 
                label="Total de Pedidos"
                change={reportData.kpis.pedidosChange}
              />
              <KPICard 
                value={formatCurrency(reportData.kpis.ticketMedio)} 
                label="Ticket Médio"
                change={reportData.kpis.ticketMedioChange}
              />
              <KPICard 
                value={formatPercent(reportData.kpis.margem)} 
                label="Margem"
                change={reportData.kpis.margemChange}
              />
            </KPIRow>
          </Section>

          {reportData.stores.length > 0 && (
            <Section title="PERFORMANCE POR LOJA">
              <Table
                columns={[
                  { header: 'Loja', width: '30%' },
                  { header: 'Pedidos', width: '15%', align: 'right' },
                  { header: 'Receita', width: '20%', align: 'right' },
                  { header: 'Custos', width: '15%', align: 'right' },
                  { header: 'Lucro', width: '20%', align: 'right' },
                ]}
                rows={reportData.stores.map(store => [
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

    const pdfData = await generatePdf(GeneralReportDocument)
    const filename = generateReportFilename('geral')

    const duration = Date.now() - startTime
    console.log('[REPORT_GENERAL] Gerado com sucesso', {
      userId: user.id,
      orgId: profile.organization_id,
      storeId,
      period,
      duration: `${duration}ms`,
    })

    return pdfResponse(pdfData, filename)

  } catch (error) {
    console.error('[REPORT_GENERAL] Erro:', error)
    return ReportErrors.INTERNAL_ERROR(
      error instanceof Error ? error.message : 'Erro desconhecido'
    )
  }
}
