import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { PromptPreviewBlock } from './RadialView'

it('declares missing content while preserving the Portuguese header and text', () => {
  const html = renderToStaticMarkup(<PromptPreviewBlock block={{
    kind: 'STATE', text: '# ESTADO\nSem conversa', ghost: true,
  }} />)

  expect(html).toContain('Não disponível neste preview')
  expect(html).toContain('class="preview-ghost"')
  expect(html).toContain('# ESTADO\nSem conversa')
  expect(html).not.toContain('# STATE')
})

it('preserves real content without declaring it missing', () => {
  const html = renderToStaticMarkup(<PromptPreviewBlock block={{
    kind: 'AGENT', text: '# AGENTE\nDuda', ghost: false,
  }} />)

  expect(html).toContain('# AGENTE\nDuda')
  expect(html).not.toContain('Não disponível neste preview')
  expect(html).not.toContain('preview-ghost')
})

it.each([false, true])('escapes preview text when ghost is %s', (ghost) => {
  const html = renderToStaticMarkup(<PromptPreviewBlock block={{
    kind: 'STATE', text: '# ESTADO\n<script>alert("preview")</script>', ghost,
  }} />)

  expect(html).toContain('&lt;script&gt;alert(&quot;preview&quot;)&lt;/script&gt;')
  expect(html).not.toContain('<script>')
})
