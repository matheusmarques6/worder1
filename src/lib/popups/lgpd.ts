import type { SupabaseClient } from '@supabase/supabase-js'
import { checked, readSubjectRows } from '@/lib/lgpd/operations'

export interface PopupDataExport {
  submissions: any[]
  consents: any[]
  coupons: any[]
  visitors: any[]
  whatsapp: any[]
}

export interface PopupEraseReport {
  submissions: number
  consents: number
  visitors: number
  whatsapp: number
}

export async function exportPopupData(admin: SupabaseClient, orgId: string, contactId: string): Promise<PopupDataExport> {
  const read = (table: string, fields = '*') => readSubjectRows(admin, table, orgId, 'contact_id', contactId, fields)
  const [subs, consents, grants, visitors, whats] = await Promise.all([
    read('crm_form_submissions', '*, form:crm_forms(name)'),
    read('consent_records'), read('incentive_grants'),
    read('visitor_identities'), read('whatsapp_opt_status'),
  ])
  return {
    submissions: subs.map((s: any) => ({
      ...s, popup: Array.isArray(s.form) ? s.form[0]?.name : s.form?.name, form: undefined,
    })),
    consents, coupons: grants, visitors, whatsapp: whats,
  }
}

/**
 * Partial scrub through explicit subject links, not proof of anonymization or
 * lawful retention. The append-only consent trigger may reject its update;
 * propagate that error so the request cannot be certified as completed.
 */
export async function erasePopupData(admin: SupabaseClient, orgId: string, contactId: string): Promise<PopupEraseReport> {
  const now = new Date().toISOString()
  const scrub = async (table: string, patch: Record<string, any>) => {
    const result = await checked(admin.from(table).update(patch, { count: 'exact' })
      .eq('organization_id', orgId).eq('contact_id', contactId).select('id'), `erase_${table}`)
    return result.count ?? (result.data || []).length
  }
  const submissions = await scrub('crm_form_submissions', {
    answers: {}, ip_address: null, user_agent: null, referrer: null,
    page_url: null, visitor_id: null, session_id: null,
  })
  const consents = await scrub('consent_records', { ip_address: null, user_agent: null, page_url: null })
  const visitors = await scrub('visitor_identities', {
    contact_id: null, last_email: null, last_ip: null, last_user_agent: null,
    email_hash: null, phone_hash: null, shopify_customer_id: null, updated_at: now,
  })
  // Both senders look up the original phone. Preserve it for operational
  // suppression; replacing it would reopen marketing. This is not anonymous.
  const whatsapp = await scrub('whatsapp_opt_status', {
    consent_evidence: {}, status: 'opted_out',
    opted_out_at: now, opt_out_reason: 'lgpd_erasure', updated_at: now,
  })
  return { submissions, consents, visitors, whatsapp }
}
