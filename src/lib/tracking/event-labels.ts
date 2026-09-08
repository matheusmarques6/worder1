// Rótulos em português dos tipos de evento (Configurações → Rastreamento,
// linha do tempo do contato). Mesma lista de /api/analytics/metrics.

export const EVENT_LABELS: Record<string, string> = {
  viewed_product: 'Produto visualizado', viewed_collection: 'Coleção visualizada', submitted_search: 'Busca realizada',
  added_to_cart: 'Adicionado ao carrinho', removed_from_cart: 'Removido do carrinho', cart_viewed: 'Carrinho visualizado',
  checkout_started: 'Checkout iniciado', checkout_contact_submitted: 'Contato do checkout enviado', payment_submitted: 'Pagamento enviado',
  checkout_completed: 'Checkout concluído', checkout_abandoned: 'Checkout abandonado',
  placed_order: 'Pedido realizado', order_paid: 'Pedido pago', ordered_product: 'Produto pedido', fulfilled_order: 'Pedido enviado',
  shipment_confirmed: 'Envio confirmado', shipment_delivered: 'Envio entregue', cancelled_order: 'Pedido cancelado', refunded_order: 'Pedido reembolsado',
  active_on_site: 'Ativo no site', page_viewed: 'Página visualizada',
  email_received: 'E-mail recebido', email_opened: 'E-mail aberto', email_clicked: 'E-mail clicado', email_bounced: 'E-mail retornado',
  email_unsubscribed: 'Descadastrado', email_conversion: 'Conversão de e-mail',
  whatsapp_message_received: 'WhatsApp recebido', whatsapp_first_message: 'Primeira mensagem WhatsApp', whatsapp_keyword: 'Palavra-chave WhatsApp',
  ctwa_ad: 'Anúncio Click-to-WhatsApp', back_in_stock: 'Alerta de volta ao estoque',
  form_submitted: 'Formulário enviado', profile_created: 'Cliente criado', customer_created: 'Cliente criado', profile_updated: 'Perfil atualizado',
  subscribed_email: 'Inscrito no e-mail', subscribed_sms: 'Inscrito no SMS', rfm_segment_change: 'Mudança de segmento RFM',
}

export function eventLabel(type: string | null | undefined): string {
  if (!type) return 'Evento'
  return EVENT_LABELS[type] || type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

/** Resumo curto das propriedades para a lista de eventos recentes. */
export function eventSummary(type: string, p: any, value: number | null, currency: string | null): string {
  const props = p || {}
  const money = (v: number, c: string | null) => {
    try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: c || 'BRL' }).format(v) } catch { return `${c || ''} ${v}` }
  }
  const parts: string[] = []
  const orderNo = props.order_number || props.name || props.OrderNumber || props.order?.order_number
  if (orderNo) parts.push(String(orderNo).startsWith('#') ? String(orderNo) : `#${orderNo}`)
  const items = props.line_items?.length || props.items?.length || props.ItemCount || props.item_count
  if (items) parts.push(`${items} ${Number(items) === 1 ? 'item' : 'itens'}`)
  if (value != null && Number.isFinite(Number(value)) && Number(value) > 0) parts.push(money(Number(value), currency))
  else if (props.total_price || props.Value) parts.push(money(Number(props.total_price || props.Value), currency || props.currency))
  if (!parts.length) {
    const title = props.product_title || props.ProductName || props.title || props.name || props.query || props.search_query
    if (title) parts.push(String(title))
  }
  if (!parts.length) {
    const email = props.email || props.customer?.email || props.customer_email
    if (email) parts.push(String(email))
  }
  if (!parts.length && props.page_url) parts.push(String(props.page_url).replace(/^https?:\/\//, '').slice(0, 60))
  return parts.join(' · ') || type
}
