import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// =============================================
// Types
// =============================================

interface LeadScore {
  id: string
  organization_id: string
  deal_id: string
  engagement_score: number
  fit_score: number
  intent_score: number
  total_score: number
  scoring_factors: ScoringFactors
  intent_signals: IntentSignal[]
  last_activity_at: string
  score_updated_at: string
  created_at: string
}

interface ScoringFactors {
  email_opens: number
  email_clicks: number
  website_visits: number
  form_submissions: number
  meeting_scheduled: boolean
  proposal_requested: boolean
  pricing_viewed: boolean
  demo_requested: boolean
  response_time_minutes: number
  messages_sent: number
  messages_received: number
  days_since_last_contact: number
  deal_value: number
  company_size?: string
  industry_match?: boolean
  budget_confirmed?: boolean
}

interface IntentSignal {
  type: string
  description: string
  weight: number
  detected_at: string
}

interface ScoringConfig {
  weights: {
    engagement: number
    fit: number
    intent: number
  }
  thresholds: {
    hot: number
    warm: number
    cold: number
  }
  factors: {
    [key: string]: {
      weight: number
      max_score: number
    }
  }
}

// Default scoring configuration
const DEFAULT_CONFIG: ScoringConfig = {
  weights: {
    engagement: 0.4,
    fit: 0.3,
    intent: 0.3,
  },
  thresholds: {
    hot: 80,
    warm: 50,
    cold: 0,
  },
  factors: {
    email_opens: { weight: 2, max_score: 20 },
    email_clicks: { weight: 5, max_score: 25 },
    website_visits: { weight: 3, max_score: 15 },
    form_submissions: { weight: 10, max_score: 30 },
    meeting_scheduled: { weight: 15, max_score: 15 },
    proposal_requested: { weight: 20, max_score: 20 },
    pricing_viewed: { weight: 10, max_score: 10 },
    demo_requested: { weight: 15, max_score: 15 },
    messages_received: { weight: 2, max_score: 20 },
    response_time: { weight: -1, max_score: 10 },
    days_inactive: { weight: -2, max_score: 20 },
  },
}

// =============================================
// GET - List lead scores or get single score
// =============================================

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerComponentClient({ cookies })
    const { searchParams } = new URL(request.url)

    // Resolve the user from the session cookie so we can validate
    // the requested organization_id against their actual memberships.
    // Without this guard, `?organization_id=...&deal_id=...` could
    // be aimed at a foreign org and (depending on RLS coverage) read
    // its lead scores.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle()
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
    const orgIds = new Set<string>(
      [profile?.organization_id, ...((memberships || []).map((m: any) => m.organization_id))]
        .filter(Boolean)
    )

    const requested = searchParams.get('organization_id')
    const organizationId =
      requested && orgIds.has(requested) ? requested : profile?.organization_id
    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
    }

    const dealId = searchParams.get('deal_id')
    const minScore = searchParams.get('min_score')
    const category = searchParams.get('category') // hot, warm, cold
    const limit = parseInt(searchParams.get('limit') || '50')

    // Get single deal score — already scopes by organization_id, but
    // organizationId is now provably one the user owns.
    if (dealId) {
      const { data: score, error } = await supabase
        .from('lead_scores')
        .select(`
          *,
          deals (
            id,
            title,
            value,
            status,
            stage_id,
            contact_id,
            contacts (id, first_name, last_name, email, phone)
          )
        `)
        .eq('deal_id', dealId)
        .eq('organization_id', organizationId)
        .single()

      if (error) {
        // If no score exists, calculate it
        if (error.code === 'PGRST116') {
          const newScore = await calculateLeadScore(supabase, dealId, organizationId)
          return NextResponse.json({ score: newScore })
        }
        return NextResponse.json({ error: 'Erro ao buscar score' }, { status: 500 })
      }

      return NextResponse.json({ score })
    }

    // List all scores
    let query = supabase
      .from('lead_scores')
      .select(`
        *,
        deals (
          id,
          title,
          value,
          status,
          stage_id,
          contact_id,
          contacts (id, first_name, last_name, email)
        )
      `)
      .eq('organization_id', organizationId)
      .order('total_score', { ascending: false })
      .limit(limit)

    if (minScore) {
      query = query.gte('total_score', parseInt(minScore))
    }

    if (category) {
      switch (category) {
        case 'hot':
          query = query.gte('total_score', DEFAULT_CONFIG.thresholds.hot)
          break
        case 'warm':
          query = query.gte('total_score', DEFAULT_CONFIG.thresholds.warm)
            .lt('total_score', DEFAULT_CONFIG.thresholds.hot)
          break
        case 'cold':
          query = query.lt('total_score', DEFAULT_CONFIG.thresholds.warm)
          break
      }
    }

    const { data: scores, error } = await query

    if (error) {
      console.error('[LeadScoring] List error:', error)
      return NextResponse.json({ error: 'Erro ao carregar scores' }, { status: 500 })
    }

    // Calculate stats
    const stats = {
      total: scores?.length || 0,
      hot: scores?.filter(s => s.total_score >= DEFAULT_CONFIG.thresholds.hot).length || 0,
      warm: scores?.filter(s => s.total_score >= DEFAULT_CONFIG.thresholds.warm && s.total_score < DEFAULT_CONFIG.thresholds.hot).length || 0,
      cold: scores?.filter(s => s.total_score < DEFAULT_CONFIG.thresholds.warm).length || 0,
      average: scores?.length ? Math.round(scores.reduce((sum, s) => sum + s.total_score, 0) / scores.length) : 0,
    }

    return NextResponse.json({ scores, stats, config: DEFAULT_CONFIG })
  } catch (error) {
    console.error('[LeadScoring] GET error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// =============================================
// POST - Calculate/update scores or detect intent
// =============================================

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerComponentClient({ cookies })
    const body = await request.json()

    const { action } = body

    switch (action) {
      case 'calculate':
        return await handleCalculateScore(supabase, body)

      case 'bulk_calculate':
        return await handleBulkCalculate(supabase, body)

      case 'detect_intent':
        return await handleDetectIntent(supabase, body)

      case 'add_signal':
        return await handleAddIntentSignal(supabase, body)

      default:
        return NextResponse.json({ error: 'Acao invalida' }, { status: 400 })
    }
  } catch (error) {
    console.error('[LeadScoring] POST error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// =============================================
// Calculate Lead Score
// =============================================

async function calculateLeadScore(
  supabase: any,
  dealId: string,
  organizationId: string
): Promise<LeadScore | null> {
  // Get deal data
  const { data: deal, error: dealError } = await supabase
    .from('deals')
    .select(`
      *,
      contacts (*),
      pipeline_stages (name)
    `)
    .eq('id', dealId)
    .single()

  if (dealError || !deal) {
    return null
  }

  // Get activity data
  const { data: activities } = await supabase
    .from('deal_activities')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })

  // Get messages data
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('contact_id', deal.contact_id)
    .order('created_at', { ascending: false })
    .limit(100)

  // Calculate scoring factors
  const factors: ScoringFactors = {
    email_opens: activities?.filter((a: any) => a.type === 'email_open').length || 0,
    email_clicks: activities?.filter((a: any) => a.type === 'email_click').length || 0,
    website_visits: activities?.filter((a: any) => a.type === 'website_visit').length || 0,
    form_submissions: activities?.filter((a: any) => a.type === 'form_submit').length || 0,
    meeting_scheduled: activities?.some((a: any) => a.type === 'meeting_scheduled') || false,
    proposal_requested: activities?.some((a: any) => a.type === 'proposal_requested') || false,
    pricing_viewed: activities?.some((a: any) => a.type === 'pricing_viewed') || false,
    demo_requested: activities?.some((a: any) => a.type === 'demo_requested') || false,
    response_time_minutes: calculateAverageResponseTime(messages),
    messages_sent: messages?.filter((m: any) => m.direction === 'outbound').length || 0,
    messages_received: messages?.filter((m: any) => m.direction === 'inbound').length || 0,
    days_since_last_contact: calculateDaysSinceLastContact(activities, messages),
    deal_value: deal.value || 0,
  }

  // Calculate engagement score (0-100)
  let engagementScore = 0
  engagementScore += Math.min(factors.email_opens * 2, 20)
  engagementScore += Math.min(factors.email_clicks * 5, 25)
  engagementScore += Math.min(factors.website_visits * 3, 15)
  engagementScore += Math.min(factors.messages_received * 2, 20)
  engagementScore += factors.meeting_scheduled ? 15 : 0
  engagementScore = Math.min(engagementScore, 100)

  // Deduct for inactivity
  if (factors.days_since_last_contact > 7) {
    engagementScore -= Math.min((factors.days_since_last_contact - 7) * 2, 30)
  }
  engagementScore = Math.max(engagementScore, 0)

  // Calculate fit score (0-100)
  let fitScore = 50 // Base score
  if (factors.deal_value > 10000) fitScore += 20
  else if (factors.deal_value > 5000) fitScore += 10
  else if (factors.deal_value > 1000) fitScore += 5

  if (factors.budget_confirmed) fitScore += 15
  if (factors.industry_match) fitScore += 10
  if (factors.company_size === 'enterprise') fitScore += 10
  else if (factors.company_size === 'mid-market') fitScore += 5

  fitScore = Math.min(fitScore, 100)

  // Calculate intent score (0-100)
  let intentScore = 0
  intentScore += factors.proposal_requested ? 25 : 0
  intentScore += factors.pricing_viewed ? 15 : 0
  intentScore += factors.demo_requested ? 20 : 0
  intentScore += factors.form_submissions > 0 ? 15 : 0
  intentScore += Math.min(factors.messages_received * 3, 25)
  intentScore = Math.min(intentScore, 100)

  // Calculate total score
  const totalScore = Math.round(
    engagementScore * DEFAULT_CONFIG.weights.engagement +
    fitScore * DEFAULT_CONFIG.weights.fit +
    intentScore * DEFAULT_CONFIG.weights.intent
  )

  // Detect intent signals
  const intentSignals = detectIntentSignals(factors, activities, messages)

  // Upsert the score
  const scoreData = {
    organization_id: organizationId,
    deal_id: dealId,
    engagement_score: Math.round(engagementScore),
    fit_score: Math.round(fitScore),
    intent_score: Math.round(intentScore),
    total_score: totalScore,
    scoring_factors: factors,
    intent_signals: intentSignals,
    last_activity_at: activities?.[0]?.created_at || messages?.[0]?.created_at || new Date().toISOString(),
    score_updated_at: new Date().toISOString(),
  }

  const { data: score, error } = await supabase
    .from('lead_scores')
    .upsert(scoreData, { onConflict: 'deal_id' })
    .select()
    .single()

  if (error) {
    console.error('[LeadScoring] Upsert error:', error)
    return null
  }

  return score
}

// =============================================
// Helper Functions
// =============================================

function calculateAverageResponseTime(messages: any[]): number {
  if (!messages || messages.length < 2) return 0

  const responseTimes: number[] = []
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].direction !== messages[i - 1].direction) {
      const diff = new Date(messages[i - 1].created_at).getTime() - new Date(messages[i].created_at).getTime()
      responseTimes.push(Math.abs(diff) / (1000 * 60)) // Convert to minutes
    }
  }

  if (responseTimes.length === 0) return 0
  return Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
}

function calculateDaysSinceLastContact(activities: any[], messages: any[]): number {
  const lastActivity = activities?.[0]?.created_at
  const lastMessage = messages?.[0]?.created_at

  const lastContactDate = lastActivity && lastMessage
    ? new Date(Math.max(new Date(lastActivity).getTime(), new Date(lastMessage).getTime()))
    : lastActivity
      ? new Date(lastActivity)
      : lastMessage
        ? new Date(lastMessage)
        : null

  if (!lastContactDate) return 30 // Default to 30 days if no contact

  const daysDiff = Math.floor((Date.now() - lastContactDate.getTime()) / (1000 * 60 * 60 * 24))
  return daysDiff
}

function detectIntentSignals(factors: ScoringFactors, activities: any[], messages: any[]): IntentSignal[] {
  const signals: IntentSignal[] = []
  const now = new Date().toISOString()

  // High-intent signals
  if (factors.proposal_requested) {
    signals.push({
      type: 'proposal_requested',
      description: 'Solicitou proposta comercial',
      weight: 25,
      detected_at: activities?.find((a: any) => a.type === 'proposal_requested')?.created_at || now,
    })
  }

  if (factors.pricing_viewed) {
    signals.push({
      type: 'pricing_viewed',
      description: 'Visualizou pagina de precos',
      weight: 15,
      detected_at: activities?.find((a: any) => a.type === 'pricing_viewed')?.created_at || now,
    })
  }

  if (factors.demo_requested) {
    signals.push({
      type: 'demo_requested',
      description: 'Solicitou demonstracao',
      weight: 20,
      detected_at: activities?.find((a: any) => a.type === 'demo_requested')?.created_at || now,
    })
  }

  if (factors.meeting_scheduled) {
    signals.push({
      type: 'meeting_scheduled',
      description: 'Agendou reuniao',
      weight: 15,
      detected_at: activities?.find((a: any) => a.type === 'meeting_scheduled')?.created_at || now,
    })
  }

  // Engagement signals
  if (factors.messages_received >= 5) {
    signals.push({
      type: 'high_engagement',
      description: `${factors.messages_received} mensagens recebidas`,
      weight: 10,
      detected_at: now,
    })
  }

  if (factors.email_clicks >= 3) {
    signals.push({
      type: 'email_engagement',
      description: `${factors.email_clicks} cliques em emails`,
      weight: 8,
      detected_at: now,
    })
  }

  // Keyword detection in messages
  const intentKeywords = [
    { keywords: ['orcamento', 'preco', 'valor', 'quanto custa'], signal: 'budget_inquiry', description: 'Perguntou sobre precos' },
    { keywords: ['quando', 'prazo', 'urgente', 'rapido'], signal: 'urgency', description: 'Demonstrou urgencia' },
    { keywords: ['concorrente', 'comparar', 'diferenca'], signal: 'comparison', description: 'Comparando opcoes' },
    { keywords: ['contrato', 'fechar', 'assinar'], signal: 'closing_intent', description: 'Interesse em fechar negocio' },
  ]

  const recentMessages = messages?.slice(0, 20) || []
  for (const { keywords, signal, description } of intentKeywords) {
    const found = recentMessages.some((m: any) =>
      keywords.some(k => m.content?.toLowerCase().includes(k))
    )
    if (found) {
      signals.push({
        type: signal,
        description,
        weight: 10,
        detected_at: now,
      })
    }
  }

  return signals.sort((a, b) => b.weight - a.weight)
}

// =============================================
// Action Handlers
// =============================================

async function handleCalculateScore(supabase: any, body: any) {
  const { deal_id, organization_id } = body

  if (!deal_id || !organization_id) {
    return NextResponse.json({ error: 'deal_id e organization_id sao obrigatorios' }, { status: 400 })
  }

  const score = await calculateLeadScore(supabase, deal_id, organization_id)

  if (!score) {
    return NextResponse.json({ error: 'Erro ao calcular score' }, { status: 500 })
  }

  return NextResponse.json({ score })
}

async function handleBulkCalculate(supabase: any, body: any) {
  const { organization_id, deal_ids } = body

  if (!organization_id) {
    return NextResponse.json({ error: 'organization_id e obrigatorio' }, { status: 400 })
  }

  // Get all active deals if no specific IDs provided
  let targetDeals = deal_ids

  if (!targetDeals || targetDeals.length === 0) {
    const { data: deals } = await supabase
      .from('deals')
      .select('id')
      .eq('organization_id', organization_id)
      .in('status', ['active', 'pending'])
      .limit(100)

    targetDeals = deals?.map((d: any) => d.id) || []
  }

  const results = await Promise.all(
    targetDeals.map((dealId: string) => calculateLeadScore(supabase, dealId, organization_id))
  )

  const successful = results.filter(Boolean).length
  const failed = results.length - successful

  return NextResponse.json({
    message: `${successful} scores calculados, ${failed} falhas`,
    processed: successful,
    failed,
  })
}

async function handleDetectIntent(supabase: any, body: any) {
  const { deal_id, organization_id, content } = body

  if (!deal_id || !content) {
    return NextResponse.json({ error: 'deal_id e content sao obrigatorios' }, { status: 400 })
  }

  const contentLower = content.toLowerCase()
  const signals: IntentSignal[] = []
  const now = new Date().toISOString()

  // Intent patterns
  const patterns = [
    { regex: /pre[cç]o|valor|or[cç]amento|quanto custa/i, type: 'budget_inquiry', desc: 'Interesse em precos', weight: 15 },
    { regex: /urgente|rapido|imediato|hoje|amanha/i, type: 'urgency', desc: 'Demonstrou urgencia', weight: 12 },
    { regex: /fechar|contratar|assinar|confirmar/i, type: 'closing_intent', desc: 'Intencao de fechamento', weight: 20 },
    { regex: /demonstra[cç][aã]o|demo|mostrar|apresenta[cç][aã]o/i, type: 'demo_interest', desc: 'Interesse em demo', weight: 18 },
    { regex: /concorrente|outro fornecedor|comparar/i, type: 'comparison', desc: 'Comparando opcoes', weight: 10 },
    { regex: /problema|dificuldade|n[aã]o funciona/i, type: 'pain_point', desc: 'Identificou problema', weight: 8 },
    { regex: /quando come[cç]a|implementa[cç][aã]o|prazo/i, type: 'timeline', desc: 'Perguntou sobre prazo', weight: 12 },
  ]

  for (const { regex, type, desc, weight } of patterns) {
    if (regex.test(contentLower)) {
      signals.push({
        type,
        description: desc,
        weight,
        detected_at: now,
      })
    }
  }

  // Update the lead score with new signals
  if (signals.length > 0 && organization_id) {
    const { data: existing } = await supabase
      .from('lead_scores')
      .select('intent_signals')
      .eq('deal_id', deal_id)
      .single()

    const existingSignals = existing?.intent_signals || []
    const newSignalTypes = signals.map(s => s.type)
    const filteredExisting = existingSignals.filter((s: IntentSignal) => !newSignalTypes.includes(s.type))

    await supabase
      .from('lead_scores')
      .update({
        intent_signals: [...filteredExisting, ...signals],
        score_updated_at: now,
      })
      .eq('deal_id', deal_id)

    // Recalculate score
    await calculateLeadScore(supabase, deal_id, organization_id)
  }

  return NextResponse.json({ signals, detected: signals.length })
}

async function handleAddIntentSignal(supabase: any, body: any) {
  const { deal_id, signal } = body

  if (!deal_id || !signal) {
    return NextResponse.json({ error: 'deal_id e signal sao obrigatorios' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('lead_scores')
    .select('intent_signals')
    .eq('deal_id', deal_id)
    .single()

  const existingSignals = existing?.intent_signals || []
  const newSignal: IntentSignal = {
    type: signal.type,
    description: signal.description,
    weight: signal.weight || 10,
    detected_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('lead_scores')
    .update({
      intent_signals: [...existingSignals, newSignal],
      score_updated_at: new Date().toISOString(),
    })
    .eq('deal_id', deal_id)

  if (error) {
    return NextResponse.json({ error: 'Erro ao adicionar sinal' }, { status: 500 })
  }

  return NextResponse.json({ success: true, signal: newSignal })
}
