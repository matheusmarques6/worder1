// =============================================
// O domínio dos links do e-mail está apontando para o Worder?
//
// Esta é a única peça do envio que mora fora do código: um CNAME que
// alguém configura num painel de DNS. Quando ele aponta para o lugar
// errado, TODO link de TODO e-mail morre — e nada, do lado de cá,
// percebe: o Resend aceitou a mensagem, o log diz enviado, a tela fica
// verde, e o cliente clica e cai numa página de erro.
//
// Foi o que aconteceu: `click.worder.email` estava configurado no Resend
// como o subdomínio de click tracking DELE. O mesmo host não pode ser
// dos dois — quem atende lá é o Resend, que responde 400 para
// /api/t/c/…, o caminho do nosso redirecionador.
//
// A sonda pergunta em /api/t/ping e separa três respostas:
//
//   marca do Worder     o host é o app: os links funcionam.
//   responde, sem marca outra coisa atende ali (Resend, parking, proxy):
//                       todo link do e-mail está morto.
//   não responde        DNS/certificado/host fora do ar: idem.
//
// A classificação mora aqui, pura. Quem faz rede é probe-run.
// =============================================

export type HostDeLinksDiagnostico = 'ok' | 'outro_servidor' | 'sem_resposta' | 'nao_verificado'

export interface HostDeLinksVeredito {
  diagnostico: HostDeLinksDiagnostico
  ok: boolean
  titulo: string
  detalhe: string
  acao: string
}

export interface RespostaDoPing {
  /** Código HTTP, ou null quando nem chegou a responder. */
  status: number | null
  /** O corpo trouxe a marca `{ worder: true }`? */
  ehWorder: boolean
  erro?: string
}

export function classificarHostDeLinks(
  host: string,
  resposta: RespostaDoPing | null
): HostDeLinksVeredito {
  if (!resposta) {
    return {
      diagnostico: 'nao_verificado',
      ok: true,
      titulo: '',
      detalhe: '',
      acao: '',
    }
  }

  if (resposta.ehWorder) {
    return {
      diagnostico: 'ok',
      ok: true,
      titulo: 'O domínio dos links responde',
      detalhe: `${host} está atendendo pelo Worder.`,
      acao: '',
    }
  }

  if (resposta.status !== null) {
    return {
      diagnostico: 'outro_servidor',
      ok: false,
      titulo: 'Os links dos seus e-mails estão quebrados',
      detalhe:
        `${host} responde ${resposta.status}, mas quem atende ali não é o Worder. ` +
        'Todo clique — produto, botão, descadastro — cai numa página de erro. ' +
        'A causa mais comum é o mesmo subdomínio estar sendo usado como domínio ' +
        'de rastreamento do provedor de envio: ele não conhece as nossas rotas.',
      acao:
        'Aponte o domínio dos links (CNAME) para o app do Worder, num subdomínio ' +
        'SÓ dele — separado do subdomínio de rastreamento do provedor de envio.',
    }
  }

  return {
    diagnostico: 'sem_resposta',
    ok: false,
    titulo: 'Os links dos seus e-mails estão quebrados',
    detalhe:
      `${host} não respondeu (${resposta.erro || 'sem resposta'}). Todo clique do ` +
      'e-mail cai numa página de erro.',
    acao: 'Confira o CNAME do domínio dos links e se ele está publicado e ativo.',
  }
}
