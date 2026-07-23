// =============================================
// Is a campaign allowed to send from its resolved sender domain?
//
// Both the hard send gate (api/email/campaigns/send) and the advisory
// preflight (api/email/campaigns/preflight) asked this question — and both
// got it wrong the SAME two ways, which silently blocked every manual
// campaign send:
//
//   1. They read a column `verification_status` that does not exist. The
//      real column is `status` ('pending' | 'verified' | 'failed'), written
//      by api/email/domains/verify. The bad name made PostgREST error, the
//      row came back null, and the gate treated EVERY domain — verified or
//      not — as unverified → 422 DOMAIN_NOT_VERIFIED on every send.
//   2. They matched only `organization_id = org`, missing (a) the shared
//      pre-warmed system domain worder.email (organization_id NULL,
//      is_system=true) and (b) campaigns with no explicit from_email that
//      resolve their sender from the store/org identity.
//
// This is the single source of truth both routes now call.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin';

// Resend reports either 'verified' or 'active' for a live domain; verify
// maps both to 'verified', but accept both here defensively.
const VERIFIED_STATUSES = new Set(['verified', 'active']);

/**
 * Resolve the address a campaign will ACTUALLY send from and whether its
 * domain is a verified sending domain.
 *
 * fromEmail resolution mirrors the real send: the campaign's explicit
 * from_email, else the store/org sender identity (getEmailProviderForOrg).
 * A campaign relying on the store default must not be judged "unverified"
 * just because from_email is blank.
 *
 * Domain match includes the shared system domain (is_system=true,
 * organization_id NULL) so sends from worder.email aren't blocked.
 */
export async function resolveSendDomainVerification(
  orgId: string,
  storeId: string | null | undefined,
  campaignFromEmail?: string | null
): Promise<{ fromEmail: string; domainVerified: boolean }> {
  let fromEmail = (campaignFromEmail || '').trim();
  if (!fromEmail) {
    try {
      const { getEmailProviderForOrg } = await import('./providers');
      const { config } = await getEmailProviderForOrg(orgId, storeId || null);
      fromEmail = (config.defaultFrom || '').trim();
    } catch {
      /* leave blank → treated as unverified below */
    }
  }

  if (!fromEmail || !fromEmail.includes('@')) {
    return { fromEmail, domainVerified: false };
  }

  const domainPart = fromEmail.split('@')[1].toLowerCase();
  const { data: doms } = await supabaseAdmin
    .from('email_domains')
    .select('status, organization_id, is_system')
    .eq('domain', domainPart)
    // org-owned custom domains (store-scoped rows included — (org,domain)
    // is unique) OR the shared system domain.
    .or(`organization_id.eq.${orgId},is_system.eq.true`);

  const domainVerified =
    Array.isArray(doms) &&
    doms.some((d: any) => VERIFIED_STATUSES.has(String(d?.status || '').toLowerCase()));

  return { fromEmail, domainVerified };
}
