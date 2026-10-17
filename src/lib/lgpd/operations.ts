import type { SupabaseClient } from '@supabase/supabase-js'

/** Stage codes must never embed a database message or a personal value. */
export class LgpdStepError extends Error {
  constructor(public readonly stage: string) { super('LGPD operation failed') }
}

export async function checked(query: PromiseLike<any>, stage: string): Promise<any> {
  const result = await query
  if (result.error) throw new LgpdStepError(stage)
  return result
}

/** The cap fails explicitly instead of producing a truncated successful export. */
export async function readSubjectRows(
  admin: SupabaseClient, table: string, orgId: string,
  column: string, value: string, fields = '*',
): Promise<any[]> {
  const rows: any[] = []
  for (let offset = 0; offset < 10000; offset += 500) {
    const result = await checked(admin.from(table).select(fields)
      .eq('organization_id', orgId).eq(column, value)
      .order('id', { ascending: true }).range(offset, offset + 499), `read_${table}`)
    if (!Array.isArray(result.data)) throw new LgpdStepError(`read_${table}`)
    rows.push(...result.data)
    if (result.data.length < 500) return rows
  }
  throw new LgpdStepError(`export_limit_${table}`)
}

/** Review requirements, not a claim of lawful retention or erasure. */
export const GRAPH_REVIEW_REQUIRED = [
  'unlinked_and_legacy_channel_records',
  'internal_outbox_tools_judges_and_inflight_processing',
  'shared_sources_chunks_vectors_and_third_party_content',
  'media_objects_caches_logs_and_external_processors',
  'retention_basis_and_backup_restore_tombstones',
  'verified_delivery_to_data_subject',
]
