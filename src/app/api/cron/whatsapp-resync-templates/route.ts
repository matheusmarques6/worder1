import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createWhatsAppCloudClient } from '@/lib/whatsapp/cloud-api';
import { getAccessToken } from '@/lib/whatsapp/account-loader';
import { authorizeCronRequest } from '@/lib/cron-auth';
import { buildResyncUpdate } from '@/lib/whatsapp/template-resync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface StaleTemplateRow {
  /** Legacy alias of row_id (table PK). Kept by the RPC for rollout compat. */
  template_id: string;
  name: string;
  language: string;
  waba_id: string;
  created_at: string;
  age_minutes: number;
  /** whatsapp_templates.id (PK) — unambiguous. */
  row_id: string;
  /** COALESCE(meta_template_id, template_id) from the table — Meta's ID. */
  meta_template_id: string | null;
}

export async function GET(req: NextRequest) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 1. Fetch templates stuck in PENDING status for more than 60 minutes
  const { data: staleTemplates, error } = await supabaseAdmin.rpc(
    'stale_pending_templates',
    { p_threshold_minutes: 60 }
  );

  if (error) {
    console.error('[resync-templates] RPC error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (staleTemplates || []) as StaleTemplateRow[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, updated: 0 });
  }

  // 2. Group templates by waba_id so we load each account once
  const byWaba = new Map<string, StaleTemplateRow[]>();
  for (const tpl of rows) {
    if (!byWaba.has(tpl.waba_id)) byWaba.set(tpl.waba_id, []);
    byWaba.get(tpl.waba_id)!.push(tpl);
  }

  let checked = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const [wabaId, templates] of byWaba) {
    // 3. Load the WABA account row for credentials
    const { data: account, error: accErr } = await supabaseAdmin
      .from('whatsapp_business_accounts')
      .select('*')
      .eq('id', wabaId)
      .single();

    if (accErr || !account) {
      errors.push(`WABA ${wabaId}: account not found`);
      continue;
    }

    let accessToken: string;
    try {
      accessToken = getAccessToken(account);
    } catch (e: any) {
      errors.push(`WABA ${wabaId}: ${e.message}`);
      continue;
    }

    const client = createWhatsAppCloudClient({
      phoneNumberId: account.phone_number_id,
      accessToken,
      wabaId: account.waba_id,
    });

    // 4. For each stale template, fetch current status from Meta
    for (const tpl of templates) {
      checked++;
      // Rollout safety: if the RPC migration was not applied yet,
      // row_id is undefined and template_id still carries the PK.
      const rowId = tpl.row_id ?? tpl.template_id;

      try {
        if (!tpl.meta_template_id) {
          errors.push(`Template ${rowId} (${tpl.name}): no Meta ID in DB`);
          continue;
        }

        const metaTemplate = await client.getTemplateById(tpl.meta_template_id);
        const update = buildResyncUpdate(metaTemplate);
        if (!update) continue; // still PENDING on Meta's side

        const { error: updateErr } = await supabaseAdmin
          .from('whatsapp_templates')
          .update(update)
          .eq('id', rowId);

        if (updateErr) {
          errors.push(`Template ${rowId}: update failed - ${updateErr.message}`);
        } else {
          updated++;
          console.log(
            `[resync-templates] Template "${tpl.name}" (${tpl.language}) updated: PENDING -> ${update.status}`
          );
        }
      } catch (e: any) {
        errors.push(`Template ${rowId} (${tpl.name}): Meta API error - ${e.message}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    checked,
    updated,
    errors: errors.length > 0 ? errors : undefined,
  });
}
