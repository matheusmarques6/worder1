// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('../blocks/BlockPreview', () => ({
  BlockPreview: ({ block }: { block: { id: string } }) => <div>{block.id}</div>,
}))

class ResizeObserverStub {
  static instances: ResizeObserverStub[] = []
  disconnect = vi.fn()
  observe = vi.fn()

  constructor() {
    ResizeObserverStub.instances.push(this)
  }
}

let root: Root
let container: HTMLDivElement
let UniversalThumb: typeof import('./UniversalBits').UniversalThumb

beforeEach(async () => {
  ResizeObserverStub.instances = []
  vi.stubGlobal('React', React)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  ;({ UniversalThumb } = await import('./UniversalBits'))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

it('keeps hooks and releases the observer when content becomes empty', async () => {
  await act(async () => {
    root.render(<UniversalThumb content={null} kind="block" />)
  })
  await act(async () => {
    root.render(<UniversalThumb content={{ id: 'block-1' }} kind="block" />)
  })

  const observer = ResizeObserverStub.instances[0]

  await act(async () => {
    root.render(<UniversalThumb content={null} kind="block" />)
  })

  expect(observer.disconnect).toHaveBeenCalled()
})
