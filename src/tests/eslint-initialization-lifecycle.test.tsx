// @vitest-environment jsdom

import React, { act, StrictMode, useEffect, useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { useAuthStore, useStoreStore, useUIStore } from '@/stores'
import { useFlowStore } from '@/stores/flowStore'
import { useDeals } from '@/hooks/useDeals'
import DashboardLayout from '@/app/(dashboard)/layout'
import { FlowBuilder } from '@/components/flow-builder'
import { AdvancedMetricsSection } from '@/components/shopify/AdvancedMetricsSection'
import { ContactDrawer } from '@/components/crm/ContactDrawer'

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('next/image', () => ({ default: () => null }))
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  motion: Object.fromEntries(['div', 'button'].map((name) => [name,
    ({ children, whileHover, whileTap, ...props }: React.HTMLAttributes<HTMLElement> & { whileHover?: unknown, whileTap?: unknown }) => React.createElement(name, props, children),
  ])),
}))
vi.mock('@/components/ui/Toast', () => ({ ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/ui/ConfirmDialog', () => ({ ConfirmProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/store/AddStoreModal', () => ({ AddStoreModal: () => null }))
vi.mock('@/components/integrations/shopify/PixelHealthBanner', () => ({ PixelHealthBanner: () => null }))
vi.mock('@/components/flow-builder/Canvas', () => ({ Canvas: () => null }))
vi.mock('@/components/flow-builder/Sidebar', () => ({ Sidebar: () => null }))
vi.mock('@/components/flow-builder/Toolbar', () => ({ Toolbar: ({ currentAutomationId }: { currentAutomationId?: string }) => <span>toolbar:{currentAutomationId}</span> }))
vi.mock('@/components/flow-builder/panels/PropertiesPanel', () => ({ PropertiesPanel: ({ automationId }: { automationId?: string }) => <span>properties:{automationId}</span> }))
vi.mock('@/components/flow-builder/panels/ExecutionPanel', () => ({ ExecutionPanel: ({ automationId }: { automationId?: string }) => <span>execution:{automationId}</span> }))
vi.mock('@/components/flow-builder/panels/HistoryPanel', () => ({ HistoryPanel: ({ automationId }: { automationId?: string }) => <span>history:{automationId}</span> }))
vi.mock('@xyflow/react', () => ({ ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/shopify/RFMSection', () => ({ RFMSection: ({ data }: { data: { totalCustomers: number } }) => <div>customers:{data.totalCustomers}</div> }))
vi.mock('@/components/shopify/CohortSection', () => ({ CohortSection: () => null }))
vi.mock('@/lib/supabase-client', () => ({ supabaseClient: { channel: () => { const channel = { on: () => channel, subscribe: () => channel, unsubscribe: vi.fn() }; return channel }, removeChannel: vi.fn() } }))

let root: Root
let container: HTMLDivElement
let mounted = false
let attached = false

const store = (id: string) => ({ id, name: `Store ${id}`, domain: `${id}.myshopify.com`, isActive: true })
const response = (data: unknown) => ({ ok: true, json: async () => data })
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  return { promise: new Promise<T>((done, fail) => { resolve = done; reject = fail }), resolve, reject }
}

function DealsProbe({ onIdentity }: { onIdentity: (refetch: unknown) => void }) {
  const { refetch } = useDeals()
  const [, setTick] = useState(0)
  useEffect(() => onIdentity(refetch), [refetch, onIdentity])
  return <button onClick={() => setTick((tick) => tick + 1)}>rerender</button>
}

beforeEach(() => {
  mounted = false
  attached = false
  vi.stubGlobal('React', React)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  useAuthStore.setState({ user: { id: 'user-1', name: 'User', email: 'user@example.com', organization_id: 'org-1' } as any })
  useUIStore.setState({ sidebarCollapsed: false, _hasHydrated: true })
  useStoreStore.setState({ stores: [store('store-a')], currentStore: store('store-a'), _hasHydrated: true })
  useFlowStore.getState().resetStore()
  container = document.createElement('div')
  document.body.append(container)
  attached = true
  root = createRoot(container)
  mounted = true
})

afterEach(async () => {
  if (mounted) await act(async () => root.unmount())
  if (attached) container.remove()
  mounted = false
  attached = false
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

it('keeps store B when the store A loader completes after a user switch', async () => {
  const storesRequest = deferred<any>()
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => String(input) === '/api/stores'
    ? storesRequest.promise
    : Promise.resolve(response({ notifications: [], unreadCount: 0 }))))

  await act(async () => { root.render(<DashboardLayout><div /></DashboardLayout>) })
  await act(async () => { useStoreStore.getState().setCurrentStore(store('store-b')) })
  await act(async () => { storesRequest.resolve(response({ success: true, stores: [
    { id: 'store-a', shop_name: 'Store A', shop_domain: 'a.myshopify.com' },
    { id: 'store-b', shop_name: 'Store B', shop_domain: 'b.myshopify.com' },
  ] })) })

  await vi.waitFor(() => expect(useStoreStore.getState().currentStore?.id).toBe('store-b'))
})

it('preserves edits on equivalent flow input, owns two keyboard listeners, and reloads once for a new automation', async () => {
  const activeKeydownListeners = new Set<EventListenerOrEventListenerObject>()
  const addEventListener = window.addEventListener.bind(window)
  const removeEventListener = window.removeEventListener.bind(window)
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'keydown') activeKeydownListeners.add(listener)
    addEventListener(type, listener, options)
  })
  vi.spyOn(window, 'removeEventListener').mockImplementation((type, listener, options) => {
    if (type === 'keydown') activeKeydownListeners.delete(listener)
    removeEventListener(type, listener, options)
  })
  const first = [{ id: 'node-a', type: 'trigger_order', position: { x: 0, y: 0 }, data: {} }]
  const replacement = [{ ...first[0], data: {} }]
  const second = [{ id: 'node-b', type: 'trigger_order', position: { x: 0, y: 0 }, data: {} }]
  const props = { initialNodes: first, initialEdges: [], onSave: vi.fn(async () => undefined), onBack: vi.fn(), organizationId: 'org-1' }

  await act(async () => { root.render(<StrictMode><FlowBuilder automationId="flow-a" {...props} /></StrictMode>) })
  await vi.waitFor(() => expect(useFlowStore.getState().automationId).toBe('flow-a'))
  expect(activeKeydownListeners.size).toBe(2)
  await act(async () => { useFlowStore.getState().updateNode('node-a', { label: 'edited' }) })
  await act(async () => { root.render(<StrictMode><FlowBuilder automationId="flow-a" {...props} initialNodes={replacement} initialEdges={[]} /></StrictMode>) })
  expect(useFlowStore.getState().nodes[0].data.label).toBe('edited')
  expect(activeKeydownListeners.size).toBe(2)

  await act(async () => { useFlowStore.setState({ showTestModal: true, showHistoryPanel: true, showAnalytics: true, analyticsData: { old: { sent: 1, opened: 1, clicked: 1, revenue: 1 } } }) })
  await act(async () => { root.render(<StrictMode><FlowBuilder automationId="flow-b" {...props} initialNodes={second} initialEdges={[]} /></StrictMode>) })
  await vi.waitFor(() => expect(useFlowStore.getState().nodes.map((node) => node.id)).toEqual(['node-b']))
  expect(useFlowStore.getState()).toMatchObject({ automationId: 'flow-b', showTestModal: false, showHistoryPanel: false, showAnalytics: false, analyticsData: {} })
  await act(async () => { useFlowStore.setState({ showPropertiesPanel: true, showTestModal: true, showHistoryPanel: true }) })
  await vi.waitFor(() => expect(container.textContent).toContain('toolbar:flow-b'))
  expect(container.textContent).toContain('properties:flow-b')
  expect(container.textContent).toContain('execution:flow-b')
  expect(container.textContent).toContain('history:flow-b')
  expect(activeKeydownListeners.size).toBe(2)
  await act(async () => root.unmount())
  expect(activeKeydownListeners.size).toBe(0)
})

it('ignores stale A1 metrics errors while A2 loads and after A2 succeeds', async () => {
  const requests: Array<{ url: string, result: ReturnType<typeof deferred<any>> }> = []
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const result = deferred<any>()
    requests.push({ url: String(input), result })
    return result.promise
  }))

  await act(async () => { root.render(<AdvancedMetricsSection storeId="store-a" />) })
  await act(async () => { [...container.querySelectorAll('button')][0].dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  await vi.waitFor(() => expect(requests).toHaveLength(1))
  await act(async () => { root.render(<AdvancedMetricsSection storeId="store-b" />) })
  await vi.waitFor(() => expect(requests).toHaveLength(2))
  await act(async () => { root.render(<AdvancedMetricsSection storeId="store-a" />) })
  await vi.waitFor(() => expect(requests).toHaveLength(3))
  await act(async () => { requests[0].result.reject(new Error('old A1')) })
  expect(container.textContent).toContain('Calculando métricas...')
  expect(container.textContent).not.toContain('Erro de conexão')
  await act(async () => { requests[2].result.resolve(response({ success: true, data: { rfm: { totalCustomers: 3, segments: {} }, cohort: { cohorts: [], summary: {} }, calculatedAt: 'a2' } })) })

  await vi.waitFor(() => expect(container.textContent).toContain('customers:3'))
  expect(container.textContent).not.toContain('Erro de conexão')
})

it('keeps A2 metrics when stale A1 succeeds after switching A to B to A', async () => {
  const requests: Array<ReturnType<typeof deferred<any>>> = []
  vi.stubGlobal('fetch', vi.fn(() => {
    const result = deferred<any>()
    requests.push(result)
    return result.promise
  }))

  await act(async () => { root.render(<AdvancedMetricsSection storeId="store-a" />) })
  await act(async () => { (container.querySelector('button') as HTMLButtonElement).click() })
  await vi.waitFor(() => expect(requests).toHaveLength(1))
  await act(async () => { root.render(<AdvancedMetricsSection storeId="store-b" />) })
  await vi.waitFor(() => expect(requests).toHaveLength(2))
  await act(async () => { root.render(<AdvancedMetricsSection storeId="store-a" />) })
  await vi.waitFor(() => expect(requests).toHaveLength(3))
  await act(async () => { requests[2].resolve(response({ success: true, data: { rfm: { totalCustomers: 3, segments: {} }, cohort: { cohorts: [], summary: {} }, calculatedAt: 'a2' } })) })
  await vi.waitFor(() => expect(container.textContent).toContain('customers:3'))

  await act(async () => { requests[0].resolve(response({ success: true, data: { rfm: { totalCustomers: 1, segments: {} }, cohort: { cohorts: [], summary: {} }, calculatedAt: 'a1' } })) })
  expect(container.textContent).toContain('customers:3')
  expect(container.textContent).not.toContain('customers:1')
})

it('keeps useDeals refetch stable through a local rerender', async () => {
  const refs: unknown[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => response(String(input).includes('pipelines') ? { pipelines: [] } : { deals: [] })))
  await act(async () => { root.render(<DealsProbe onIdentity={(refetch) => { refs.push(refetch) }} />) })
  await vi.waitFor(() => expect(refs).toHaveLength(1))
  await act(async () => { (container.querySelector('button') as HTMLButtonElement).click() })
  expect(refs).toHaveLength(1)
})

it('does not let flow A analytics repopulate state after switching to B', async () => {
  const requests: Array<ReturnType<typeof deferred<any>>> = []
  vi.stubGlobal('fetch', vi.fn(() => {
    const request = deferred<any>()
    requests.push(request)
    return request.promise
  }))
  const node = (id: string) => [{ id, type: 'trigger_order', position: { x: 0, y: 0 }, data: {} }]
  const props = { initialEdges: [], onSave: vi.fn(async () => undefined), onBack: vi.fn() }
  await act(async () => { root.render(<FlowBuilder automationId="flow-a" initialNodes={node('a')} {...props} />) })
  await act(async () => { useFlowStore.setState({ showAnalytics: true }) })
  await vi.waitFor(() => expect(requests).toHaveLength(1))
  await act(async () => { root.render(<FlowBuilder automationId="flow-b" initialNodes={node('b')} {...props} />) })
  await act(async () => { requests[0].resolve(response({ nodeStats: { stale: { sent: 1 } } })) })
  await vi.waitFor(() => expect(useFlowStore.getState().analyticsData).toEqual({}))
})

it('renders enriched contact deals whether pipelines or deals arrive first', async () => {
  const deals = deferred<any>()
  const pipeline = { id: 'pipeline-1', name: 'Pipeline real', color: '#123', stages: [{ id: 'stage-1', name: 'Qualificado', color: '#456' }] }
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/deals?')) return deals.promise
    return Promise.resolve(response({ activities: [], contact: {} }))
  }))
  const contact = { id: 'contact-1', organization_id: 'org-1', first_name: 'Ana', last_name: 'Silva', email: 'ana@example.com', tags: [] } as any
  const props = { contact, onClose: vi.fn(), onUpdateTags: vi.fn(async () => undefined) }
  await act(async () => { root.render(<ContactDrawer {...props} pipelines={[pipeline] as any} />) })
  await act(async () => { deals.resolve(response({ deals: [{ id: 'deal-1', title: 'Deal tardio', value: 10, pipeline_id: 'pipeline-1', stage_id: 'stage-1' }] })) })
  await vi.waitFor(() => expect(container.textContent).toContain('Pipeline real'))
  expect(container.textContent).not.toContain('Deal tardioPipeline•')

  const dealsFirst = deferred<any>()
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => String(input).includes('/api/deals?') ? dealsFirst.promise : Promise.resolve(response({ activities: [], contact: {} }))))
  await act(async () => { root.render(<ContactDrawer key="deals-first" {...props} pipelines={[]} />) })
  await act(async () => { dealsFirst.resolve(response({ deals: [{ id: 'deal-2', title: 'Deal primeiro', value: 10, pipeline_id: 'pipeline-1', stage_id: 'stage-1' }] })) })
  await vi.waitFor(() => expect(container.textContent).toContain('Deal primeiro'))
  const dealCard = [...container.querySelectorAll('p')].find((element) => element.textContent === 'Deal primeiro')?.parentElement?.parentElement
  expect(dealCard).toBeTruthy()
  await act(async () => { root.render(<ContactDrawer key="deals-first" {...props} pipelines={[pipeline] as any} />) })
  await vi.waitFor(() => {
    expect(container.contains(dealCard!)).toBe(true)
    expect(dealCard?.textContent).toContain('Deal primeiro')
    expect(dealCard?.textContent).toContain('Pipeline real')
    expect(dealCard?.textContent).toContain('Qualificado')
  })
})
