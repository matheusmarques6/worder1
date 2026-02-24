// ============================================
// VARIABLE DEFINITIONS FOR PERSONALIZATION
// ============================================

export interface Variable {
  key: string;
  label: string;
  description: string;
  example: string;
  category: string;
  defaultValue?: string;
}

export interface VariableCategory {
  id: string;
  label: string;
  icon?: string;
  variables: Variable[];
}

// ============================================
// CONTACT VARIABLES (Available for all triggers)
// ============================================

export const CONTACT_VARIABLES: Variable[] = [
  { key: 'contact.first_name', label: 'Primeiro Nome', description: 'Primeiro nome do contato', example: 'João', category: 'contact', defaultValue: 'Cliente' },
  { key: 'contact.last_name', label: 'Sobrenome', description: 'Sobrenome do contato', example: 'Silva', category: 'contact', defaultValue: '' },
  { key: 'contact.full_name', label: 'Nome Completo', description: 'Nome completo do contato', example: 'João Silva', category: 'contact', defaultValue: 'Cliente' },
  { key: 'contact.email', label: 'E-mail', description: 'E-mail do contato', example: 'joao@email.com', category: 'contact' },
  { key: 'contact.phone', label: 'Telefone', description: 'Telefone do contato', example: '+5511999999999', category: 'contact' },
  { key: 'contact.whatsapp', label: 'WhatsApp', description: 'Número WhatsApp do contato', example: '+5511999999999', category: 'contact' },
  { key: 'contact.cpf', label: 'CPF', description: 'CPF do contato', example: '123.456.789-00', category: 'contact' },
  { key: 'contact.birthday', label: 'Aniversário', description: 'Data de nascimento', example: '15/03/1990', category: 'contact' },
  { key: 'contact.city', label: 'Cidade', description: 'Cidade do contato', example: 'São Paulo', category: 'contact' },
  { key: 'contact.state', label: 'Estado', description: 'Estado do contato', example: 'SP', category: 'contact' },
  { key: 'contact.address', label: 'Endereço', description: 'Endereço completo', example: 'Rua das Flores, 123', category: 'contact' },
  { key: 'contact.custom.*', label: 'Campo Personalizado', description: 'Campo customizado do contato', example: 'valor_custom', category: 'contact' },
];

// ============================================
// EVENT VARIABLES (Per trigger type)
// ============================================

export const ABANDONED_CART_VARIABLES: Variable[] = [
  { key: 'event.cart_id', label: 'ID do Carrinho', description: 'Identificador único do carrinho', example: 'cart_123', category: 'event' },
  { key: 'event.cart_url', label: 'URL do Carrinho', description: 'Link de recuperação do carrinho', example: 'https://loja.com/cart/abc', category: 'event' },
  { key: 'event.total_value', label: 'Valor Total', description: 'Valor total do carrinho', example: 'R$ 299,90', category: 'event' },
  { key: 'event.total_items', label: 'Total de Itens', description: 'Quantidade de itens no carrinho', example: '3', category: 'event' },
  { key: 'event.currency', label: 'Moeda', description: 'Moeda do carrinho', example: 'BRL', category: 'event' },
  { key: 'event.abandoned_at', label: 'Data do Abandono', description: 'Data/hora do abandono', example: '22/01/2025 14:30', category: 'event' },
  { key: 'event.items[0].name', label: 'Nome do 1º Produto', description: 'Nome do primeiro produto', example: 'Camiseta Azul', category: 'event' },
  { key: 'event.items[0].price', label: 'Preço do 1º Produto', description: 'Preço do primeiro produto', example: 'R$ 99,90', category: 'event' },
  { key: 'event.items[0].quantity', label: 'Qtd do 1º Produto', description: 'Quantidade do primeiro produto', example: '2', category: 'event' },
  { key: 'event.items[0].image_url', label: 'Imagem do 1º Produto', description: 'URL da imagem do primeiro produto', example: 'https://...', category: 'event' },
  { key: 'event.items[0].url', label: 'URL do 1º Produto', description: 'Link do primeiro produto', example: 'https://loja.com/produto', category: 'event' },
];

export const ORDER_VARIABLES: Variable[] = [
  { key: 'event.order_id', label: 'Número do Pedido', description: 'Número identificador do pedido', example: '#12345', category: 'event' },
  { key: 'event.order_status', label: 'Status do Pedido', description: 'Status atual do pedido', example: 'Aprovado', category: 'event' },
  { key: 'event.total_value', label: 'Valor Total', description: 'Valor total do pedido', example: 'R$ 499,90', category: 'event' },
  { key: 'event.subtotal', label: 'Subtotal', description: 'Subtotal do pedido', example: 'R$ 450,00', category: 'event' },
  { key: 'event.shipping_value', label: 'Valor do Frete', description: 'Valor do frete', example: 'R$ 49,90', category: 'event' },
  { key: 'event.discount_value', label: 'Valor do Desconto', description: 'Valor do desconto aplicado', example: 'R$ 50,00', category: 'event' },
  { key: 'event.coupon_code', label: 'Cupom Usado', description: 'Código do cupom utilizado', example: 'PROMO10', category: 'event' },
  { key: 'event.payment_method', label: 'Forma de Pagamento', description: 'Método de pagamento usado', example: 'Cartão de Crédito', category: 'event' },
  { key: 'event.tracking_code', label: 'Código de Rastreio', description: 'Código de rastreamento', example: 'BR123456789', category: 'event' },
  { key: 'event.tracking_url', label: 'URL de Rastreio', description: 'Link para rastrear pedido', example: 'https://...', category: 'event' },
  { key: 'event.created_at', label: 'Data do Pedido', description: 'Data/hora da criação', example: '22/01/2025 14:30', category: 'event' },
  { key: 'event.items[0].name', label: 'Nome do 1º Produto', description: 'Nome do primeiro produto', example: 'Camiseta Azul', category: 'event' },
  { key: 'event.items[0].price', label: 'Preço do 1º Produto', description: 'Preço do primeiro produto', example: 'R$ 99,90', category: 'event' },
  { key: 'event.items[0].quantity', label: 'Qtd do 1º Produto', description: 'Quantidade do primeiro produto', example: '2', category: 'event' },
  { key: 'event.items[0].sku', label: 'SKU do 1º Produto', description: 'SKU do primeiro produto', example: 'CAM-AZU-M', category: 'event' },
];

export const DEAL_VARIABLES: Variable[] = [
  { key: 'event.deal_id', label: 'ID do Deal', description: 'Identificador do deal', example: 'deal_123', category: 'event' },
  { key: 'event.deal_name', label: 'Nome do Deal', description: 'Nome/título do deal', example: 'Proposta para Cliente X', category: 'event' },
  { key: 'event.deal_value', label: 'Valor do Deal', description: 'Valor do deal', example: 'R$ 5.000,00', category: 'event' },
  { key: 'event.deal_stage', label: 'Estágio Atual', description: 'Estágio atual do deal', example: 'Proposta Enviada', category: 'event' },
  { key: 'event.pipeline_name', label: 'Nome do Pipeline', description: 'Nome do pipeline', example: 'Vendas B2B', category: 'event' },
  { key: 'event.expected_close_date', label: 'Data de Fechamento', description: 'Data prevista de fechamento', example: '30/01/2025', category: 'event' },
  { key: 'event.deal_owner', label: 'Responsável', description: 'Vendedor responsável', example: 'Maria Santos', category: 'event' },
];

export const WHATSAPP_VARIABLES: Variable[] = [
  { key: 'event.message_text', label: 'Texto da Mensagem', description: 'Conteúdo da mensagem recebida', example: 'Olá, gostaria de mais informações', category: 'event' },
  { key: 'event.message_type', label: 'Tipo da Mensagem', description: 'Tipo da mensagem (text, image, etc)', example: 'text', category: 'event' },
  { key: 'event.sender_name', label: 'Nome do Remetente', description: 'Nome de quem enviou', example: 'João Silva', category: 'event' },
  { key: 'event.sender_phone', label: 'Telefone do Remetente', description: 'Telefone de quem enviou', example: '+5511999999999', category: 'event' },
  { key: 'event.received_at', label: 'Data de Recebimento', description: 'Data/hora do recebimento', example: '22/01/2025 14:30', category: 'event' },
];

export const SIGNUP_VARIABLES: Variable[] = [
  { key: 'event.source', label: 'Origem', description: 'De onde veio o cadastro', example: 'Formulário Site', category: 'event' },
  { key: 'event.form_name', label: 'Nome do Formulário', description: 'Nome do formulário preenchido', example: 'Newsletter', category: 'event' },
  { key: 'event.created_at', label: 'Data do Cadastro', description: 'Data/hora do cadastro', example: '22/01/2025 14:30', category: 'event' },
  { key: 'event.tags', label: 'Tags Iniciais', description: 'Tags adicionadas no cadastro', example: 'lead, newsletter', category: 'event' },
];

export const TAG_VARIABLES: Variable[] = [
  { key: 'event.tag_name', label: 'Nome da Tag', description: 'Nome da tag adicionada/removida', example: 'VIP', category: 'event' },
  { key: 'event.tag_id', label: 'ID da Tag', description: 'Identificador da tag', example: 'tag_123', category: 'event' },
  { key: 'event.added_at', label: 'Data da Adição', description: 'Data/hora da adição', example: '22/01/2025 14:30', category: 'event' },
];

export const WEBHOOK_VARIABLES: Variable[] = [
  { key: 'event.payload', label: 'Payload Completo', description: 'Dados completos do webhook', example: '{ ... }', category: 'event' },
  { key: 'event.source', label: 'Origem', description: 'De onde veio o webhook', example: 'Shopify', category: 'event' },
  { key: 'event.type', label: 'Tipo do Evento', description: 'Tipo do evento do webhook', example: 'order.created', category: 'event' },
];

// ============================================
// ORGANIZATION VARIABLES
// ============================================

export const ORGANIZATION_VARIABLES: Variable[] = [
  { key: 'organization.name', label: 'Nome da Empresa', description: 'Nome da sua empresa', example: 'Minha Loja', category: 'organization' },
  { key: 'organization.email', label: 'E-mail da Empresa', description: 'E-mail principal', example: 'contato@minhaloja.com', category: 'organization' },
  { key: 'organization.phone', label: 'Telefone da Empresa', description: 'Telefone principal', example: '+5511999999999', category: 'organization' },
  { key: 'organization.website', label: 'Site', description: 'URL do site', example: 'https://minhaloja.com', category: 'organization' },
  { key: 'organization.logo_url', label: 'Logo', description: 'URL do logo', example: 'https://...', category: 'organization' },
];

// ============================================
// DATE/TIME VARIABLES
// ============================================

export const DATE_VARIABLES: Variable[] = [
  { key: 'now.date', label: 'Data Atual', description: 'Data de hoje', example: '22/01/2025', category: 'date' },
  { key: 'now.time', label: 'Hora Atual', description: 'Hora atual', example: '14:30', category: 'date' },
  { key: 'now.day', label: 'Dia do Mês', description: 'Dia atual do mês', example: '22', category: 'date' },
  { key: 'now.month', label: 'Mês Atual', description: 'Mês atual', example: 'Janeiro', category: 'date' },
  { key: 'now.year', label: 'Ano Atual', description: 'Ano atual', example: '2025', category: 'date' },
  { key: 'now.weekday', label: 'Dia da Semana', description: 'Dia da semana atual', example: 'Quarta-feira', category: 'date' },
];

// ============================================
// GET VARIABLES BY TRIGGER TYPE
// ============================================

export function getVariablesByTriggerType(triggerType: string): VariableCategory[] {
  const categories: VariableCategory[] = [
    {
      id: 'contact',
      label: 'Contato',
      icon: '👤',
      variables: CONTACT_VARIABLES,
    },
    {
      id: 'organization',
      label: 'Empresa',
      icon: '🏢',
      variables: ORGANIZATION_VARIABLES,
    },
    {
      id: 'date',
      label: 'Data/Hora',
      icon: '📅',
      variables: DATE_VARIABLES,
    },
  ];

  // Add event-specific variables based on trigger
  let eventVariables: Variable[] = [];
  let eventLabel = 'Evento';
  let eventIcon = '⚡';

  switch (triggerType) {
    case 'trigger_abandon':
      eventVariables = ABANDONED_CART_VARIABLES;
      eventLabel = 'Carrinho Abandonado';
      eventIcon = '🛒';
      break;
    case 'trigger_order':
    case 'trigger_order_paid':
      eventVariables = ORDER_VARIABLES;
      eventLabel = 'Pedido';
      eventIcon = '📦';
      break;
    case 'trigger_deal_created':
    case 'trigger_deal_stage':
    case 'trigger_deal_won':
    case 'trigger_deal_lost':
      eventVariables = DEAL_VARIABLES;
      eventLabel = 'Deal';
      eventIcon = '💼';
      break;
    case 'trigger_whatsapp':
      eventVariables = WHATSAPP_VARIABLES;
      eventLabel = 'Mensagem WhatsApp';
      eventIcon = '💬';
      break;
    case 'trigger_signup':
      eventVariables = SIGNUP_VARIABLES;
      eventLabel = 'Cadastro';
      eventIcon = '👋';
      break;
    case 'trigger_tag':
      eventVariables = TAG_VARIABLES;
      eventLabel = 'Tag';
      eventIcon = '🏷️';
      break;
    case 'trigger_webhook':
      eventVariables = WEBHOOK_VARIABLES;
      eventLabel = 'Webhook';
      eventIcon = '🔗';
      break;
    default:
      eventVariables = [];
  }

  if (eventVariables.length > 0) {
    categories.unshift({
      id: 'event',
      label: eventLabel,
      icon: eventIcon,
      variables: eventVariables,
    });
  }

  return categories;
}

// ============================================
// PARSE VARIABLE STRING
// ============================================

export function formatVariableForInsert(key: string): string {
  return `{{ ${key} }}`;
}

export function formatVariableWithDefault(key: string, defaultValue: string): string {
  return `{{ ${key}|default:'${defaultValue}' }}`;
}

export function extractVariablesFromText(text: string): string[] {
  const regex = /\{\{\s*([^}|]+)(?:\|[^}]*)?\s*\}\}/g;
  const matches = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1].trim());
  }

  return matches;
}
