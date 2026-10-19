import type { SupabaseClient } from '@supabase/supabase-js'

export async function findOrgAgent(db: SupabaseClient, orgId: string, id: string) {
  let table = 'agents'
  let result = await db.from(table).select('*').eq('id', id).eq('organization_id', orgId).maybeSingle()
  if (['42P01', 'PGRST205'].includes(result.error?.code || '') || (!result.error && !result.data)) {
    table = 'whatsapp_agents'
    result = await db.from(table).select('*').eq('id', id).eq('organization_id', orgId).maybeSingle()
  }
  return { ...result, table }
}

/** Writable permission fields; identity and tenant columns are never copied. */
const fields = [
  'access_level', 'whatsapp_access_all', 'whatsapp_number_ids', 'pipeline_access_all', 'pipeline_ids',
  'can_send_messages', 'can_transfer_chats', 'can_edit_pipeline', 'can_view_all_conversations',
  'can_transfer_conversations', 'can_use_ai_suggestions', 'can_send_media', 'can_use_quick_replies',
  'can_access_crm', 'can_access_pipelines', 'can_create_deals', 'can_manage_tags',
  'can_view_contact_info', 'can_edit_contact_info', 'can_add_notes', 'can_view_order_history',
  'can_view_analytics', 'can_view_reports', 'max_concurrent_chats', 'allowed_hours_start',
  'allowed_hours_end', 'allowed_days',
  'whatsapp_allowed_numbers', 'whatsapp_can_send', 'whatsapp_can_transfer', 'pipeline_allowed_ids', 'pipeline_can_edit',
] as const

export function writableAgentPermissions(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(fields.filter(field => Object.prototype.hasOwnProperty.call(input, field)).map(field => [field, input[field]]))
}
