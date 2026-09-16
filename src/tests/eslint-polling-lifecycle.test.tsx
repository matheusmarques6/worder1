// @vitest-environment jsdom

import React, { act } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'

const external = vi.hoisted(() => ({
  authedFetch: vi.fn(), channel: { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }, removeChannel: vi.fn(), fetchConversations: vi.fn(), refreshConversations: vi.fn(), fetchInstances: vi.fn(), fetchMessages: vi.fn(), fetchContact: vi.fn(), clearMessages: vi.fn(), clearContact: vi.fn(), refetchLatest: vi.fn(), selectedConversation: { id: 'conversation-1', contact_id: 'contact-1' } as any,
}))

vi.mock('framer-motion', () => ({ motion: { div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div> }, AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</> }))
vi.mock('@/lib/api/authed-fetch', () => ({ authedFetch: external.authedFetch }))
vi.mock('@/lib/supabase-client', () => ({ supabaseClient: { channel: vi.fn(() => external.channel), removeChannel: external.removeChannel } }))
vi.mock('@/stores', () => ({ useAuthStore: () => ({ user: { organization_id: 'org-1', id: 'user-1', email: 'user@example.com' } }), useStoreStore: () => ({ currentStore: { id: 'store-1' } }) }))
vi.mock('@/hooks/useWhatsAppConnectionManager', () => ({ mapNumberToInstance: (number: any) => number, useWhatsAppConnection: () => ({ instances: [], selectedInstance: null, loading: false, selectInstance: vi.fn(), fetchInstances: external.fetchInstances }) }))
vi.mock('@/hooks/useInboxConversations', () => ({ useInboxConversations: () => ({ conversations: [], selectedConversation: external.selectedConversation, isLoading: false, isRefreshing: false, filters: {}, selectConversation: vi.fn(), fetchConversations: external.fetchConversations, toggleBot: vi.fn(), setFilters: vi.fn(), refresh: external.refreshConversations, markAsRead: vi.fn() }) }))
vi.mock('@/hooks/useInboxMessages', () => ({
  useInboxMessages: () => ({ messages: [], isLoading: false, isSending: false, isUploading: false, fetchMessages: external.fetchMessages, sendMessage: vi.fn(), sendMedia: vi.fn(), addMessage: vi.fn(), updateMessageStatus: vi.fn(), clear: external.clearMessages, refetchLatest: external.refetchLatest }),
}))
vi.mock('@/hooks/useInboxContact', () => ({
  useInboxContact: () => ({ contact: null, conversation: null, notes: [], activities: [], orders: [], cart: null, activeDeal: null, deals: [], tasks: [], invoices: [], comments: [], isLoading: false, fetchContact: external.fetchContact, updateContact: vi.fn(), addTag: vi.fn(), removeTag: vi.fn(), addNote: vi.fn(), deleteNote: vi.fn(), blockContact: vi.fn(), unblockContact: vi.fn(), fetchOrders: vi.fn(), fetchDeals: vi.fn(), createDeal: vi.fn(), assignConversation: vi.fn(), toggleBot: vi.fn(), createTask: vi.fn(), completeTask: vi.fn(), deleteTask: vi.fn(), uploadInvoice: vi.fn(), deleteInvoice: vi.fn(), addComment: vi.fn(), refreshContact: vi.fn(), clear: external.clearContact }),
}))
vi.mock('@/hooks/useCloudInboxRealtime', () => ({ useCloudInboxRealtime: () => ({ isConnected: false, channels: { messages: 'idle' } }) }))
vi.mock('@/components/whatsapp/inbox/ConversationList', () => ({ ConversationList: () => null }))
vi.mock('@/components/whatsapp/inbox/ChatPanel', () => ({ ChatPanel: () => null }))
vi.mock('@/components/whatsapp/inbox/ContactPanel', () => ({ ContactPanel: () => null }))
vi.mock('@/components/whatsapp/inbox/ReactivateAiBanner', () => ({ ReactivateAiBanner: () => null }))
vi.mock('@/components/whatsapp/inbox/WhatsAppConnectionManager', () => ({ default: () => null }))
vi.mock('@/components/whatsapp/WhatsAppConnectUnified', () => ({ default: () => null }))

let root: Root
let container: HTMLDivElement
let ImportTab: typeof import('@/components/integrations/shopify/tabs/ImportTab').ImportTab
let InboxContent: typeof import('@/components/whatsapp/inbox/InboxContent').default
let useNotifications: typeof import('@/hooks/useNotifications').useNotifications
let WhatsAppConnectionManager: typeof import('@/components/whatsapp/inbox/WhatsAppConnectionManager').default
const response = (data: unknown) => ({ ok: true, json: async () => data })

beforeEach(async () => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers()
  ;({ ImportTab } = await import('@/components/integrations/shopify/tabs/ImportTab'))
  ;({ default: InboxContent } = await import('@/components/whatsapp/inbox/InboxContent'))
  ;({ useNotifications } = await import('@/hooks/useNotifications'))
  ;({ default: WhatsAppConnectionManager } = await vi.importActual('@/components/whatsapp/inbox/WhatsAppConnectionManager'))
  external.authedFetch.mockResolvedValue(response({ steps: [] }))
  external.selectedConversation = { id: 'conversation-1', contact_id: 'contact-1' }
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks() })

it('cleans ImportTab polling after an import starts', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'POST') return response({ job: { id: 'job-1', status: 'running', total_customers: 1, processed_count: 0, created_count: 0, updated_count: 0, skipped_count: 0, error_count: 0, deals_created_count: 0, current_page: 0 } })
    if (url.includes('jobId=job-1')) return response({ job: { id: 'job-1', status: 'running' } })
    if (url.includes('import-jobs')) return response({ jobs: [] })
    return response({ count: 1, existingInCRM: 0, availableTags: [] })
  })
  vi.stubGlobal('fetch', fetchMock)
  await act(async () => { root.render(<ImportTab store={{ id: 'store-1', shop_name: null, shop_domain: 'store.test' }} organizationId="org-1" pipelines={[]} />) })
  await act(async () => { await vi.runAllTicks() })
  const start = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Iniciar Importação'))!
  await act(async () => { start.dispatchEvent(new MouseEvent('click', { bubbles: true })) }); await act(async () => { await vi.runAllTicks() }); await act(async () => root.unmount()); await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('jobId=job-1'))).toHaveLength(0)
})

it('fetches the Inbox list once and keeps one conversation poll', async () => {
  await act(async () => { root.render(<InboxContent />) }); expect(external.fetchConversations).toHaveBeenCalledTimes(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) }); expect(external.refreshConversations).toHaveBeenCalledTimes(1)
})

it('switches Inbox messages and contact by scalar IDs', async () => {
  await act(async () => { root.render(<InboxContent />) })
  external.selectedConversation = { id: 'conversation-2', contact_id: 'contact-2' }
  await act(async () => { root.render(<InboxContent />) })
  external.selectedConversation = { id: 'conversation-2', contact_id: 'contact-3' }
  await act(async () => { root.render(<InboxContent />) })
  expect(external.fetchMessages.mock.calls.map(([id]) => id)).toEqual(['conversation-1', 'conversation-2'])
  expect(external.fetchContact.mock.calls).toEqual([['contact-1', 'conversation-1'], ['contact-2', 'conversation-2'], ['contact-3', 'conversation-2']])
})

it('uses the latest selection callback without restarting the connection poll', async () => {
  const firstSelect = vi.fn(); const latestSelect = vi.fn(); external.authedFetch.mockResolvedValue(response({ numbers: [{ id: 'number-1', phone_number: '+5511', status: 'connected' }] })); const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
  await act(async () => { root.render(<WhatsAppConnectionManager organizationId="org-1" storeId="store-1" selectedInstance={null} onSelectInstance={firstSelect} onConnectClick={vi.fn()} />) }); await act(async () => { await vi.runAllTicks() })
  await act(async () => { root.render(<WhatsAppConnectionManager organizationId="org-1" storeId="store-1" selectedInstance={{ id: 'number-1', status: 'disconnected' } as any} onSelectInstance={latestSelect} onConnectClick={vi.fn()} />) }); await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(setIntervalSpy).toHaveBeenCalledTimes(1); expect(latestSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'number-1', status: 'connected' }))
})

it('keeps one notifications timer and channel while loading the next offset', async () => {
  let notificationIndex = 0
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) => response({ notifications: [{ id: 'notification-' + ++notificationIndex, read: false }], unread_count: 1, total: 40 })); vi.stubGlobal('fetch', fetchMock); const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
  function Harness() { const { loadMore } = useNotifications({ organizationId: 'org-1', userId: 'user-1', pollInterval: 1000 }); return <button onClick={loadMore}>more</button> }
  await act(async () => { root.render(<Harness />) }); await act(async () => { await vi.runAllTicks() }); await act(async () => { container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true })) }); await act(async () => { await vi.runAllTicks() })
  expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain('/api/notifications?organization_id=org-1&user_id=user-1&limit=20&offset=20'); expect(setIntervalSpy).toHaveBeenCalledTimes(1); expect(external.channel.on).toHaveBeenCalledTimes(1)
})
