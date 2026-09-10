// =============================================
// Saúde do envio — o que está prestes a falhar em silêncio.
//
// O painel de popups respondeu a mesma pergunta do lado da captura. Este
// responde do lado do envio, que é onde as falhas são mais caladas: um
// domínio que sai do ar continua "configurado" na tela, um token de
// WhatsApp vencido só aparece quando a campanha não sai, e uma campanha
// agendada no endereço temporário descobre a franquia no minuto do
// disparo — de madrugada, sem ninguém olhando.
//
// A regra mora aqui, pura, para ser testada sem banco. A rota busca as
// linhas e chama `buildSendingIssues`.
//
// O critério de tudo o que entra é o mesmo: "alguém recebe (ou deixa de
// receber) algo pior do que a tela promete, e ninguém está olhando".
// Nada de métrica de vaidade — cada item diz o que fazer e para onde ir.
// =============================================

export type HealthLevel = 'error' | 'warn'
export type SendingChannel = 'email' | 'whatsapp'

export interface SendingIssue {
  level: HealthLevel
  /** Identificador estável da regra, para telemetria e testes. */
  kind: string
  channel: SendingChannel
  /** A coisa afetada: o domínio, o nome da campanha, o número. */
  subject: string | null
  title: string
  detail: string
  action: string
  /** Para onde o botão leva. */
  href: string | null
}

// ── Limiares ──────────────────────────────────────────────
// Rejeição e spam seguem o que Gmail e Yahoo publicaram em 2024: acima de
// 0,3% de reclamação a entrega começa a degradar, e eles pedem para ficar
// abaixo de 0,1%. Rejeição alta é sinal de lista velha ou comprada.
export const BOUNCE_WARN = 0.02
export const BOUNCE_ERROR = 0.05
export const COMPLAINT_WARN = 0.001
export const COMPLAINT_ERROR = 0.003
/** Abaixo disso a taxa é ruído: 1 rejeição em 20 envios não diz nada. */
export const MIN_VOLUME_FOR_RATES = 200
/** Depois disso, um domínio parado em "pendente" é DNS que não foi publicado. */
export const DOMAIN_PENDING_HOURS = 24
export const TOKEN_EXPIRY_WARN_DAYS = 7
/** Silêncio de entrada maior que isto, com conta ativa, é webhook caído. */
export const WEBHOOK_SILENCE_DAYS = 3
/** Franquia abaixo desta fração vira aviso. */
export const ALLOWANCE_LOW_FRACTION = 0.2

export interface DomainRow {
  domain: string
  status: string | null
  verified_at?: string | null
  is_system?: boolean | null
  created_at?: string | null
  warmup_enabled?: boolean | null
  warmup_daily_limit?: number | null
  total_sent_today?: number | null
}

export interface ScheduledCampaign {
  id: string
  name: string | null
  scheduled_at: string | null
  from_email: string | null
  total_recipients?: number | null
}

export interface WhatsAppRow {
  id: string
  label: string | null
  status?: string | null
  quality_rating?: string | null
  webhook_configured?: boolean | null
  last_webhook_at?: string | null
  last_health_status?: string | null
  last_health_expires_at?: string | null
  token_invalid_at?: string | null
}

export interface SendingHealthInput {
  /** Endereço de onde as campanhas saem hoje. */
  sender: { email: string | null; onSharedDomain: boolean }
  /** Domínios da organização (os do sistema entram marcados e são ignorados). */
  domains: DomainRow[]
  /** Franquia do endereço compartilhado, já avaliada. */
  allowance: { onSharedDomain: boolean; used: number; allowance: number; remaining: number }
  /** Campanhas agendadas que ainda não saíram. */
  scheduled: ScheduledCampaign[]
  /** Envios dos últimos 30 dias. */
  rates: { sent: number; bounced: number; complained: number }
  /** Contas de WhatsApp da organização. */
  whatsapp: WhatsAppRow[]
  /**
   * De onde saem os links dos e-mails. `app` quer dizer que nem a loja,
   * nem a organização, nem a plataforma têm domínio de rastreamento — e
   * então os links saem do host do painel.
   */
  trackingHost?: { url: string; source: 'store' | 'organization' | 'platform' | 'app' }
  /**
   * Resultado da sonda das imagens do e-mail. Quando o host da CDN ou o
   * transformador de imagens está fora, TODO e-mail com imagem do editor
   * chega com retângulos vazios — e nada, do lado do envio, acusa: o
   * Resend aceitou, o log diz enviado.
   */
  imagens?: { ok: boolean; titulo: string; detalhe: string; acao: string; diagnostico: string }
  now?: Date
}

const pctLabel = (v: number) => `${(v * 100).toFixed(2).replace('.', ',')}%`
const hoursSince = (iso: string | null | undefined, now: Date): number | null => {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? (now.getTime() - t) / 3600000 : null
}

export function buildSendingIssues(input: SendingHealthInput): SendingIssue[] {
  const now = input.now || new Date()
  const issues: SendingIssue[] = []

  // ── E-mail: o domínio de onde as mensagens saem ──
  const own = (input.domains || []).filter((d) => !d.is_system)
  const verified = own.filter((d) => d.status === 'verified')

  for (const d of own) {
    if (d.status === 'verified') continue
    if (d.verified_at) {
      // Já esteve verificado e não está mais: alguém mexeu no DNS. Este é
      // o caso caro — a entrega cai sem nenhum aviso na tela antiga.
      issues.push({
        level: 'error', kind: 'domain_broke', channel: 'email', subject: d.domain,
        title: 'O DNS do seu domínio saiu do ar',
        detail: `${d.domain} já esteve verificado e não está mais. Sem SPF e DKIM válidos, Gmail e Outlook mandam para spam ou recusam.`,
        action: 'Confira se os registros ainda estão publicados no seu provedor de DNS e verifique de novo.',
        href: '/settings/email',
      })
      continue
    }
    const age = hoursSince(d.created_at, now)
    if (age !== null && age >= DOMAIN_PENDING_HOURS) {
      issues.push({
        level: 'warn', kind: 'domain_pending', channel: 'email', subject: d.domain,
        title: 'Domínio esperando o DNS há mais de um dia',
        detail: `${d.domain} foi adicionado há ${Math.round(age / 24)} ${Math.round(age / 24) === 1 ? 'dia' : 'dias'} e os registros ainda não foram encontrados. Até verificar, tudo sai pelo endereço temporário.`,
        action: 'Publique os registros DNS que a tela mostra e clique em verificar.',
        href: '/settings/email',
      })
    }
  }

  // Sem nenhum domínio próprio, a conversa é outra: não é um erro, é o
  // passo que falta. Só aparece para quem está de fato no compartilhado.
  if (own.length === 0 && input.sender.onSharedDomain) {
    issues.push({
      level: 'warn', kind: 'sender_shared', channel: 'email', subject: input.sender.email,
      title: 'Enviando pelo endereço temporário',
      detail: 'Suas mensagens saem de um endereço nosso, com reputação compartilhada com outras lojas. Campanha em massa exige o seu domínio.',
      action: 'Verifique o domínio da sua loja — leva alguns minutos e é uma vez só.',
      href: '/settings/email',
    })
  }

  // ── De onde saem os links do e-mail ──
  // O host dos links é lido pelos filtros junto do remetente. Link
  // apontando para o painel, com remetente no domínio da loja, é o
  // padrão de e-mail encaminhado por intermediário.
  const th = input.trackingHost
  if (th?.source === 'app') {
    issues.push({
      level: 'warn', kind: 'tracking_host_app', channel: 'email', subject: null,
      title: 'Os links dos seus e-mails saem do domínio do painel',
      detail: 'Clique, abertura e descadastro apontam para o endereço do painel. Com o remetente no seu domínio e os links noutro, o filtro lê a mensagem como encaminhada por intermediário.',
      action: 'Configure o subdomínio de links em Configurações → E-mail (um CNAME, uma vez só).',
      href: '/settings/email',
    })
  } else if (th?.source === 'platform' && verified.length > 0) {
    issues.push({
      level: 'warn', kind: 'tracking_host_shared', channel: 'email', subject: null,
      title: 'Links no nosso domínio, remetente no seu',
      detail: 'Seu domínio de envio está verificado, mas os links do e-mail ainda saem por um domínio nosso. Alinhar os dois é o que fecha a conta da reputação.',
      action: 'Aponte um CNAME (ex.: links.sualoja.com.br) e salve em Configurações → E-mail.',
      href: '/settings/email',
    })
  }

  // ── As imagens do e-mail carregam? ──
  const img = input.imagens
  if (img && !img.ok && img.diagnostico !== 'sem_imagens' && img.diagnostico !== 'sem_host') {
    issues.push({
      level: 'error', kind: 'imagens_quebradas', channel: 'email', subject: null,
      title: img.titulo,
      detail: img.detalhe,
      action: img.acao,
      href: '/settings/email',
    })
  }

  // ── Franquia do endereço compartilhado ──
  const al = input.allowance
  if (al?.onSharedDomain && al.allowance > 0) {
    if (al.remaining <= 0) {
      issues.push({
        level: 'error', kind: 'allowance_spent', channel: 'email', subject: input.sender.email,
        title: 'Franquia do endereço temporário esgotada',
        detail: `Os ${al.allowance.toLocaleString('pt-BR')} envios de campanha dos últimos 30 dias já foram usados. Novas campanhas em massa não saem.`,
        action: 'Verifique o domínio da sua loja para enviar sem limite.',
        href: '/settings/email',
      })
    } else if (al.remaining <= al.allowance * ALLOWANCE_LOW_FRACTION) {
      issues.push({
        level: 'warn', kind: 'allowance_low', channel: 'email', subject: input.sender.email,
        title: 'Franquia do endereço temporário acabando',
        detail: `Restam ${al.remaining.toLocaleString('pt-BR')} de ${al.allowance.toLocaleString('pt-BR')} envios de campanha nos últimos 30 dias.`,
        action: 'Verifique o domínio da sua loja antes da próxima campanha grande.',
        href: '/settings/email',
      })
    }
  }

  // ── Campanha agendada que vai bater no bloqueio ──
  // Descobrir isso no minuto do disparo é o pior momento possível.
  for (const c of input.scheduled || []) {
    // De onde a campanha VAI sair, não de onde ela foi criada: desde a
    // correção do remetente, um endereço temporário guardado no
    // agendamento cede lugar ao domínio próprio no momento do disparo.
    // Só há risco quando o remetente de hoje ainda é o compartilhado.
    if (!input.sender.onSharedDomain) break
    const wanted = Math.max(0, Number(c.total_recipients) || 0)
    const willFail = al.remaining <= 0 || (wanted > 0 && wanted > al.remaining)
    if (!willFail) continue
    issues.push({
      level: 'error', kind: 'scheduled_blocked', channel: 'email', subject: c.name || 'Campanha agendada',
      title: 'Campanha agendada não vai sair',
      detail: `"${c.name || 'Sem nome'}" está agendada no endereço temporário${wanted > 0 ? ` para ${wanted.toLocaleString('pt-BR')} contatos` : ''} e a franquia ${al.remaining <= 0 ? 'já acabou' : `só cobre ${al.remaining.toLocaleString('pt-BR')}`}.`,
      action: 'Verifique o domínio da sua loja antes do horário agendado.',
      href: '/settings/email',
    })
  }

  // ── Reputação dos últimos 30 dias ──
  const sent = Math.max(0, Number(input.rates?.sent) || 0)
  if (sent >= MIN_VOLUME_FOR_RATES) {
    const bounce = (Number(input.rates.bounced) || 0) / sent
    const complaint = (Number(input.rates.complained) || 0) / sent
    if (bounce >= BOUNCE_WARN) {
      issues.push({
        level: bounce >= BOUNCE_ERROR ? 'error' : 'warn', kind: 'bounce_high', channel: 'email', subject: null,
        title: `Rejeição em ${pctLabel(bounce)}`,
        detail: `${input.rates.bounced.toLocaleString('pt-BR')} de ${sent.toLocaleString('pt-BR')} envios voltaram nos últimos 30 dias. Acima de ${pctLabel(BOUNCE_ERROR)} os provedores começam a recusar o domínio inteiro.`,
        action: 'Pare de importar listas antigas e ligue a validação na entrada, em Entregabilidade.',
        href: '/email/deliverability',
      })
    }
    if (complaint >= COMPLAINT_WARN) {
      issues.push({
        level: complaint >= COMPLAINT_ERROR ? 'error' : 'warn', kind: 'complaint_high', channel: 'email', subject: null,
        title: `Marcações de spam em ${pctLabel(complaint)}`,
        detail: `${input.rates.complained.toLocaleString('pt-BR')} pessoas marcaram como spam nos últimos 30 dias. Gmail e Yahoo pedem menos de ${pctLabel(COMPLAINT_WARN)}.`,
        action: 'Envie menos para quem não abre há meses e deixe o descadastro visível no topo.',
        href: '/email/deliverability',
      })
    }
  }

  // ── Aquecimento: o limite do dia já batido ──
  for (const d of verified) {
    const cap = Number(d.warmup_daily_limit) || 0
    const usedToday = Number(d.total_sent_today) || 0
    if (d.warmup_enabled && cap > 0 && usedToday >= cap) {
      issues.push({
        level: 'warn', kind: 'warmup_cap', channel: 'email', subject: d.domain,
        title: 'Limite de aquecimento atingido hoje',
        detail: `${d.domain} já enviou ${usedToday.toLocaleString('pt-BR')} de ${cap.toLocaleString('pt-BR')} mensagens do dia. O resto fica na fila para amanhã.`,
        action: 'É o esperado durante o aquecimento; se precisa de mais hoje, ajuste o plano em Entregabilidade.',
        href: '/email/deliverability',
      })
    }
  }

  // ── WhatsApp ──
  for (const w of input.whatsapp || []) {
    const label = w.label || 'Número do WhatsApp'
    const inactive = w.status && !['active', 'connected', 'verified'].includes(String(w.status).toLowerCase())

    if (w.token_invalid_at || (w.last_health_status && String(w.last_health_status).toLowerCase().includes('invalid'))) {
      issues.push({
        level: 'error', kind: 'wa_token_invalid', channel: 'whatsapp', subject: label,
        title: 'Token do WhatsApp inválido',
        detail: 'A Meta recusou o token deste número: nenhuma mensagem sai e nenhuma entra.',
        action: 'Refaça a conexão em Configurações do WhatsApp para gerar um token novo.',
        href: '/whatsapp/settings',
      })
    } else {
      const h = hoursSince(w.last_health_expires_at, now)
      // h negativo = ainda vai vencer; -24*7 é "vence em 7 dias".
      if (h !== null && h < 0 && h > -24 * TOKEN_EXPIRY_WARN_DAYS) {
        const days = Math.max(0, Math.round(-h / 24))
        issues.push({
          level: 'warn', kind: 'wa_token_expiring', channel: 'whatsapp', subject: label,
          title: `Token do WhatsApp vence em ${days} ${days === 1 ? 'dia' : 'dias'}`,
          detail: 'Quando vencer, o envio e o recebimento param juntos, sem aviso da Meta.',
          action: 'Renove a conexão em Configurações do WhatsApp antes do vencimento.',
          href: '/whatsapp/settings',
        })
      }
    }

    if (!inactive) {
      const silence = hoursSince(w.last_webhook_at, now)
      if (w.webhook_configured === false) {
        issues.push({
          level: 'error', kind: 'wa_webhook_off', channel: 'whatsapp', subject: label,
          title: 'Webhook do WhatsApp desligado',
          detail: 'O envio continua funcionando e NADA entra: nem mensagem de cliente, nem recibo de entrega.',
          action: 'Reative a inscrição do app em Configurações do WhatsApp.',
          href: '/whatsapp/settings',
        })
      } else if (silence !== null && silence > 24 * WEBHOOK_SILENCE_DAYS) {
        issues.push({
          level: 'warn', kind: 'wa_webhook_silent', channel: 'whatsapp', subject: label,
          title: `Nada entra pelo WhatsApp há ${Math.round(silence / 24)} dias`,
          detail: 'Pode ser silêncio real dos clientes ou a inscrição do app ter caído — de fora, os dois parecem iguais.',
          action: 'Mande uma mensagem para o número e veja se ela aparece na caixa de entrada.',
          href: '/whatsapp/inbox',
        })
      }
    }

    const q = String(w.quality_rating || '').toUpperCase()
    if (q === 'RED') {
      issues.push({
        level: 'error', kind: 'wa_quality_red', channel: 'whatsapp', subject: label,
        title: 'Qualidade do número em vermelho',
        detail: 'A Meta reduz o limite diário e pode bloquear o número. Isso vem de bloqueios e denúncias de quem recebe.',
        action: 'Pare as campanhas deste número por alguns dias e envie só para quem falou com você.',
        href: '/whatsapp/settings',
      })
    } else if (q === 'YELLOW') {
      issues.push({
        level: 'warn', kind: 'wa_quality_yellow', channel: 'whatsapp', subject: label,
        title: 'Qualidade do número em amarelo',
        detail: 'Um passo antes do vermelho, que corta o limite diário. Costuma ser template genérico para lista fria.',
        action: 'Reduza o volume e revise o texto dos templates de marketing.',
        href: '/whatsapp/templates',
      })
    }
  }

  const order: Record<HealthLevel, number> = { error: 0, warn: 1 }
  issues.sort((a, b) => order[a.level] - order[b.level] || a.kind.localeCompare(b.kind))
  return issues
}
