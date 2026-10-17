import { openIntegrationSecret, sealIntegrationSecret } from '../../src/lib/integrations/credential-codec'

const fields = {
  shopify_stores: ['access_token', 'api_secret', 'webhook_secret'],
  instagram_accounts: ['access_token'],
  tiktok_accounts: ['access_token'],
} as const
type Target = keyof typeof fields
interface Options {
  target: Target
  organizationId: string
  apply?: boolean
  confirmation?: string
  checkpoint?: string
  onCheckpoint?: (checkpoint: string) => void
}

/** Counts only; field-level CAS prevents overwriting a concurrently refreshed credential. */
export async function backfillIntegrationCredentials(client: any, options: Options) {
  if (!Object.hasOwn(fields, options.target) || !options.organizationId) throw new Error('Explicit target and organization are required')
  if (options.apply && options.confirmation !== `${options.target}:${options.organizationId}`) throw new Error('Exact target:organization confirmation is required')
  const counts = { scanned: 0, candidates: 0, changed: 0, encrypted: 0, invalid: 0, conflicts: 0, checkpoint: options.checkpoint || '' }
  for (;;) {
    let query = client.from(options.target).select(['id', ...fields[options.target]].join(','))
      .eq('organization_id', options.organizationId).order('id', { ascending: true }).limit(100)
    if (counts.checkpoint) query = query.gt('id', counts.checkpoint)
    const { data: rows, error } = await query
    if (error) throw new Error('Credential backfill read failed; resume from the saved checkpoint')
    if (!rows?.length) break
    for (const row of rows) {
      counts.scanned++
      for (const field of fields[options.target]) {
        const value = row[field]
        if (!value || (options.target === 'shopify_stores' && field === 'access_token' && value === 'manual')) continue
        let plain: string
        try { plain = openIntegrationSecret(value) } catch { counts.invalid++; continue }
        if (plain !== value) { counts.encrypted++; continue }
        counts.candidates++
        if (!options.apply) continue
        const { data: updated, error: writeError } = await client.from(options.target)
          .update({ [field]: sealIntegrationSecret(plain) })
          .eq('id', row.id).eq('organization_id', options.organizationId).eq(field, value).select('id')
        if (writeError) throw new Error('Credential backfill write failed; resume from the saved checkpoint')
        if (updated?.length) counts.changed++
        else counts.conflicts++
      }
      counts.checkpoint = row.id
      options.onCheckpoint?.(row.id)
    }
  }
  return counts
}

async function main() {
  const { readFileSync, writeFileSync } = await import('node:fs')
  const { createClient } = await import('@supabase/supabase-js')
  const args = process.argv.slice(2)
  const arg = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
  const target = arg('--target') as Target
  const organizationId = arg('--org') || ''
  const apply = args.includes('--apply')
  const checkpointFile = arg('--checkpoint-file')
  if (apply && !checkpointFile) throw new Error('--apply requires --checkpoint-file')
  let checkpoint = ''
  if (checkpointFile && args.includes('--resume')) {
    const saved = JSON.parse(readFileSync(checkpointFile, 'utf8'))
    if (saved.target !== target || saved.organizationId !== organizationId) throw new Error('Checkpoint scope mismatch')
    checkpoint = saved.checkpoint
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Explicit database environment is required')
  const counts = await backfillIntegrationCredentials(createClient(url, key, { auth: { persistSession: false } }), {
    target, organizationId, apply, confirmation: arg('--confirm'), checkpoint,
    onCheckpoint: apply && checkpointFile ? value => writeFileSync(checkpointFile, JSON.stringify({ target, organizationId, checkpoint: value })) : undefined,
  })
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...counts }))
}

if (/encrypt-integration-credentials\.(ts|js)$/.test(process.argv[1] || '')) {
  main().catch(() => { console.error('Credential backfill failed. Check scope, confirmation, key and checkpoint; no values were logged.'); process.exitCode = 1 })
}
