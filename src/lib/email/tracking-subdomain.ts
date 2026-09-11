// =============================================
// O subdomínio dos links — o host que o destinatário VÊ
//
// Um clique passa por dois redirecionadores, e a ordem importa mais do
// que parece:
//
//   1. o Resend reescreve cada link NO ENVIO, depois do nosso render;
//   2. o nosso /api/t/c redireciona o que o Resend entregar.
//
// Quem reescreve por último é quem aparece: o host que o cliente lê ao
// passar o mouse, e o host que o filtro do Gmail compara com o
// remetente, é o do RESEND. O nosso fica no meio do caminho, invisível.
//
// Daí a arquitetura:
//
//   host visível   tracking_subdomain do Resend, por domínio de envio.
//                  Loja sem domínio próprio → click.worder.email (o do
//                  nosso domínio compartilhado). Loja com domínio
//                  próprio → click.<dominio-dela>, configurado por API
//                  e publicado como UM CNAME no mesmo lugar onde ela já
//                  publicou SPF e DKIM.
//   host interno   t.worder.email, um só para toda a plataforma. É onde
//                  vive o /api/t/c, que carimba a atribuição
//                  (worderContactID/SendID/AutomationID) e grava o
//                  clique na hora.
//
// O ganho de fazer assim: o lojista alinha o host dos links com o
// domínio de envio dele — que é o que a entregabilidade pede — sem que
// nenhum domínio de cliente precise ser anexado à nossa hospedagem. Um
// CNAME no DNS dele resolve, e é o mesmo fluxo do SPF/DKIM que ele já
// conhece.
//
// Este módulo é só a regra do nome. Quem fala com o Resend é resend.ts.
// =============================================

/** O que sugerimos, e o que o Resend usa por padrão. */
export const PREFIXO_PADRAO = 'click'

export function subdominioDeLinksPadrao(dominio: string): string {
  const d = String(dominio || '').trim().toLowerCase()
  return d ? `${PREFIXO_PADRAO}.${d}` : ''
}

export interface ValidacaoDoSubdominio {
  ok: boolean
  valor?: string
  erro?: string
}

/**
 * O subdomínio de links TEM de ser do próprio domínio de envio.
 *
 * Não é preciosismo: o Resend só emite certificado e só entrega o CNAME
 * para um nome dentro do domínio que o lojista provou ser dele. Um nome
 * de fora (o clássico "vou usar o mesmo da outra loja") passaria no
 * formato, seria aceito na tela e morreria no DNS — que é exatamente o
 * tipo de falha calada que esta parte do sistema já pagou caro.
 */
export function validarSubdominioDeLinks(
  dominioDeEnvio: string,
  bruto: unknown
): ValidacaoDoSubdominio {
  const dominio = String(dominioDeEnvio || '').trim().toLowerCase()
  if (!dominio) return { ok: false, erro: 'Domínio de envio ausente.' }

  const valor = String(bruto ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '')

  if (!valor) return { ok: true, valor: '' } // vazio = volta ao padrão do Resend

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(valor)) {
    return { ok: false, erro: 'Subdomínio inválido. Use algo como click.sualoja.com.br' }
  }

  if (valor === dominio) {
    return {
      ok: false,
      erro: 'Use um subdomínio, não o domínio raiz — ex.: ' + subdominioDeLinksPadrao(dominio),
    }
  }

  if (!valor.endsWith(`.${dominio}`)) {
    return {
      ok: false,
      erro: `O subdomínio dos links precisa ser do próprio ${dominio} — ex.: ${subdominioDeLinksPadrao(dominio)}`,
    }
  }

  return { ok: true, valor }
}

/**
 * O CNAME de rastreamento no meio dos registros que o Resend devolve.
 * A tela do assistente lista todos; este atalho serve para dizer, no
 * painel de saúde, se falta publicar justo o dos links.
 */
export function registroDeLinks(
  registros: unknown,
  subdominio: string | null | undefined
): { host: string; valor: string; status: string | null } | null {
  if (!subdominio || !Array.isArray(registros)) return null
  const alvo = String(subdominio).toLowerCase()
  for (const r of registros as any[]) {
    const nome = String(r?.name || '').toLowerCase()
    if (!nome) continue
    const tipo = String(r?.type || '').toUpperCase()
    if (tipo !== 'CNAME') continue
    if (nome === alvo || alvo.startsWith(`${nome}.`)) {
      return { host: alvo, valor: String(r?.value || ''), status: r?.status ? String(r.status) : null }
    }
  }
  return null
}
