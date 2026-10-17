/** Object keys are owned by the authenticated org and verified conversation. */
export function ownedMediaPath(path: string | null | undefined, orgId: string, conversationId: string): string | null {
  if (!/^[\w-]+$/.test(orgId) || !/^[\w-]+$/.test(conversationId) || !path) return null
  const parts = path.split('/')
  if (parts.length !== 3 || parts[0] !== orgId || parts[1] !== conversationId) return null
  return /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(parts[2]) && !parts[2].includes('..') ? path : null
}

/** Only recover legacy public/signed keys from this project's Storage origin. */
export function resolveOwnedMediaPath(
  row: { media_storage_path?: string | null; media_url?: string | null },
  orgId: string,
  conversationId: string,
): string | null {
  if (row.media_storage_path) return ownedMediaPath(row.media_storage_path, orgId, conversationId)
  if (!row.media_url) return null
  try {
    const rawPath = row.media_url.split(/[?#]/)[0]
    if (/[\\%]/.test(rawPath) || rawPath.split('/').some(part => part === '.' || part === '..')) return null
    const url = new URL(row.media_url)
    const configured = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    if (url.origin !== configured.origin || url.username || url.password) return null
    const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/whatsapp-media\/(.+)$/)
    return match ? ownedMediaPath(match[1], orgId, conversationId) : null
  } catch {
    return null
  }
}

/** Historical Evolution messages used provider URLs, never our Storage signer. */
export function legacyProviderMediaUrl(row: { provider?: string; media_storage_path?: string | null; media_url?: string | null }): string | null {
  if (row.provider !== 'evolution' || row.media_storage_path || !row.media_url) return null
  try {
    const url = new URL(row.media_url)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname.includes('/storage/v1/')) return null
    return row.media_url
  } catch {
    return null
  }
}
