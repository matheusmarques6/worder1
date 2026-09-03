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
//
// As DUAS recusas — sem segredo configurado e com chave errada — respondem o
// mesmo 404 genérico, byte a byte (item 43, fix round 2). O motivo fica no
// log do servidor, nunca na resposta: é a decisão já registrada do item 25
// (checklist :426-429). O corpo antigo dizia "Set DEBUG_ENDPOINT_SECRET env
// var to enable", o que entregava a um chamador não autenticado a diferença
// entre "esta rota de debug existe e está com o segredo desconfigurado" e
// "existe e sua chave está errada" — o 404 deixava de ser o disfarce que se
// propunha a ser, justamente para quem está sondando.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/webhook-security';

/**
 * Exige `DEBUG_ENDPOINT_SECRET` via query (?debug_key=) ou header
 * (x-debug-key / Authorization: Bearer), em QUALQUER ambiente — sem exceção
 * de dev.
 *
 * @returns null se liberado, NextResponse de erro caso contrário.
 */
export function assertDebugAllowed(req: NextRequest): NextResponse | null {
  // Uma única forma de negar: nenhum chamador distingue os dois motivos.
  const deny = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

  const secret = process.env.DEBUG_ENDPOINT_SECRET;
  if (!secret) {
    // Mensagem pensada para quem vê isto no terminal do `next dev`: diz qual
    // env falta, em vez de o código adivinhar por NODE_ENV — e em vez de a
    // dica de configuração viajar no corpo do 404.
    console.error(
      '[debug-guard] Rota de debug/diagnóstico negada: configure DEBUG_ENDPOINT_SECRET ' +
        'no .env (veja .env.example). Negando por padrão, em qualquer ambiente.'
    );
    return deny();
  }

  const url = new URL(req.url);
  const provided =
    url.searchParams.get('debug_key') ||
    req.headers.get('x-debug-key') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  // Comparação em tempo constante: reaproveita verifyBearerToken (o mesmo
  // helper que internal-auth.ts usa desde o item 25 — checa comprimento antes
  // do crypto.timingSafeEqual e não lança) em vez de reimplementar. O prefixo
  // `Bearer ` já saiu acima, então aqui o helper só compara.
  if (!verifyBearerToken(provided ?? null, secret)) return deny();

  return null;
}
