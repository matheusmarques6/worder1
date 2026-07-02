import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient, authError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

interface Rule {
  field: string
  operator: string
  value: any
}

// POST: preview contact count for a candidate rule set (AND/OR).
// Body: { organization_id, store_id?, rules: Rule[], rules_logic: 'AND' | 'OR' }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      organization_id: bodyOrgId,
      store_id,
      rules = [],
      rules_logic = 'AND',
    }: {
      organization_id?: string
      store_id?: string
      rules: Rule[]
      rules_logic: 'AND' | 'OR'
    } = body

    // ✅ SEMPRE derivar org da sessão — nunca confiar no org do body
    const auth = await getAuthClient()
    if (!auth) return authError()
    const organization_id = auth.user.organization_id

    // Se o cliente passar um organization_id diferente do da sessão, rejeitar
    if (bodyOrgId && bodyOrgId !== organization_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!Array.isArray(rules)) {
      return NextResponse.json({ error: 'rules must be an array' }, { status: 400 })
    }

    let q: any = supabaseAdmin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organization_id)

    if (store_id) q = q.eq('store_id', store_id)

    if (rules.length === 0) {
      const { count } = await q
      return NextResponse.json({ count: count ?? 0 })
    }

    if (rules_logic === 'OR') {
      // PostgREST `or` filter — build comma-separated clauses.
      const parts = rules.map(ruleToPostgrest).filter(Boolean) as string[]
      if (parts.length > 0) q = q.or(parts.join(','))
    } else {
      for (const r of rules) q = applyRule(q, r)
    }

    const { count, error } = await q
    if (error) throw error
    return NextResponse.json({ count: count ?? 0 })
  } catch (err: any) {
    console.error('[segments/preview]', err)
    return NextResponse.json({ error: err?.message || 'error' }, { status: 500 })
  }
}

function applyRule(query: any, rule: Rule) {
  const { field, operator, value } = rule
  switch (operator) {
    case 'equals': return query.eq(field, value)
    case 'not_equals': return query.neq(field, value)
    case 'contains': return query.ilike(field, `%${value}%`)
    case 'greater_than': return query.gt(field, value)
    case 'less_than': return query.lt(field, value)
    case 'greater_than_or_equal': return query.gte(field, value)
    case 'less_than_or_equal': return query.lte(field, value)
    case 'is_null': return query.is(field, null)
    case 'is_not_null': return query.not(field, 'is', null)
    case 'in': return query.in(field, Array.isArray(value) ? value : [value])
    default: return query
  }
}

function ruleToPostgrest(rule: Rule): string | null {
  const { field, operator, value } = rule
  const v = value === null || value === undefined ? '' : String(value)
  switch (operator) {
    case 'equals': return `${field}.eq.${v}`
    case 'not_equals': return `${field}.neq.${v}`
    case 'contains': return `${field}.ilike.%${v}%`
    case 'greater_than': return `${field}.gt.${v}`
    case 'less_than': return `${field}.lt.${v}`
    case 'greater_than_or_equal': return `${field}.gte.${v}`
    case 'less_than_or_equal': return `${field}.lte.${v}`
    case 'is_null': return `${field}.is.null`
    case 'is_not_null': return `not.${field}.is.null`
    default: return null
  }
}
