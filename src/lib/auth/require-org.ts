import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveActiveIdentity } from './active-identity'

export interface AuthContext {
  orgId: string
  userId: string
  role: string
  agentId: string | null
  aal: 'aal1' | 'aal2'
}

/**
 * Authenticates a request and returns the caller's organization_id.
 *
 * Aceita 2 fontes de token (em ordem de prioridade):
 *   1. Authorization: Bearer <jwt>   — uso por integrações externas / SDKs
 *   2. Cookie `sb-access-token`      — uso normal do front-end (cookie httpOnly
 *                                       gravado por /api/auth no login)
 *
 * O app autentica via cookies httpOnly (middleware.ts lê em SSR), então o JS
 * do browser não consegue acessar o token pra montar Authorization header. Por
 * isso o fallback de cookie é obrigatório — sem ele, todas as fetch() do front
 * recebem 401 sistemático mesmo com o usuário logado.
 *
 * Use at the top of every WhatsApp/CRM API route que usa supabaseAdmin
 * (service_role bypassa RLS), pra escopar queries no org do caller em vez de
 * confiar em organizationId vindo da query string.
 *
 * Returns a NextResponse on failure — caller must check with `instanceof` and
 * return it short-circuit. Returns { orgId, userId } on success.
 */
export async function requireOrgFromAuth(
  request: NextRequest,
): Promise<AuthContext | NextResponse> {
  let token: string | null = null

  // Source 1: Authorization header (preferido — integrações externas)
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    token = authHeader.slice('Bearer '.length).trim()
  }

  // Source 2: cookie httpOnly setado pelo /api/auth no login
  if (!token) {
    token = request.cookies.get('sb-access-token')?.value ?? null
  }

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Dev mode token shortcut — mesmo bypass usado pelo middleware
  if (token === 'dev-access-token') {
    return NextResponse.json({ error: 'Dev token not supported here' }, { status: 401 })
  }

  const identity = await resolveActiveIdentity(supabaseAdmin, token)
  if (!identity) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  if (!identity.mfaSatisfied) return NextResponse.json({ error: 'Verificação em duas etapas necessária.', code: 'mfa_required' }, { status: 403 })
  return { orgId: identity.orgId, userId: identity.userId, role: identity.role, agentId: identity.agentId, aal: identity.aal }
}
