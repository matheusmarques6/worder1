import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/whatsapp/cloud-api'
import { checked, LgpdStepError, readSubjectRows } from './operations'

/**
 * The app guard and SQL sender preflight look up phones, not CRM flags.
 * Retain this operational suppression key until both consumers support a
 * replacement index. This is deliberately not an anonymization operation.
 */
export async function suppressWhatsAppForContact(admin: SupabaseClient, orgId: string, contact: any): Promise<number> {
  if (!contact.id || contact.organization_id !== orgId) throw new LgpdStepError('suppression_contact_scope')
  const [opts, identities, whatsappContacts] = await Promise.all([
    readSubjectRows(admin, 'whatsapp_opt_status', orgId, 'contact_id', contact.id),
    readSubjectRows(admin, 'channel_identities', orgId, 'contact_id', contact.id),
    readSubjectRows(admin, 'whatsapp_contacts', orgId, 'crm_contact_id', contact.id),
  ])
  if (contact.whatsapp_contact_id && !whatsappContacts.some(row => row.id === contact.whatsapp_contact_id)) {
    const linked = await readSubjectRows(admin, 'whatsapp_contacts', orgId, 'id', contact.whatsapp_contact_id)
    if (linked.length !== 1 || (linked[0].crm_contact_id && linked[0].crm_contact_id !== contact.id)) {
      throw new LgpdStepError('suppression_ambiguous_identity')
    }
    whatsappContacts.push(linked[0])
  }
  const candidates = [
    contact.phone, contact.whatsapp,
    ...opts.map(row => row.phone),
    ...identities.filter(row => row.channel === 'whatsapp').map(row => row.external_id),
    ...whatsappContacts.flatMap(row => [row.phone_number, row.wa_id]),
  ]
  const phones = new Set<string>()
  for (const candidate of candidates) {
    if (candidate == null || candidate === '') continue
    if (typeof candidate !== 'string' || !/^[+\d\s().-]+$/.test(candidate)) throw new LgpdStepError('suppression_invalid_identity')
    const phone = normalizePhone(candidate)
    if (!/^\d{7,15}$/.test(phone)) throw new LgpdStepError('suppression_invalid_identity')
    phones.add(phone)
  }

  const now = new Date().toISOString()
  for (const phone of phones) {
    const current = await readSubjectRows(admin, 'whatsapp_opt_status', orgId, 'phone', phone)
    // maybeSingle in the actual sender permits a missing row on lookup error.
    // Do not certify a duplicate or reassign another subject's phone record.
    if (current.length > 1 || current.some(row => row.contact_id && row.contact_id !== contact.id)) {
      throw new LgpdStepError('suppression_ambiguous_identity')
    }
    const patch = { status: 'opted_out', opted_out_at: now, opt_out_reason: 'lgpd_restriction', updated_at: now }
    if (current.length) {
      await checked(admin.from('whatsapp_opt_status').update(patch)
        .eq('organization_id', orgId).eq('id', current[0].id).eq('phone', phone), 'suppression_write')
    } else {
      // The canonical baseline does not guarantee UNIQUE(org, phone), so do
      // not rely on an onConflict target absent from the versioned schema.
      await checked(admin.from('whatsapp_opt_status').insert({
        ...patch, organization_id: orgId, contact_id: contact.id, phone,
      }), 'suppression_write')
    }
    const after = await readSubjectRows(admin, 'whatsapp_opt_status', orgId, 'phone', phone)
    if (after.length !== 1 || after[0].status !== 'opted_out') throw new LgpdStepError('suppression_postcondition')
  }
  return phones.size
}
