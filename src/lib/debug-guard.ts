// =============================================
// WORDER: Debug / Diagnostic endpoint guard
// /src/lib/debug-guard.ts
//
// Use em endpoints de debug/diagnóstico para impedir acesso em produção
// sem um secret explícito.
//
// Exemplo:
//   import { assertDebugAllowed } from '@/lib/debug-guard'
//   export async function GET(req: NextRequest) {
//     const blocked = assertDebugAllowed(req)
//     if (blocked) return blocked
//     ...
//   }
// =============================================

import { NextRequest, NextResponse } from 'next/server';

/**
 * Em produção, exige `DEBUG_ENDPOINT_SECRET` via query (?debug_key=) ou header (x-debug-key).
 * Em dev, libera automaticamente.
 *
 * @returns null se liberado, NextResponse de erro caso contrário.
 */
export function assertDebugAllowed(req: NextRequest): NextResponse | null {
  // Dev sempre liberado
  if (process.env.NODE_ENV !== 'production') return null;

  const secret = process.env.DEBUG_ENDPOINT_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          'Debug endpoints disabled in production. Set DEBUG_ENDPOINT_SECRET env var to enable.',
      },
      { status: 404 }
    );
  }

  const url = new URL(req.url);
  const provided =
    url.searchParams.get('debug_key') ||
    req.headers.get('x-debug-key') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (provided !== secret) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return null;
}
