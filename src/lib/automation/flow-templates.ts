// Pre-built flow templates for the Worder automation platform.
// Each template uses REAL node types that match nodeTypes.ts exactly.

export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  triggerType: string;
  tags: string[];
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: {
      label: string;
      description: string;
      category: 'trigger' | 'action' | 'condition' | 'control';
      nodeType: string;
      icon?: string;
      config: Record<string, any>;
    };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    type?: string;
  }>;
}

// ==============================
// 1. Carrinho Abandonado (3 emails)
// ==============================
const abandonedCart: FlowTemplate = {
  id: 'abandoned-cart',
  name: 'Carrinho Abandonado',
  description: 'Recupere vendas com 3 emails apos abandono do carrinho.',
  triggerType: 'trigger_abandon',
  tags: ['Recomendado', 'ecommerce'],
  nodes: [
    {
      id: 'n1', type: 'trigger_abandon', position: { x: 400, y: 80 },
      data: { label: 'Carrinho Abandonado', description: 'Dispara quando cliente abandona carrinho', category: 'trigger', nodeType: 'trigger_abandon', icon: 'ShoppingCart', config: {} },
    },
    {
      id: 'n2', type: 'control_delay', position: { x: 400, y: 220 },
      data: { label: 'Aguardar 1 hora', description: '', category: 'control', nodeType: 'control_delay', icon: 'Clock', config: { value: 1, unit: 'hours' } },
    },
    {
      id: 'n3', type: 'action_email', position: { x: 400, y: 360 },
      data: { label: 'Email #1 - Lembrete', description: '', category: 'action', nodeType: 'action_email', icon: 'Mail', config: { subject: 'Voce esqueceu algo no carrinho' } },
    },
    {
      id: 'n4', type: 'control_delay', position: { x: 400, y: 500 },
      data: { label: 'Aguardar 24 horas', description: '', category: 'control', nodeType: 'control_delay', icon: 'Clock', config: { value: 24, unit: 'hours' } },
    },
    {
      id: 'n5', type: 'condition_field', position: { x: 400, y: 640 },
      data: { label: 'Valor do carrinho > R$200?', description: '', category: 'condition', nodeType: 'condition_field', icon: 'GitBranch', config: { field: 'event.cart_value', operator: 'greater_than', value: '200' } },
    },
    {
      id: 'n6', type: 'action_email', position: { x: 250, y: 800 },
      data: { label: 'Email #2 - Frete gratis', description: '', category: 'action', nodeType: 'action_email', icon: 'Mail', config: { subject: 'Frete gratis no seu carrinho!' } },
    },
    {
      id: 'n7', type: 'action_email', position: { x: 550, y: 800 },
      data: { label: 'Email #2 - Lembrete', description: '', category: 'action', nodeType: 'action_email', icon: 'Mail', config: { subject: 'Seus itens estao esperando' } },
    },
    {
      id: 'n8', type: 'control_delay', position: { x: 400, y: 950 },
      data: { label: 'Aguardar 48 horas', description: '', category: 'control', nodeType: 'control_delay', icon: 'Clock', config: { value: 48, unit: 'hours' } },
    },
    {
      id: 'n9', type: 'action_email', position: { x: 400, y: 1090 },
      data: { label: 'Email #3 - Desconto 10%', description: '', category: 'action', nodeType: 'action_email', icon: 'Mail', config: { subject: 'Ultima chance: 10% de desconto' } },
    },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2', type: 'smoothstep' },
    { id: 'e2', source: 'n2', target: 'n3', type: 'smoothstep' },
    { id: 'e3', source: 'n3', target: 'n4', type: 'smoothstep' },
    { id: 'e4', source: 'n4', target: 'n5', type: 'smoothstep' },
    { id: 'e5', source: 'n5', target: 'n6', sourceHandle: 'true', type: 'smoothstep' },
    { id: 'e6', source: 'n5', target: 'n7', sourceHandle: 'false', type: 'smoothstep' },
    { id: 'e7', source: 'n6', target: 'n8', type: 'smoothstep' },
    { id: 'e8', source: 'n7', target: 'n8', type: 'smoothstep' },
    { id: 'e9', source: 'n8', target: 'n9', type: 'smoothstep' },
  ],
};

// ==============================
// 2. Boas-vindas (3 emails)
// ==============================
const welcomeSeries: FlowTemplate = {
  id: 'welcome-series',
  name: 'Serie de Boas-vindas',
  description: 'Receba novos contatos com uma sequencia de 3 emails.',
  triggerType: 'trigger_signup',
  tags: ['Recomendado', 'onboarding'],
  nodes: [
    {
      id: 'n1', type: 'trigger_signup', position: { x: 400, y: 80 },
      data: { label: 'Contato Criado', description: 'Quando novo contato e criado', category: 'trigger', nodeType: 'trigger_signup', icon: 'UserPlus', config: {} },
    },
    {
      id: 'n2', type: 'action_email', position: { x: 400, y: 220 },
      data: { label: 'Email #1 - Bem-vindo', description: '', category: 'action', nodeType: 'action_email', icon: 'Mail', config: { subject: 'Bem-vindo! Aqui esta seu cupom' } },
    },
    {
      id: 'n3', type: 'control_delay', position: { x: 400, y: 360 },
      data: { label: 'Aguardar 2 dias', description: '', category: 'control', nodeType: 'control_delay', icon: 'Clock', config: { value: 2, unit: 'days' } },
    },
    {
      id: 'n4', type: 'action_email', position: { x: 400, y: 500 },
      data: { label: 'Email #2 - Best-sellers', description: '', category: 'action', nodeType: 'action_email', icon: 'Mail', config: { subject: 'Conheca nossos best-sellers' } },
    },
    {
      id: 'n5', type: 'control_delay', position: { x: 400, y: 640 },
      data: { label: 'Aguardar 3 dias', description: '', category: 'control', nodeType: 'control_delay', icon: 'Clock', config: { value: 3, unit: 'days' } },
    },
    {
      id: 'n6', type: 'condition_field', position: { x: 400, y: 780 },
      data: { label: 'Ja fez pedido?', description: '', category: 'condition', nodeType: 'condition_field', icon: 'GitBranch', config: { field: 'contact.total_orders', operator: 'greater_than', value: '0' } },
    },
    {
      id: 'n7', type: 'action_email', position: { x: 550, y: 930 },
      data: { label: 'Email #3 - Cupom expira', description: '', category: 'action', nodeType: 'action_email', icon: 'Mail', config: { subject: 'Ultima chance para seu cupom de boas-vindas' } },
    },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2', type: 'smoothstep' },
    { id: 'e2', source: 'n2', target: 'n3', type: 'smoothstep' },
    { id: 'e3', source: 'n3', target: 'n4', type: 'smoothstep' },
    { id: 'e4', source: 'n4', target: 'n5', type: 'smoothstep' },
    { id: 'e5', source: 'n5', target: 'n6', type: 'smoothstep' },
    { id: 'e6', source: 'n6', target: 'n7', sourceHandle: 'false', type: 'smoothstep' },
  ],
};

// ==============================
// 3. Pos-Compra (2 emails)
// ==============================
const postPurchase: FlowTemplate = {
  id: 'post-purchase',
  name: 'Pos-Compra',
  description: 'Acompanhe clientes apos a compra com review e cross-sell.',
  triggerType: 'trigger_order',
  tags: ['ecommerce', 'retencao'],
  nodes: [
    {
      id: 'n1', type: 'trigger_order', position: { x: 400, y: 80 },
      data: { label: 'Pedido Realizado', description: 'Quando um pedido e criado', category: 'trigger', nodeType: 'trigger_order', icon: 'Package', config: {} },
    },
    {
      id: 'n2', type: 'control_delay', position: { x: 400, y: 220 },
      data: { label: 'Aguardar 3 dias', description: '', category: 'control', nodeType: 'control_delay', icon: 'Clock', config: { value: 3, unit: 'days' } },
    },
    {
      id: 'n3', type: 'action_email', position: { x: 400, y: 360 },
      data: { label: 'Email #1 - Review', description: '', category: 'action', nodeType: 'action_email', icon: 'Mail', config: { subject: 'Como esta seu pedido? Conta pra gente!' } },
    },
    {
      id: 'n4', type: 'control_delay', position: { x: 400, y: 500 },
      data: { label: 'Aguardar 7 dias', description: '', category: 'control', nodeType: 'control_delay', icon: 'Clock', config: { value: 7, unit: 'days' } },
    },
    {
      id: 'n5', type: 'action_email', position: { x: 400, y: 640 },
      data: { label: 'Email #2 - Cross-sell', description: '', category: 'action', nodeType: 'action_email', icon: 'Mail', config: { subject: 'Produtos que combinam com o que voce comprou' } },
    },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2', type: 'smoothstep' },
    { id: 'e2', source: 'n2', target: 'n3', type: 'smoothstep' },
    { id: 'e3', source: 'n3', target: 'n4', type: 'smoothstep' },
    { id: 'e4', source: 'n4', target: 'n5', type: 'smoothstep' },
  ],
};

// ==============================
// 4. Reconquistar Clientes (3 emails)
// ==============================
const winback: FlowTemplate = {
  id: 'winback',
  name: 'Reconquistar Clientes',
  description: 'Re-engaje clientes inativos com descontos progressivos.',
  triggerType: 'trigger_segment',
  tags: ['retencao', 'winback'],
  nodes: [
    {
      id: 'n1', type: 'trigger_segment', position: { x: 400, y: 80 },
      data: { label: 'Sem compra ha 60 dias', description: 'Contato entrou no segmento de inativos', category: 'trigger', nodeType: 'trigger_segment', icon: 'Users', config: {} },
    },
    {
      id: 'n2', type: 'action_email', position: { x: 400, y: 220 },
      data: { label: 'Email #1 - Sentimos falta', description: '', category: 'action', nodeType: 'action_email', icon: 'Mail', config: { subject: 'Sentimos sua falta! Veja as novidades' } },
    },
    {
      id: 'n3', type: 'control_delay', position: { x: 400, y: 360 },
      data: { label: 'Aguardar 7 dias', description: '', category: 'control', nodeType: 'control_delay', icon: 'Clock', config: { value: 7, unit: 'days' } },
    },
    {
      id: 'n4', type: 'action_email', position: { x: 400, y: 500 },
      data: { label: 'Email #2 - 10% OFF', description: '', category: 'action', nodeType: 'action_email', icon: 'Mail', config: { subject: '10% OFF especial para voce voltar' } },
    },
    {
      id: 'n5', type: 'control_delay', position: { x: 400, y: 640 },
      data: { label: 'Aguardar 14 dias', description: '', category: 'control', nodeType: 'control_delay', icon: 'Clock', config: { value: 14, unit: 'days' } },
    },
    {
      id: 'n6', type: 'action_email', position: { x: 400, y: 780 },
      data: { label: 'Email #3 - Ultimo aviso', description: '', category: 'action', nodeType: 'action_email', icon: 'Mail', config: { subject: 'Ultimo aviso: seu desconto expira amanha' } },
    },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2', type: 'smoothstep' },
    { id: 'e2', source: 'n2', target: 'n3', type: 'smoothstep' },
    { id: 'e3', source: 'n3', target: 'n4', type: 'smoothstep' },
    { id: 'e4', source: 'n4', target: 'n5', type: 'smoothstep' },
    { id: 'e5', source: 'n5', target: 'n6', type: 'smoothstep' },
  ],
};

// ==============================
// 5. Navegacao Abandonada (2 emails)
// ==============================
const browseAbandonment: FlowTemplate = {
  id: 'browse-abandonment',
  name: 'Navegacao Abandonada',
  description: 'Recupere visitantes que viram produtos mas nao compraram.',
  triggerType: 'trigger_viewed_product',
  tags: ['ecommerce', 'recuperacao'],
  nodes: [
    {
      id: 'n1', type: 'trigger_viewed_product', position: { x: 400, y: 80 },
      data: { label: 'Produto Visualizado', description: 'Quando contato ve um produto', category: 'trigger', nodeType: 'trigger_viewed_product', icon: 'Eye', config: {} },
    },
    {
      id: 'n2', type: 'control_delay', position: { x: 400, y: 220 },
      data: { label: 'Aguardar 2 horas', description: '', category: 'control', nodeType: 'control_delay', icon: 'Clock', config: { value: 2, unit: 'hours' } },
    },
    {
      id: 'n3', type: 'action_email', position: { x: 400, y: 360 },
      data: { label: 'Email #1 - Ainda interessado?', description: '', category: 'action', nodeType: 'action_email', icon: 'Mail', config: { subject: 'Ainda interessado em {{event.product_title}}?' } },
    },
    {
      id: 'n4', type: 'control_delay', position: { x: 400, y: 500 },
      data: { label: 'Aguardar 24 horas', description: '', category: 'control', nodeType: 'control_delay', icon: 'Clock', config: { value: 24, unit: 'hours' } },
    },
    {
      id: 'n5', type: 'condition_field', position: { x: 400, y: 640 },
      data: { label: 'Viu 3+ produtos?', description: '', category: 'condition', nodeType: 'condition_field', icon: 'GitBranch', config: { field: 'contact.total_views', operator: 'greater_or_equal', value: '3' } },
    },
    {
      id: 'n6', type: 'action_email', position: { x: 250, y: 800 },
      data: { label: 'Email #2 - Recomendacoes', description: '', category: 'action', nodeType: 'action_email', icon: 'Mail', config: { subject: 'Selecionamos produtos para voce' } },
    },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2', type: 'smoothstep' },
    { id: 'e2', source: 'n2', target: 'n3', type: 'smoothstep' },
    { id: 'e3', source: 'n3', target: 'n4', type: 'smoothstep' },
    { id: 'e4', source: 'n4', target: 'n5', type: 'smoothstep' },
    { id: 'e5', source: 'n5', target: 'n6', sourceHandle: 'true', type: 'smoothstep' },
  ],
};

export const FLOW_TEMPLATES: FlowTemplate[] = [
  abandonedCart,
  welcomeSeries,
  postPurchase,
  winback,
  browseAbandonment,
];

export default FLOW_TEMPLATES;
