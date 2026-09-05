import { describe, it, expect } from 'vitest'
import {
  DEFAULT_UTM_SETTINGS,
  appendParamsToUrl,
  buildLinkParams,
  identificationParams,
  isStampableUrl,
  isValidCustomParamKey,
  makeLinkParamsResolver,
  normalizeUtmSettings,
  previewLinkUrl,
  resolveUtmTemplate,
  sampleLinkContext,
  stampHtmlLinks,
  stampTextLinks,
  utmSettingsFromLegacy,
  linkVariables,
  normalizeMessageUtmConfig,
  type LinkContext,
} from '../link-params'

const CAMPAIGN: LinkContext = {
  channel: 'email',
  messageType: 'campaign',
  campaignName: 'Black Friday',
  campaignId: 'camp-1',
  emailSubject: 'Até 50% OFF',
  abVariant: 'a',
  sendId: 'send-1',
  contactId: 'contact-1',
  storeName: 'Dr. Groot',
  storeDomain: 'https://drgroot.com/',
  sentAt: '2026-09-05T10:00:00Z',
}

const AUTOMATION: LinkContext = {
  channel: 'email',
  messageType: 'automation',
  automationName: 'Welcome Series',
  automationId: 'auto-1',
  messageName: 'Email 1',
  messageId: 'node-1',
  emailSubject: 'Bem-vindo',
  sendId: 'send-2',
  contactId: 'contact-2',
  sentAt: '2026-09-05T10:00:00Z',
}

function params(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url).searchParams.entries())
}

describe('padrões e variáveis (modelo Omnisend/Klaviyo)', () => {
  it('campanha sai com as seis UTMs preenchidas + identificação', () => {
    const { utm, ident } = buildLinkParams(DEFAULT_UTM_SETTINGS, CAMPAIGN)
    expect(utm).toEqual({
      utm_source: 'worder',
      utm_medium: 'email',
      utm_campaign: 'campaign: Black Friday (camp-1)',
      utm_content: 'camp-1',
      utm_term: '2026-09-05',
      utm_id: 'camp-1',
    })
    expect(ident).toEqual({
      worderContactID: 'contact-1',
      worderSendID: 'send-1',
      worderCampaignID: 'camp-1',
      worderMessageID: 'camp-1',
    })
  })

  it('automação rotula pelo fluxo e pelo nó, e o canal muda o utm_medium', () => {
    const { utm, ident } = buildLinkParams(DEFAULT_UTM_SETTINGS, { ...AUTOMATION, channel: 'whatsapp' })
    expect(utm.utm_medium).toBe('whatsapp')
    expect(utm.utm_campaign).toBe('automation: Welcome Series (auto-1)')
    expect(utm.utm_content).toBe('Email 1 (node-1)')
    expect(utm.utm_id).toBe('auto-1')
    expect(ident).toEqual({
      worderContactID: 'contact-2',
      worderSendID: 'send-2',
      worderAutomationID: 'auto-1',
      worderMessageID: 'node-1',
    })
  })

  it('variante B entra no message_id da campanha', () => {
    const vars = linkVariables({ ...CAMPAIGN, abVariant: 'b' })
    expect(vars.message_id).toBe('camp-1-b')
    expect(vars.message_name).toBe('Até 50% OFF')
    expect(vars.store_domain).toBe('drgroot.com')
  })

  it('template com variável desconhecida vira vazio e parênteses vazios somem', () => {
    const vars = linkVariables({ ...CAMPAIGN, campaignName: '' })
    expect(resolveUtmTemplate('campaign: {{campaign_name}} ({{campaign_id}})', vars)).toBe('campaign: (camp-1)')
    expect(resolveUtmTemplate('x {{nao_existe}} y', vars)).toBe('x y')
    expect(resolveUtmTemplate('{{campaign_name|"sem nome"}}', vars)).toBe('sem nome')
    expect(resolveUtmTemplate('{{campaign_name|campaign_id}}', vars)).toBe('camp-1')
  })

  it('merge tags soltas ({{first_name}}) também resolvem, e as nativas vencem', () => {
    const vars = linkVariables({ ...CAMPAIGN, extra: { first_name: 'Ana', channel: 'hackeado' } })
    expect(resolveUtmTemplate('{{first_name}}-{{channel}}', vars)).toBe('Ana-email')
  })

  it('valores são saneados: sem quebra de linha e no máximo 250 caracteres', () => {
    const vars = linkVariables({ ...CAMPAIGN, campaignName: 'a\nb\tc' + 'x'.repeat(400) })
    const v = resolveUtmTemplate('{{campaign_name}}', vars)
    expect(v.startsWith('a b c')).toBe(true)
    expect(v.length).toBe(250)
  })

  it('parâmetro vazio não vai para a URL (nada de utm_term=)', () => {
    const settings = normalizeUtmSettings({ campaign: { utm_term: '' } })
    const { utm } = buildLinkParams(settings, CAMPAIGN)
    expect('utm_term' in utm).toBe(false)
    expect(utm.utm_source).toBe('worder')
  })

  it('sobrescrita por mensagem vence o padrão, e desligar UTM mantém a identificação', () => {
    const { utm } = buildLinkParams(DEFAULT_UTM_SETTINGS, AUTOMATION, undefined, {
      utmOverrides: { utm_campaign: 'boas-vindas-{{message_name}}', utm_medium: '' },
    })
    expect(utm.utm_campaign).toBe('boas-vindas-Email 1')
    expect(utm.utm_medium).toBe('email') // override vazio não apaga o padrão

    const off = buildLinkParams(DEFAULT_UTM_SETTINGS, AUTOMATION, undefined, { utmDisabled: true })
    expect(off.utm).toEqual({})
    expect(off.ident.worderSendID).toBe('send-2')
  })

  it('parâmetros personalizados entram; nomes reservados são recusados', () => {
    const settings = normalizeUtmSettings({
      custom: [
        { key: 'utm_store', campaign: '{{store_name}}', automation: '{{store_name}}' },
        { key: 'worderContactID', campaign: 'x', automation: 'x' },
        { key: 'utm_source', campaign: 'x', automation: 'x' },
        { key: 'bad key', campaign: 'x', automation: 'x' },
        { key: 'utm_store', campaign: 'dup', automation: 'dup' },
      ],
    })
    expect(settings.custom).toEqual([{ key: 'utm_store', campaign: '{{store_name}}', automation: '{{store_name}}' }])
    expect(buildLinkParams(settings, CAMPAIGN).utm.utm_store).toBe('Dr. Groot')
    expect(isValidCustomParamKey('worderX')).toBe(false)
    expect(isValidCustomParamKey('utm_id')).toBe(false)
    expect(isValidCustomParamKey('ref')).toBe(true)
  })

  it('normalização: chave ausente = padrão, chave presente vazia = respeitada', () => {
    const s = normalizeUtmSettings({ enabled: false, automation: { utm_content: '' } })
    expect(s.enabled).toBe(false)
    expect(s.automation.utm_content).toBe('')
    expect(s.automation.utm_campaign).toBe(DEFAULT_UTM_SETTINGS.automation.utm_campaign)
    expect(s.campaign).toEqual(DEFAULT_UTM_SETTINGS.campaign)
  })

  it('configuração legada da organização (utm_source/utm_medium/utm_auto_add) é honrada', () => {
    const legacy = utmSettingsFromLegacy({ utm_source: 'minha-loja', utm_medium: 'newsletter', utm_auto_add: false })
    expect(legacy?.enabled).toBe(false)
    expect(legacy?.campaign.utm_source).toBe('minha-loja')
    expect(legacy?.automation.utm_medium).toBe('newsletter')
    expect(utmSettingsFromLegacy({ tracking_domain: 'x' })).toBeNull()
  })

  it('sobrescrita por campanha: só chaves preenchidas contam; vazio total vira null', () => {
    expect(normalizeMessageUtmConfig(null)).toBeNull()
    expect(normalizeMessageUtmConfig({})).toBeNull()
    expect(normalizeMessageUtmConfig({ overrides: { utm_source: '  ', utm_medium: '' } })).toBeNull()
    expect(normalizeMessageUtmConfig({ disabled: false, overrides: {} })).toBeNull()
    expect(normalizeMessageUtmConfig({ disabled: true })).toEqual({ disabled: true })
    expect(
      normalizeMessageUtmConfig({ overrides: { utm_campaign: 'bf-{{campaign_id}}', utm_bogus: 'x', utm_term: 42 } })
    ).toEqual({ overrides: { utm_campaign: 'bf-{{campaign_id}}' } })

    const cfg = normalizeMessageUtmConfig({ overrides: { utm_campaign: 'bf-2026' } })!
    const { utm } = buildLinkParams(DEFAULT_UTM_SETTINGS, CAMPAIGN, undefined, {
      utmOverrides: cfg.overrides,
      utmDisabled: cfg.disabled === true,
    })
    expect(utm.utm_campaign).toBe('bf-2026')
    expect(utm.utm_source).toBe('worder')
  })

  it('identificação: campanha leva worderCampaignID, automação leva worderAutomationID', () => {
    expect(identificationParams(CAMPAIGN)).not.toHaveProperty('worderAutomationID')
    expect(identificationParams(AUTOMATION)).not.toHaveProperty('worderCampaignID')
    expect(identificationParams({ channel: 'sms', messageType: 'automation' })).toEqual({})
  })
})

describe('carimbo de URL', () => {
  it('não sobrescreve o que o lojista já colocou e preserva o fragmento', () => {
    const out = appendParamsToUrl('https://loja.com/p?utm_source=instagram#topo', {
      utm_source: 'worder',
      utm_medium: 'email',
    })
    const u = new URL(out)
    expect(u.searchParams.get('utm_source')).toBe('instagram')
    expect(u.searchParams.get('utm_medium')).toBe('email')
    expect(u.hash).toBe('#topo')
  })

  it('URL inválida ou sem parâmetros novos volta intacta', () => {
    expect(appendParamsToUrl('nao-e-url', { a: '1' })).toBe('nao-e-url')
    expect(appendParamsToUrl('https://loja.com/?a=1', { a: '2' })).toBe('https://loja.com/?a=1')
  })

  it('só carimba destinos http(s) resolvidos fora do app/tracking', () => {
    const opts = { skipHosts: ['app.worder.com.br', 'click.drgroot.com'] }
    expect(isStampableUrl('https://drgroot.com/products/x', opts)).toBe(true)
    expect(isStampableUrl('mailto:oi@x.com', opts)).toBe(false)
    expect(isStampableUrl('tel:+55', opts)).toBe(false)
    expect(isStampableUrl('#topo', opts)).toBe(false)
    expect(isStampableUrl('https://drgroot.com/{{ checkout_url }}', opts)).toBe(false)
    expect(isStampableUrl('/products/x', opts)).toBe(false)
    expect(isStampableUrl('https://app.worder.com.br/preferences?token=1', opts)).toBe(false)
    expect(isStampableUrl('https://click.drgroot.com/api/t/c/1?url=x', opts)).toBe(false)
    expect(isStampableUrl('https://drgroot.com/unsubscribe?token=1', opts)).toBe(false)
  })
})

describe('stampHtmlLinks — todo link do e-mail sai completo', () => {
  const resolve = makeLinkParamsResolver(DEFAULT_UTM_SETTINGS, CAMPAIGN)

  it('carimba cada <a href> com UTM + identificação, mantendo &amp; válido no HTML', () => {
    const html =
      '<a href="https://drgroot.com/products/shampoo?variant=1&amp;ref=x">Comprar</a>' +
      '<a href="mailto:oi@drgroot.com">Fale</a>' +
      '<a href="https://app.worder.com.br/unsubscribe?token=abc">Sair</a>'
    const out = stampHtmlLinks(html, resolve, { skipHosts: ['app.worder.com.br'] })

    const hrefs = Array.from(out.matchAll(/href="([^"]+)"/g)).map((m) => m[1])
    expect(hrefs).toHaveLength(3)
    expect(hrefs[0]).not.toContain('&utm') // atributo continua com &amp;
    const p = params(hrefs[0].replace(/&amp;/g, '&'))
    expect(p.variant).toBe('1')
    expect(p.ref).toBe('x')
    expect(p.utm_source).toBe('worder')
    expect(p.utm_campaign).toBe('campaign: Black Friday (camp-1)')
    expect(p.utm_id).toBe('camp-1')
    expect(p.worderContactID).toBe('contact-1')
    expect(p.worderSendID).toBe('send-1')
    expect(p.worderCampaignID).toBe('camp-1')
    expect(hrefs[1]).toBe('mailto:oi@drgroot.com')
    expect(hrefs[2]).toBe('https://app.worder.com.br/unsubscribe?token=abc')
  })

  it('{{link_text}} e {{link_index}} resolvem por link (texto ou alt da imagem)', () => {
    const settings = normalizeUtmSettings({ campaign: { utm_content: '{{link_text}}', utm_term: '{{link_index}}' } })
    const r = makeLinkParamsResolver(settings, CAMPAIGN)
    const html =
      '<a href="https://drgroot.com/a"><span>Comprar <b>agora</b></span></a>' +
      '<a href="https://drgroot.com/b"><img src="x.png" alt="Banner"></a>'
    const out = stampHtmlLinks(html, r)
    const hrefs = Array.from(out.matchAll(/href="([^"]+)"/g)).map((m) => m[1].replace(/&amp;/g, '&'))
    expect(params(hrefs[0]).utm_content).toBe('Comprar agora')
    expect(params(hrefs[0]).utm_term).toBe('1')
    expect(params(hrefs[1]).utm_content).toBe('Banner')
    expect(params(hrefs[1]).utm_term).toBe('2')
  })

  it('UTM manual do lojista vence, mas a identificação entra mesmo assim', () => {
    const html = '<a href="https://drgroot.com/p?utm_source=instagram&amp;utm_campaign=co-promo">x</a>'
    const out = stampHtmlLinks(html, resolve)
    const p = params(out.match(/href="([^"]+)"/)![1].replace(/&amp;/g, '&'))
    expect(p.utm_source).toBe('instagram')
    expect(p.utm_campaign).toBe('co-promo')
    expect(p.utm_medium).toBe('email')
    expect(p.worderSendID).toBe('send-1')
  })

  it('é idempotente e cobre âncora sem fechamento', () => {
    const html = '<a href="https://drgroot.com/a">ok</a><a href="https://drgroot.com/b">quebrado'
    const once = stampHtmlLinks(html, resolve)
    const twice = stampHtmlLinks(once, resolve)
    expect(twice).toBe(once)
    const hrefs = Array.from(once.matchAll(/href="([^"]+)"/g)).map((m) => m[1].replace(/&amp;/g, '&'))
    expect(params(hrefs[1]).worderSendID).toBe('send-1')
    expect(params(hrefs[1]).utm_source).toBe('worder')
  })

  it('não toca em href com merge tag não resolvida', () => {
    const html = '<a href="{{ checkout_url }}">x</a><a href="https://drgroot.com/{{slug}}">y</a>'
    expect(stampHtmlLinks(html, resolve)).toBe(html)
  })
})

describe('stampTextLinks — SMS e WhatsApp', () => {
  it('carimba URLs soltas e deixa a pontuação final de fora', () => {
    const r = makeLinkParamsResolver(DEFAULT_UTM_SETTINGS, { ...AUTOMATION, channel: 'sms' })
    const out = stampTextLinks('Oi! Veja: https://drgroot.com/oferta. Ou https://drgroot.com/b?x=1, tchau', r)
    const urls = Array.from(out.matchAll(/https?:\/\/\S+?(?=[.,]\s|$)/g)).map((m) => m[0])
    expect(urls).toHaveLength(2)
    const p1 = params(urls[0])
    expect(p1.utm_medium).toBe('sms')
    expect(p1.utm_campaign).toBe('automation: Welcome Series (auto-1)')
    expect(p1.worderAutomationID).toBe('auto-1')
    expect(out).toContain('/oferta?utm_source=worder')
    expect(out).toMatch(/\. Ou https/)
    expect(params(urls[1]).x).toBe('1')
    expect(out.endsWith(', tchau')).toBe(true)
  })

  it('texto sem link ou com merge tag fica igual', () => {
    const r = makeLinkParamsResolver(DEFAULT_UTM_SETTINGS, AUTOMATION)
    expect(stampTextLinks('sem link', r)).toBe('sem link')
    expect(stampTextLinks('https://x.com/{{a}}', r)).toBe('https://x.com/{{a}}')
    expect(stampTextLinks('', r)).toBe('')
  })
})

describe('preview da tela de configurações', () => {
  it('monta uma URL de exemplo completa para campanha e automação', () => {
    const camp = params(previewLinkUrl(DEFAULT_UTM_SETTINGS, sampleLinkContext('campaign')))
    expect(camp.utm_campaign).toBe('campaign: Black Friday (3f2a9c1e-0000-4000-8000-000000000001)')
    expect(camp.worderCampaignID).toBeTruthy()
    const auto = params(previewLinkUrl(DEFAULT_UTM_SETTINGS, sampleLinkContext('automation', 'whatsapp')))
    expect(auto.utm_medium).toBe('whatsapp')
    expect(auto.utm_content).toBe('Email 1 (250a848e-0000-4000-8000-000000000005)')
    expect(auto.worderAutomationID).toBeTruthy()
  })
})
