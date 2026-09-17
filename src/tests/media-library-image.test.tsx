// @vitest-environment jsdom

import React, { act } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { MediaLibraryModal } from '@/components/shared/MediaLibraryModal'
import type { MediaFile } from '@/lib/media/upload'

vi.mock('@/stores', () => ({ useStoreStore: () => ({ currentStore: { id: 'store-1' } }) }))

let root: Root
let container: HTMLDivElement

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  vi.unstubAllGlobals()
})

it('serves uppercase SVG directly by MIME while optimizing raster thumbnails', async () => {
  const files: MediaFile[] = [
    { id: 'svg', name: 'Logo.SVG', url: '/storage/Logo.SVG', type: 'image/svg+xml', size: 100, storage_path: 'Logo.SVG', created_at: '2026-01-01' },
    { id: 'png', name: 'Photo.png', url: '/storage/Photo.png', type: 'image/png', size: 200, storage_path: 'Photo.png', created_at: '2026-01-01' },
  ]
  vi.stubGlobal('React', React)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ files }) })))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)

  await act(async () => { root.render(<MediaLibraryModal onSelect={vi.fn()} onClose={vi.fn()} />) })
  const svg = container.querySelector('img[alt="Logo.SVG"]')!
  const raster = container.querySelector('img[alt="Photo.png"]')!
  expect(svg.getAttribute('src')).toBe('/storage/Logo.SVG')
  expect(svg.hasAttribute('srcset')).toBe(false)
  expect(raster.getAttribute('src')).toContain('/_next/image?url=%2Fstorage%2FPhoto.png')
  expect(raster.getAttribute('srcset')).toContain('/_next/image?url=%2Fstorage%2FPhoto.png')
})
