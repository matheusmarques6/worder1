// =============================================
// WORDER: Debug / Diagnostic endpoint guard
// /src/lib/debug-guard.ts
//
// Use em endpoints de debug/diagnóstico para impedir acesso sem um secret
// explícito.
//
// Exemplo:
//   import { assertDebugAllowed } from '@/lib/debug-guard'
//   export async function GET(req: NextRequest) {
//     const blocked = assertDebugAllowed(req)
//     if (blocked) return blocked
//     ...
//   }
//
// Fail-closed sem exceção de ambiente (item 43, fix round 1 — mesma lição do
// item 25 em src/lib/internal-auth.ts): NODE_ENV não é credencial. Antes,
// "dev sempre liberado" deixava QUALQUER rota que usa este guard sem
// proteção nenhuma em `next dev` — inclusive `/api/ai/test`, onde o corpo da
// requisição escolhe o `organizationId` que agora filtra a RPC do RAG
// (item 43): sem o secret como fronteira, o body governava tenancy sozinho
// em dev. Quem depende de rodar essas rotas localmente configura
// DEBUG_ENDPOINT_SECRET no seu .env.
// =============================================

import { NextRequest, NextResponse } from 'next/server';

/**
 * Exige `DEBUG_ENDPOINT_SECRET` via query (?debug_key=) ou header
 * (x-debug-key / Authorization: Bearer), em QUALQUER ambiente — sem exceção
 * de dev.
 *
 * @returns null se liberado, NextResponse de erro caso contrário.
 */
export function assertDebugAllowed(req: NextRequest): NextResponse | null {
  const secret = process.env.DEBUG_ENDPOINT_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          'Debug endpoints disabled. Set DEBUG_ENDPOINT_SECRET env var to enable (any environment, including dev).',
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
