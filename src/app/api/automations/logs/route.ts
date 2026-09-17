// =============================================
// Automation Logs API
// src/app/api/automations/logs/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils';
import { sanitizeSearchTerm } from '@/lib/db/search-term'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get('status')
  const source = searchParams.get('source')
  const days = searchParams.get('days')
  const search = searchParams.get('search')
  // O termo vai para dentro de um filtro do PostgREST: vírgula e
  // parêntese deixariam de ser texto e passariam a ser consulta.
  const buscaSegura = sanitizeSearchTerm(search)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')

  try {
    // RLS filtra automaticamente por organization_id
    let query = supabase
      .from('automation_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    // A tabela guarda `success` (booleano) e `trigger_event`; `status`,
    // `message`, `rule_name` e `event_type` não existem. Os filtros
    // antigos derrubavam a consulta inteira — a tela de monitoramento
    // ficava vazia assim que alguém filtrasse.
    if (status && status !== 'all') {
      query = query.eq('success', status === 'success' || status === 'completed')
    }

    if (source && source !== 'all') {
      query = query.eq('source_type', source)
    }

    if (days && days !== 'all') {
      const daysAgo = new Date()
      daysAgo.setDate(daysAgo.getDate() - parseInt(days))
      query = query.gte('created_at', daysAgo.toISOString())
    }

    if (buscaSegura) {
      // Só as colunas de texto que existem.
      query = query.or(`trigger_event.ilike.%${buscaSegura}%,action_type.ilike.%${buscaSegura}%,error_message.ilike.%${buscaSegura}%`)
    }

    const { data, error } = await query

    if (error) throw error

    // A tela lê status/message/rule_name/event_type: devolvemos esses
    // nomes a partir das colunas reais, para o contrato dela não mudar.
    const logs = (data || []).map((l: any) => ({
      ...l,
      status: l.success === false ? 'error' : 'success',
      event_type: l.trigger_event ?? null,
      rule_name: (l.details && typeof l.details === 'object' ? l.details.rule_name : null) ?? null,
      message: (l.details && typeof l.details === 'object' ? l.details.message : null) ?? l.error_message ?? '',
    }))

    return NextResponse.json({ logs })
  } catch (error: any) {
    console.error('Error fetching automation logs:', error)
    if (error.code === '42P01') {
      return NextResponse.json({ logs: [] })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create log entry (used by automation engine)
export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;

  try {
    const body = await request.json()
    const {
      rule_id,
      rule_name,
      source_type,
      event_type,
      status,
      message,
      error_message,
      deal_id,
      contact_id,
      metadata,
    } = body

    if (!source_type || !event_type || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Usa organization_id do usuário autenticado
    const { data, error } = await supabase
      .from('automation_logs')
      .insert({
        organization_id: user.organization_id,
        rule_id,
        source_type,
        // `trigger_event` e `success` são as colunas; o nome da regra e a
        // mensagem vão em `details`. Antes, com event_type/status/message/
        // rule_name/metadata no payload, NENHUM log de automação era
        // gravado — e é essa tabela que alimenta a tela de monitoramento.
        trigger_event: event_type,
        action_type: source_type,
        success: !(status === 'error' || status === 'failed'),
        error_message,
        deal_id,
        contact_id,
        details: { rule_name: rule_name ?? null, message: message || '' },
        event_data: metadata || {},
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ log: data })
  } catch (error: any) {
    console.error('Error creating automation log:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
