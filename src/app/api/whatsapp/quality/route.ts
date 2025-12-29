// =============================================
// API: /api/whatsapp/quality
// Monitor de qualidade do número WhatsApp
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const META_API_VERSION = 'v18.0'
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`

// =============================================
// TIPOS
// =============================================

interface QualityData {
  quality_rating: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN'
  messaging_limit_tier: string
  verified_name: string
  display_phone_number: string
  id: string
}

interface QualityHistoryItem {
  id: string
  phone_number_id: string
  quality_rating: string
  messaging_limit_tier: string
  verified_name: string
  previous_rating: string | null
  rating_changed: boolean
  checked_at: string
}

// =============================================
// GET - Buscar qualidade atual e histórico
// =============================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organization_id')
    const action = searchParams.get('action') || 'dashboard'
    const phoneNumberId = searchParams.get('phone_number_id')
    const days = parseInt(searchParams.get('days') || '30')

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
    }

    switch (action) {
      case 'dashboard':
        return getDashboard(organizationId)

      case 'history':
        return getHistory(organizationId, phoneNumberId, days)

      case 'check':
        return checkQualityNow(organizationId, phoneNumberId)

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error: any) {
    console.error('Quality GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =============================================
// POST - Verificar qualidade e salvar histórico
// =============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { organization_id, phone_number_id } = body

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
    }

    // Se phone_number_id fornecido, verificar apenas esse
    if (phone_number_id) {
      return checkQualityNow(organization_id, phone_number_id)
    }

    // Senão, verificar todas as instâncias da organização
    return checkAllInstances(organization_id)
  } catch (error: any) {
    console.error('Quality POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =============================================
// FUNÇÕES AUXILIARES
// =============================================

async function getDashboard(organizationId: string) {
  // Buscar instâncias com qualidade
  const { data: instances, error: instancesError } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('organization_id', organizationId)
    .not('phone_number_id', 'is', null)

  if (instancesError) {
    throw new Error(`Failed to fetch instances: ${instancesError.message}`)
  }

  // Buscar histórico recente (últimos 7 dias) para gráfico
  const { data: history } = await supabase
    .from('whatsapp_quality_history')
    .select('*')
    .eq('organization_id', organizationId)
    .gte('checked_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('checked_at', { ascending: true })

  // Agregar por dia para gráfico
  const chartData = aggregateHistoryByDay(history || [])

  // Calcular estatísticas
  const stats = calculateQualityStats(instances || [])

  // Mudanças recentes (últimas 10)
  const { data: recentChanges } = await supabase
    .from('whatsapp_quality_history')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('rating_changed', true)
    .order('checked_at', { ascending: false })
    .limit(10)

  return NextResponse.json({
    instances: (instances || []).map(inst => ({
      id: inst.id,
      instance_name: inst.instance_name,
      phone_number: inst.phone_number,
      phone_number_id: inst.phone_number_id,
      status: inst.status,
      quality_rating: inst.quality_rating || 'UNKNOWN',
      messaging_limit_tier: inst.messaging_limit_tier || 'UNKNOWN',
      quality_checked_at: inst.quality_checked_at,
    })),
    stats,
    chart_data: chartData,
    recent_changes: recentChanges || [],
  })
}

async function getHistory(
  organizationId: string,
  phoneNumberId: string | null,
  days: number
) {
  let query = supabase
    .from('whatsapp_quality_history')
    .select('*')
    .eq('organization_id', organizationId)
    .gte('checked_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
    .order('checked_at', { ascending: false })
    .limit(500)

  if (phoneNumberId) {
    query = query.eq('phone_number_id', phoneNumberId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch history: ${error.message}`)
  }

  return NextResponse.json({
    history: data || [],
    period_days: days,
    total: data?.length || 0,
  })
}

async function checkQualityNow(
  organizationId: string,
  phoneNumberId: string | null
) {
  // Buscar instância
  let query = supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('organization_id', organizationId)

  if (phoneNumberId) {
    query = query.eq('phone_number_id', phoneNumberId)
  } else {
    query = query.not('phone_number_id', 'is', null).eq('status', 'connected')
  }

  const { data: instances, error: instancesError } = await query

  if (instancesError || !instances || instances.length === 0) {
    return NextResponse.json({ 
      error: 'No WhatsApp instance found',
      details: instancesError?.message 
    }, { status: 404 })
  }

  const results = []

  for (const instance of instances) {
    if (!instance.access_token || !instance.phone_number_id) {
      results.push({
        instance_id: instance.id,
        phone_number_id: instance.phone_number_id,
        error: 'Missing access_token or phone_number_id',
      })
      continue
    }

    try {
      // Buscar qualidade da Meta API
      const qualityData = await fetchQualityFromMeta(
        instance.phone_number_id,
        instance.access_token
      )

      // Salvar no histórico
      const { data: saved, error: saveError } = await supabase.rpc('save_quality_history', {
        p_organization_id: organizationId,
        p_phone_number_id: instance.phone_number_id,
        p_waba_id: instance.waba_id,
        p_quality_rating: qualityData.quality_rating,
        p_messaging_limit_tier: qualityData.messaging_limit_tier,
        p_verified_name: qualityData.verified_name,
        p_display_phone_number: qualityData.display_phone_number,
        p_raw_response: qualityData,
      })

      if (saveError) {
        console.error('Failed to save quality history:', saveError)
      }

      results.push({
        instance_id: instance.id,
        instance_name: instance.instance_name,
        phone_number_id: instance.phone_number_id,
        quality_rating: qualityData.quality_rating,
        messaging_limit_tier: qualityData.messaging_limit_tier,
        verified_name: qualityData.verified_name,
        display_phone_number: qualityData.display_phone_number,
        checked_at: new Date().toISOString(),
        success: true,
      })

      // Verificar se qualidade caiu e notificar
      await checkAndNotifyQualityDrop(instance, qualityData)

    } catch (error: any) {
      console.error(`Failed to check quality for ${instance.phone_number_id}:`, error)
      results.push({
        instance_id: instance.id,
        phone_number_id: instance.phone_number_id,
        error: error.message,
        success: false,
      })
    }
  }

  return NextResponse.json({
    checked: results.length,
    results,
  })
}

async function checkAllInstances(organizationId: string) {
  return checkQualityNow(organizationId, null)
}

async function fetchQualityFromMeta(
  phoneNumberId: string,
  accessToken: string
): Promise<QualityData> {
  const url = `${META_BASE_URL}/${phoneNumberId}?fields=quality_rating,messaging_limit_tier,verified_name,display_phone_number`

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to fetch quality from Meta')
  }

  const data = await response.json()

  return {
    id: data.id,
    quality_rating: data.quality_rating || 'UNKNOWN',
    messaging_limit_tier: data.messaging_limit_tier || 'UNKNOWN',
    verified_name: data.verified_name || '',
    display_phone_number: data.display_phone_number || '',
  }
}

async function checkAndNotifyQualityDrop(
  instance: any,
  newQuality: QualityData
) {
  const previousRating = instance.quality_rating
  const newRating = newQuality.quality_rating

  // Se qualidade caiu, registrar alerta
  const qualityOrder = { GREEN: 3, YELLOW: 2, RED: 1, UNKNOWN: 0 }
  const previousScore = qualityOrder[previousRating as keyof typeof qualityOrder] || 0
  const newScore = qualityOrder[newRating as keyof typeof qualityOrder] || 0

  if (previousScore > newScore && newScore > 0) {
    console.log(`⚠️ Quality dropped for ${instance.phone_number}: ${previousRating} → ${newRating}`)

    // TODO: Implementar notificação por email/webhook
    // Por enquanto, apenas salvar no log
    try {
      await supabase.from('activity_logs').insert({
        organization_id: instance.organization_id,
        entity_type: 'whatsapp_instance',
        entity_id: instance.id,
        action: 'quality_dropped',
        changes: {
          previous_rating: previousRating,
          new_rating: newRating,
          phone_number: instance.phone_number,
          messaging_limit: newQuality.messaging_limit_tier,
        },
      })
    } catch {
      // Ignora se tabela não existir
    }
  }
}

function aggregateHistoryByDay(history: any[]): any[] {
  const byDay: Record<string, { date: string; checks: number; green: number; yellow: number; red: number }> = {}

  for (const item of history) {
    const date = item.checked_at.split('T')[0]

    if (!byDay[date]) {
      byDay[date] = { date, checks: 0, green: 0, yellow: 0, red: 0 }
    }

    byDay[date].checks++

    switch (item.quality_rating) {
      case 'GREEN':
        byDay[date].green++
        break
      case 'YELLOW':
        byDay[date].yellow++
        break
      case 'RED':
        byDay[date].red++
        break
    }
  }

  return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date))
}

function calculateQualityStats(instances: any[]) {
  const total = instances.length
  const green = instances.filter(i => i.quality_rating === 'GREEN').length
  const yellow = instances.filter(i => i.quality_rating === 'YELLOW').length
  const red = instances.filter(i => i.quality_rating === 'RED').length
  const unknown = instances.filter(i => !i.quality_rating || i.quality_rating === 'UNKNOWN').length

  return {
    total,
    green,
    yellow,
    red,
    unknown,
    healthy_percent: total > 0 ? Math.round((green / total) * 100) : 0,
    at_risk_percent: total > 0 ? Math.round(((yellow + red) / total) * 100) : 0,
  }
}
