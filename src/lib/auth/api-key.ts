// Chaves de API (Configurações → Desenvolvedor → Chaves de API).
//
// Formato: wk_live_<48 hex>. Guardamos só o SHA-256 (key_hash) e o prefixo
// para exibição; chaves antigas ainda em texto puro (coluna `key`) seguem
// funcionando até serem regeneradas.

import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { checkRateLimit } from '@/lib/rate-limit'

export const API_KEY_PERMISSIONS = [
  { key: 'contacts:read', label: 'Ler contatos' },
  { key: 'contacts:write', label: 'Criar e atualizar contatos' },
  { key: 'events:write', label: 'Enviar eventos' },
  { key: 'orders:read', label: 'Ler pedidos' },
] as const
export type ApiKeyPermission = (typeof API_KEY_PERMISSIONS)[number]['key']
export const RATE_LIMIT_PER_MINUTE = 600
export const BULK_IMPORT_LIMIT = 10_000

export function hashApiKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = 'wk_live_' + crypto.randomBytes(24).toString('hex')
  return { raw, prefix: raw.slice(0, 12), hash: hashApiKey(raw) }
}

/** Como a chave aparece na lista: wk_live_••••8f2a */
export function maskApiKey(prefix: string | null, hash: string | null, legacyKey?: string | null): string {
  const p = (prefix || legacyKey?.slice(0, 8) || 'wk_live_').replace(/_$/, '')
  const tail = legacyKey ? legacyKey.slice(-4) : hash ? hash.slice(0, 4) : '••••'
  return `${p.startsWith('wk_') || p.startsWith('wrd_') ? p.split('_').slice(0, 2).join('_') : p}_••••${tail}`
}

export interface ApiKeyContext {
  keyId: string
  organizationId: string
  permissions: string[]
  name: string
}

/**
 * Autentica `Authorization: Bearer wk_live_…` (ou X-API-Key).
 * Devolve o contexto ou uma resposta de erro pronta.
 */
export async function authenticateApiKey(req: Request, required?: ApiKeyPermission): Promise<{ ctx: ApiKeyContext } | { error: NextResponse }> {
  const h = req.headers.get('authorization') || ''
  const raw = (h.toLowerCase().startsWith('bearer ') ? h.slice(7) : req.headers.get('x-api-key') || '').trim()
  if (!raw) return { error: NextResponse.json({ error: 'missing_api_key', message: 'Envie Authorization: Bearer <chave>.' }, { status: 401 }) }
  if (!/^(wk_live_|wrd_)[a-f0-9]{24,64}$/i.test(raw)) return { error: NextResponse.json({ error: 'invalid_api_key' }, { status: 401 }) }

  const hash = hashApiKey(raw)
  const prefix = raw.slice(0, 12)
  const { data: rows } = await supabaseAdmin
    .from('api_keys')
    .select('id, organization_id, name, permissions, key_hash, key, expires_at, is_active, key_prefix')
    .or(`key_hash.eq.${hash},key.eq.${raw}`)
    .limit(2)
  const row = (rows || []).find((r: any) => r.key_hash === hash || r.key === raw)
  if (!row || row.is_active === false) return { error: NextResponse.json({ error: 'invalid_api_key' }, { status: 401 }) }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return { error: NextResponse.json({ error: 'expired_api_key' }, { status: 401 }) }
  if (row.key_prefix && row.key_prefix !== prefix && row.key !== raw) return { error: NextResponse.json({ error: 'invalid_api_key' }, { status: 401 }) }

  const perms: string[] = Array.isArray(row.permissions) ? row.permissions : []
  if (required && !perms.includes(required) && !perms.includes('*')) {
    return { error: NextResponse.json({ error: 'insufficient_permissions', message: `Esta chave não tem a permissão ${required}.` }, { status: 403 }) }
  }

  const rl = await checkRateLimit(`apikey:${row.id}`, { limit: RATE_LIMIT_PER_MINUTE, windowSec: 60 })
  if (!rl.allowed) return { error: NextResponse.json({ error: 'rate_limited', message: `Limite de ${RATE_LIMIT_PER_MINUTE} requisições por minuto.` }, { status: 429 }) }

  // Último uso — sem esperar.
  supabaseAdmin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', row.id).then(() => {}, () => {})

  return { ctx: { keyId: row.id, organizationId: row.organization_id, permissions: perms, name: row.name } }
}
