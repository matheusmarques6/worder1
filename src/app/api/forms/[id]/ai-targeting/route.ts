// =============================================
// POST /api/forms/:id/ai-targeting — { prompt }
//
// "Descreva quem deve ver" → patch de behavior. O modelo só enxerga os
// segmentos e listas da org de quem pergunta; o patch volta normalizado
// para o editor mostrar e o lojista aplicar (nada é salvo aqui).
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { getAuthClient, authError } from '@/lib/api-utils'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { generateTargeting } from '@/lib/popups/ai-targeting'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Limite diário por org. Com Upstash configurado o contador é compartilhado
// entre instâncias; sem ele, vale por instância (best-effort em serverless).
const DAILY_LIMIT = 100
const ORG_USAGE = new Map<string, { count: number; resetAt: number }>()
let upstash: Ratelimit | null | undefined
function getRatelimit(): Ratelimit | null {
  if (upstash !== undefined) return upstash
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      upstash = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.fixedWindow(DAILY_LIMIT, '1 d'), prefix: 'rl:popup-ai' })
      return upstash
    } catch { /* cai no contador local */ }
  }
  upstash = null
  return null
}

async function checkRate(orgId: string): Promise<boolean> {
  const rl = getRatelimit()
  if (rl) {
    try { return (await rl.limit(orgId)).success } catch { /* Redis fora: não bloqueia o lojista */ }
  }
  const now = Date.now()
  const e = ORG_USAGE.get(orgId)
  if (!e || e.resetAt < now) { ORG_USAGE.set(orgId, { count: 1, resetAt: now + 86400000 }); return true }
  if (e.count >= DAILY_LIMIT) return false
  e.count += 1
  return true
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const orgId = auth.user.organization_id
  const body = await req.json().catch(() => ({}))
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) return NextResponse.json({ error: 'Descreva quem deve ver o popup.' }, { status: 400 })
  if (!(await checkRate(orgId))) return NextResponse.json({ error: 'Limite diário de sugestões da IA atingido.' }, { status: 429 })

  const admin = getSupabaseAdmin()
  const { data: form } = await admin.from('crm_forms').select('id').eq('id', params.id).eq('organization_id', orgId).maybeSingle()
  if (!form) return NextResponse.json({ error: 'Popup não encontrado' }, { status: 404 })

  const [{ data: segs }, { data: lists }] = await Promise.all([
    admin.from('customer_segments').select('id, name').eq('organization_id', orgId).limit(100),
    admin.from('contact_lists').select('id, name').eq('organization_id', orgId).eq('is_archived', false).limit(100),
  ])
  const ctx = {
    segments: (segs || []).map((s: any) => ({ id: s.id as string, name: String(s.name || '') })),
    lists: (lists || []).map((s: any) => ({ id: s.id as string, name: String(s.name || '') })),
  }
  const r = await generateTargeting(prompt, ctx)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 })
  return NextResponse.json(r.suggestion, { headers: { 'Cache-Control': 'no-store' } })
}
