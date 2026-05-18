// POST /api/segments/ai/generate
//
// Body: { prompt: string, locale?: string }
// Returns: { rule: SegmentRule, attempts: number }
//
// Rate-limited per organization to keep AI cost predictable. The
// limit (50/day per org) is enforced in-process — if you need a
// harder guarantee bump it to a Redis counter, but per-org orgs in
// prod don't burst this fast.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generateSegmentRule } from '@/lib/segments/ai-generator';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Simple per-process rate counter. Lives in module scope, resets on
// cold start. Good enough as a soft cap; harder limits should go to
// a shared store (Redis / DB) if we ever see abuse.
const ORG_USAGE = new Map<string, { count: number; resetAt: number }>();
const DAILY_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

function checkRate(orgId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = ORG_USAGE.get(orgId);
  if (!entry || entry.resetAt < now) {
    ORG_USAGE.set(orgId, { count: 1, resetAt: now + DAY_MS });
    return { allowed: true, remaining: DAILY_LIMIT - 1 };
  }
  if (entry.count >= DAILY_LIMIT) return { allowed: false, remaining: 0 };
  entry.count += 1;
  return { allowed: true, remaining: DAILY_LIMIT - entry.count };
}

export async function POST(req: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  const body = await req.json().catch(() => ({}));
  const prompt: string = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return NextResponse.json({ error: 'prompt obrigatório' }, { status: 400 });
  }
  if (prompt.length > 800) {
    return NextResponse.json({ error: 'prompt muito longo (máx 800 caracteres)' }, { status: 400 });
  }

  // Multi-org scope check
  const { data: memberships } = await supabaseAdmin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', auth.user.id);
  const orgIds = [...new Set([
    auth.user.organization_id,
    ...(memberships?.map((m: any) => m.organization_id) || []),
  ])];
  const orgId = body.organization_id || auth.user.organization_id;
  if (!orgIds.includes(orgId)) {
    return NextResponse.json({ error: 'invalid organization_id' }, { status: 403 });
  }

  const rate = checkRate(orgId);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Limite diário atingido (${DAILY_LIMIT} gerações por dia por organização). Tenta amanhã ou crie o segmento manualmente.` },
      { status: 429 }
    );
  }

  const result = await generateSegmentRule(prompt);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, attempts: result.attempts },
      { status: 502 }
    );
  }

  return NextResponse.json({
    rule: result.rule,
    attempts: result.attempts,
    remaining_today: rate.remaining,
  });
}
