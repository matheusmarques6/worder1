export async function resolveSegment(supabase: any, segmentId: string, orgId: string): Promise<string[]> {
  try {
    const { data: segment } = await supabase.from('segments').select('conditions').eq('id', segmentId).single()
    if (!segment) return []
    let query = supabase.from('contacts').select('id').eq('organization_id', orgId)
    for (const rule of segment.conditions?.rules || []) {
      if (!rule.field || !rule.value) continue
      switch (rule.operator) {
        case '=': case 'equals': query = query.eq(rule.field, rule.value); break
        case '>': case 'greater_than': query = query.gt(rule.field, rule.value); break
        case '<': case 'less_than': query = query.lt(rule.field, rule.value); break
        case 'contains': query = query.ilike(rule.field, `%${rule.value}%`); break
      }
    }
    const { data } = await query
    return (data || []).map((c: any) => c.id)
  } catch { return [] }
}

export async function countSegmentByConditions(supabase: any, conditions: any, orgId: string): Promise<number> {
  try {
    let query = supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)
    for (const rule of conditions?.rules || []) {
      if (!rule.field || !rule.value) continue
      switch (rule.operator) {
        case '=': case 'equals': query = query.eq(rule.field, rule.value); break
        case 'contains': query = query.ilike(rule.field, `%${rule.value}%`); break
      }
    }
    const { count } = await query
    return count || 0
  } catch { return 0 }
}
