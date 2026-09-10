import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildSendingIssues, type SendingHealthInput } from '../health'

const NOW = new Date('2026-09-09T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600000).toISOString()
const daysAhead = (d: number) => new Date(NOW.getTime() + d * 86400000).toISOString()

function input(patch: Partial<SendingHealthInput> = {}): SendingHealthInput {
  return {
    sender: { email: 'loja@minhaloja.com.br', onSharedDomain: false },
    domains: [{ domain: 'minhaloja.com.br', status: 'verified', verified_at: hoursAgo(200) }],
    allowance: { onSharedDomain: false, used: 0, allowance: 1000, remaining: Infinity },
    scheduled: [],
    rates: { sent: 0, bounced: 0, complained: 0 },
    whatsapp: [],
    now: NOW,
    ...patch,
  }
}

const kinds = (i: SendingHealthInput) => buildSendingIssues(i).map((x) => x.kind)

describe('saúde do envio · a casa em ordem', () => {
  it('domínio verificado, sem franquia e sem WhatsApp: nada a dizer', () => {
    expect(buildSendingIssues(input())).toEqual([])
  })

  it('volume pequeno não vira taxa: 1 rejeição em 20 envios não diz nada', () => {
    expect(kinds(input({ rates: { sent: 20, bounced: 1, complained: 1 } }))).toEqual([])
  })
})

describe('saúde do envio · domínio', () => {
  it('domínio que já esteve verificado e caiu é erro, não aviso', () => {
    const out = buildSendingIssues(input({
      domains: [{ domain: 'minhaloja.com.br', status: 'failed', verified_at: hoursAgo(500) }],
    }))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ kind: 'domain_broke', level: 'error', channel: 'email', subject: 'minhaloja.com.br' })
    expect(out[0].href).toBe('/settings/email')
  })

  it('domínio pendente só reclama depois de um dia', () => {
    const pendente = (h: number) => input({
      domains: [{ domain: 'nova.com.br', status: 'pending', created_at: hoursAgo(h) }],
    })
    expect(kinds(pendente(3))).toEqual([])
    expect(kinds(pendente(30))).toEqual(['domain_pending'])
  })

  it('sem domínio próprio, o aviso é o convite — e some quando já existe um pendente', () => {
    expect(kinds(input({
      domains: [],
      sender: { email: 'loja@worder.email', onSharedDomain: true },
      allowance: { onSharedDomain: true, used: 0, allowance: 1000, remaining: 1000 },
    }))).toEqual(['sender_shared'])

    // Com um domínio a caminho, repetir "verifique seu domínio" é ruído.
    expect(kinds(input({
      domains: [{ domain: 'nova.com.br', status: 'pending', created_at: hoursAgo(30) }],
      sender: { email: 'loja@worder.email', onSharedDomain: true },
      allowance: { onSharedDomain: true, used: 0, allowance: 1000, remaining: 1000 },
    }))).toEqual(['domain_pending'])
  })

  it('limite de aquecimento batido é aviso, e só para domínio verificado', () => {
    const out = buildSendingIssues(input({
      domains: [{ domain: 'minhaloja.com.br', status: 'verified', verified_at: hoursAgo(200), warmup_enabled: true, warmup_daily_limit: 500, total_sent_today: 500 }],
    }))
    expect(out.map((x) => x.kind)).toEqual(['warmup_cap'])
    expect(out[0].level).toBe('warn')
  })
})

describe('saúde do envio · franquia do endereço temporário', () => {
  const shared = (remaining: number, extra: Partial<SendingHealthInput> = {}) => input({
    domains: [],
    sender: { email: 'loja@worder.email', onSharedDomain: true },
    allowance: { onSharedDomain: true, used: 1000 - remaining, allowance: 1000, remaining },
    ...extra,
  })

  it('acabou vira erro; acabando vira aviso; sobrando não vira nada', () => {
    expect(kinds(shared(0))).toContain('allowance_spent')
    expect(kinds(shared(150))).toContain('allowance_low')
    expect(kinds(shared(900))).not.toContain('allowance_low')
  })

  it('campanha agendada maior que o que resta é sinalizada antes da meia-noite', () => {
    const out = buildSendingIssues(shared(200, {
      scheduled: [{ id: 'c1', name: 'Black Friday', scheduled_at: daysAhead(2), from_email: 'loja@worder.email', total_recipients: 5000 }],
    }))
    const blocked = out.find((x) => x.kind === 'scheduled_blocked')!
    expect(blocked.level).toBe('error')
    expect(blocked.detail).toContain('Black Friday')
    expect(blocked.detail).toContain('5.000')
  })

  it('campanha que cabe na franquia não é sinalizada', () => {
    expect(kinds(shared(5000, {
      scheduled: [{ id: 'c1', name: 'Novidades', scheduled_at: daysAhead(1), from_email: 'loja@worder.email', total_recipients: 300 }],
    }))).not.toContain('scheduled_blocked')
  })

  it('com domínio próprio, o agendamento antigo no endereço temporário não é problema', () => {
    // O disparo troca o remetente congelado pelo domínio verificado.
    expect(kinds(input({
      scheduled: [{ id: 'c1', name: 'Antiga', scheduled_at: daysAhead(1), from_email: 'loja@worder.email', total_recipients: 90000 }],
    }))).toEqual([])
  })
})

describe('saúde do envio · reputação', () => {
  it('rejeição alta é erro acima de 5% e aviso acima de 2%', () => {
    const out5 = buildSendingIssues(input({ rates: { sent: 1000, bounced: 60, complained: 0 } }))
    expect(out5[0]).toMatchObject({ kind: 'bounce_high', level: 'error' })
    const out2 = buildSendingIssues(input({ rates: { sent: 1000, bounced: 25, complained: 0 } }))
    expect(out2[0]).toMatchObject({ kind: 'bounce_high', level: 'warn' })
  })

  it('spam acima de 0,3% é erro; acima de 0,1% é aviso', () => {
    expect(buildSendingIssues(input({ rates: { sent: 10000, bounced: 0, complained: 40 } }))[0])
      .toMatchObject({ kind: 'complaint_high', level: 'error' })
    expect(buildSendingIssues(input({ rates: { sent: 10000, bounced: 0, complained: 15 } }))[0])
      .toMatchObject({ kind: 'complaint_high', level: 'warn' })
  })
})

describe('saúde do envio · WhatsApp', () => {
  const wa = (patch: Partial<SendingHealthInput['whatsapp'][number]>) => input({
    whatsapp: [{ id: 'w1', label: '+55 11 90000-0000', status: 'active', webhook_configured: true, last_webhook_at: hoursAgo(2), ...patch }],
  })

  it('token recusado pela Meta é erro', () => {
    const out = buildSendingIssues(wa({ token_invalid_at: hoursAgo(5) }))
    expect(out[0]).toMatchObject({ kind: 'wa_token_invalid', level: 'error', channel: 'whatsapp' })
  })

  it('token perto de vencer avisa; token com prazo longo não', () => {
    expect(kinds(wa({ last_health_expires_at: daysAhead(3) }))).toEqual(['wa_token_expiring'])
    expect(kinds(wa({ last_health_expires_at: daysAhead(60) }))).toEqual([])
  })

  it('token já inválido não repete o aviso de vencimento', () => {
    expect(kinds(wa({ token_invalid_at: hoursAgo(1), last_health_expires_at: daysAhead(2) })))
      .toEqual(['wa_token_invalid'])
  })

  it('webhook desligado é erro: sai mensagem e não entra nada', () => {
    const out = buildSendingIssues(wa({ webhook_configured: false }))
    expect(out[0].kind).toBe('wa_webhook_off')
    expect(out[0].detail).toContain('NADA entra')
  })

  it('silêncio longo de entrada é aviso, não erro', () => {
    expect(kinds(wa({ last_webhook_at: hoursAgo(24 * 5) }))).toEqual(['wa_webhook_silent'])
  })

  it('conta inativa não gera aviso de webhook', () => {
    expect(kinds(wa({ status: 'disconnected', webhook_configured: false }))).toEqual([])
  })

  it('qualidade vermelha é erro; amarela é aviso', () => {
    expect(kinds(wa({ quality_rating: 'RED' }))).toEqual(['wa_quality_red'])
    expect(kinds(wa({ quality_rating: 'YELLOW' }))).toEqual(['wa_quality_yellow'])
    expect(kinds(wa({ quality_rating: 'GREEN' }))).toEqual([])
  })
})

describe('saúde do envio · ordem', () => {
  it('erro vem antes de aviso, para o que precisa de ação hoje aparecer primeiro', () => {
    const out = buildSendingIssues(input({
      domains: [{ domain: 'minhaloja.com.br', status: 'failed', verified_at: hoursAgo(500) }],
      rates: { sent: 1000, bounced: 25, complained: 0 },
      whatsapp: [{ id: 'w1', label: 'n', status: 'active', webhook_configured: false, quality_rating: 'YELLOW' }],
    }))
    const levels = out.map((x) => x.level)
    expect(levels).toEqual([...levels].sort((a, b) => (a === 'error' ? 0 : 1) - (b === 'error' ? 0 : 1)))
    expect(out.filter((x) => x.level === 'error').map((x) => x.kind).sort())
      .toEqual(['domain_broke', 'wa_webhook_off'])
  })
})

describe('saúde do envio · de onde saem os links', () => {
  it('link saindo do host do painel é ponto de atenção', () => {
    const out = buildSendingIssues(input({ trackingHost: { url: 'https://app.worder.com.br', source: 'app' } }))
    expect(out.map((x) => x.kind)).toEqual(['tracking_host_app'])
    expect(out[0].level).toBe('warn')
    expect(out[0].href).toBe('/settings/email')
  })

  it('com o padrão da plataforma e domínio próprio verificado, sugere alinhar os dois', () => {
    const out = buildSendingIssues(input({ trackingHost: { url: 'https://click.worder.com.br', source: 'platform' } }))
    expect(out.map((x) => x.kind)).toEqual(['tracking_host_shared'])
  })

  it('com o padrão da plataforma e SEM domínio próprio, não enche o lojista', () => {
    // Quem ainda nem verificou o domínio de envio já tem o convite certo
    // (sender_shared); dois avisos sobre a mesma coisa é ruído.
    const out = buildSendingIssues(input({
      domains: [],
      sender: { email: 'loja@worder.email', onSharedDomain: true },
      allowance: { onSharedDomain: true, used: 0, allowance: 1000, remaining: 1000 },
      trackingHost: { url: 'https://click.worder.com.br', source: 'platform' },
    }))
    expect(out.map((x) => x.kind)).toEqual(['sender_shared'])
  })

  it('com o domínio de links da própria loja, nada a dizer', () => {
    expect(buildSendingIssues(input({ trackingHost: { url: 'https://links.sualoja.com.br', source: 'store' } })))
      .toEqual([])
  })
})

describe('saúde do envio · o botão Resolver leva a algum lugar', () => {
  it('todo href aponta para uma tela que existe', () => {
    // Um aviso com botão morto é pior que aviso nenhum: o lojista clica,
    // cai num 404 e para de confiar no painel.
    const tudo = buildSendingIssues(input({
      domains: [
        { domain: 'quebrado.com.br', status: 'failed', verified_at: hoursAgo(500) },
        { domain: 'pendente.com.br', status: 'pending', created_at: hoursAgo(48) },
        { domain: 'ok.com.br', status: 'verified', verified_at: hoursAgo(100), warmup_enabled: true, warmup_daily_limit: 10, total_sent_today: 10 },
      ],
      sender: { email: 'loja@worder.email', onSharedDomain: true },
      allowance: { onSharedDomain: true, used: 1000, allowance: 1000, remaining: 0 },
      scheduled: [{ id: 'c1', name: 'Agendada', scheduled_at: daysAhead(1), from_email: 'loja@worder.email', total_recipients: 10 }],
      rates: { sent: 5000, bounced: 400, complained: 30 },
      whatsapp: [
        { id: 'w1', label: 'A', status: 'active', webhook_configured: false, quality_rating: 'RED', token_invalid_at: hoursAgo(1) },
        { id: 'w2', label: 'B', status: 'active', webhook_configured: true, last_webhook_at: hoursAgo(24 * 9), quality_rating: 'YELLOW' },
      ],
    }))
    // O fixture tem de exercitar as regras de verdade, senão o teste passa vazio.
    expect(tudo.length).toBeGreaterThanOrEqual(8)
    for (const issue of tudo) {
      if (!issue.href) continue
      const page = join(process.cwd(), 'src', 'app', '(dashboard)', issue.href, 'page.tsx')
      expect(existsSync(page), `${issue.kind} aponta para ${issue.href}, que não existe`).toBe(true)
    }
  })
})
