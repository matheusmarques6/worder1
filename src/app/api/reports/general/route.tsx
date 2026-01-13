/**
 * API Route: Relatório Geral
 * v2.1 - Auth padronizada + dados reais + variação % + cache
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
  formatPercent,
  formatDateTime,
  formatReportPeriod,
  calculatePeriodDates,
  calculateChange,
  calculatePreviousPeriod,
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
import type { GeneralReportData } from '@/lib/reports/contracts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // 1. Auth padronizada usando helper existente
    const auth = await getAuthClient()
    if (!auth) {
      return authError('Não autorizado', 401)
    }

    const { supabase, user } = auth
    const organizationId = user.organization_id

    // 2. Extrair parâmetros
    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get('storeId')
    const period = searchParams.get('period') || '30d'
    const skipCache = shouldSkipCache(searchParams)
    
    // 3. Calcular datas do período atual e anterior
    const { startDate, endDate } = calculatePeriodDates(period)
    const { previousStartDate, previousEndDate } = calculatePreviousPeriod(startDate, endDate)

    // 4. Buscar dados com cache
    const { data: reportData, fromCache } = await withReportCache<GeneralReportData>(
      {
        type: 'general',
        organizationId,
        storeId: storeId || undefined,
        period,
        skipCache,
      },
      async () => {
        // Buscar lojas da organização
        let storesQuery = supabase
          .from('stores')
          .select('id, name, domain')
          .eq('organization_id', organizationId)
          .order('name')
          .limit(REPORT_LIMITS.MAX_STORES)

        if (storeId) {
          storesQuery = storesQuery.eq('id', storeId)
        }

        const { data: stores } = await storesQuery

        // Buscar deals do período ATUAL
        const { data: currentDeals } = await supabase
          .from('deals')
          .select('value, status, store_id')
          .eq('organization_id', organizationId)
          .eq('status', 'won')
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())

        // Buscar deals do período ANTERIOR (para comparação)
        const { data: previousDeals } = await supabase
          .from('deals')
          .select('value, status, store_id')
          .eq('organization_id', organizationId)
          .eq('status', 'won')
          .gte('created_at', previousStartDate.toISOString())
          .lte('created_at', previousEndDate.toISOString())

        // Calcular KPIs do período atual
        const wonDeals = currentDeals || []
        const currentRevenue = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0)
        const currentCount = wonDeals.length
        const currentAvgTicket = currentCount > 0 ? currentRevenue / currentCount : 0

        // Calcular KPIs do período anterior
        const prevWonDeals = previousDeals || []
        const previousRevenue = prevWonDeals.reduce((sum, d) => sum + (d.value || 0), 0)
        const previousCount = prevWonDeals.length
        const previousAvgTicket = previousCount > 0 ? previousRevenue / previousCount : 0

        // Montar dados do relatório com variação % REAL
        return {
          period: formatReportPeriod(startDate, endDate),
          generatedAt: formatDateTime(new Date()),
          kpis: {
            receita: currentRevenue,
            receitaChange: calculateChange(currentRevenue, previousRevenue),
            pedidos: currentCount,
            pedidosChange: calculateChange(currentCount, previousCount),
            ticketMedio: currentAvgTicket,
            ticketMedioChange: calculateChange(currentAvgTicket, previousAvgTicket),
            custos: null,
            custosChange: null,
            lucro: null,
            lucroChange: null,
            margem: null,
            margemChange: null,
            marketing: null,
            marketingChange: null,
            impostos: null,
            impostosChange: null,
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
              custos: null,
              lucro: null,
              margem: null,
            }
          }),
        } as GeneralReportData
      }
    )

    // 5. Gerar PDF (sempre fresco, não cachear)
    const GeneralReportDocument = (
      <Document>
        <PageWrapper>
          <ReportHeader 
            title="RELATÓRIO GERAL"
            period={reportData.period}
            generatedAt={reportData.generatedAt}
          />

          {/* Seção de KPIs reais do CRM */}
          <Section title="VISÃO GERAL DE VENDAS">
            <KPIRow>
              <KPICard 
                value={formatCurrency(reportData.kpis.receita)} 
                label="Receita Total"
                change={reportData.kpis.receitaChange}
              />
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
            </KPIRow>
          </Section>

          {/* Seção financeira só aparece se houver dados */}
          {(reportData.kpis.custos !== null || reportData.kpis.lucro !== null) && (
            <Section title="VISÃO FINANCEIRA">
              <KPIRow>
                {reportData.kpis.custos !== null && (
                  <KPICard 
                    value={formatCurrency(reportData.kpis.custos)} 
                    label="Custos"
                    change={reportData.kpis.custosChange}
                  />
                )}
                {reportData.kpis.lucro !== null && (
                  <KPICard 
                    value={formatCurrency(reportData.kpis.lucro)} 
                    label="Lucro"
                    change={reportData.kpis.lucroChange}
                  />
                )}
                {reportData.kpis.margem !== null && (
                  <KPICard 
                    value={formatPercent(reportData.kpis.margem)} 
                    label="Margem"
                    change={reportData.kpis.margemChange}
                  />
                )}
              </KPIRow>
            </Section>
          )}

          {/* Performance por loja */}
          {reportData.stores.length > 0 && (
            <Section title="PERFORMANCE POR LOJA">
              <Table
                columns={[
                  { header: 'Loja', width: '50%' },
                  { header: 'Pedidos', width: '25%', align: 'right' },
                  { header: 'Receita', width: '25%', align: 'right' },
                ]}
                rows={reportData.stores.map(store => [
                  store.name,
                  store.pedidos.toString(),
                  formatCurrency(store.receita),
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
      orgId: organizationId,
      storeId,
      period,
      fromCache,
      duration: `${duration}ms`,
      kpis: {
        receita: reportData.kpis.receita,
        receitaChange: reportData.kpis.receitaChange,
        pedidos: reportData.kpis.pedidos,
      },
    })

    // Adicionar header X-Cache na resposta
    const response = pdfResponse(pdfData, filename)
    return addCacheHeader(response, fromCache)

  } catch (error) {
    console.error('[REPORT_GENERAL] Erro:', error)
    return ReportErrors.INTERNAL_ERROR(
      error instanceof Error ? error.message : 'Erro desconhecido'
    )
  }
}
