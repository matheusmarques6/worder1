/**
 * One-shot backfill: encrypt legacy plaintext access_token values.
 *
 * Run AFTER deploying the migration 20260522_whatsapp_access_token_encrypted.sql.
 * Run BEFORE removing the legacy access_token column.
 *
 * Idempotent: only touches rows where access_token_encrypted IS NULL AND
 * access_token IS NOT NULL.
 *
 * Usage:
 *   ENCRYPTION_KEY=... \
 *   NEXT_PUBLIC_SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx ts-node scripts/encrypt-whatsapp-tokens.ts
 *
 * Add --dry-run to preview row counts without writes.
 */

import { createClient } from '@supabase/supabase-js';
import { encryptToken } from '../src/lib/whatsapp/token-encryption';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE env vars');
    process.exit(1);
  }
  if (!process.env.ENCRYPTION_KEY) {
    console.error('Missing ENCRYPTION_KEY');
    process.exit(1);
  }

  const sb = createClient(url, key);

  const { data: rows, error } = await sb
    .from('whatsapp_business_accounts')
    .select('id, access_token, access_token_encrypted')
    .is('access_token_encrypted', null)
    .not('access_token', 'is', null);

  if (error) {
    console.error('Query error:', error);
    process.exit(1);
  }

  const candidates = rows || [];
  console.log(`[encrypt-whatsapp-tokens] candidates: ${candidates.length}`);
  if (DRY_RUN) {
    console.log('[encrypt-whatsapp-tokens] --dry-run: no writes');
    return;
  }

  let ok = 0;
  let fail = 0;

  for (const row of candidates) {
    try {
      const encrypted = encryptToken(row.access_token as string);
      const { error: updateErr } = await sb
        .from('whatsapp_business_accounts')
        .update({ access_token_encrypted: encrypted })
        .eq('id', row.id)
        .is('access_token_encrypted', null);

      if (updateErr) throw updateErr;
      ok++;
      console.log(`[encrypt-whatsapp-tokens] ok ${row.id}`);
    } catch (err: any) {
      fail++;
      console.error(`[encrypt-whatsapp-tokens] fail ${row.id}:`, err?.message);
    }
  }

  console.log(`[encrypt-whatsapp-tokens] done — ok:${ok} fail:${fail}`);
  if (fail > 0) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
