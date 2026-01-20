import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// =============================================
// API: /api/analytics/rfm
// Calcular e visualizar scores RFM
// =============================================

// GET - Buscar dados RFM
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organization_id = searchParams.get('organization_id')
    const view = searchParams.get('view') || 'summary'

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id required' }, { status: 400 })
    }

    // Resumo por segmento
    if (view === 'summary') {
      // Buscar segmentos E calculated_at
      const { data: segments } = await supabase
        .from('customer_rfm_scores')
        .select('rfm_segment, calculated_at')
        .eq('organization_id', organization_id)

      const summary: Record<string, { count: number; label: string; color: string; description: string }> = {
        champions: { count: 0, label: 'Campeões', color: '#22c55e', description: 'Compraram recentemente, frequentemente e gastam muito' },
        loyal: { count: 0, label: 'Leais', color: '#3b82f6', description: 'Compram com frequência e gastam bem' },
        potential_loyal: { count: 0, label: 'Potenciais Leais', color: '#8b5cf6', description: 'Clientes recentes com potencial de se tornarem leais' },
        new_customers: { count: 0, label: 'Novos Clientes', color: '#06b6d4', description: 'Compraram recentemente pela primeira vez' },
        at_risk: { count: 0, label: 'Em Risco', color: '#f59e0b', description: 'Compravam com frequência mas não compram há um tempo' },
        cant_lose: { count: 0, label: 'Não Pode Perder', color: '#ef4444', description: 'Eram grandes clientes mas estão sumindo' },
        hibernating: { count: 0, label: 'Hibernando', color: '#6b7280', description: 'Última compra há muito tempo, baixa frequência' },
        lost: { count: 0, label: 'Perdidos', color: '#374151', description: 'Não compram há muito tempo e compravam pouco' },
        others: { count: 0, label: 'Outros', color: '#9ca3af', description: 'Não se encaixam em outros segmentos' },
      }

      segments?.forEach(s => {
        if (s.rfm_segment && summary[s.rfm_segment]) {
          summary[s.rfm_segment].count++
        }
      })

      // Calcular totais
      const total = segments?.length || 0
      
      const { data: revenueData } = await supabase
        .from('customer_rfm_scores')
        .select('total_spent')
        .eq('organization_id', organization_id)
      
      const totalRevenue = revenueData?.reduce((sum, r) => sum + (r.total_spent || 0), 0) || 0

      // Pegar calculated_at do primeiro registro
      const lastCalculated = segments?.[0]?.calculated_at || null

      return NextResponse.json({ 
        summary, 
        total_contacts: total,
        total_revenue: totalRevenue,
        last_calculated: lastCalculated,
      })
    }

    // Lista de contatos por segmento
    if (view === 'contacts') {
      const segment = searchParams.get('segment')
      const limit = parseInt(searchParams.get('limit') || '50')
      const offset = parseInt(searchParams.get('offset') || '0')

      let query = supabase
        .from('customer_rfm_scores')
        .select(`
          *,
          contacts (
            id, name, email, phone, avatar_url
          )
        `, { count: 'exact' })
        .eq('organization_id', organization_id)
        .order('total_spent', { ascending: false })
        .range(offset, offset + limit - 1)

      if (segment) query = query.eq('rfm_segment', segment)

      const { data, count, error } = await query
      if (error) throw error

      return NextResponse.json({ contacts: data, total: count })
    }

    // Distribuição de scores
    if (view === 'distribution') {
      const { data } = await supabase
        .from('customer_rfm_scores')
        .select('recency_score, frequency_score, monetary_score')
        .eq('organization_id', organization_id)

      const distribution = {
        recency: [0, 0, 0, 0, 0],
        frequency: [0, 0, 0, 0, 0],
        monetary: [0, 0, 0, 0, 0],
      }

      data?.forEach(d => {
        if (d.recency_score) distribution.recency[d.recency_score - 1]++
        if (d.frequency_score) distribution.frequency[d.frequency_score - 1]++
        if (d.monetary_score) distribution.monetary[d.monetary_score - 1]++
      })

      return NextResponse.json({ distribution })
    }

    return NextResponse.json({ error: 'Invalid view' }, { status: 400 })

  } catch (error: any) {
    console.error('[RFM Analytics] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Recalcular RFM scores
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { organization_id, period_days = 365 } = body

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id required' }, { status: 400 })
    }

    // Tentar chamar função do banco
    const { error } = await supabase.rpc('calculate_rfm_scores', {
      p_organization_id: organization_id,
      p_period_days: period_days,
    })

    if (error) {
      // Se a função não existir, calcular manualmente
      await calculateRFMManual(organization_id, period_days)
    }

    // Buscar resultado
    const { data: summary } = await supabase
      .from('customer_rfm_scores')
      .select('rfm_segment')
      .eq('organization_id', organization_id)

    const segments: Record<string, number> = {}
    summary?.forEach(s => {
      if (s.rfm_segment) {
        segments[s.rfm_segment] = (segments[s.rfm_segment] || 0) + 1
      }
    })

    return NextResponse.json({ 
      success: true, 
      total_scored: summary?.length || 0,
      segments,
    })

  } catch (error: any) {
    console.error('[RFM Calculate] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =============================================
// CÁLCULO MANUAL DE RFM
// =============================================
async function calculateRFMManual(organization_id: string, period_days: number) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - period_days)

  // Buscar todos os contatos
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', organization_id)

  if (!contacts?.length) return

  // Buscar métricas de compra por contato
  const { data: purchases } = await supabase
    .from('customer_events')
    .select('contact_id, order_total, event_timestamp')
    .eq('organization_id', organization_id)
    .eq('event_type', 'purchase')
    .gte('event_timestamp', cutoffDate.toISOString())

  // Agregar por contato
  const contactMetrics: Record<string, { 
    lastPurchase: Date; 
    orders: number; 
    total: number 
  }> = {}

  purchases?.forEach(p => {
    if (!p.contact_id) return
    
    if (!contactMetrics[p.contact_id]) {
      contactMetrics[p.contact_id] = {
        lastPurchase: new Date(p.event_timestamp),
        orders: 0,
        total: 0,
      }
    }

    const m = contactMetrics[p.contact_id]
    const pDate = new Date(p.event_timestamp)
    if (pDate > m.lastPurchase) m.lastPurchase = pDate
    m.orders++
    m.total += p.order_total || 0
  })

  // Calcular percentis
  const recencies = Object.values(contactMetrics).map(m => 
    Math.floor((Date.now() - m.lastPurchase.getTime()) / (1000 * 60 * 60 * 24))
  ).sort((a, b) => a - b)

  const frequencies = Object.values(contactMetrics).map(m => m.orders).sort((a, b) => a - b)
  const monetaries = Object.values(contactMetrics).map(m => m.total).sort((a, b) => a - b)

  const getPercentile = (arr: number[], p: number) => arr[Math.floor(arr.length * p)] || 0

  // Upsert scores
  for (const contact of contacts) {
    const metrics = contactMetrics[contact.id]
    
    if (!metrics) {
      // Contato sem compras
      await supabase.from('customer_rfm_scores').upsert({
        organization_id,
        contact_id: contact.id,
        recency_score: 1,
        frequency_score: 1,
        monetary_score: 1,
        rfm_score: '111',
        rfm_segment: 'lost',
        total_orders: 0,
        total_spent: 0,
        calculation_period_days: period_days,
        calculated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,contact_id' })
      continue
    }

    const daysSince = Math.floor((Date.now() - metrics.lastPurchase.getTime()) / (1000 * 60 * 60 * 24))

    // Calcular scores (1-5)
    const rScore = daysSince <= getPercentile(recencies, 0.2) ? 5 :
                   daysSince <= getPercentile(recencies, 0.4) ? 4 :
                   daysSince <= getPercentile(recencies, 0.6) ? 3 :
                   daysSince <= getPercentile(recencies, 0.8) ? 2 : 1

    const fScore = metrics.orders >= getPercentile(frequencies, 0.8) ? 5 :
                   metrics.orders >= getPercentile(frequencies, 0.6) ? 4 :
                   metrics.orders >= getPercentile(frequencies, 0.4) ? 3 :
                   metrics.orders >= getPercentile(frequencies, 0.2) ? 2 : 1

    const mScore = metrics.total >= getPercentile(monetaries, 0.8) ? 5 :
                   metrics.total >= getPercentile(monetaries, 0.6) ? 4 :
                   metrics.total >= getPercentile(monetaries, 0.4) ? 3 :
                   metrics.total >= getPercentile(monetaries, 0.2) ? 2 : 1

    // Determinar segmento
    const segment = 
      rScore >= 4 && fScore >= 4 && mScore >= 4 ? 'champions' :
      rScore >= 3 && fScore >= 3 && mScore >= 3 ? 'loyal' :
      rScore >= 4 && fScore <= 2 ? 'new_customers' :
      rScore >= 3 && fScore >= 3 && mScore <= 2 ? 'potential_loyal' :
      rScore <= 2 && fScore >= 3 ? 'at_risk' :
      rScore <= 2 && fScore >= 4 && mScore >= 4 ? 'cant_lose' :
      rScore <= 2 && fScore <= 2 && mScore <= 2 ? 'lost' :
      rScore <= 3 && fScore <= 2 ? 'hibernating' : 'others'

    await supabase.from('customer_rfm_scores').upsert({
      organization_id,
      contact_id: contact.id,
      last_purchase_date: metrics.lastPurchase.toISOString(),
      total_orders: metrics.orders,
      total_spent: metrics.total,
      avg_order_value: metrics.total / metrics.orders,
      recency_score: rScore,
      frequency_score: fScore,
      monetary_score: mScore,
      rfm_score: `${rScore}${fScore}${mScore}`,
      rfm_segment: segment,
      calculation_period_days: period_days,
      calculated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,contact_id' })
  }
}
