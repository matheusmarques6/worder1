// Curated segment templates — the gallery shown on the empty state
// of /segments. Klaviyo / Omnisend both ship a set of these to
// reduce blank-page anxiety. Every template here renders into a
// valid v2 SegmentRule so the merchant can click → review → save.

import type { SegmentRule } from './dsl';

export interface SegmentTemplate {
  id: string;
  name: string;
  description: string;
  category: 'engagement' | 'retention' | 'growth' | 'commerce';
  emoji: string;
  rule: SegmentRule;
}

export const SEGMENT_TEMPLATES: SegmentTemplate[] = [
  {
    id: 'champions',
    name: 'Champions',
    description: 'Compram com frequência, valor alto e recentemente. Os melhores clientes.',
    category: 'retention',
    emoji: '🏆',
    rule: {
      version: 2,
      root: {
        type: 'group',
        logic: 'AND',
        children: [
          { type: 'profile', field: 'total_orders', operator: 'gte', value: 3 },
          { type: 'profile', field: 'total_spent', operator: 'gte', value: 500 },
          { type: 'event', event: 'placed_order', frequency: { op: 'at_least', value: 1 }, window: { kind: 'last', value: 90, unit: 'day' } },
        ],
      },
    },
  },
  {
    id: 'vip-clients',
    name: 'Clientes VIP',
    description: 'Marcados como VIP no ciclo de vida — atendimento especial.',
    category: 'retention',
    emoji: '👑',
    rule: {
      version: 2,
      root: {
        type: 'group',
        logic: 'AND',
        children: [
          { type: 'profile', field: 'lifecycle_stage', operator: 'equals', value: 'vip' },
        ],
      },
    },
  },
  {
    id: 'at-risk',
    name: 'Em risco de churn',
    description: 'Clientes com churn_risk alto ou que não compram há 60 dias.',
    category: 'retention',
    emoji: '⚠️',
    rule: {
      version: 2,
      root: {
        type: 'group',
        logic: 'OR',
        children: [
          { type: 'profile', field: 'churn_risk', operator: 'gte', value: 0.7 },
          { type: 'event', event: 'placed_order', frequency: { op: 'zero', value: 0 }, window: { kind: 'last', value: 60, unit: 'day' } },
        ],
      },
    },
  },
  {
    id: 'browse-abandoners',
    name: 'Browse abandoners',
    description: 'Viram produto nos últimos 7 dias mas não compraram.',
    category: 'commerce',
    emoji: '👀',
    rule: {
      version: 2,
      root: {
        type: 'group',
        logic: 'AND',
        children: [
          { type: 'event', event: 'viewed_product', frequency: { op: 'at_least', value: 1 }, window: { kind: 'last', value: 7, unit: 'day' } },
          { type: 'event', event: 'placed_order', frequency: { op: 'zero', value: 0 }, window: { kind: 'last', value: 7, unit: 'day' } },
        ],
      },
    },
  },
  {
    id: 'cart-abandoners',
    name: 'Carrinho abandonado',
    description: 'Iniciou checkout nos últimos 3 dias mas não fechou.',
    category: 'commerce',
    emoji: '🛒',
    rule: {
      version: 2,
      root: {
        type: 'group',
        logic: 'AND',
        children: [
          { type: 'event', event: 'started_checkout', frequency: { op: 'at_least', value: 1 }, window: { kind: 'last', value: 3, unit: 'day' } },
          { type: 'event', event: 'placed_order', frequency: { op: 'zero', value: 0 }, window: { kind: 'last', value: 3, unit: 'day' } },
        ],
      },
    },
  },
  {
    id: 'win-back',
    name: 'Win-back',
    description: 'Compraram pelo menos 1x mas não retornam há 90 dias.',
    category: 'retention',
    emoji: '🔄',
    rule: {
      version: 2,
      root: {
        type: 'group',
        logic: 'AND',
        children: [
          { type: 'profile', field: 'total_orders', operator: 'gte', value: 1 },
          { type: 'event', event: 'placed_order', frequency: { op: 'zero', value: 0 }, window: { kind: 'last', value: 90, unit: 'day' } },
        ],
      },
    },
  },
  {
    id: 'new-subscribers',
    name: 'Inscritos recentes',
    description: 'Entraram na base nos últimos 14 dias e ainda não compraram.',
    category: 'growth',
    emoji: '✨',
    rule: {
      version: 2,
      root: {
        type: 'group',
        logic: 'AND',
        children: [
          { type: 'profile', field: 'created_at', operator: 'in_last', value: 14, unit: 'day' },
          { type: 'profile', field: 'total_orders', operator: 'equals', value: 0 },
          { type: 'profile', field: 'is_subscribed_email', operator: 'is_true' },
        ],
      },
    },
  },
  {
    id: 'engaged-email',
    name: 'Engajados por email',
    description: 'Abriram pelo menos um email no último mês.',
    category: 'engagement',
    emoji: '✉️',
    rule: {
      version: 2,
      root: {
        type: 'group',
        logic: 'AND',
        children: [
          { type: 'event', event: 'email_opened', frequency: { op: 'at_least', value: 1 }, window: { kind: 'last', value: 30, unit: 'day' } },
        ],
      },
    },
  },
  {
    id: 'high-clv',
    name: 'CLV alto',
    description: 'Lifetime value predito acima de R$500.',
    category: 'retention',
    emoji: '💰',
    rule: {
      version: 2,
      root: {
        type: 'group',
        logic: 'AND',
        children: [
          { type: 'profile', field: 'predicted_clv', operator: 'gte', value: 500 },
        ],
      },
    },
  },
];

export const TEMPLATE_CATEGORY_LABELS: Record<SegmentTemplate['category'], string> = {
  engagement: 'Engajamento',
  retention: 'Retenção',
  growth: 'Crescimento',
  commerce: 'Comércio',
};
