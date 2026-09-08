// =============================================
// GET /api/health — qual versão está no ar?
//
// Devolve o commit e a branch que a Vercel publicou. Serve para
// responder "a correção já está em produção?" sem adivinhar: compare o
// commit aqui com o da branch de trabalho. Público e sem dados
// sensíveis.
// =============================================

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_COMMIT_SHA || null,
    commit_short: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    commit_message: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split('\n')[0] || null,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || null,
    deployment: process.env.VERCEL_URL || null,
    now: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
