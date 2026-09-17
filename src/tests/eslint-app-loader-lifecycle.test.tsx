// @vitest-environment jsdom

import React, { act } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { useAuthStore, useStoreStore } from '@/stores'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  return { ...actual, ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <>{children}</> }
})

vi.stubGlobal('React', React)
const { default: EmailAnalyticsPage } = await import('@/app/(dashboard)/analytics/email/page')
const { default: ShopifyAnalyticsPage } = await import('@/app/(dashboard)/analytics/shopify/page')
const { default: IntegrationsPage } = await import('@/app/(dashboard)/crm/integrations/page')

let root: Root
let container: HTMLDivElement
let mounted = false
let attached = false

const store = (id: string) => ({ id, currency: 'BRL' } as any)
const response = (data: unknown, ok = true) => ({ ok, json: async () => data })

const lastRequest = <Args extends readonly unknown[]>(fetchMock: { mock: { calls: readonly Args[] } }, prefix: string) => {
  const urls = fetchMock.mock.calls.map((args) => String(args[0])).filter((url) => url.startsWith(prefix))
  return urls.at(-1)
}

beforeEach(() => {
  mounted = false
  attached = false
  vi.stubGlobal('React', React)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  useAuthStore.setState({ user: { organization_id: 'org-1' } as any })
  useStoreStore.setState({ currentStore: store('store-a'), _hasHydrated: true })
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
})

it('loads email analytics for store B after switching from store A', async () => {
  const fetchMock = vi.fn(async () => response({ metrics: null, timeline: [], campaigns: [] }))
  vi.stubGlobal('fetch', fetchMock)

  await act(async () => { root.render(<EmailAnalyticsPage />) })
  await act(async () => { useStoreStore.setState({ currentStore: store('store-b') }) })

  await vi.waitFor(() => expect(lastRequest(fetchMock, '/api/analytics/email-dashboard')).toBe('/api/analytics/email-dashboard?days=30&storeId=store-b'))
})

it('loads Shopify analytics for store B after switching from store A', async () => {
  const fetchMock = vi.fn(async () => response({ success: true, data: {} }))
  vi.stubGlobal('fetch', fetchMock)

  await act(async () => { root.render(<ShopifyAnalyticsPage />) })
  await act(async () => { useStoreStore.setState({ currentStore: store('store-b') }) })

  await vi.waitFor(() => expect(lastRequest(fetchMock, '/api/analytics/shopify')).toBe('/api/analytics/shopify?period=7d&storeId=store-b'))
})

it('loads CRM active integrations for store B after switching from store A', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/integrations/categories') return response({ categories: [] })
    if (url === '/api/integrations') return response({ integrations: [] })
    if (url.startsWith('/api/integrations/installed')) return response({ installed: [] })
    if (url.startsWith('/api/shopify/store')) return response({ store: null })
    if (url.startsWith('/api/whatsapp/config')) return response({ config: null })
    return response({})
  })
  vi.stubGlobal('fetch', fetchMock)

  await act(async () => { root.render(<IntegrationsPage />) })
  await act(async () => { useStoreStore.setState({ currentStore: store('store-b') }) })

  await vi.waitFor(() => expect(lastRequest(fetchMock, '/api/shopify/store')).toBe('/api/shopify/store?storeId=store-b'))
})
