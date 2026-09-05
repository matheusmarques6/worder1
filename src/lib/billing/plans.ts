// Tabela de planos e preços por uso exibida em Configurações → Plano e uso.
// Os limites técnicos vêm de PLAN_LIMITS (stripe.ts); aqui é o que o
// cliente vê para comparar.

export interface PlanCard {
  key: 'free' | 'starter' | 'pro' | 'business'
  label: string
  price: number // R$/mês
  features: string[]
  popular?: boolean
}

export const PLANS: PlanCard[] = [
  { key: 'free', label: 'Free', price: 0, features: ['1.000 e-mails/mês', '2.000 contatos', '200 WhatsApp/mês', 'Fluxos essenciais'] },
  { key: 'starter', label: 'Starter', price: 99, features: ['10.000 e-mails/mês', '10.000 contatos', '1.000 WhatsApp/mês', 'Teste A/B e agendamento'] },
  { key: 'pro', label: 'Pro', price: 299, features: ['50.000 e-mails/mês', '50.000 contatos', '5.000 WhatsApp/mês', 'Domínios ilimitados, atribuição multicanal'], popular: true },
  { key: 'business', label: 'Business', price: 799, features: ['200.000 e-mails/mês', '200.000 contatos', '20.000 WhatsApp/mês', 'API completa e gerente de conta'] },
]

export const PLAN_ORDER = ['free', 'starter', 'pro', 'business', 'enterprise']

export interface UsagePrice {
  key: 'whatsapp_marketing' | 'whatsapp_utility' | 'sms' | 'email_block'
  label: string
  help?: string
  price: number // R$
}

export const USAGE_PRICES: UsagePrice[] = [
  { key: 'whatsapp_marketing', label: 'WhatsApp — conversa de marketing', help: 'Tarifa Meta + taxa Worder', price: 0.42 },
  { key: 'whatsapp_utility', label: 'WhatsApp — conversa de utilidade', price: 0.18 },
  { key: 'sms', label: 'SMS', help: 'Por mensagem enviada', price: 0.09 },
  { key: 'email_block', label: 'E-mails adicionais', help: 'Por bloco de 1.000', price: 12 },
]
