// =============================================
// O caminho até a primeira venda — em passos, com estado real.
//
// Quem entra na Worder pela primeira vez vê dezenas de telas e nenhuma
// ordem entre elas. Este é o roteiro: da loja conectada ao primeiro
// e-mail saindo pelo domínio do lojista, na sequência em que cada passo
// depende do anterior.
//
// A regra de ouro é a mesma do resto deste trabalho: cada passo é dado
// como feito por um FATO no banco (existe uma loja ativa, existe um
// popup publicado, existe um domínio verificado), nunca por um "já vi
// esta tela". Uma lista que se marca sozinha ao ser vista mente para o
// lojista e esconde justo o passo que faltou.
//
// A regra mora aqui, pura. A rota busca os fatos; a tela desenha.
// =============================================

export interface OnboardingFacts {
  /** Existe pelo menos uma loja ativa? */
  hasStore: boolean
  /** O carregador da Worder já apareceu na vitrine? */
  embedActive: boolean
  /** Popups publicados (sem contar variantes de teste). */
  publishedPopups: number
  /** A organização tem domínio próprio verificado? */
  domainVerified: boolean
  /** Campanhas já enviadas. */
  campaignsSent: number
  /** Automações ligadas (boas-vindas, carrinho abandonado…). */
  automationsActive: number
}

export interface ChecklistStep {
  id: string
  title: string
  /** Por que este passo existe, na linguagem do lojista. */
  detail: string
  done: boolean
  /** Texto do botão. */
  cta: string
  href: string
  /**
   * O passo anterior que ainda falta. Enquanto houver um, o botão fica
   * apagado: mandar criar popup sem loja conectada é fazer o lojista
   * bater numa tela vazia.
   */
  blockedBy: string | null
}

export interface Checklist {
  steps: ChecklistStep[]
  done: number
  total: number
  complete: boolean
  /** O próximo passo de verdade — o primeiro que falta e está liberado. */
  next: ChecklistStep | null
  /** 0 a 1. */
  progress: number
}

export function buildChecklist(facts: OnboardingFacts): Checklist {
  const f = {
    hasStore: !!facts.hasStore,
    embedActive: !!facts.embedActive,
    publishedPopups: Math.max(0, Number(facts.publishedPopups) || 0),
    domainVerified: !!facts.domainVerified,
    campaignsSent: Math.max(0, Number(facts.campaignsSent) || 0),
    automationsActive: Math.max(0, Number(facts.automationsActive) || 0),
  }

  const bruto: Array<Omit<ChecklistStep, 'blockedBy'> & { needs?: string }> = [
    {
      id: 'store',
      title: 'Conecte sua loja',
      detail: 'É de onde vêm pedidos, produtos e clientes. Sem ela, os números da Worder ficam vazios.',
      done: f.hasStore,
      cta: 'Conectar Shopify',
      href: '/integrations',
    },
    {
      id: 'embed',
      title: 'Ative a Worder na sua vitrine',
      detail: 'Um interruptor no tema da Shopify. Enquanto ele estiver desligado, nenhum popup aparece — mesmo publicado.',
      done: f.embedActive,
      cta: 'Ativar agora',
      href: '/site/forms',
      needs: 'store',
    },
    {
      id: 'popup',
      title: 'Publique seu primeiro popup',
      detail: 'É o que transforma visita em contato. Comece por um modelo pronto: texto, campos e cupom já no lugar.',
      done: f.publishedPopups > 0,
      cta: 'Criar popup',
      href: '/site/forms',
      needs: 'embed',
    },
    {
      id: 'domain',
      title: 'Verifique seu domínio de envio',
      detail: 'Faz os e-mails saírem do endereço da sua loja, e não de um nosso. É o que separa a caixa de entrada do spam — e campanha em massa exige.',
      done: f.domainVerified,
      cta: 'Verificar domínio',
      href: '/settings/email',
      needs: 'store',
    },
    {
      id: 'automation',
      title: 'Ligue as boas-vindas automáticas',
      detail: 'Quem acabou de se inscrever está com você agora. O e-mail de boas-vindas com o cupom é o que fecha a primeira compra.',
      done: f.automationsActive > 0,
      cta: 'Ver automações',
      href: '/automations',
      needs: 'popup',
    },
    {
      id: 'campaign',
      title: 'Envie sua primeira campanha',
      detail: 'Com a lista crescendo e o domínio verificado, a primeira campanha é o teste de tudo o que veio antes.',
      done: f.campaignsSent > 0,
      cta: 'Criar campanha',
      href: '/email/campaigns/new',
      needs: 'domain',
    },
  ]

  const feito = new Map(bruto.map((s) => [s.id, s.done]))
  const titulo = new Map(bruto.map((s) => [s.id, s.title]))

  const steps: ChecklistStep[] = bruto.map(({ needs, ...s }) => ({
    ...s,
    blockedBy: needs && !feito.get(needs) ? titulo.get(needs) || null : null,
  }))

  const done = steps.filter((s) => s.done).length
  const next = steps.find((s) => !s.done && !s.blockedBy) || null

  return {
    steps,
    done,
    total: steps.length,
    complete: done === steps.length,
    next,
    progress: steps.length ? done / steps.length : 0,
  }
}
