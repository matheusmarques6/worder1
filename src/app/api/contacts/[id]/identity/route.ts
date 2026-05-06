// =============================================
// GET /api/contacts/[id]/identity
//
// Returns the visitor_identities row(s) linked to this contact,
// plus all the client-side visitor_id aliases ever seen for this
// person. Used by the contact detail page to surface:
//   - "How we identified you" (worder_visitor_id, fingerprint, etc)
//   - "Devices/browsers" (every visitor_id alias)
//   - "Match history" (match_count, first_seen_at, last_seen_at)
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;
  const contactId = params.id;

  const admin = getSupabaseAdmin();

  // 1. Verify contact belongs to this org (defense in depth)
  const { data: contact } = await admin
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  // 2. Pull all identity rows linked to this contact (usually 1, but
  //    could be more if the resolver merged or if pre-merge dups exist).
  const { data: identities } = await admin
    .from('visitor_identities')
    .select('id, worder_visitor_id, contact_id, fingerprint_hash, user_agent_hash, ip_subnet, last_email, last_user_agent, last_ip, match_count, match_source, first_seen_at, last_seen_at, created_at, store_id')
    .eq('organization_id', orgId)
    .eq('contact_id', contactId)
    .is('merged_into_id', null)
    .order('last_seen_at', { ascending: false });

  // 3. For each identity, pull its aliases
  const identityIds = (identities || []).map(i => i.id);
  let aliasesByIdentity: Record<string, any[]> = {};
  if (identityIds.length > 0) {
    const { data: aliases } = await admin
      .from('visitor_id_aliases')
      .select('id, identity_id, alias_visitor_id, source, first_seen_at')
      .in('identity_id', identityIds)
      .order('first_seen_at', { ascending: false });
    for (const a of aliases || []) {
      if (!aliasesByIdentity[a.identity_id]) aliasesByIdentity[a.identity_id] = [];
      aliasesByIdentity[a.identity_id].push(a);
    }
  }

  // 4. Recent events count (for context on the "match_count" number)
  const { count: eventsCount } = await admin
    .from('contact_events')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('contact_id', contactId);

  return NextResponse.json({
    contact_id: contactId,
    total_events: eventsCount || 0,
    identities: (identities || []).map(i => ({
      id: i.id,
      worder_visitor_id: i.worder_visitor_id,
      // Hashes — surface only the first 12 chars for display, never the full hash
      fingerprint_short: i.fingerprint_hash ? String(i.fingerprint_hash).slice(0, 12) : null,
      user_agent_short: i.last_user_agent ? String(i.last_user_agent).slice(0, 80) : null,
      last_ip: i.last_ip,
      last_email: i.last_email,
      match_count: i.match_count,
      match_source: i.match_source,
      first_seen_at: i.first_seen_at,
      last_seen_at: i.last_seen_at,
      aliases: aliasesByIdentity[i.id] || [],
    })),
  });
}
