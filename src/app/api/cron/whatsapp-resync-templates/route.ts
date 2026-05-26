import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createWhatsAppCloudClient } from '@/lib/whatsapp/cloud-api';
import { getAccessToken } from '@/lib/whatsapp/account-loader';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorize(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  return process.env.NODE_ENV !== 'production';
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
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

  if (!staleTemplates || staleTemplates.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, updated: 0 });
  }

  // 2. Group templates by waba_id so we load each account once
  const byWaba = new Map<string, typeof staleTemplates>();
  for (const tpl of staleTemplates) {
    const wabaId = tpl.waba_id as string;
    if (!byWaba.has(wabaId)) byWaba.set(wabaId, []);
    byWaba.get(wabaId)!.push(tpl);
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

      try {
        const { data: dbTemplate } = await supabaseAdmin
          .from('whatsapp_templates')
          .select('template_id, meta_template_id')
          .eq('id', tpl.template_id)
          .single();

        const metaTemplateId = dbTemplate?.meta_template_id || dbTemplate?.template_id;
        if (!metaTemplateId) {
          errors.push(`Template ${tpl.template_id} (${tpl.name}): no Meta ID in DB`);
          continue;
        }

        const metaTemplate = await client.getTemplateById(metaTemplateId);

        if (metaTemplate.status && metaTemplate.status !== 'PENDING') {
          // Status changed on Meta side - update our DB
          const { error: updateErr } = await supabaseAdmin
            .from('whatsapp_templates')
            .update({
              status: metaTemplate.status,
              components: metaTemplate.components || undefined,
              rejection_reason:
                metaTemplate.status === 'REJECTED'
                  ? (metaTemplate as any).rejected_reason || (metaTemplate as any).quality_score?.reason || null
                  : undefined,
              synced_at: new Date().toISOString(),
            })
            .eq('id', tpl.template_id);

          if (updateErr) {
            errors.push(`Template ${tpl.template_id}: update failed - ${updateErr.message}`);
          } else {
            updated++;
            console.log(
              `[resync-templates] Template "${tpl.name}" (${tpl.language}) updated: PENDING -> ${metaTemplate.status}`
            );
          }
        }
      } catch (e: any) {
        errors.push(`Template ${tpl.template_id} (${tpl.name}): Meta API error - ${e.message}`);
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
