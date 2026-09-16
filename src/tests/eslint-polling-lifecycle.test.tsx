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
const job = (id: string, status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' = 'running') => ({ id, status, total_customers: 1, processed_count: 0, created_count: 0, updated_count: 0, skipped_count: 0, error_count: 0, deals_created_count: 0, current_page: 0, last_error: null, started_at: null, completed_at: null })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

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
    if (url.includes('jobId=job-1')) return response({ job: job('job-1') })
    if (url.includes('import-jobs')) return response({ jobs: [] })
    return response({ count: 1, existingInCRM: 0, availableTags: [] })
  })
  vi.stubGlobal('fetch', fetchMock)
  await act(async () => { root.render(<ImportTab store={{ id: 'store-1', shop_name: null, shop_domain: 'store.test' }} organizationId="org-1" pipelines={[]} />) })
  await act(async () => { await vi.runAllTicks() })
  const start = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Iniciar Importação'))!
  await act(async () => { start.dispatchEvent(new MouseEvent('click', { bubbles: true })) }); await act(async () => { await vi.runAllTicks() }); await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('jobId=job-1'))).toHaveLength(1)
  await act(async () => root.unmount()); await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('jobId=job-1'))).toHaveLength(1)
})

it('does not start a stale initial poll after switching stores', async () => {
  const staleJobs = deferred<ReturnType<typeof response>>()
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('import-customers')) return Promise.resolve(response({ count: 1, existingInCRM: 0, availableTags: [] }))
    if (url.includes('storeId=store-a')) return staleJobs.promise
    if (url.includes('storeId=store-b')) return Promise.resolve(response({ jobs: [] }))
    return Promise.resolve(response({ job: job('unexpected') }))
  })
  vi.stubGlobal('fetch', fetchMock)
  await act(async () => { root.render(<ImportTab store={{ id: 'store-a', shop_name: null, shop_domain: 'a.test' }} organizationId="org-1" pipelines={[]} />) }); await act(async () => { await vi.runAllTicks() })
  await act(async () => { root.render(<ImportTab store={{ id: 'store-b', shop_name: null, shop_domain: 'b.test' }} organizationId="org-1" pipelines={[]} />) }); await act(async () => { await vi.runAllTicks() })
  await act(async () => { staleJobs.resolve(response({ jobs: [job('job-a')] })); await vi.runAllTicks() }); await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('jobId=job-a'))).toHaveLength(0)
})

it('does not start a stale POST poll after unmount', async () => {
  const post = deferred<ReturnType<typeof response>>()
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') return post.promise
    const url = String(input)
    if (url.includes('import-jobs')) return Promise.resolve(response({ jobs: [] }))
    return Promise.resolve(response({ count: 1, existingInCRM: 0, availableTags: [] }))
  })
  vi.stubGlobal('fetch', fetchMock)
  await act(async () => { root.render(<ImportTab store={{ id: 'store-a', shop_name: null, shop_domain: 'a.test' }} organizationId="org-1" pipelines={[]} />) }); await act(async () => { await vi.runAllTicks() })
  const start = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Iniciar Importação'))!
  await act(async () => { start.dispatchEvent(new MouseEvent('click', { bubbles: true })) }); await act(async () => root.unmount())
  await act(async () => { post.resolve(response({ job: job('job-a') })); await vi.runAllTicks(); await vi.advanceTimersByTimeAsync(2000) })
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('jobId=job-a'))).toHaveLength(0)
})

it('does not let a stale completion publish after a store switch', async () => {
  const pollA = deferred<ReturnType<typeof response>>()
  const onSuccess = vi.fn()
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('import-customers')) return Promise.resolve(response({ count: 1, existingInCRM: 0, availableTags: [] }))
    if (url.includes('storeId=store-a')) return Promise.resolve(response({ jobs: [job('job-a')] }))
    if (url.includes('storeId=store-b')) return Promise.resolve(response({ jobs: [job('job-b')] }))
    if (url.includes('jobId=job-a')) return pollA.promise
    return Promise.resolve(response({ job: job('job-b') }))
  })
  vi.stubGlobal('fetch', fetchMock)
  await act(async () => { root.render(<ImportTab store={{ id: 'store-a', shop_name: null, shop_domain: 'a.test' }} organizationId="org-1" pipelines={[]} onSuccess={onSuccess} />) }); await act(async () => { await vi.runAllTicks(); await vi.advanceTimersByTimeAsync(2000) })
  await act(async () => { root.render(<ImportTab store={{ id: 'store-b', shop_name: null, shop_domain: 'b.test' }} organizationId="org-1" pipelines={[]} onSuccess={onSuccess} />) }); await act(async () => { await vi.runAllTicks() })
  await act(async () => { pollA.resolve(response({ job: job('job-a', 'completed') })); await vi.runAllTicks() })
  expect(onSuccess).not.toHaveBeenCalled()
})

it('does not let DELETE for job A clear job B polling', async () => {
  const deleteA = deferred<ReturnType<typeof response>>()
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'DELETE') return deleteA.promise
    if (url.includes('import-customers')) return Promise.resolve(response({ count: 1, existingInCRM: 0, availableTags: [] }))
    if (url.includes('storeId=store-a')) return Promise.resolve(response({ jobs: [job('job-a')] }))
    if (url.includes('storeId=store-b')) return Promise.resolve(response({ jobs: [job('job-b')] }))
    return Promise.resolve(response({ job: job('job-b') }))
  })
  vi.stubGlobal('fetch', fetchMock)
  await act(async () => { root.render(<ImportTab store={{ id: 'store-a', shop_name: null, shop_domain: 'a.test' }} organizationId="org-1" pipelines={[]} />) }); await act(async () => { await vi.runAllTicks() })
  const cancel = [...container.querySelectorAll('button')].find((button) => button.title === 'Cancelar importação')!
  await act(async () => { cancel.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  await act(async () => { root.render(<ImportTab store={{ id: 'store-b', shop_name: null, shop_domain: 'b.test' }} organizationId="org-1" pipelines={[]} />) }); await act(async () => { await vi.runAllTicks(); deleteA.resolve(response({})); await vi.runAllTicks(); await vi.advanceTimersByTimeAsync(2000) })
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('jobId=job-b'))).toHaveLength(1)
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
  const firstSelect = vi.fn(); const latestSelect = vi.fn(); let request = 0
  external.authedFetch.mockImplementation(async () => response({ numbers: [request++ === 0 ? { id: 'number-a', phone_number: '+5511', status: 'connected' } : { id: 'number-b', phone_number: '+5521', status: 'connected' }] }))
  const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
  await act(async () => { root.render(<WhatsAppConnectionManager organizationId="org-1" storeId="store-1" selectedInstance={{ id: 'number-a', status: 'connected' } as any} onSelectInstance={firstSelect} onConnectClick={vi.fn()} />) }); await act(async () => { await vi.runAllTicks() })
  await act(async () => { root.render(<WhatsAppConnectionManager organizationId="org-1" storeId="store-1" selectedInstance={{ id: 'number-b', status: 'disconnected' } as any} onSelectInstance={latestSelect} onConnectClick={vi.fn()} />) }); await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(setIntervalSpy).toHaveBeenCalledTimes(1); expect(latestSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'number-b', status: 'connected' }))
})

it('keeps one notifications timer and channel while loading the next offset', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('limit=1')) return response({ unread_count: 2 })
    const offset = Number(new URL(url, 'https://worder.test').searchParams.get('offset'))
    return response({ notifications: Array.from({ length: 20 }, (_, i) => ({ id: 'notification-' + (offset + i), read: false })), unread_count: 1, total: 60 })
  }); vi.stubGlobal('fetch', fetchMock); const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
  function Harness() { const { notifications, loadMore } = useNotifications({ organizationId: 'org-1', userId: 'user-1', pollInterval: 1000 }); return <><span>{notifications.length}</span><button onClick={loadMore}>more</button></> }
  await act(async () => { root.render(<Harness />) }); await act(async () => { await vi.runAllTicks() }); await act(async () => { container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true })) }); await act(async () => { await vi.runAllTicks() })
  expect(container.querySelector('span')!.textContent).toBe('40')
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('limit=20&offset=0'))).toHaveLength(1)
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('limit=20&offset=20'))).toHaveLength(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('limit=1'))).toHaveLength(1)
  await act(async () => { await external.channel.on.mock.calls[0][2]() })
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('limit=20&offset=0'))).toHaveLength(3)
  expect(setIntervalSpy).toHaveBeenCalledTimes(1); expect(external.channel.on).toHaveBeenCalledTimes(1)
  await act(async () => root.unmount())
  expect(external.removeChannel).toHaveBeenCalledWith(external.channel)
})
