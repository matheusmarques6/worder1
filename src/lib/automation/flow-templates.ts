// Pre-built flow templates for the Worder automation platform.
// Each template contains nodes and edges arrays compatible with React Flow.

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
  exitConditions?: Array<{ type: string; value: string }>;
  frequencyConfig?: { type: string; value?: number; unit?: string };
}

// ---------------------------------------------------------------------------
// 1. Abandoned Cart
// trigger_abandon -> delay 1h -> email #1 -> delay 24h -> condition (cart_value > 200)
//   SIM -> email #2 -> delay 48h -> email #3
//   NAO -> email #2b -> delay 48h -> email #3
// ---------------------------------------------------------------------------

const abandonedCartTemplate: FlowTemplate = {
  id: 'abandoned-cart',
  name: 'Carrinho Abandonado',
  description:
    'Recupere vendas perdidas com uma sequencia de 3 emails enviados apos o abandono do carrinho.',
  triggerType: 'cart_abandon',
  tags: ['ecommerce', 'recuperacao', 'carrinho'],
  nodes: [
    {
      id: 'trigger_abandon',
      type: 'triggerNode',
      position: { x: 400, y: 100 },
      data: {
        label: 'Abandono de Carrinho',
        description: 'Dispara quando um carrinho e abandonado',
        category: 'trigger',
        nodeType: 'trigger_cart_abandon',
        config: { event: 'cart_abandon' },
      },
    },
    {
      id: 'delay_1h',
      type: 'delayNode',
      position: { x: 400, y: 250 },
      data: {
        label: 'Aguardar 1 hora',
        description: 'Espera 1 hora antes de enviar o primeiro email',
        category: 'control',
        nodeType: 'delay',
        config: { value: 1, unit: 'hours' },
      },
    },
    {
      id: 'email_1',
      type: 'emailNode',
      position: { x: 400, y: 400 },
      data: {
        label: 'Email #1 - Lembrete',
        description: 'Primeiro lembrete sobre o carrinho abandonado',
        category: 'action',
        nodeType: 'send_email',
        config: {
          subject: 'Voce esqueceu algo no carrinho',
          templateId: '',
        },
      },
    },
    {
      id: 'delay_24h',
      type: 'delayNode',
      position: { x: 400, y: 550 },
      data: {
        label: 'Aguardar 24 horas',
        description: 'Espera 24 horas antes de verificar o valor do carrinho',
        category: 'control',
        nodeType: 'delay',
        config: { value: 24, unit: 'hours' },
      },
    },
    {
      id: 'condition_cart_value',
      type: 'conditionNode',
      position: { x: 400, y: 700 },
      data: {
        label: 'Valor do carrinho > R$200?',
        description: 'Verifica se o valor do carrinho e maior que R$200',
        category: 'condition',
        nodeType: 'condition_field',
        config: { field: 'cart_value', operator: 'greater_than', value: '200' },
      },
    },
    {
      id: 'email_2_sim',
      type: 'emailNode',
      position: { x: 250, y: 850 },
      data: {
        label: 'Email #2 - Oferta VIP',
        description: 'Oferta especial para carrinhos de alto valor',
        category: 'action',
        nodeType: 'send_email',
        config: {
          subject: 'Uma oferta exclusiva para voce finalizar sua compra',
          templateId: '',
        },
      },
    },
    {
      id: 'email_2b_nao',
      type: 'emailNode',
      position: { x: 550, y: 850 },
      data: {
        label: 'Email #2b - Lembrete',
        description: 'Segundo lembrete padrao sobre o carrinho',
        category: 'action',
        nodeType: 'send_email',
        config: {
          subject: 'Seus itens ainda estao esperando por voce',
          templateId: '',
        },
      },
    },
    {
      id: 'delay_48h',
      type: 'delayNode',
      position: { x: 400, y: 1000 },
      data: {
        label: 'Aguardar 48 horas',
        description: 'Espera 48 horas antes do ultimo email',
        category: 'control',
        nodeType: 'delay',
        config: { value: 48, unit: 'hours' },
      },
    },
    {
      id: 'email_3',
      type: 'emailNode',
      position: { x: 400, y: 1150 },
      data: {
        label: 'Email #3 - Ultima chance',
        description: 'Ultimo email de recuperacao do carrinho',
        category: 'action',
        nodeType: 'send_email',
        config: {
          subject: 'Ultima chance: seu carrinho expira em breve',
          templateId: '',
        },
      },
    },
  ],
  edges: [
    { id: 'e-trigger-delay1', source: 'trigger_abandon', target: 'delay_1h' },
    { id: 'e-delay1-email1', source: 'delay_1h', target: 'email_1' },
    { id: 'e-email1-delay24', source: 'email_1', target: 'delay_24h' },
    { id: 'e-delay24-cond', source: 'delay_24h', target: 'condition_cart_value' },
    {
      id: 'e-cond-sim',
      source: 'condition_cart_value',
      target: 'email_2_sim',
      sourceHandle: 'sim',
      type: 'smoothstep',
    },
    {
      id: 'e-cond-nao',
      source: 'condition_cart_value',
      target: 'email_2b_nao',
      sourceHandle: 'nao',
      type: 'smoothstep',
    },
    { id: 'e-email2sim-delay48', source: 'email_2_sim', target: 'delay_48h' },
    { id: 'e-email2bnao-delay48', source: 'email_2b_nao', target: 'delay_48h' },
    { id: 'e-delay48-email3', source: 'delay_48h', target: 'email_3' },
  ],
  exitConditions: [
    { type: 'event', value: 'purchase_completed' },
    { type: 'event', value: 'cart_cleared' },
  ],
  frequencyConfig: { type: 'once_per_cart', value: 1, unit: 'days' },
};

// ---------------------------------------------------------------------------
// 2. Welcome Series
// trigger_signup -> email #1 (immediate) -> delay 2d -> email #2 -> delay 3d
//   -> condition (has_ordered)
//     SIM -> end
//     NAO -> email #3
// ---------------------------------------------------------------------------

const welcomeSeriesTemplate: FlowTemplate = {
  id: 'welcome-series',
  name: 'Serie de Boas-vindas',
  description:
    'Engaje novos assinantes com uma sequencia de 3 emails de boas-vindas.',
  triggerType: 'signup',
  tags: ['onboarding', 'boas-vindas', 'engajamento'],
  nodes: [
    {
      id: 'trigger_signup',
      type: 'triggerNode',
      position: { x: 400, y: 100 },
      data: {
        label: 'Novo Cadastro',
        description: 'Dispara quando um novo usuario se cadastra',
        category: 'trigger',
        nodeType: 'trigger_signup',
        config: { event: 'signup' },
      },
    },
    {
      id: 'email_1',
      type: 'emailNode',
      position: { x: 400, y: 250 },
      data: {
        label: 'Email #1 - Boas-vindas',
        description: 'Email de boas-vindas enviado imediatamente',
        category: 'action',
        nodeType: 'send_email',
        config: {
          subject: 'Bem-vindo! Conheca nossa loja',
          templateId: '',
        },
      },
    },
    {
      id: 'delay_2d',
      type: 'delayNode',
      position: { x: 400, y: 400 },
      data: {
        label: 'Aguardar 2 dias',
        description: 'Espera 2 dias antes do segundo email',
        category: 'control',
        nodeType: 'delay',
        config: { value: 2, unit: 'days' },
      },
    },
    {
      id: 'email_2',
      type: 'emailNode',
      position: { x: 400, y: 550 },
      data: {
        label: 'Email #2 - Destaques',
        description: 'Apresenta produtos em destaque',
        category: 'action',
        nodeType: 'send_email',
        config: {
          subject: 'Confira nossos produtos mais populares',
          templateId: '',
        },
      },
    },
    {
      id: 'delay_3d',
      type: 'delayNode',
      position: { x: 400, y: 700 },
      data: {
        label: 'Aguardar 3 dias',
        description: 'Espera 3 dias antes de verificar se ja comprou',
        category: 'control',
        nodeType: 'delay',
        config: { value: 3, unit: 'days' },
      },
    },
    {
      id: 'condition_has_ordered',
      type: 'conditionNode',
      position: { x: 400, y: 850 },
      data: {
        label: 'Ja fez um pedido?',
        description: 'Verifica se o usuario ja realizou uma compra',
        category: 'condition',
        nodeType: 'condition_field',
        config: { field: 'has_ordered', operator: 'equals', value: 'true' },
      },
    },
    {
      id: 'end_sim',
      type: 'endNode',
      position: { x: 250, y: 1000 },
      data: {
        label: 'Fim do Fluxo',
        description: 'Usuario ja comprou, encerra o fluxo',
        category: 'control',
        nodeType: 'end',
        config: {},
      },
    },
    {
      id: 'email_3',
      type: 'emailNode',
      position: { x: 550, y: 1000 },
      data: {
        label: 'Email #3 - Incentivo',
        description: 'Oferece incentivo para a primeira compra',
        category: 'action',
        nodeType: 'send_email',
        config: {
          subject: 'Um presente especial para sua primeira compra',
          templateId: '',
        },
      },
    },
  ],
  edges: [
    { id: 'e-trigger-email1', source: 'trigger_signup', target: 'email_1' },
    { id: 'e-email1-delay2d', source: 'email_1', target: 'delay_2d' },
    { id: 'e-delay2d-email2', source: 'delay_2d', target: 'email_2' },
    { id: 'e-email2-delay3d', source: 'email_2', target: 'delay_3d' },
    { id: 'e-delay3d-cond', source: 'delay_3d', target: 'condition_has_ordered' },
    {
      id: 'e-cond-sim',
      source: 'condition_has_ordered',
      target: 'end_sim',
      sourceHandle: 'sim',
      type: 'smoothstep',
    },
    {
      id: 'e-cond-nao',
      source: 'condition_has_ordered',
      target: 'email_3',
      sourceHandle: 'nao',
      type: 'smoothstep',
    },
  ],
  exitConditions: [{ type: 'event', value: 'unsubscribed' }],
  frequencyConfig: { type: 'once_per_contact' },
};

// ---------------------------------------------------------------------------
// 3. Post-Purchase
// trigger_order -> delay 3d -> email #1 -> delay 7d -> email #2
// ---------------------------------------------------------------------------

const postPurchaseTemplate: FlowTemplate = {
  id: 'post-purchase',
  name: 'Pos-Compra',
  description:
    'Acompanhe o cliente apos a compra com emails de agradecimento e solicitacao de avaliacao.',
  triggerType: 'order',
  tags: ['ecommerce', 'pos-compra', 'avaliacao'],
  nodes: [
    {
      id: 'trigger_order',
      type: 'triggerNode',
      position: { x: 400, y: 100 },
      data: {
        label: 'Pedido Realizado',
        description: 'Dispara quando um pedido e confirmado',
        category: 'trigger',
        nodeType: 'trigger_order',
        config: { event: 'order_completed' },
      },
    },
    {
      id: 'delay_3d',
      type: 'delayNode',
      position: { x: 400, y: 250 },
      data: {
        label: 'Aguardar 3 dias',
        description: 'Espera 3 dias apos o pedido',
        category: 'control',
        nodeType: 'delay',
        config: { value: 3, unit: 'days' },
      },
    },
    {
      id: 'email_1',
      type: 'emailNode',
      position: { x: 400, y: 400 },
      data: {
        label: 'Email #1 - Agradecimento',
        description: 'Email de agradecimento pela compra',
        category: 'action',
        nodeType: 'send_email',
        config: {
          subject: 'Obrigado pela sua compra! Como foi sua experiencia?',
          templateId: '',
        },
      },
    },
    {
      id: 'delay_7d',
      type: 'delayNode',
      position: { x: 400, y: 550 },
      data: {
        label: 'Aguardar 7 dias',
        description: 'Espera 7 dias antes de pedir avaliacao',
        category: 'control',
        nodeType: 'delay',
        config: { value: 7, unit: 'days' },
      },
    },
    {
      id: 'email_2',
      type: 'emailNode',
      position: { x: 400, y: 700 },
      data: {
        label: 'Email #2 - Avaliacao',
        description: 'Solicita uma avaliacao do produto',
        category: 'action',
        nodeType: 'send_email',
        config: {
          subject: 'Avalie seu produto e ganhe um cupom exclusivo',
          templateId: '',
        },
      },
    },
  ],
  edges: [
    { id: 'e-trigger-delay3d', source: 'trigger_order', target: 'delay_3d' },
    { id: 'e-delay3d-email1', source: 'delay_3d', target: 'email_1' },
    { id: 'e-email1-delay7d', source: 'email_1', target: 'delay_7d' },
    { id: 'e-delay7d-email2', source: 'delay_7d', target: 'email_2' },
  ],
  exitConditions: [{ type: 'event', value: 'order_refunded' }],
  frequencyConfig: { type: 'once_per_order' },
};

// ---------------------------------------------------------------------------
// 4. Winback
// trigger_segment -> email #1 -> delay 7d -> email #2 -> delay 14d -> email #3
// ---------------------------------------------------------------------------

const winbackTemplate: FlowTemplate = {
  id: 'winback',
  name: 'Reativacao de Clientes',
  description:
    'Reengaje clientes inativos com uma sequencia de 3 emails ao longo de 3 semanas.',
  triggerType: 'segment',
  tags: ['reativacao', 'winback', 'engajamento'],
  nodes: [
    {
      id: 'trigger_segment',
      type: 'triggerNode',
      position: { x: 400, y: 100 },
      data: {
        label: 'Segmento Inativo',
        description: 'Dispara para contatos no segmento de inativos',
        category: 'trigger',
        nodeType: 'trigger_segment',
        config: { event: 'segment_entry', segmentId: '' },
      },
    },
    {
      id: 'email_1',
      type: 'emailNode',
      position: { x: 400, y: 250 },
      data: {
        label: 'Email #1 - Sentimos sua falta',
        description: 'Primeiro email de reativacao',
        category: 'action',
        nodeType: 'send_email',
        config: {
          subject: 'Faz tempo que nao te vemos por aqui!',
          templateId: '',
        },
      },
    },
    {
      id: 'delay_7d',
      type: 'delayNode',
      position: { x: 400, y: 400 },
      data: {
        label: 'Aguardar 7 dias',
        description: 'Espera 7 dias antes do segundo email',
        category: 'control',
        nodeType: 'delay',
        config: { value: 7, unit: 'days' },
      },
    },
    {
      id: 'email_2',
      type: 'emailNode',
      position: { x: 400, y: 550 },
      data: {
        label: 'Email #2 - Novidades',
        description: 'Mostra novidades e produtos recentes',
        category: 'action',
        nodeType: 'send_email',
        config: {
          subject: 'Veja o que ha de novo na nossa loja',
          templateId: '',
        },
      },
    },
    {
      id: 'delay_14d',
      type: 'delayNode',
      position: { x: 400, y: 700 },
      data: {
        label: 'Aguardar 14 dias',
        description: 'Espera 14 dias antes do ultimo email',
        category: 'control',
        nodeType: 'delay',
        config: { value: 14, unit: 'days' },
      },
    },
    {
      id: 'email_3',
      type: 'emailNode',
      position: { x: 400, y: 850 },
      data: {
        label: 'Email #3 - Oferta final',
        description: 'Oferta exclusiva de reativacao',
        category: 'action',
        nodeType: 'send_email',
        config: {
          subject: 'Ultima chance: desconto exclusivo so para voce',
          templateId: '',
        },
      },
    },
  ],
  edges: [
    { id: 'e-trigger-email1', source: 'trigger_segment', target: 'email_1' },
    { id: 'e-email1-delay7d', source: 'email_1', target: 'delay_7d' },
    { id: 'e-delay7d-email2', source: 'delay_7d', target: 'email_2' },
    { id: 'e-email2-delay14d', source: 'email_2', target: 'delay_14d' },
    { id: 'e-delay14d-email3', source: 'delay_14d', target: 'email_3' },
  ],
  exitConditions: [
    { type: 'event', value: 'purchase_completed' },
    { type: 'event', value: 'unsubscribed' },
  ],
  frequencyConfig: { type: 'once_per_contact' },
};

// ---------------------------------------------------------------------------
// 5. Browse Abandonment
// trigger_viewed_product -> delay 2h -> email #1 -> delay 24h
//   -> condition (viewed_3_products)
//     SIM -> email #2
//     NAO -> end
// ---------------------------------------------------------------------------

const browseAbandonmentTemplate: FlowTemplate = {
  id: 'browse-abandonment',
  name: 'Abandono de Navegacao',
  description:
    'Reengaje visitantes que visualizaram produtos mas nao adicionaram ao carrinho.',
  triggerType: 'viewed_product',
  tags: ['ecommerce', 'navegacao', 'recuperacao'],
  nodes: [
    {
      id: 'trigger_viewed_product',
      type: 'triggerNode',
      position: { x: 400, y: 100 },
      data: {
        label: 'Produto Visualizado',
        description: 'Dispara quando um produto e visualizado sem adicao ao carrinho',
        category: 'trigger',
        nodeType: 'trigger_viewed_product',
        config: { event: 'product_viewed' },
      },
    },
    {
      id: 'delay_2h',
      type: 'delayNode',
      position: { x: 400, y: 250 },
      data: {
        label: 'Aguardar 2 horas',
        description: 'Espera 2 horas antes de enviar o primeiro email',
        category: 'control',
        nodeType: 'delay',
        config: { value: 2, unit: 'hours' },
      },
    },
    {
      id: 'email_1',
      type: 'emailNode',
      position: { x: 400, y: 400 },
      data: {
        label: 'Email #1 - Produto visitado',
        description: 'Lembra o visitante sobre o produto que ele viu',
        category: 'action',
        nodeType: 'send_email',
        config: {
          subject: 'Ainda interessado? O produto que voce viu esta disponivel',
          templateId: '',
        },
      },
    },
    {
      id: 'delay_24h',
      type: 'delayNode',
      position: { x: 400, y: 550 },
      data: {
        label: 'Aguardar 24 horas',
        description: 'Espera 24 horas antes de verificar o engajamento',
        category: 'control',
        nodeType: 'delay',
        config: { value: 24, unit: 'hours' },
      },
    },
    {
      id: 'condition_viewed_3',
      type: 'conditionNode',
      position: { x: 400, y: 700 },
      data: {
        label: 'Visualizou 3+ produtos?',
        description: 'Verifica se o visitante viu 3 ou mais produtos',
        category: 'condition',
        nodeType: 'condition_field',
        config: {
          field: 'viewed_3_products',
          operator: 'equals',
          value: 'true',
        },
      },
    },
    {
      id: 'email_2',
      type: 'emailNode',
      position: { x: 250, y: 850 },
      data: {
        label: 'Email #2 - Recomendacoes',
        description: 'Envia recomendacoes baseadas nos produtos visualizados',
        category: 'action',
        nodeType: 'send_email',
        config: {
          subject: 'Selecionamos produtos especiais para voce',
          templateId: '',
        },
      },
    },
    {
      id: 'end_nao',
      type: 'endNode',
      position: { x: 550, y: 850 },
      data: {
        label: 'Fim do Fluxo',
        description: 'Encerra o fluxo para visitantes com baixo engajamento',
        category: 'control',
        nodeType: 'end',
        config: {},
      },
    },
  ],
  edges: [
    { id: 'e-trigger-delay2h', source: 'trigger_viewed_product', target: 'delay_2h' },
    { id: 'e-delay2h-email1', source: 'delay_2h', target: 'email_1' },
    { id: 'e-email1-delay24h', source: 'email_1', target: 'delay_24h' },
    { id: 'e-delay24h-cond', source: 'delay_24h', target: 'condition_viewed_3' },
    {
      id: 'e-cond-sim',
      source: 'condition_viewed_3',
      target: 'email_2',
      sourceHandle: 'sim',
      type: 'smoothstep',
    },
    {
      id: 'e-cond-nao',
      source: 'condition_viewed_3',
      target: 'end_nao',
      sourceHandle: 'nao',
      type: 'smoothstep',
    },
  ],
  exitConditions: [
    { type: 'event', value: 'cart_created' },
    { type: 'event', value: 'purchase_completed' },
  ],
  frequencyConfig: { type: 'throttle', value: 1, unit: 'days' },
};

// ---------------------------------------------------------------------------
// Exported collection
// ---------------------------------------------------------------------------

export const FLOW_TEMPLATES: FlowTemplate[] = [
  abandonedCartTemplate,
  welcomeSeriesTemplate,
  postPurchaseTemplate,
  winbackTemplate,
  browseAbandonmentTemplate,
];
