import { NextRequest } from 'next/server'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
  Image,
} from '@react-pdf/renderer'
import { WORDER_LOGO_BASE64 } from '@/lib/reports/assets/logo'

// ⚠️ IMPORTANTE: Necessário para funcionar na Vercel
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Estilos do PDF
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#f97316',
    marginBottom: 30,
  },
  logo: {
    width: 120,
    height: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  kpiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  kpiCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    width: '30%',
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  kpiLabel: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 4,
  },
  kpiChange: {
    fontSize: 10,
    marginTop: 8,
  },
  positive: {
    color: '#22c55e',
  },
  negative: {
    color: '#ef4444',
  },
  table: {
    width: '100%',
    marginTop: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1f2937',
    padding: 8,
  },
  tableHeaderCell: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tableCell: {
    fontSize: 10,
    color: '#374151',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 10,
  },
  footerText: {
    fontSize: 8,
    color: '#9ca3af',
  },
})

// Componente do documento PDF
function POCReport() {
  const generatedAt = new Date().toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Image style={styles.logo} src={WORDER_LOGO_BASE64} />
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.headerTitle}>RELATÓRIO POC</Text>
            <Text style={styles.headerSubtitle}>Spike Técnico - Fase 0</Text>
            <Text style={styles.headerSubtitle}>Gerado em: {generatedAt}</Text>
          </View>
        </View>

        {/* KPIs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MÉTRICAS DE EXEMPLO</Text>
          <View style={styles.kpiRow}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>R$ 150.000</Text>
              <Text style={styles.kpiLabel}>Receita Total</Text>
              <Text style={[styles.kpiChange, styles.positive]}>▲ 12,5% vs anterior</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>85%</Text>
              <Text style={styles.kpiLabel}>Taxa de Conversão</Text>
              <Text style={[styles.kpiChange, styles.positive]}>▲ 3,2% vs anterior</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>R$ 5.200</Text>
              <Text style={styles.kpiLabel}>Ticket Médio</Text>
              <Text style={[styles.kpiChange, styles.negative]}>▼ 2,1% vs anterior</Text>
            </View>
          </View>
        </View>

        {/* Tabela */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TOP 5 DEALS</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { width: '40%' }]}>Deal</Text>
              <Text style={[styles.tableHeaderCell, { width: '25%' }]}>Valor</Text>
              <Text style={[styles.tableHeaderCell, { width: '20%' }]}>Estágio</Text>
              <Text style={[styles.tableHeaderCell, { width: '15%' }]}>Prob.</Text>
            </View>
            {[
              { deal: 'Empresa ABC Ltda', valor: 'R$ 50.000', estagio: 'Negociação', prob: '70%' },
              { deal: 'Cliente XYZ S.A.', valor: 'R$ 35.000', estagio: 'Proposta', prob: '50%' },
              { deal: 'Tech Solutions', valor: 'R$ 28.000', estagio: 'Qualificação', prob: '30%' },
              { deal: 'Global Corp', valor: 'R$ 22.000', estagio: 'Negociação', prob: '60%' },
              { deal: 'StartUp Inc', valor: 'R$ 15.000', estagio: 'Fechamento', prob: '90%' },
            ].map((row, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.tableCell, { width: '40%' }]}>{row.deal}</Text>
                <Text style={[styles.tableCell, { width: '25%' }]}>{row.valor}</Text>
                <Text style={[styles.tableCell, { width: '20%' }]}>{row.estagio}</Text>
                <Text style={[styles.tableCell, { width: '15%' }]}>{row.prob}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Info de Validação */}
        <View style={[styles.section, { marginTop: 30 }]}>
          <View style={{ backgroundColor: '#ecfdf5', padding: 16, borderRadius: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#059669' }}>
              ✅ Spike Técnico Validado!
            </Text>
            <Text style={{ fontSize: 10, color: '#047857', marginTop: 8 }}>
              Se você está vendo este PDF, significa que:
            </Text>
            <Text style={{ fontSize: 10, color: '#047857', marginTop: 4 }}>
              • @react-pdf/renderer está funcionando
            </Text>
            <Text style={{ fontSize: 10, color: '#047857', marginTop: 2 }}>
              • Runtime nodejs está configurado corretamente
            </Text>
            <Text style={{ fontSize: 10, color: '#047857', marginTop: 2 }}>
              • Logo em base64 renderiza
            </Text>
            <Text style={{ fontSize: 10, color: '#047857', marginTop: 2 }}>
              • Estilos e layout funcionam
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Worder CRM - worder.com.br</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}

export async function GET(request: NextRequest) {
  try {
    console.log('[REPORT_POC] Iniciando geração do PDF...')
    const startTime = Date.now()

    // Gerar PDF
    const pdfBuffer = await renderToBuffer(<POCReport />)

    const duration = Date.now() - startTime
    console.log('[REPORT_POC] PDF gerado com sucesso', {
      duration: `${duration}ms`,
      size: `${(pdfBuffer.length / 1024).toFixed(2)}KB`,
    })

    // Retornar PDF (converter Buffer para Uint8Array para compatibilidade com Response)
    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="poc-report-${new Date().toISOString().split('T')[0]}.pdf"`,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    console.error('[REPORT_POC] Erro ao gerar PDF:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Erro ao gerar PDF', 
        details: error instanceof Error ? error.message : 'Erro desconhecido' 
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    )
  }
}
