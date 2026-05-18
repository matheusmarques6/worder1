// Field catalog — the source of truth for what shows up in the segment
// builder's field picker. Each entry declares:
//  - the column / event it maps to
//  - its data type (drives which operators the UI offers)
//  - the category (drives the picker's grouping)
//  - a human label and optional enum values
//
// Used by:
//   - the UI builder (FieldPicker, OperatorPicker, ValueInput)
//   - the resolver (v2 path: column→SQL mapping)
//   - the AI generator (system prompt enumerates this catalog so the LLM
//     only produces valid field references)

import type { FieldType, StringOperator, NumberOperator, DateOperator, BooleanOperator, EnumOperator, StringArrayOperator } from './dsl';

export type FieldCategory =
  | 'identity'
  | 'location'
  | 'engagement'
  | 'consent'
  | 'commerce'
  | 'predictive'
  | 'custom'
  | 'source'
  | 'event'
  | 'membership';

export type FieldDef = {
  key: string;                  // canonical identifier used in rules
  label: string;                // display name (PT-BR)
  category: FieldCategory;
  type: FieldType;
  // SQL hint — how the resolver should reach the data.
  source:
    | { kind: 'contact_column'; column: string }
    | { kind: 'contact_jsonb'; column: string; path: string[] }
    | { kind: 'event'; event_type: string };
  enumValues?: Array<{ value: string; label: string }>;
  description?: string;
  // For events: list of property paths a sub-filter can target.
  eventProperties?: Array<{ path: string; label: string; type: FieldType }>;
};

export const FIELD_CATALOG: FieldDef[] = [
  // ────────── IDENTIDADE ──────────
  { key: 'email',       label: 'Email',       category: 'identity', type: 'string',
    source: { kind: 'contact_column', column: 'email' } },
  { key: 'first_name',  label: 'Primeiro nome', category: 'identity', type: 'string',
    source: { kind: 'contact_column', column: 'first_name' } },
  { key: 'last_name',   label: 'Sobrenome',   category: 'identity', type: 'string',
    source: { kind: 'contact_column', column: 'last_name' } },
  { key: 'phone',       label: 'Telefone',    category: 'identity', type: 'string',
    source: { kind: 'contact_column', column: 'phone' } },

  // ────────── LOCALIZAÇÃO ──────────
  { key: 'country',     label: 'País',        category: 'location', type: 'string',
    source: { kind: 'contact_column', column: 'country' } },
  { key: 'state',       label: 'Estado',      category: 'location', type: 'string',
    source: { kind: 'contact_column', column: 'state' } },
  { key: 'city',        label: 'Cidade',      category: 'location', type: 'string',
    source: { kind: 'contact_column', column: 'city' } },
  { key: 'zip',         label: 'CEP',         category: 'location', type: 'string',
    source: { kind: 'contact_column', column: 'zip' } },
  { key: 'timezone',    label: 'Fuso horário', category: 'location', type: 'string',
    source: { kind: 'contact_column', column: 'timezone' } },

  // ────────── ENGAJAMENTO ──────────
  { key: 'lifecycle_stage', label: 'Estágio do ciclo', category: 'engagement', type: 'enum',
    source: { kind: 'contact_column', column: 'lifecycle_stage' },
    enumValues: [
      { value: 'subscriber',      label: 'Inscrito' },
      { value: 'customer',        label: 'Cliente' },
      { value: 'repeat_customer', label: 'Cliente recorrente' },
      { value: 'vip',             label: 'VIP' },
    ] },
  { key: 'last_active_at', label: 'Última atividade', category: 'engagement', type: 'date',
    source: { kind: 'contact_column', column: 'last_active_at' } },
  { key: 'engagement_score', label: 'Score de engajamento', category: 'engagement', type: 'number',
    source: { kind: 'contact_column', column: 'engagement_score' },
    description: 'Score 0–100. Atualizado conforme atividade.' },

  // ────────── CONSENTIMENTO ──────────
  { key: 'is_subscribed_email',    label: 'Inscrito email',    category: 'consent', type: 'boolean',
    source: { kind: 'contact_column', column: 'is_subscribed_email' } },
  { key: 'is_subscribed_sms',      label: 'Inscrito SMS',      category: 'consent', type: 'boolean',
    source: { kind: 'contact_column', column: 'is_subscribed_sms' } },
  { key: 'is_subscribed_whatsapp', label: 'Inscrito WhatsApp', category: 'consent', type: 'boolean',
    source: { kind: 'contact_column', column: 'is_subscribed_whatsapp' } },
  { key: 'email_consent_at', label: 'Data do consent email', category: 'consent', type: 'date',
    source: { kind: 'contact_column', column: 'email_consent_at' } },
  { key: 'suppressed',  label: 'Suprimido',  category: 'consent', type: 'boolean',
    source: { kind: 'contact_column', column: 'suppressed' } },

  // ────────── COMÉRCIO ──────────
  { key: 'total_orders',     label: 'Total de pedidos',  category: 'commerce', type: 'number',
    source: { kind: 'contact_column', column: 'total_orders' } },
  { key: 'total_spent',      label: 'Total gasto',       category: 'commerce', type: 'number',
    source: { kind: 'contact_column', column: 'total_spent' } },
  { key: 'average_order_value', label: 'Ticket médio',   category: 'commerce', type: 'number',
    source: { kind: 'contact_column', column: 'average_order_value' } },
  { key: 'lifetime_value',   label: 'Lifetime value',    category: 'commerce', type: 'number',
    source: { kind: 'contact_column', column: 'lifetime_value' } },
  { key: 'first_order_at',   label: 'Primeiro pedido',   category: 'commerce', type: 'date',
    source: { kind: 'contact_column', column: 'first_order_at' } },
  { key: 'last_order_at',    label: 'Último pedido',     category: 'commerce', type: 'date',
    source: { kind: 'contact_column', column: 'last_order_at' } },
  { key: 'days_since_last_order', label: 'Dias desde último pedido', category: 'commerce', type: 'number',
    source: { kind: 'contact_column', column: 'days_since_last_order' } },
  { key: 'order_frequency_days', label: 'Frequência de pedido (dias)', category: 'commerce', type: 'number',
    source: { kind: 'contact_column', column: 'order_frequency_days' } },

  // ────────── PREDITIVO ──────────
  { key: 'predicted_clv',    label: 'CLV predito',       category: 'predictive', type: 'number',
    source: { kind: 'contact_column', column: 'predicted_clv' },
    description: 'Previsão de valor que o cliente ainda vai gastar nos próximos 12 meses.' },
  { key: 'churn_risk',       label: 'Risco de churn',    category: 'predictive', type: 'number',
    source: { kind: 'contact_column', column: 'churn_risk' },
    description: 'Score 0–1. Quanto maior, mais provável o cliente abandonar.' },
  // Worder armazena DOIS conjuntos: rfm_recency/_frequency/_monetary (1-5) e
  // rfm_recency_score/_frequency_score/_monetary_score (legacy). O catálogo
  // expõe o conjunto novo; o legacy fica intocado.
  { key: 'rfm_recency',      label: 'RFM Recência',      category: 'predictive', type: 'number',
    source: { kind: 'contact_column', column: 'rfm_recency' } },
  { key: 'rfm_frequency',    label: 'RFM Frequência',    category: 'predictive', type: 'number',
    source: { kind: 'contact_column', column: 'rfm_frequency' } },
  { key: 'rfm_monetary',     label: 'RFM Monetário',     category: 'predictive', type: 'number',
    source: { kind: 'contact_column', column: 'rfm_monetary' } },
  { key: 'rfm_segment',      label: 'RFM Segmento',      category: 'predictive', type: 'enum',
    source: { kind: 'contact_column', column: 'rfm_segment' },
    enumValues: [
      { value: 'champions',     label: 'Champions' },
      { value: 'loyal',         label: 'Loyal' },
      { value: 'potential',     label: 'Potential Loyalist' },
      { value: 'new',           label: 'New Customers' },
      { value: 'promising',     label: 'Promising' },
      { value: 'attention',     label: 'Needs Attention' },
      { value: 'about_to_sleep', label: 'About To Sleep' },
      { value: 'at_risk',       label: 'At Risk' },
      { value: 'cant_lose',     label: "Can't Lose Them" },
      { value: 'hibernating',   label: 'Hibernating' },
      { value: 'lost',          label: 'Lost' },
    ] },

  // ────────── CUSTOM ──────────
  { key: 'tags',             label: 'Tags',              category: 'custom', type: 'string_array',
    source: { kind: 'contact_column', column: 'tags' } },

  // ────────── DATAS RECORRENTES ──────────
  { key: 'birthday',         label: 'Aniversário',       category: 'identity', type: 'date',
    source: { kind: 'contact_column', column: 'birthday' },
    description: 'Mês e dia. Usado em filtros de aniversário recorrente.' },

  // ────────── SOURCE / ATRIBUIÇÃO ──────────
  { key: 'created_at',       label: 'Cadastrado em',     category: 'source', type: 'date',
    source: { kind: 'contact_column', column: 'created_at' } },
  { key: 'source',           label: 'Origem',            category: 'source', type: 'string',
    source: { kind: 'contact_column', column: 'source' } },
  { key: 'utm_source',       label: 'UTM Source',        category: 'source', type: 'string',
    source: { kind: 'contact_column', column: 'utm_source' } },
  { key: 'utm_medium',       label: 'UTM Medium',        category: 'source', type: 'string',
    source: { kind: 'contact_column', column: 'utm_medium' } },
  { key: 'utm_campaign',     label: 'UTM Campaign',      category: 'source', type: 'string',
    source: { kind: 'contact_column', column: 'utm_campaign' } },

  // ────────── EVENTOS ──────────
  // Comércio
  { key: 'placed_order', label: 'Fez pedido', category: 'event', type: 'string',
    source: { kind: 'event', event_type: 'placed_order' },
    eventProperties: [
      { path: 'total_price',    label: 'Valor total',  type: 'number' },
      { path: 'currency',       label: 'Moeda',        type: 'string' },
      { path: 'product_id',     label: 'Produto',      type: 'string' },
      { path: 'product_title',  label: 'Nome do produto', type: 'string' },
      { path: 'collection_id',  label: 'Coleção',      type: 'string' },
      { path: 'discount_code',  label: 'Cupom usado',  type: 'string' },
      { path: 'shipping_country', label: 'País de entrega', type: 'string' },
    ] },
  { key: 'viewed_product', label: 'Visualizou produto', category: 'event', type: 'string',
    source: { kind: 'event', event_type: 'viewed_product' },
    eventProperties: [
      { path: 'product_id',    label: 'Produto',       type: 'string' },
      { path: 'product_title', label: 'Nome do produto', type: 'string' },
      { path: 'collection_id', label: 'Coleção',       type: 'string' },
      { path: 'price',         label: 'Preço',         type: 'number' },
    ] },
  { key: 'added_to_cart', label: 'Adicionou ao carrinho', category: 'event', type: 'string',
    source: { kind: 'event', event_type: 'added_to_cart' },
    eventProperties: [
      { path: 'product_id', label: 'Produto', type: 'string' },
      { path: 'price',      label: 'Preço',   type: 'number' },
      { path: 'quantity',   label: 'Quantidade', type: 'number' },
    ] },
  { key: 'started_checkout', label: 'Iniciou checkout', category: 'event', type: 'string',
    source: { kind: 'event', event_type: 'started_checkout' },
    eventProperties: [
      { path: 'total_price', label: 'Valor total', type: 'number' },
    ] },
  { key: 'viewed_page', label: 'Visualizou página', category: 'event', type: 'string',
    source: { kind: 'event', event_type: 'viewed_page' },
    eventProperties: [
      { path: 'page_url',  label: 'URL',   type: 'string' },
      { path: 'page_type', label: 'Tipo',  type: 'string' },
    ] },
  // Engajamento
  { key: 'email_sent',    label: 'Recebeu email',  category: 'event', type: 'string', source: { kind: 'event', event_type: 'email_sent' } },
  { key: 'email_opened',  label: 'Abriu email',    category: 'event', type: 'string', source: { kind: 'event', event_type: 'email_opened' } },
  { key: 'email_clicked', label: 'Clicou em email', category: 'event', type: 'string', source: { kind: 'event', event_type: 'email_clicked' } },
  { key: 'sms_sent',      label: 'Recebeu SMS',    category: 'event', type: 'string', source: { kind: 'event', event_type: 'sms_sent' } },
  { key: 'sms_clicked',   label: 'Clicou em SMS',  category: 'event', type: 'string', source: { kind: 'event', event_type: 'sms_clicked' } },
  { key: 'whatsapp_sent', label: 'Recebeu WhatsApp', category: 'event', type: 'string', source: { kind: 'event', event_type: 'whatsapp_sent' } },
  { key: 'whatsapp_replied', label: 'Respondeu WhatsApp', category: 'event', type: 'string', source: { kind: 'event', event_type: 'whatsapp_replied' } },
  { key: 'subscribed',    label: 'Se inscreveu',    category: 'event', type: 'string', source: { kind: 'event', event_type: 'subscribed' } },
  { key: 'unsubscribed',  label: 'Descadastrou',    category: 'event', type: 'string', source: { kind: 'event', event_type: 'unsubscribed' } },
];

export const FIELD_INDEX: Record<string, FieldDef> = Object.fromEntries(
  FIELD_CATALOG.map((f) => [f.key, f]),
);

export const CATEGORY_LABELS: Record<FieldCategory, string> = {
  identity: 'Identidade',
  location: 'Localização',
  engagement: 'Engajamento',
  consent: 'Consentimento',
  commerce: 'Comércio',
  predictive: 'Preditivo',
  custom: 'Personalizado',
  source: 'Origem',
  event: 'Eventos',
  membership: 'Listas e segmentos',
};

// Operadores válidos por tipo de campo. UI consulta isso pra mostrar as opções certas.
export const OPERATORS_BY_TYPE: Record<FieldType, string[]> = {
  string: ['equals','not_equals','contains','not_contains','starts_with','not_starts_with','ends_with','not_ends_with','is_set','is_not_set'] satisfies StringOperator[],
  number: ['equals','not_equals','gt','gte','lt','lte','between','is_set','is_not_set'] satisfies NumberOperator[],
  date:   ['before','after','between_dates','in_last','not_in_last','in_next','between_relative','is_today','is_this_month','is_set','is_not_set'] satisfies DateOperator[],
  boolean: ['is_true','is_false'] satisfies BooleanOperator[],
  enum:   ['equals','not_equals','in','not_in'] satisfies EnumOperator[],
  string_array: ['contains_any','contains_all','not_contains_any','is_empty','is_not_empty','size_gte','size_lte'] satisfies StringArrayOperator[],
};

// Human labels for operators in the UI dropdown.
export const OPERATOR_LABELS: Record<string, string> = {
  equals: 'é',
  not_equals: 'não é',
  contains: 'contém',
  not_contains: 'não contém',
  starts_with: 'começa com',
  not_starts_with: 'não começa com',
  ends_with: 'termina com',
  not_ends_with: 'não termina com',
  is_set: 'está preenchido',
  is_not_set: 'não está preenchido',
  gt: 'maior que',
  gte: 'maior ou igual a',
  lt: 'menor que',
  lte: 'menor ou igual a',
  between: 'entre',
  before: 'antes de',
  after: 'depois de',
  between_dates: 'entre datas',
  in_last: 'nos últimos',
  not_in_last: 'não nos últimos',
  in_next: 'nos próximos',
  between_relative: 'entre (relativo)',
  is_today: 'é hoje',
  is_this_month: 'é este mês',
  is_true: 'é verdadeiro',
  is_false: 'é falso',
  in: 'é um de',
  not_in: 'não é um de',
  contains_any: 'contém qualquer',
  contains_all: 'contém todos',
  not_contains_any: 'não contém nenhum',
  is_empty: 'está vazio',
  is_not_empty: 'não está vazio',
  size_gte: 'tem pelo menos N itens',
  size_lte: 'tem no máximo N itens',
};
