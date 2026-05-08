// =============================================
// Identity Resolver
// src/lib/identity/resolver.ts
//
// Server-side identity graph that maps anonymous browser signals to a
// stable worder_visitor_id, surviving Safari ITP and cross-device.
//
// Resolution cascade (most reliable → least reliable):
//   1. shopify_customer_id (Shopify-logged-in user) — exact, cross-device
//   2. email_hash — exact, cross-device
//   3. phone_hash — exact, cross-device
//   4. worder_visitor_id alias — same browser, came back
//   5. fingerprint_hash + user_agent_hash — probabilistic, same browser
//      after localStorage wipe (Safari ITP, incognito)
//   6. New identity — never seen this user/browser before
//
// Each resolution returns a worder_visitor_id, the contact_id (when
// linked), and a "stitched" boolean indicating we re-identified an
// existing user despite a wiped cookie. The /api/track/event handler
// uses these to attach incoming events to the right contact and
// retroactively link historic anonymous events.
// =============================================

import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const FINGERPRINT_MATCH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface ResolveInput {
  organizationId: string;
  storeId?: string | null;
  // Client-provided identifiers
  clientVisitorId?: string | null;     // localStorage _worder_vid
  fingerprintHash?: string | null;     // ThumbmarkJS hash
  userAgent?: string | null;           // raw UA string
  ip?: string | null;                  // for /24 IPv4 or /48 IPv6 subnet match
  // Identity claims
  email?: string | null;
  phone?: string | null;
  shopifyCustomerId?: string | null;
  // Source label
  source?: string;
}

export interface ResolveOutput {
  identityId: string;
  worderVisitorId: string;
  contactId: string | null;
  stitched: boolean;                   // true when we matched a pre-existing identity by something other than the client_visitor_id
  matchSource: 'visitor_id' | 'fingerprint' | 'email' | 'phone' | 'shopify_customer' | 'new';
}

// =============================================
// Hashing helpers — kept in sync with worder_hash_email/_phone in SQL
// =============================================

export function hashEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const norm = email.trim().toLowerCase();
  if (!norm) return null;
  return crypto.createHash('sha256').update(norm).digest('hex');
}

export function hashPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, '');
  if (!digits) return null;
  return crypto.createHash('sha256').update(digits).digest('hex');
}

export function hashUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  // Truncate to first 64 chars of sha256 — full hex is overkill and the
  // shorter form gives identical match accuracy with smaller indexes.
  return crypto.createHash('sha256').update(ua).digest('hex').slice(0, 32);
}

export function ipSubnet(ip: string | null | undefined): string | null {
  if (!ip) return null;
  if (ip.includes(':')) {
    // IPv6 — keep first 3 groups (/48)
    const parts = ip.split(':').filter(p => p !== '');
    return parts.slice(0, 3).join(':') + '::';
  }
  // IPv4 — keep first 3 octets (/24)
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
}

function newWorderVisitorId(): string {
  return 'wv_' + crypto.randomBytes(16).toString('hex');
}

// =============================================
// Main resolver
// =============================================

export async function resolveIdentity(input: ResolveInput): Promise<ResolveOutput> {
  const supabase = getSupabaseAdmin();
  const orgId = input.organizationId;

  const emailHash = hashEmail(input.email);
  const phoneHash = hashPhone(input.phone);
  const uaHash = hashUserAgent(input.userAgent);
  const subnet = ipSubnet(input.ip);

  // Helper to materialize and update the matched row
  async function attach(
    identity: any,
    matchSource: ResolveOutput['matchSource']
  ): Promise<ResolveOutput> {
    // If this row was soft-merged elsewhere, follow the pointer.
    let working = identity;
    if (identity.merged_into_id) {
      const { data: target } = await supabase
        .from('visitor_identities')
        .select('*')
        .eq('id', identity.merged_into_id)
        .maybeSingle();
      if (target) working = target;
    }

    // Bump match_count, update last_seen and any newly-known signals
    const updates: Record<string, any> = {
      last_seen_at: new Date().toISOString(),
      match_count: (working.match_count || 0) + 1,
    };
    if (input.fingerprintHash && !working.fingerprint_hash) updates.fingerprint_hash = input.fingerprintHash;
    if (uaHash && !working.user_agent_hash) updates.user_agent_hash = uaHash;
    if (subnet && !working.ip_subnet) updates.ip_subnet = subnet;
    if (emailHash && !working.email_hash) updates.email_hash = emailHash;
    if (phoneHash && !working.phone_hash) updates.phone_hash = phoneHash;
    if (input.shopifyCustomerId && !working.shopify_customer_id) updates.shopify_customer_id = String(input.shopifyCustomerId);
    if (input.email && !working.last_email) updates.last_email = input.email;
    if (input.userAgent && !working.last_user_agent) updates.last_user_agent = input.userAgent.slice(0, 500);
    if (input.ip && !working.last_ip) updates.last_ip = input.ip;
    if (input.storeId && !working.store_id) updates.store_id = input.storeId;

    // Always update last_seen_at + match_count (already in updates object).
    // updated_at fires the row's modified-at trigger if any.
    updates.updated_at = new Date().toISOString();
    await supabase.from('visitor_identities').update(updates).eq('id', working.id);

    // Record the alias if this client_visitor_id is new for this identity
    if (input.clientVisitorId && input.clientVisitorId !== working.worder_visitor_id) {
      await supabase
        .from('visitor_id_aliases')
        .insert({
          identity_id: working.id,
          organization_id: orgId,
          alias_visitor_id: input.clientVisitorId,
          source: input.source || 'pixel',
        })
        .then(() => {}, () => {}); // ignore unique-violation duplicates
    }

    return {
      identityId: working.id,
      worderVisitorId: working.worder_visitor_id,
      contactId: working.contact_id || null,
      stitched: matchSource !== 'visitor_id',
      matchSource,
    };
  }

  // ===== STEP 1: shopify_customer_id (most reliable) =====
  if (input.shopifyCustomerId) {
    const { data: byShopifyCustomer } = await supabase
      .from('visitor_identities')
      .select('*')
      .eq('organization_id', orgId)
      .eq('shopify_customer_id', String(input.shopifyCustomerId))
      .is('merged_into_id', null)
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byShopifyCustomer) return attach(byShopifyCustomer, 'shopify_customer');
  }

  // ===== STEP 2: email_hash =====
  if (emailHash) {
    const { data: byEmail } = await supabase
      .from('visitor_identities')
      .select('*')
      .eq('organization_id', orgId)
      .eq('email_hash', emailHash)
      .is('merged_into_id', null)
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byEmail) return attach(byEmail, 'email');
  }

  // ===== STEP 3: phone_hash =====
  if (phoneHash) {
    const { data: byPhone } = await supabase
      .from('visitor_identities')
      .select('*')
      .eq('organization_id', orgId)
      .eq('phone_hash', phoneHash)
      .is('merged_into_id', null)
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byPhone) return attach(byPhone, 'phone');
  }

  // ===== STEP 4: worder_visitor_id (the client sent ours back) =====
  if (input.clientVisitorId) {
    // First check if it's the canonical worder_visitor_id for some identity
    const { data: byWorderId } = await supabase
      .from('visitor_identities')
      .select('*')
      .eq('organization_id', orgId)
      .eq('worder_visitor_id', input.clientVisitorId)
      .is('merged_into_id', null)
      .maybeSingle();
    if (byWorderId) return attach(byWorderId, 'visitor_id');

    // Otherwise check if it's an alias (we issued a new wv_ id but the
    // client cached this one from before)
    const { data: alias } = await supabase
      .from('visitor_id_aliases')
      .select('identity_id')
      .eq('organization_id', orgId)
      .eq('alias_visitor_id', input.clientVisitorId)
      .maybeSingle();
    if (alias) {
      const { data: aliased } = await supabase
        .from('visitor_identities')
        .select('*')
        .eq('id', alias.identity_id)
        .maybeSingle();
      if (aliased) return attach(aliased, 'visitor_id');
    }
  }

  // ===== STEP 5: fingerprint_hash + user_agent_hash =====
  // This is the magic — recovers identity after Safari ITP wipes
  // localStorage. Requires both fingerprint AND UA hash to match,
  // within 30 days, otherwise we'd over-match too aggressively.
  if (input.fingerprintHash && uaHash) {
    const cutoff = new Date(Date.now() - FINGERPRINT_MATCH_WINDOW_MS).toISOString();
    const { data: byFingerprint } = await supabase
      .from('visitor_identities')
      .select('*')
      .eq('organization_id', orgId)
      .eq('fingerprint_hash', input.fingerprintHash)
      .eq('user_agent_hash', uaHash)
      .is('merged_into_id', null)
      .gt('last_seen_at', cutoff)
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byFingerprint) return attach(byFingerprint, 'fingerprint');
  }

  // ===== STEP 6: new identity =====
  const worderVisitorId = newWorderVisitorId();
  const { data: created, error: createErr } = await supabase
    .from('visitor_identities')
    .insert({
      organization_id: orgId,
      store_id: input.storeId || null,
      worder_visitor_id: worderVisitorId,
      fingerprint_hash: input.fingerprintHash || null,
      user_agent_hash: uaHash,
      ip_subnet: subnet,
      email_hash: emailHash,
      phone_hash: phoneHash,
      shopify_customer_id: input.shopifyCustomerId ? String(input.shopifyCustomerId) : null,
      last_email: input.email || null,
      last_user_agent: input.userAgent ? input.userAgent.slice(0, 500) : null,
      last_ip: input.ip || null,
      match_source: 'new',
    })
    .select('*')
    .single();

  if (createErr || !created) {
    // Race condition — another concurrent request just created the
    // same identity (rare, but possible during a burst). Re-resolve
    // with whatever signal we have.
    if (input.clientVisitorId) {
      const { data: race } = await supabase
        .from('visitor_identities')
        .select('*')
        .eq('organization_id', orgId)
        .eq('worder_visitor_id', input.clientVisitorId)
        .maybeSingle();
      if (race) return attach(race, 'visitor_id');
    }
    throw createErr || new Error('Failed to create identity');
  }

  // Register the client's old localStorage ID as an alias of our new
  // worder_visitor_id so future events from this browser use the same
  // canonical identity.
  if (input.clientVisitorId && input.clientVisitorId !== worderVisitorId) {
    await supabase
      .from('visitor_id_aliases')
      .insert({
        identity_id: created.id,
        organization_id: orgId,
        alias_visitor_id: input.clientVisitorId,
        source: input.source || 'pixel',
      })
      .then(() => {}, () => {});
  }

  return {
    identityId: created.id,
    worderVisitorId: created.worder_visitor_id,
    contactId: null,
    stitched: false,
    matchSource: 'new',
  };
}

// =============================================
// Backfill: when an identity is later linked to a contact, retroactively
// attach all historic anonymous events under any of its aliases.
// =============================================
export async function linkContactToIdentity(
  identityId: string,
  contactId: string,
  organizationId: string
): Promise<{ eventsLinked: number }> {
  const supabase = getSupabaseAdmin();

  // 1. Save contact_id on the identity row
  await supabase
    .from('visitor_identities')
    .update({ contact_id: contactId, updated_at: new Date().toISOString() })
    .eq('id', identityId);

  // 2. Pull every alias this identity has ever used
  const { data: identity } = await supabase
    .from('visitor_identities')
    .select('worder_visitor_id')
    .eq('id', identityId)
    .single();
  const { data: aliases } = await supabase
    .from('visitor_id_aliases')
    .select('alias_visitor_id')
    .eq('identity_id', identityId);

  const allIds = [
    identity?.worder_visitor_id,
    ...((aliases || []).map(a => a.alias_visitor_id)),
  ].filter(Boolean) as string[];

  if (allIds.length === 0) return { eventsLinked: 0 };

  // 3. Backfill all historic events with NULL contact_id under any of these IDs
  const { data: updated, error } = await supabase
    .from('contact_events')
    .update({ contact_id: contactId })
    .is('contact_id', null)
    .eq('organization_id', organizationId)
    .in('anonymous_id', allIds)
    .select('id');

  if (error) {
    console.error('[Identity] Backfill failed:', error);
    return { eventsLinked: 0 };
  }

  return { eventsLinked: updated?.length || 0 };
}
