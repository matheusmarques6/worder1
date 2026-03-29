export async function resolveSegment(
  supabase: any,
  segmentId: string,
  orgId: string
): Promise<string[]> {
  try {
    const { data: segment } = await supabase
      .from('segments')
      .select('conditions')
      .eq('id', segmentId)
      .eq('organization_id', orgId)
      .single();

    if (!segment?.conditions) return [];

    const rules = segment.conditions.rules || segment.conditions;
    if (!Array.isArray(rules) || rules.length === 0) return [];

    let query = supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', orgId);

    for (const rule of rules) {
      if (!rule.field || !rule.operator) continue;

      const field = rule.field;
      const value = rule.value;

      switch (rule.operator) {
        case '=':
        case 'equals':
          query = query.eq(field, value);
          break;
        case '!=':
        case 'not_equals':
          query = query.neq(field, value);
          break;
        case '>':
        case 'greater_than':
          query = query.gt(field, value);
          break;
        case '<':
        case 'less_than':
          query = query.lt(field, value);
          break;
        case '>=':
          query = query.gte(field, value);
          break;
        case '<=':
          query = query.lte(field, value);
          break;
        case 'contains':
        case 'like':
          query = query.ilike(field, `%${value}%`);
          break;
        case 'not_contains':
          query = query.not(field, 'ilike', `%${value}%`);
          break;
        case 'starts_with':
          query = query.ilike(field, `${value}%`);
          break;
        case 'ends_with':
          query = query.ilike(field, `%${value}`);
          break;
        case 'is_set':
        case 'is_not_null':
          query = query.not(field, 'is', null);
          break;
        case 'is_not_set':
        case 'is_null':
          query = query.is(field, null);
          break;
        case 'in':
          if (Array.isArray(value)) {
            query = query.in(field, value);
          }
          break;
      }
    }

    const { data } = await query.limit(50000);
    return (data || []).map((c: any) => c.id);
  } catch (e) {
    console.error('[Segment Resolver] Error:', e);
    return [];
  }
}
