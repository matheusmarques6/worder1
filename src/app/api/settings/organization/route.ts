import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ organization: null });

    const { data } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    return NextResponse.json({ organization: data });
  } catch {
    return NextResponse.json({ organization: null });
  }
}

// ✅ Colunas que o merchant pode editar via este endpoint.
// Qualquer outra chave no body (feature_flags, limits, plan, subscription_*,
// id, created_at, etc.) é IGNORADA para prevenir mass-assignment.
const EDITABLE_FIELDS = [
  // Perfil da organização
  'name',
  'timezone',
  'settings',
  'email_settings',
  // Provedor de email
  'email_provider',
  'email_provider_config',
  // Regras de envio (sending rules)
  'quiet_hours_enabled',
  'quiet_hours_start',
  'quiet_hours_end',
  'quiet_hours_timezone',
  'max_sends_per_contact_per_day',
  'max_email_per_contact_per_day',
  'max_sms_per_contact_per_day',
  'max_whatsapp_per_contact_per_day',
  'skip_contacts_in_active_flows',
] as const;

export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

    const body = await request.json();

    // ✅ Whitelist: só campos editáveis pelo merchant entram no update
    const update: Record<string, any> = {};
    for (const field of EDITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        update[field] = body[field];
      }
    }

    // If updating email_settings / settings, merge with existing so one
    // screen never wipes the keys another screen saved.
    if (update.email_settings || update.settings) {
      const { data: existing } = await supabase
        .from('organizations')
        .select('email_settings, settings')
        .eq('id', orgId)
        .single();

      if (update.email_settings) {
        update.email_settings = {
          ...(existing?.email_settings || {}),
          ...update.email_settings,
        };
      }
      if (update.settings && typeof update.settings === 'object') {
        const cur = (existing?.settings || {}) as Record<string, any>;
        const next: Record<string, any> = { ...cur };
        for (const [k, v] of Object.entries(update.settings as Record<string, any>)) {
          next[k] = v && typeof v === 'object' && !Array.isArray(v) && cur[k] && typeof cur[k] === 'object' ? { ...cur[k], ...v } : v;
        }
        update.settings = next;
      }
    }

    // Regras de envio mudaram → cache do motor de envio zera.
    if (['quiet_hours_enabled', 'quiet_hours_start', 'quiet_hours_end', 'quiet_hours_timezone', 'max_sends_per_contact_per_day', 'max_email_per_contact_per_day', 'max_sms_per_contact_per_day', 'max_whatsapp_per_contact_per_day', 'settings'].some((k) => k in update)) {
      try { const m = await import('@/lib/email/sending-rules'); m.__resetSendingRulesCache(); } catch { /* ignore */ }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('organizations')
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq('id', orgId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ organization: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
