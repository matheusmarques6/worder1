/**
 * One-shot backfill: re-encripta api_key_encrypted base64 legacy
 * de whatsapp_ai_configs para AES-256-GCM (P1.3).
 *
 * Idempotente: so toca linhas cujo valor NAO esta no formato
 * iv:tag:cipher (isEncryptedSecret=false), com guarda .eq no valor
 * antigo (concorrencia com o re-encrypt preguicoso da rota e segura).
 *
 * Usage:
 *   ENCRYPTION_KEY=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx ts-node scripts/encrypt-ai-api-keys.ts [--dry-run]
 */
import { createClient } from '@supabase/supabase-js'
import { encryptSecret, isEncryptedSecret } from '../src/lib/crypto/secret-box'

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing SUPABASE env vars')
    process.exit(1)
  }
  if (!process.env.ENCRYPTION_KEY) {
    console.error('Missing ENCRYPTION_KEY')
    process.exit(1)
  }

  const sb = createClient(url, key)
  const { data: rows, error } = await sb
    .from('whatsapp_ai_configs')
    .select('id, api_key_encrypted')
    .not('api_key_encrypted', 'is', null)

  if (error) {
    console.error('Query error:', error)
    process.exit(1)
  }

  const candidates = (rows || []).filter((r) => !isEncryptedSecret(r.api_key_encrypted))
  console.log(`[encrypt-ai-api-keys] legacy candidates: ${candidates.length} / ${rows?.length ?? 0}`)
  if (DRY_RUN) {
    console.log('[encrypt-ai-api-keys] --dry-run: no writes')
    return
  }

  let ok = 0
  let fail = 0

  for (const row of candidates) {
    try {
      const plain = Buffer.from(row.api_key_encrypted as string, 'base64').toString('utf-8')
      const { error: updateErr } = await sb
        .from('whatsapp_ai_configs')
        .update({ api_key_encrypted: encryptSecret(plain) })
        .eq('id', row.id)
        .eq('api_key_encrypted', row.api_key_encrypted) // guarda anti-corrida
      if (updateErr) throw updateErr
      ok++
    } catch (err: any) {
      fail++
      console.error(`[encrypt-ai-api-keys] fail ${row.id}:`, err?.message)
    }
  }

  console.log(`[encrypt-ai-api-keys] done -- ok:${ok} fail:${fail}`)
  if (fail > 0) process.exit(2)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
