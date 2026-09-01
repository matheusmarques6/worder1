// src/lib/internal-auth.ts
import type { NextRequest } from 'next/server'
import { verifyBearerToken } from '@/lib/webhook-security'

/**
 * Autorização de rotas INTERNAS (service_role, chamadas server-to-server —
 * nunca pelo navegador). Item 25 da auditoria: as duas cópias desta função
 * abriam sozinhas quando nem INTERNAL_API_SECRET nem CRON_SECRET estavam
 * setados, contanto que NODE_ENV não fosse "production" — ou seja, se a env
 * sumisse do ambiente (erro de deploy, .env local incompleto), a rota virava
 * pública para qualquer um que soubesse a URL.
 *
 * Fail-closed sem exceção de ambiente: NODE_ENV não é credencial. Sem
 * segredo configurado, a resposta é SEMPRE negar — inclusive em dev. Quem
 * depende de rodar essas rotas localmente configura INTERNAL_API_SECRET (ou
 * CRON_SECRET) no seu .env; o .env.example já documenta as duas. Não
 * "conserte" isto de volta para um fallback por NODE_ENV — é exatamente o
 * buraco que este arquivo fecha.
 */
export function isInternalAuthorized(request: NextRequest): boolean {
  const secret = process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET
  if (!secret) {
    // Mensagem pensada para quem vê isto no terminal do `next dev`: diz qual
    // env falta, em vez de o código adivinhar por NODE_ENV.
    console.error(
      '[internal-auth] Nenhuma rota interna autoriza: configure INTERNAL_API_SECRET ' +
        'ou CRON_SECRET no .env (veja .env.example). Negando por padrão.'
    )
    return false
  }
  // Comparação em tempo constante: reaproveita verifyBearerToken (já usa
  // crypto.timingSafeEqual com checagem de tamanho) em vez de reimplementar.
  return verifyBearerToken(request.headers.get('authorization'), secret)
}
