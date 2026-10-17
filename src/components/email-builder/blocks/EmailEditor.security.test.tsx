// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PreviewModal } from '../modals/PreviewModal'
import { EmailPreviewMode } from '@/components/flow-builder/panels/EmailPreviewMode'
import { RichTextEditor } from './RichTextEditor'
import { BlockPreview } from './BlockPreview'

let container: HTMLDivElement
let root: Root
const originalRects = Object.getOwnPropertyDescriptors(Range.prototype)
beforeEach(() => {
  vi.stubGlobal('React', React)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  // jsdom has no layout API for Range; ProseMirror autofocus reads it.
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] })
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  for (const name of ['getClientRects', 'getBoundingClientRect']) {
    if (originalRects[name]) Object.defineProperty(Range.prototype, name, originalRects[name])
    else Reflect.deleteProperty(Range.prototype, name)
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('keeps the mobile modal sandboxed after switching device', async () => {
  await act(async () => root.render(<PreviewModal isOpen html="<p>Preview</p>" onClose={() => {}} />))
  const mobile = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Mobile'))!
  await act(async () => mobile.click())
  const frame = container.querySelector('iframe')!
  expect(frame.title).toBe('Mobile Preview')
  expect(frame.getAttribute('sandbox')).toBe('')
})

it('keeps real-data preview sandboxed and scrollable in desktop and mobile', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
    const action = JSON.parse(String(options.body)).action
    return { ok: true, json: async () => action === 'list_events'
      ? { events: [] } : { html: '<p>Preview seguro</p>' } }
  }))
  await act(async () => root.render(<EmailPreviewMode templateId="fixture-template" triggerType="placed_order"
    organizationId="fixture-org" onClose={() => {}} />))
  let frame = document.querySelector('iframe')!
  expect(frame).not.toBeNull()
  expect(frame.getAttribute('sandbox')).toBe('')
  expect(frame.getAttribute('srcdoc')).toContain('Preview seguro')
  expect(frame.getAttribute('srcdoc')).not.toContain('<script>')
  expect(Number.parseInt(frame.style.height)).toBeGreaterThan(0)
  const mobile = Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Mobile'))!
  await act(async () => mobile.click())
  frame = document.querySelector('iframe')!
  expect(frame.getAttribute('sandbox')).toBe('')
  expect(Number.parseInt(frame.style.height)).toBeGreaterThan(0)
})

it('preserves block selection and entering inline text editing', async () => {
  let selections = 0
  let edits = 0
  await act(async () => root.render(<BlockPreview block={{ id: 'text', type: 'text', props: { contentHtml: '<p>Texto</p>' } }}
    selected={false} onSelect={() => { selections++ }} onEnterInlineEdit={() => { edits++ }}
    onClone={() => {}} onDelete={() => {}} />))
  const text = container.querySelector('p')!
  await act(async () => text.click())
  await act(async () => text.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
  expect(selections).toBe(1)
  expect(edits).toBe(1)
})

it('keeps rich text editable and preserves formatting and permitted links on update', async () => {
  const warnings = vi.spyOn(console, 'warn')
  const changes: string[] = []
  const content = '<p><strong>Olá</strong> <a href="https://example.test/oferta">Oferta</a> {{first_name}}</p>'
  await act(async () => root.render(<RichTextEditor content={content} onChange={html => changes.push(html)} />))
  const editor = container.querySelector('[contenteditable="true"]') as HTMLElement
  expect(editor).not.toBeNull()
  expect(editor.querySelector('strong')?.textContent).toBe('Olá')
  expect(editor.querySelector('a')?.getAttribute('href')).toBe('https://example.test/oferta')
  // Browser input enters through ProseMirror's actual DOM observer.
  await act(async () => {
    editor.querySelector('strong')!.textContent = 'Editado'
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 20))
  })
  expect(changes.at(-1)).toContain('<strong>Editado</strong>')
  expect(changes.at(-1)).toContain('https://example.test/oferta')
  expect(changes.at(-1)).toContain('{{first_name}}')
  expect(warnings).not.toHaveBeenCalled()
})
