// @vitest-environment jsdom

import React, { act } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { useAuthStore, useStoreStore, useUIStore } from '@/stores'
import { useFlowStore } from '@/stores/flowStore'

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('next/image', () => ({ default: () => null }))
vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>, motion: new Proxy({}, { get: (_, name) => ({ children, whileHover, whileTap, ...props }: React.HTMLAttributes<HTMLElement> & { whileHover?: unknown, whileTap?: unknown }) => React.createElement(name === 'button' ? 'button' : 'div', props, children) }) }))
vi.mock('@/components/ui/Toast', () => ({ ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/ui/ConfirmDialog', () => ({ ConfirmProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/store/AddStoreModal', () => ({ AddStoreModal: () => null }))
vi.mock('@/components/integrations/shopify/PixelHealthBanner', () => ({ PixelHealthBanner: () => null }))
vi.mock('@/components/flow-builder/Canvas', () => ({ Canvas: () => null }))
vi.mock('@/components/flow-builder/Sidebar', () => ({ Sidebar: () => null }))
vi.mock('@/components/flow-builder/Toolbar', () => ({ Toolbar: () => null }))
vi.mock('@/components/flow-builder/panels/PropertiesPanel', () => ({ PropertiesPanel: () => null }))
vi.mock('@/components/flow-builder/panels/ExecutionPanel', () => ({ ExecutionPanel: () => null }))
vi.mock('@/components/flow-builder/panels/HistoryPanel', () => ({ HistoryPanel: () => null }))
vi.mock('@xyflow/react', () => ({ ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/shopify/RFMSection', () => ({ RFMSection: ({ data }: { data: { totalCustomers: number } }) => <div>customers:{data.totalCustomers}</div> }))
vi.mock('@/components/shopify/CohortSection', () => ({ CohortSection: () => null }))

let root: Root
let container: HTMLDivElement
let DashboardLayout: typeof import('@/app/(dashboard)/layout').default
let FlowBuilder: typeof import('@/components/flow-builder').FlowBuilder
let AdvancedMetricsSection: typeof import('@/components/shopify/AdvancedMetricsSection').AdvancedMetricsSection

const store = (id: string) => ({ id, name: `Store ${id}`, domain: `${id}.myshopify.com`, isActive: true })
const response = (data: unknown) => ({ ok: true, json: async () => data })
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  return { promise: new Promise<T>((done) => { resolve = done }), resolve }
}

beforeEach(async () => {
  vi.stubGlobal('React', React)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  useAuthStore.setState({ user: { id: 'user-1', name: 'User', email: 'user@example.com', organization_id: 'org-1' } as any })
  useUIStore.setState({ sidebarCollapsed: false, _hasHydrated: true })
  useStoreStore.setState({ stores: [store('store-a')], currentStore: store('store-a'), _hasHydrated: true })
  useFlowStore.getState().resetStore()
  ;({ default: DashboardLayout } = await import('@/app/(dashboard)/layout'))
  ;({ FlowBuilder } = await import('@/components/flow-builder'))
  ;({ AdvancedMetricsSection } = await import('@/components/shopify/AdvancedMetricsSection'))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
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

it('preserves edits on equivalent flow input, keeps one listener, and reloads once for a new automation', async () => {
  const addListener = vi.spyOn(window, 'addEventListener')
  const first = [{ id: 'node-a', type: 'trigger_order', position: { x: 0, y: 0 }, data: {} }]
  const replacement = [{ ...first[0], data: {} }]
  const second = [{ id: 'node-b', type: 'trigger_order', position: { x: 0, y: 0 }, data: {} }]
  const props = { initialNodes: first, initialEdges: [], onSave: vi.fn(async () => undefined), onBack: vi.fn() }

  await act(async () => { root.render(<FlowBuilder automationId="flow-a" {...props} />) })
  await act(async () => { useFlowStore.getState().updateNode('node-a', { label: 'edited' }) })
  await act(async () => { root.render(<FlowBuilder automationId="flow-a" {...props} initialNodes={replacement} initialEdges={[]} />) })
  expect(useFlowStore.getState().nodes[0].data.label).toBe('edited')
  expect(addListener.mock.calls.filter(([name]) => name === 'keydown')).toHaveLength(2)

  await act(async () => { root.render(<FlowBuilder automationId="flow-b" {...props} initialNodes={second} initialEdges={[]} />) })
  await vi.waitFor(() => expect(useFlowStore.getState().nodes.map((node) => node.id)).toEqual(['node-b']))
  expect(addListener.mock.calls.filter(([name]) => name === 'keydown')).toHaveLength(2)
})

it('rejects the old store metrics response after a store switch', async () => {
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
  await act(async () => { requests[1].result.resolve(response({ success: true, data: { rfm: { totalCustomers: 2, segments: {} }, cohort: { cohorts: [], summary: {} }, calculatedAt: 'b' } })) })
  await act(async () => { requests[0].result.resolve(response({ success: true, data: { rfm: { totalCustomers: 1, segments: {} }, cohort: { cohorts: [], summary: {} }, calculatedAt: 'a' } })) })

  await vi.waitFor(() => expect(container.textContent).toContain('customers:2'))
  expect(container.textContent).not.toContain('customers:1')
})
