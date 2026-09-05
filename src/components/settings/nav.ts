// Navegação das Configurações — grupos e itens do desenho, com as rotas
// reais do app. As telas que existiam antes e não estão no desenho
// (Webhooks, Credenciais, Custos e taxas, Uso de IA) entram no grupo
// mais próximo para nenhuma funcionalidade se perder.

export interface SettingsNavItem {
  href: string
  label: string
  icon: string
  /** Palavras extras para a busca da página ("senha", "dns"…). */
  kw?: string[]
}

export interface SettingsNavGroup {
  group: string
  items: SettingsNavItem[]
}

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    group: 'Conta',
    items: [
      { href: '/settings/account', label: 'Perfil', icon: 'aud', kw: ['nome', 'e-mail', 'telefone', 'foto', 'idioma', 'fuso', 'tema', 'escuro'] },
      { href: '/settings/organization', label: 'Organização', icon: 'store', kw: ['empresa', 'cnpj', 'endereço', 'lojas', 'moeda', 'excluir'] },
      { href: '/settings/brand', label: 'Marca', icon: 'media', kw: ['logo', 'cores', 'fonte', 'tipografia', 'rodapé'] },
      { href: '/settings/users', label: 'Equipe e permissões', icon: 'aud', kw: ['membros', 'convidar', 'funções', 'papéis'] },
      { href: '/settings/security', label: 'Segurança', icon: 'gear', kw: ['senha', '2fa', 'duas etapas', 'sessões', 'login'] },
      { href: '/settings/notifications', label: 'Notificações', icon: 'bell', kw: ['alertas', 'whatsapp', 'e-mail', 'resumo'] },
    ],
  },
  {
    group: 'Plano',
    items: [
      { href: '/settings/billing', label: 'Plano e uso', icon: 'chart', kw: ['limite', 'upgrade', 'assinatura', 'consumo'] },
      { href: '/settings/billing/invoices', label: 'Faturas e pagamento', icon: 'tag', kw: ['cartão', 'cobrança', 'nota', 'boleto', 'stripe'] },
      { href: '/settings/ai-usage', label: 'Uso de IA', icon: 'ia', kw: ['tokens', 'modelo', 'custo', 'openai', 'anthropic'] },
    ],
  },
  {
    group: 'Envio',
    items: [
      { href: '/settings/email', label: 'Domínios e remetente', icon: 'mail', kw: ['dns', 'dkim', 'spf', 'dmarc', 'remetente', 'reply', 'warm-up', 'aquecimento', 'links'] },
      { href: '/settings/deliverability', label: 'Entregabilidade', icon: 'send', kw: ['spam', 'bounce', 'rejeição', 'inbox', 'higiene'] },
      { href: '/settings/sending-rules', label: 'Regras de envio', icon: 'flow', kw: ['silêncio', 'frequência', 'limite', 'horário'] },
      { href: '/settings/utm', label: 'Parâmetros UTM', icon: 'link', kw: ['analytics', 'utm_source', 'google', 'rastreio de links'] },
    ],
  },
  {
    group: 'Dados',
    items: [
      { href: '/settings/tracking', label: 'Rastreamento', icon: 'chart', kw: ['pixel', 'eventos', 'shopify', 'extensão'] },
      { href: '/settings/attribution', label: 'Atribuição', icon: 'recover', kw: ['janela', 'último toque', 'primeiro toque', 'receita'] },
      { href: '/settings/lgpd', label: 'Privacidade e LGPD', icon: 'form', kw: ['consentimento', 'opt-in', 'retenção', 'dpo', 'exclusão'] },
      { href: '/settings/taxes', label: 'Custos e taxas', icon: 'dollar', kw: ['impostos', 'gateway', 'frete', 'margem', 'lucro'] },
    ],
  },
  {
    group: 'Desenvolvedor',
    items: [
      { href: '/settings/api', label: 'Chaves de API', icon: 'integ', kw: ['token', 'api key', 'integração'] },
      { href: '/settings/webhooks', label: 'Webhooks', icon: 'zap', kw: ['endpoint', 'eventos', 'hmac', 'entregas'] },
      { href: '/settings/credentials', label: 'Credenciais', icon: 'key', kw: ['segredos', 'oauth', 'twilio', 'resend'] },
      { href: '/settings/variables', label: 'Variáveis', icon: 'list', kw: ['merge tags', 'personalização', 'campos', 'propriedades'] },
    ],
  },
]

export const ALL_SETTINGS_ITEMS = SETTINGS_NAV.flatMap((g) => g.items)

/** Item ativo: o href mais longo que casa com o caminho atual. */
export function activeSettingsItem(pathname: string): SettingsNavItem | null {
  let best: SettingsNavItem | null = null
  for (const item of ALL_SETTINGS_ITEMS) {
    if (pathname === item.href || pathname.startsWith(item.href + '/')) {
      if (!best || item.href.length > best.href.length) best = item
    }
  }
  return best
}
