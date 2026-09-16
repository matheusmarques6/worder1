// @vitest-environment jsdom

import React, { act } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  return { ...actual, ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <>{children}</> }
})

let root: Root
let container: HTMLDivElement
let ShopifyConfigModal: typeof import('@/components/integrations/shopify/ShopifyConfigModal').ShopifyConfigModal
let RFMDashboard: typeof import('@/components/shopify/RFMDashboard').RFMDashboard

const response = (data: unknown) => ({ ok: true, json: async () => data })
const store = (id: string) => ({ id, name: `Store ${id}`, domain: `${id}.myshopify.com`, connectionStatus: 'active' } as any)

beforeEach(async () => {
  vi.stubGlobal('React', React)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  ;({ ShopifyConfigModal } = await import('@/components/integrations/shopify/ShopifyConfigModal'))
  ;({ RFMDashboard } = await import('@/components/shopify/RFMDashboard'))
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

it('loads Shopify config for store B without another store A request after switching', async () => {
  const fetchMock = vi.fn(async () => response({ tags: [] }))
  vi.stubGlobal('fetch', fetchMock)

  await act(async () => { root.render(<ShopifyConfigModal isOpen onClose={vi.fn()} store={store('store-a')} organizationId="org-1" />) })
  await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/settings?'))).toHaveLength(1))
  await act(async () => { root.render(<ShopifyConfigModal isOpen onClose={vi.fn()} store={store('store-b')} organizationId="org-1" />) })

  await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/settings?'))).toHaveLength(2))
  const requests = fetchMock.mock.calls.filter(([url]) => String(url).includes('/settings?')).map(([url]) => String(url))
  expect(requests).toEqual([
    '/api/integrations/shopify/store-a/settings?organizationId=org-1',
    '/api/integrations/shopify/store-b/settings?organizationId=org-1',
  ])
})

it('loads and recalculates RFM for store B without another store A request after switching', async () => {
  const fetchMock = vi.fn(async () => response({ success: true, data: { segments: [], lastCalculated: null } }))
  vi.stubGlobal('fetch', fetchMock)

  await act(async () => { root.render(<RFMDashboard storeId="store-a" />) })
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  await act(async () => { root.render(<RFMDashboard storeId="store-b" />) })
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
  const postSwitchGetUrls = fetchMock.mock.calls.slice(2).map(([url]) => String(url))
  expect(postSwitchGetUrls).toEqual([
    '/api/shopify/analytics/rfm?storeId=store-b&view=summary',
    '/api/shopify/analytics/rfm?storeId=store-b&view=scores',
  ])

  const button = [...container.querySelectorAll('button')].find((element) => element.textContent === 'Recalcular')!
  await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7))
  const post = fetchMock.mock.calls[4]
  expect(post[0]).toBe('/api/shopify/analytics/rfm')
  expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({ storeId: 'store-b' })
})
