// =====================================================
// CATÁLOGO DE TOOLS — METADADOS PARA A UI
// =====================================================
// Módulo PURO (só dados): é importado por componentes client (ToolsTab).
// NÃO importar registry.ts/handlers aqui — eles puxam tools/db.ts ->
// supabase-admin.ts, que lança erro no browser. A paridade de nomes com
// ALL_TOOLS é garantida por teste (tools-catalog.test.ts).

export interface ToolCatalogEntry {
  /** Nome canônico da tool — deve bater com Tool.name no registry. */
  name: string
  /** Rótulo curto em PT exibido na UI. */
  label: string
  /** O que a tool faz, em PT, na linguagem do lojista. */
  description: string
  /** true = só funciona com loja Shopify conectada (store-gated no runtime). */
  requiresStore: boolean
}

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    name: 'transfer_to_human',
    label: 'Transferir para humano',
    description:
      'Desliga a IA na conversa e passa o atendimento para a equipe, registrando ' +
      'motivo e resumo na timeline do contato. Recomendada para todo agente.',
    requiresStore: false,
  },
  {
    name: 'search_knowledge',
    label: 'Buscar na base de conhecimento',
    description:
      'Busca sob demanda nas fontes da aba Fontes (políticas, FAQ, documentos). ' +
      'Com ela ativa, a base de conhecimento deixa de ser pré-injetada e passa a ' +
      'ser consultada só quando necessário. Requer chave OpenAI da organização ' +
      'cadastrada em API Keys (usada para embeddings).',
    requiresStore: false,
  },
  {
    name: 'save_customer',
    label: 'Salvar dados do cliente',
    description:
      'Salva ou atualiza o contato no CRM (nome, e-mail, tags e campos ' +
      'personalizados) quando o cliente informa dados na conversa.',
    requiresStore: false,
  },
  {
    name: 'save_interests',
    label: 'Registrar interesses',
    description:
      'Registra produtos e assuntos de interesse do cliente para remarketing e ' +
      'contexto em conversas futuras.',
    requiresStore: false,
  },
  {
    name: 'timeline',
    label: 'Timeline do contato',
    description:
      'Consulta o histórico do contato (pedidos, notas, interações) antes de ' +
      'responder e registra novas atividades relevantes.',
    requiresStore: false,
  },
  {
    name: 'product_lookup',
    label: 'Consultar produtos',
    description:
      'Busca produtos da loja por nome ou SKU e responde com preço, estoque e ' +
      'variantes. Requer loja Shopify conectada.',
    requiresStore: true,
  },
  {
    name: 'order_status',
    label: 'Status de pedido',
    description:
      'Consulta o status de pedidos (pagamento e envio) por número do pedido, ' +
      'e-mail ou telefone do cliente. Requer loja Shopify conectada.',
    requiresStore: true,
  },
]
