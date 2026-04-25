'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  EnvelopeSimple,
  Phone,
  WhatsappLogo,
  MapPin,
  Calendar,
  Tag,
  PencilSimple,
  Plus,
  ShoppingCart,
  Eye,
  PaperPlaneTilt,
  CurrencyDollar,
  Clock,
  CheckCircle,
  Export,
  UserCircle,
  ListBullets,
  ClipboardText,
  TrendUp,
  ChatCircle,
  Warning,
  Lightning,
  Trash,
  ArrowsClockwise,
  Megaphone,
  CursorClick,
  Package,
  Handbag,
} from '@phosphor-icons/react'
import Link from 'next/link'
import { useInboxContact } from '@/hooks/useInboxContact'
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { InboxContact, InboxActivity, InboxNote, InboxTask, InboxOrder, InboxDeal } from '@/types/inbox'

interface ShopifyEvent {
  id: string
  eventType: string
  eventSource: string
  properties: Record<string, any>
  monetaryValue: number | null
  currency: string | null
  occurredAt: string
  shopifyResourceId: string | null
  shopifyResourceType: string | null
}

const shopifyEventLabels: Record<string, string> = {
  placed_order: 'Pedido Realizado',
  ordered_product: 'Produto Comprado',
  fulfilled_order: 'Pedido Entregue',
  cancelled_order: 'Pedido Cancelado',
  refunded_order: 'Pedido Reembolsado',
  checkout_started: 'Checkout Iniciado',
  checkout_completed: 'Checkout Concluído',
  checkout_abandoned: 'Carrinho Abandonado',
  shipment_confirmed: 'Envio Confirmado',
  shipment_delivered: 'Entrega Confirmada',
  viewed_product: 'Produto Visualizado',
  added_to_cart: 'Adicionou ao Carrinho',
  removed_from_cart: 'Removeu do Carrinho',
  viewed_collection: 'Coleção Visualizada',
  submitted_search: 'Pesquisa Realizada',
  page_viewed: 'Página Visualizada',
  cart_viewed: 'Carrinho Visualizado',
  checkout_contact_submitted: 'Email Capturado no Checkout',
  payment_submitted: 'Pagamento Enviado',
  subscribed_email: 'Inscreveu-se por E-mail',
  subscribed_sms: 'Inscreveu-se por SMS',
  profile_created: 'Perfil Criado',
  profile_updated: 'Perfil Atualizado',
}

const activityIconMap: Record<string, { icon: React.ComponentType<any>; color: string; bgColor: string }> = {
  conversation_started: { icon: ChatCircle, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  conversation_closed: { icon: CheckCircle, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  message_sent: { icon: PaperPlaneTilt, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  message_received: { icon: ChatCircle, color: 'text-gray-500', bgColor: 'bg-zinc-500/10' },
  tag_added: { icon: Tag, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  tag_removed: { icon: Tag, color: 'text-gray-500', bgColor: 'bg-zinc-500/10' },
  deal_created: { icon: CurrencyDollar, color: 'text-brand-600', bgColor: 'bg-brand-500/10' },
  deal_won: { icon: CheckCircle, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  deal_lost: { icon: Warning, color: 'text-red-400', bgColor: 'bg-red-500/10' },
  deal_stage_changed: { icon: TrendUp, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  order_placed: { icon: ShoppingCart, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  order_paid: { icon: CheckCircle, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  order_fulfilled: { icon: CheckCircle, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  order_cancelled: { icon: Warning, color: 'text-red-400', bgColor: 'bg-red-500/10' },
  order_refunded: { icon: CurrencyDollar, color: 'text-red-400', bgColor: 'bg-red-500/10' },
  checkout_started: { icon: ShoppingCart, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  cart_abandoned: { icon: ShoppingCart, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  cart_recovered: { icon: ShoppingCart, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  task_created: { icon: ClipboardText, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
  task_completed: { icon: CheckCircle, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  note_added: { icon: PencilSimple, color: 'text-gray-500', bgColor: 'bg-zinc-500/10' },
  comment_added: { icon: PencilSimple, color: 'text-gray-500', bgColor: 'bg-zinc-500/10' },
  contact_created: { icon: UserCircle, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  contact_updated: { icon: PencilSimple, color: 'text-gray-500', bgColor: 'bg-zinc-500/10' },
  campaign_sent: { icon: Megaphone, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  campaign_clicked: { icon: CursorClick, color: 'text-brand-600', bgColor: 'bg-brand-500/10' },
  bot_interaction: { icon: Lightning, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
  blocked: { icon: Warning, color: 'text-red-400', bgColor: 'bg-red-500/10' },
  // Shopify CDP events
  placed_order: { icon: ShoppingCart, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  ordered_product: { icon: ShoppingCart, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  fulfilled_order: { icon: CheckCircle, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  cancelled_order: { icon: Warning, color: 'text-red-400', bgColor: 'bg-red-500/10' },
  refunded_order: { icon: CurrencyDollar, color: 'text-red-400', bgColor: 'bg-red-500/10' },
  checkout_completed: { icon: CheckCircle, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  checkout_abandoned: { icon: ShoppingCart, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  shipment_confirmed: { icon: Export, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  shipment_delivered: { icon: CheckCircle, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  viewed_product: { icon: Eye, color: 'text-gray-500', bgColor: 'bg-zinc-500/10' },
  added_to_cart: { icon: ShoppingCart, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  removed_from_cart: { icon: ShoppingCart, color: 'text-gray-500', bgColor: 'bg-zinc-500/10' },
  viewed_collection: { icon: Eye, color: 'text-gray-500', bgColor: 'bg-zinc-500/10' },
  page_viewed: { icon: Eye, color: 'text-gray-500', bgColor: 'bg-zinc-500/10' },
  checkout_contact_submitted: { icon: EnvelopeSimple, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  subscribed_email: { icon: EnvelopeSimple, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  subscribed_sms: { icon: Phone, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  profile_created: { icon: UserCircle, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  profile_updated: { icon: PencilSimple, color: 'text-gray-500', bgColor: 'bg-zinc-500/10' },
}

const defaultActivityIcon = { icon: Eye, color: 'text-gray-500', bgColor: 'bg-zinc-500/10' }

const tagColors = [
  'bg-yellow-500/10 text-yellow-400',
  'bg-purple-500/10 text-purple-400',
  'bg-emerald-500/10 text-emerald-400',
  'bg-blue-500/10 text-blue-400',
  'bg-red-500/10 text-red-400',
  'bg-pink-500/10 text-pink-400',
  'bg-cyan-500/10 text-cyan-400',
]

const orderStatusConfig: Record<string, { label: string; color: string }> = {
  paid: { label: 'Pago', color: 'text-emerald-400' },
  fulfilled: { label: 'Entregue', color: 'text-emerald-400' },
  partially_fulfilled: { label: 'Parcial', color: 'text-yellow-400' },
  pending: { label: 'Pendente', color: 'text-yellow-400' },
  refunded: { label: 'Reembolsado', color: 'text-red-400' },
  cancelled: { label: 'Cancelado', color: 'text-red-400' },
  authorized: { label: 'Autorizado', color: 'text-blue-400' },
}

function getContactName(c: InboxContact): string {
  if (c.full_name) return c.full_name
  if (c.name) return c.name
  if (c.first_name || c.last_name) return `${c.first_name || ''} ${c.last_name || ''}`.trim()
  if (c.profile_name) return c.profile_name
  return c.email || c.phone_number || 'Sem nome'
}

function getInitials(c: InboxContact): string {
  const name = getContactName(c)
  const parts = name.split(' ').filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (parts[0]?.[0] || '?').toUpperCase()
}

function getCity(c: InboxContact): string | null {
  if (!c.address) return null
  const parts = [c.address.city, c.address.state].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

function formatCurrency(value: number | null | undefined, currency?: string | null): string {
  if (value == null) return ''
  const prefix = currency === 'BRL' ? 'R$ ' : currency ? `${currency} ` : 'R$ '
  return `${prefix}${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

function getDateGroupLabel(dateStr: string): string {
  const date = new Date(dateStr)
  if (isToday(date)) return 'HOJE'
  if (isYesterday(date)) return 'ONTEM'
  return format(date, "d 'de' MMMM, yyyy", { locale: ptBR }).toUpperCase()
}

function renderActivityDescription(activity: any): React.ReactNode {
  const props = activity.properties || (activity as any).props || {}
  const type = activity.activity_type
  const currency = activity.currency || props.currency || 'BRL'

  const productName = props.title || props.product_title || props.ProductName || props.productName
  const productUrl = props.url || props.productUrl || props.product_url
  const price = props.price || props.Price
  const totalPrice = props.total_price || props.totalPrice || props.TotalPrice || activity.monetaryValue
  const orderNumber = props.order_number || props.order_id || props.OrderNumber || props.orderId
  const itemCount = props.item_count || props.ItemCount || (Array.isArray(props.lineItems) ? props.lineItems.length : props.lineItems) || (Array.isArray(props.Items) ? props.Items.length : props.Items)
  const pageTitle = props.title || props.page_title || props.pageTitle
  const pageUrl = props.url || props.page_url || props.pageUrl
  const trackingNumber = props.tracking_number || props.trackingNumber || props.TrackingNumber

  switch (type) {
    case 'viewed_product':
      return (
        <span>
          Viewed product.{productName && <> Product title: {productUrl ? <a href={productUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-600 hover:underline">{productName}</a> : <span className="font-semibold text-teal-600">{productName}</span>}</>}
        </span>
      )
    case 'added_to_cart':
      return (
        <span>
          Added to cart.{productName && <> Product title: {productUrl ? <a href={productUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-600 hover:underline">{productName}</a> : <span className="font-semibold text-teal-600">{productName}</span>}</>}{price != null && <> — {formatCurrency(Number(price), currency)}</>}
        </span>
      )
    case 'placed_order':
      return (
        <span>
          Placed order.{totalPrice != null && <> Amount: <span className="font-semibold text-gray-800">{formatCurrency(Number(totalPrice), currency)}</span></>}{orderNumber && <>; Order number: <span className="font-medium text-gray-700">#{orderNumber}</span></>}{itemCount != null && <> — {itemCount} item(s)</>}
        </span>
      )
    case 'checkout_started':
      return (
        <span>
          Started checkout.{totalPrice != null && <> Amount: <span className="font-semibold text-gray-800">{formatCurrency(Number(totalPrice), currency)}</span></>}{itemCount != null && <> — {itemCount} item(s)</>}
        </span>
      )
    case 'page_viewed':
      return (
        <span>
          Viewed page.{pageTitle && <> Page title: {pageUrl ? <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-600 hover:underline">{pageTitle}</a> : <span className="font-semibold text-teal-600">{pageTitle}</span>}</>}
        </span>
      )
    case 'email_captured':
    case 'checkout_contact_submitted':
      return <span>Email captured at checkout</span>
    case 'profile_created':
      return <span>Profile created</span>
    case 'fulfilled_order':
      return (
        <span>
          Order fulfilled.{orderNumber && <> Order: <span className="font-medium text-gray-700">#{orderNumber}</span></>}{trackingNumber && <> Tracking: <span className="font-medium text-gray-700">{trackingNumber}</span></>}
        </span>
      )
    case 'ordered_product':
      return (
        <span>
          Ordered product.{productName && <> <span className="font-semibold text-teal-600">{productName}</span></>}{price != null && <> — {formatCurrency(Number(price), currency)}</>}
        </span>
      )
    case 'checkout_completed':
      return (
        <span>
          Checkout completed.{totalPrice != null && <> Amount: <span className="font-semibold text-gray-800">{formatCurrency(Number(totalPrice), currency)}</span></>}
        </span>
      )
    case 'cancelled_order':
      return (
        <span>
          Order cancelled.{orderNumber && <> Order: <span className="font-medium text-gray-700">#{orderNumber}</span></>}
        </span>
      )
    case 'refunded_order':
      return (
        <span>
          Order refunded.{totalPrice != null && <> Amount: <span className="font-semibold text-gray-800">{formatCurrency(Number(totalPrice), currency)}</span></>}
        </span>
      )
    case 'removed_from_cart':
      return (
        <span>
          Removed from cart.{productName && <> <span className="font-semibold text-teal-600">{productName}</span></>}
        </span>
      )
    case 'viewed_collection':
      return (
        <span>
          Viewed collection.{(props.collection_title || props.title) && <> <span className="font-semibold text-teal-600">{props.collection_title || props.title}</span></>}
        </span>
      )
    case 'subscribed_email':
      return <span>Subscribed to email marketing</span>
    case 'subscribed_sms':
      return <span>Subscribed to SMS marketing</span>
    default:
      return null
  }
}

export default function ContactDetailPage() {
  const router = useRouter()
  const params = useParams()
  const contactId = params.id as string
  const [activeTab, setActiveTab] = useState<'timeline' | 'notes'>('timeline')
  const [noteText, setNoteText] = useState('')
  const [shopifyEvents, setShopifyEvents] = useState<ShopifyEvent[]>([])
  const [showTagInput, setShowTagInput] = useState(false)
  const [newTagText, setNewTagText] = useState('')

  const {
    contact,
    notes,
    activities,
    orders,
    deals,
    tasks,
    isLoading,
    error,
    fetchContact,
    updateContact,
    addNote,
    deleteNote,
    addTag,
    removeTag,
    createTask,
    completeTask,
    deleteTask,
  } = useInboxContact()

  useEffect(() => {
    if (contactId) {
      fetchContact(contactId)
      // Fetch Shopify CDP events
      fetch(`/api/contacts/${contactId}/shopify-events`)
        .then((res) => res.json())
        .then((data) => setShopifyEvents(data.events || []))
        .catch((err) => console.error('Error fetching shopify events:', err))
    }
  }, [contactId, fetchContact])

  // Merge shopify events into timeline activities
  const mergedActivities = [...activities]
  shopifyEvents.forEach((evt) => {
    mergedActivities.push({
      id: evt.id,
      activity_type: evt.eventType,
      title: shopifyEventLabels[evt.eventType] || evt.eventType,
      description: evt.monetaryValue
        ? `${evt.currency === 'BRL' ? 'R$ ' : (evt.currency || '') + ' '}${evt.monetaryValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}${evt.properties?.OrderNumber ? ` - Pedido #${evt.properties.OrderNumber}` : evt.properties?.order_number ? ` - Pedido #${evt.properties.order_number}` : ''}${evt.properties?.Items ? ` - ${evt.properties.Items.length} item(ns)` : ''}`
        : evt.properties?.OrderNumber || evt.properties?.order_number
        ? `Pedido #${evt.properties.OrderNumber || evt.properties.order_number}`
        : evt.properties?.ProductName || evt.properties?.product_title || null,
      created_at: evt.occurredAt,
      source: 'shopify',
      properties: evt.properties,
      monetaryValue: evt.monetaryValue,
      currency: evt.currency,
    } as any)
  })
  mergedActivities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const handleAddNote = async () => {
    if (!noteText.trim() || !contactId) return
    try {
      await addNote(contactId, noteText.trim())
      setNoteText('')
    } catch (err) {
      console.error('Error adding note:', err)
    }
  }

  const handleAddTag = async () => {
    const tag = newTagText.trim()
    if (!tag || !contactId) return
    try {
      await addTag(contactId, tag)
      setNewTagText('')
      setShowTagInput(false)
    } catch (err) {
      console.error('Error adding tag:', err)
    }
  }

  const handleToggleSubscription = async (field: 'is_subscribed_email' | 'is_subscribed_whatsapp' | 'is_subscribed_sms') => {
    if (!contact || !contactId) return
    try {
      await updateContact(contactId, { [field]: !contact[field] })
    } catch (err) {
      console.error('Error toggling subscription:', err)
    }
  }

  const tabs = [
    { id: 'timeline' as const, label: 'Timeline' },
    { id: 'notes' as const, label: `Notas${notes.length > 0 ? ` (${notes.length})` : ''}` },
  ]

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja excluir este contato? Esta ação é irreversível.')) return
    try {
      const res = await fetch(`/api/contacts?id=${contactId}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/contacts')
      }
    } catch (err) {
      console.error('Error deleting contact:', err)
    }
  }

  // Loading state
  if (isLoading && !contact) {
    return (
      <div className="flex items-center justify-center py-32">
        <ArrowsClockwise size={32} className="animate-spin text-gray-500" />
      </div>
    )
  }

  // Error state
  if (error && !contact) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/contacts')} className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors">
            <ArrowLeft size={18} weight="bold" />
          </button>
          <h1 className="text-2xl font-bold font-display text-gray-900">Contato</h1>
        </div>
        <div className="bg-white/50 border border-gray-200 rounded-xl p-12 text-center">
          <Warning size={32} className="text-red-400 mx-auto mb-3" weight="duotone" />
          <p className="text-sm text-gray-500">Erro ao carregar contato</p>
          <p className="text-xs text-gray-400 mt-1">{error}</p>
          <button onClick={() => fetchContact(contactId)} className="mt-4 px-4 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 text-sm">
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  if (!contact) return null

  const contactName = getContactName(contact)
  const initials = getInitials(contact)
  const city = getCity(contact)
  const totalSpent = contact.total_spent || contact.lifetime_value || 0
  const totalOrders = contact.total_orders || 0
  const avgOrder = totalOrders > 0 ? totalSpent / totalOrders : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/contacts')}
            className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft size={18} weight="bold" />
          </button>
          <div>
            <h1 className="text-2xl font-bold font-display text-gray-900">{contactName}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Contato desde {new Date(contact.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 text-xs transition-colors"
          >
            <Trash size={14} />
            Excluir
          </button>
          <button
            onClick={() => router.push(`/email/campaigns/new?contactId=${contactId}`)}
            className="flex items-center gap-2 px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-medium transition-colors"
          >
            <PaperPlaneTilt size={14} />
            Enviar E-mail
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Panel — Contact Info */}
        <div className="space-y-4">
          {/* Avatar & Basic Info */}
          <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
            <div className="flex flex-col items-center text-center">
              {contact.avatar_url || contact.profile_picture_url ? (
                <img
                  src={contact.avatar_url || contact.profile_picture_url}
                  alt={contactName}
                  className="w-20 h-20 rounded-full object-cover mb-4"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-brand-500 flex items-center justify-center mb-4">
                  <span className="text-2xl font-bold text-white">{initials}</span>
                </div>
              )}
              <h2 className="text-lg font-bold text-gray-900">{contactName}</h2>
              {contact.company && (
                <p className="text-xs text-gray-500 mt-0.5">{contact.position ? `${contact.position} · ` : ''}{contact.company}</p>
              )}
              <span className={`mt-2 px-2.5 py-1 rounded-full text-xs font-medium ${
                contact.is_blocked
                  ? 'bg-red-500/10 text-red-400'
                  : 'bg-emerald-500/10 text-emerald-400'
              }`}>
                {contact.is_blocked ? 'Bloqueado' : 'Ativo'}
              </span>
            </div>

            <div className="mt-6 space-y-3">
              {contact.email && (
                <div className="flex items-center gap-3">
                  <EnvelopeSimple size={16} className="text-gray-500 flex-shrink-0" />
                  <span className="text-sm text-gray-700 truncate">{contact.email}</span>
                </div>
              )}
              {(contact.phone || contact.phone_number) && (
                <div className="flex items-center gap-3">
                  <Phone size={16} className="text-gray-500 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{contact.phone || contact.phone_number}</span>
                </div>
              )}
              {(contact.whatsapp || contact.phone_number) && (
                <div className="flex items-center gap-3">
                  <WhatsappLogo size={16} className="text-[#25D366] flex-shrink-0" />
                  <span className="text-sm text-gray-700">{contact.whatsapp || contact.phone_number}</span>
                </div>
              )}
              {city && (
                <div className="flex items-center gap-3">
                  <MapPin size={16} className="text-gray-500 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{city}</span>
                </div>
              )}
              {contact.source && (
                <div className="flex items-center gap-3">
                  <Calendar size={16} className="text-gray-500 flex-shrink-0" />
                  <span className="text-sm text-gray-700">Origem: {contact.source}</span>
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Tag size={14} className="text-brand-600" />
                Tags
              </h3>
              <button
                onClick={() => setShowTagInput((v) => !v)}
                className="p-1 rounded hover:bg-gray-50 transition-colors"
              >
                <Plus size={14} className="text-gray-500" />
              </button>
            </div>
            {showTagInput && (
              <div className="mb-2">
                <input
                  type="text"
                  autoFocus
                  placeholder="Nome da tag..."
                  value={newTagText}
                  onChange={(e) => setNewTagText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTag()
                    if (e.key === 'Escape') { setShowTagInput(false); setNewTagText('') }
                  }}
                  onBlur={() => { if (!newTagText.trim()) { setShowTagInput(false); setNewTagText('') } }}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500"
                />
              </div>
            )}
            {contact.tags && contact.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {contact.tags.map((tag, i) => (
                  <span
                    key={tag}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium ${tagColors[i % tagColors.length]}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Nenhuma tag adicionada</p>
            )}
          </div>

          {/* Custom Fields */}
          {contact.custom_fields && Object.keys(contact.custom_fields).length > 0 && (
            <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Propriedades</h3>
                <button className="p-1 rounded hover:bg-gray-50 transition-colors">
                  <PencilSimple size={14} className="text-gray-500" />
                </button>
              </div>
              <div className="space-y-3">
                {Object.entries(contact.custom_fields).map(([key, value]) => (
                  <div key={key}>
                    <p className="text-xs text-gray-500">{key}</p>
                    <p className="text-sm text-gray-700 mt-0.5">{String(value)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subscriptions */}
          <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <ListBullets size={14} className="text-brand-600" />
              Canais
            </h3>
            <div className="space-y-2">
              <button
                onClick={() => handleToggleSubscription('is_subscribed_email')}
                className="w-full flex items-center justify-between py-1.5 hover:bg-gray-50 rounded px-1 -mx-1 transition-colors"
              >
                <span className="text-sm text-gray-700 flex items-center gap-2">
                  <EnvelopeSimple size={14} className="text-gray-500" /> E-mail
                </span>
                <span className={`text-xs ${contact.is_subscribed_email !== false ? 'text-emerald-400' : 'text-gray-400'}`}>
                  {contact.is_subscribed_email !== false ? 'Inscrito' : 'Não inscrito'}
                </span>
              </button>
              <button
                onClick={() => handleToggleSubscription('is_subscribed_whatsapp')}
                className="w-full flex items-center justify-between py-1.5 hover:bg-gray-50 rounded px-1 -mx-1 transition-colors"
              >
                <span className="text-sm text-gray-700 flex items-center gap-2">
                  <WhatsappLogo size={14} className="text-[#25D366]" /> WhatsApp
                </span>
                <span className={`text-xs ${contact.is_subscribed_whatsapp !== false ? 'text-emerald-400' : 'text-gray-400'}`}>
                  {contact.is_subscribed_whatsapp !== false ? 'Inscrito' : 'Não inscrito'}
                </span>
              </button>
              <button
                onClick={() => handleToggleSubscription('is_subscribed_sms')}
                className="w-full flex items-center justify-between py-1.5 hover:bg-gray-50 rounded px-1 -mx-1 transition-colors"
              >
                <span className="text-sm text-gray-700 flex items-center gap-2">
                  <Phone size={14} className="text-gray-500" /> SMS
                </span>
                <span className={`text-xs ${contact.is_subscribed_sms ? 'text-emerald-400' : 'text-gray-400'}`}>
                  {contact.is_subscribed_sms ? 'Inscrito' : 'Não inscrito'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Center — Timeline/Notes/Tasks */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white/50 border border-gray-200 rounded-xl">
            <div className="flex border-b border-gray-200">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
                    activeTab === tab.id ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="contactTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500"
                    />
                  )}
                </button>
              ))}
            </div>

            <div className="p-6">
              {/* Timeline Tab */}
              {activeTab === 'timeline' && (
                <div className="space-y-1">
                  {mergedActivities.length === 0 ? (
                    <div className="text-center py-8">
                      <Clock size={24} className="text-zinc-700 mx-auto mb-2" weight="duotone" />
                      <p className="text-sm text-gray-500">Nenhuma atividade registrada</p>
                    </div>
                  ) : (
                    (() => {
                      const grouped: { label: string; items: typeof mergedActivities }[] = []
                      mergedActivities.forEach((activity) => {
                        const label = getDateGroupLabel(activity.created_at)
                        const last = grouped[grouped.length - 1]
                        if (last && last.label === label) {
                          last.items.push(activity)
                        } else {
                          grouped.push({ label, items: [activity] })
                        }
                      })
                      return grouped.map((group) => (
                        <div key={group.label}>
                          <div className="flex items-center gap-3 py-3">
                            <div className="h-px flex-1 bg-gray-100" />
                            <span className="text-[10px] font-semibold text-gray-400 tracking-wider">{group.label}</span>
                            <div className="h-px flex-1 bg-gray-100" />
                          </div>
                          {group.items.map((activity, i) => {
                            const iconCfg = activityIconMap[activity.activity_type] || defaultActivityIcon
                            const Icon = iconCfg.icon
                            const isShopify = (activity as any).source === 'shopify'
                            const richDesc = isShopify ? renderActivityDescription(activity) : null
                            return (
                              <div key={activity.id} className="flex gap-4">
                                <div className="flex flex-col items-center">
                                  <div className={`w-8 h-8 rounded-full ${iconCfg.bgColor} flex items-center justify-center flex-shrink-0 relative`}>
                                    <Icon size={16} className={iconCfg.color} weight="fill" />
                                    {isShopify && (
                                      <img src="/integrations/icone shopify .png" alt="" className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white p-[1px]" />
                                    )}
                                  </div>
                                  {i < group.items.length - 1 && <div className="w-px h-full bg-gray-50 min-h-[24px]" />}
                                </div>
                                <div className="pb-5 min-w-0 flex-1">
                                  {richDesc ? (
                                    <p className="text-sm text-gray-700 leading-relaxed">{richDesc}</p>
                                  ) : (
                                    <>
                                      <p className="text-sm text-gray-700">{activity.title}</p>
                                      {activity.description && <p className="text-xs text-gray-500 mt-0.5">{activity.description}</p>}
                                    </>
                                  )}
                                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                    <Clock size={10} />
                                    {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: ptBR })}
                                  </p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ))
                    })()
                  )}
                </div>
              )}

              {/* Notes Tab */}
              {activeTab === 'notes' && (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Adicionar uma nota..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                      className="flex-1 bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500"
                    />
                    <button
                      onClick={handleAddNote}
                      disabled={!noteText.trim()}
                      className="px-4 py-2 bg-brand-500 text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
                    >
                      Salvar
                    </button>
                  </div>
                  {notes.length === 0 ? (
                    <div className="text-center py-8">
                      <PencilSimple size={24} className="text-zinc-700 mx-auto mb-2" weight="duotone" />
                      <p className="text-sm text-gray-500">Nenhuma nota adicionada</p>
                    </div>
                  ) : (
                    notes.map((note) => (
                      <div key={note.id} className="bg-gray-50/30 rounded-lg p-4 group">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm text-gray-700 leading-relaxed flex-1">{note.content}</p>
                          <button
                            onClick={() => deleteNote(contactId, note.id)}
                            className="p-1 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash size={12} />
                          </button>
                        </div>
                        <div className="flex items-center gap-3 mt-3">
                          <span className="text-xs text-gray-500">{note.created_by_name || 'Sistema'}</span>
                          <span className="text-xs text-gray-400">·</span>
                          <span className="text-xs text-gray-400">
                            {formatDistanceToNow(new Date(note.created_at), { addSuffix: true, locale: ptBR })}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tasks tab removed */}
            </div>
          </div>
        </div>

        {/* Right Panel — Orders & Metrics */}
        <div className="space-y-4">
          {/* Engagement Metrics */}
          <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Engajamento</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Total de mensagens</span>
                <span className="text-sm text-gray-700 font-medium">{contact.total_messages_sent + contact.total_messages_received}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Mensagens enviadas</span>
                <span className="text-sm text-blue-400 font-medium">{contact.total_messages_sent}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Mensagens recebidas</span>
                <span className="text-sm text-emerald-400 font-medium">{contact.total_messages_received}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Conversas</span>
                <span className="text-sm text-brand-600 font-medium">{contact.total_conversations}</span>
              </div>
              {contact.last_message_at && (
                <>
                  <div className="w-full h-px bg-gray-50 my-1" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Última mensagem</span>
                    <span className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(contact.last_message_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Lifetime Value */}
          <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <TrendUp size={14} className="text-emerald-400" />
              Valor do Cliente
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50/30 rounded-lg p-3">
                <p className="text-xs text-gray-500">Total Gasto</p>
                <p className="text-lg font-bold text-gray-900 mt-1">
                  R$ {totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-gray-50/30 rounded-lg p-3">
                <p className="text-xs text-gray-500">Pedidos</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{totalOrders}</p>
              </div>
              <div className="bg-gray-50/30 rounded-lg p-3 col-span-2">
                <p className="text-xs text-gray-500">Ticket Médio</p>
                <p className="text-lg font-bold text-brand-600 mt-1">
                  R$ {avgOrder.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          {/* Produtos no Carrinho (abandoned cart items) */}
          {(() => {
            const completedCheckoutTimes = new Set(
              shopifyEvents
                .filter(e => e.eventType === 'checkout_completed' || e.eventType === 'placed_order')
                .map(e => new Date(e.occurredAt).getTime())
            )
            const cartItems = shopifyEvents
              .filter(e => e.eventType === 'added_to_cart')
              .filter(evt => {
                const evtTime = new Date(evt.occurredAt).getTime()
                // Consider it abandoned if no checkout_completed happened after this add_to_cart
                return ![...completedCheckoutTimes].some(ct => ct > evtTime)
              })
            // Deduplicate by product title, keep most recent
            const seen = new Map<string, ShopifyEvent>()
            cartItems.forEach(evt => {
              const title = evt.properties?.title || evt.properties?.product_title || evt.properties?.ProductName || 'Produto'
              if (!seen.has(title)) seen.set(title, evt)
            })
            const uniqueCartItems = Array.from(seen.values()).slice(0, 5)
            if (uniqueCartItems.length === 0) return null
            const now = Date.now()
            return (
              <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
                  <Handbag size={14} className="text-yellow-500" />
                  Produtos no Carrinho
                </h3>
                <div className="space-y-2">
                  {uniqueCartItems.map((evt) => {
                    const title = evt.properties?.title || evt.properties?.product_title || evt.properties?.ProductName || 'Produto'
                    const price = evt.properties?.price || evt.properties?.Price || evt.monetaryValue
                    const qty = evt.properties?.quantity || evt.properties?.Quantity || 1
                    const hoursAgo = (now - new Date(evt.occurredAt).getTime()) / (1000 * 60 * 60)
                    const isAbandoned = hoursAgo > 24
                    return (
                      <div key={evt.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                        {evt.properties?.imageUrl || evt.properties?.image_url ? (
                          <img
                            src={evt.properties.imageUrl || evt.properties.image_url}
                            alt={title}
                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-gray-100"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                            <ShoppingCart size={16} className="text-gray-300" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 font-medium truncate">{title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-500">{qty}x</span>
                            {price != null && (
                              <span className="text-xs text-gray-500">· R$ {Number(price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            )}
                            {isAbandoned && (
                              <span className="text-[10px] font-medium text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded-full">Abandonado</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Produtos Visualizados Recentes */}
          {(() => {
            const viewedProducts = shopifyEvents.filter(e => e.eventType === 'viewed_product')
            // Deduplicate by product title, keep most recent
            const seen = new Map<string, ShopifyEvent>()
            viewedProducts.forEach(evt => {
              const title = evt.properties?.title || evt.properties?.product_title || evt.properties?.ProductName
              if (title && !seen.has(title)) seen.set(title, evt)
            })
            const uniqueViewed = Array.from(seen.values()).slice(0, 5)
            if (uniqueViewed.length === 0) return null
            return (
              <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
                  <Eye size={14} className="text-gray-500" />
                  Produtos Visualizados Recentes
                </h3>
                <div className="space-y-2">
                  {uniqueViewed.map((evt) => {
                    const title = evt.properties?.title || evt.properties?.product_title || evt.properties?.ProductName || 'Produto'
                    const price = evt.properties?.price || evt.properties?.Price
                    const imageUrl = evt.properties?.imageUrl || evt.properties?.image_url || evt.properties?.featuredImage
                    const productUrl = evt.properties?.url || evt.properties?.productUrl || evt.properties?.product_url
                    return (
                      <div key={evt.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={title}
                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-gray-100"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                            <Package size={16} className="text-gray-300" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          {productUrl ? (
                            <a href={productUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-teal-600 font-medium truncate block hover:underline">{title}</a>
                          ) : (
                            <p className="text-sm text-gray-700 font-medium truncate">{title}</p>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            {price != null && (
                              <span className="text-xs text-gray-500">R$ {Number(price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            )}
                            <span className="text-xs text-gray-400">
                              {formatDistanceToNow(new Date(evt.occurredAt), { addSuffix: true, locale: ptBR })}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Deals */}
          {deals.length > 0 && (
            <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
                <CurrencyDollar size={14} className="text-brand-600" />
                Negociações
              </h3>
              <div className="space-y-3">
                {deals.slice(0, 5).map((deal) => (
                  <div key={deal.id} className="flex items-center justify-between py-2 border-b border-gray-200/50 last:border-0">
                    <div>
                      <p className="text-sm text-gray-700 font-medium">{deal.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {deal.stage?.name || 'Sem etapa'} · {deal.status === 'won' ? 'Ganho' : deal.status === 'lost' ? 'Perdido' : 'Aberto'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-700 font-medium">R$ {deal.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      <p className={`text-xs ${deal.status === 'won' ? 'text-emerald-400' : deal.status === 'lost' ? 'text-red-400' : 'text-blue-400'}`}>
                        {deal.status === 'won' ? 'Ganho' : deal.status === 'lost' ? 'Perdido' : 'Aberto'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Orders */}
          {orders.length > 0 && (
            <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <ShoppingCart size={14} className="text-brand-600" />
                  Pedidos Recentes
                </h3>
              </div>
              <div className="space-y-3">
                {orders.slice(0, 5).map((order) => {
                  const status = orderStatusConfig[order.financial_status] || orderStatusConfig[order.fulfillment_status || ''] || { label: order.financial_status, color: 'text-gray-500' }
                  return (
                    <div key={order.id} className="flex items-center justify-between py-2 border-b border-gray-200/50 last:border-0">
                      <div>
                        <p className="text-sm text-gray-700 font-medium">#{order.order_number}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(order.created_at).toLocaleDateString('pt-BR')} · {order.line_items?.length || 0} {(order.line_items?.length || 0) === 1 ? 'item' : 'itens'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-700 font-medium">
                          {order.currency === 'BRL' ? 'R$ ' : `${order.currency} `}{order.total_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                        <p className={`text-xs ${status.color}`}>{status.label}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Products Purchased (from Shopify events) */}
          {shopifyEvents.filter(e => e.eventType === 'ordered_product' || e.eventType === 'placed_order').length > 0 && (
            <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
                <ShoppingCart size={14} className="text-blue-500" />
                Produtos Comprados
              </h3>
              <div className="space-y-2">
                {shopifyEvents
                  .filter(e => e.eventType === 'ordered_product')
                  .slice(0, 10)
                  .map((evt) => (
                    <div key={evt.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 font-medium truncate">
                          {evt.properties?.ProductName || evt.properties?.title || 'Produto'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {evt.properties?.Quantity || evt.properties?.quantity || 1}x · {evt.properties?.SKU || evt.properties?.sku || ''}
                        </p>
                      </div>
                      <p className="text-sm text-gray-900 font-medium ml-3">
                        {evt.monetaryValue ? `R$ ${evt.monetaryValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                      </p>
                    </div>
                  ))}
                {shopifyEvents.filter(e => e.eventType === 'ordered_product').length === 0 &&
                  shopifyEvents.filter(e => e.eventType === 'placed_order').slice(0, 5).map((evt) => (
                    <div key={evt.id} className="py-2 border-b border-gray-100 last:border-0">
                      <p className="text-sm text-gray-700 font-medium">
                        Pedido #{evt.properties?.OrderNumber || evt.properties?.order_number || '—'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {evt.properties?.ItemCount || evt.properties?.item_count || 0} itens · R$ {evt.monetaryValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0'}
                      </p>
                    </div>
                  ))
                }
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
