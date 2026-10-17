import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium, type Browser, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { BlockPreview } from './BlockPreview'
import { PreviewModal } from '../modals/PreviewModal'
import { SendTestModal } from '../modals/SendTestModal'
import { DEFAULT_DOCUMENT, createSection, type EmailBlock } from '../config/types'
import { renderDocumentToHtml } from '@/lib/email/render-html'

const localMarker = `<img src="data:image/png,invalid" onerror="document.body.dataset.auditMarker='executed'">`
const parentMarker = `<img src="data:image/png,invalid" onerror="document.body.dataset.auditMarker='executed';parent.document.body.dataset.auditMarker='executed'">`
const noop = () => {}
let browser: Browser
let page: Page

function blockMarkup(type: EmailBlock['type'], props: EmailBlock['props']) {
  return renderToStaticMarkup(<BlockPreview block={{ id: 'security-block', type, props }} selected={false}
    onSelect={noop} onClone={noop} onDelete={noop} />)
}

beforeAll(async () => {
  vi.stubGlobal('React', React)
  const executablePath = process.env.E2E_CHROMIUM_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync)
  browser = await chromium.launch({ executablePath, headless: true })
  page = await browser.newPage()
  // The canaries use only invalid data images. Block every network URL as a backstop.
  await page.route(/^https?:/, route => route.abort())
}, 30_000)

afterAll(async () => {
  await browser?.close()
  vi.unstubAllGlobals()
})

it.each(['text', 'split'] as const)('keeps event HTML out of the panel for %s blocks', async type => {
  await page.setContent(blockMarkup(type, { contentHtml: localMarker, textHtml: localMarker }))
  await page.waitForLoadState('load')
  expect(await page.locator('body').getAttribute('data-audit-marker')).toBeNull()
  expect(await page.locator('[onerror]').count()).toBe(0)
})

it('isolates arbitrary HTML without script or same-origin privileges', async () => {
  await page.setContent(blockMarkup('html', { code: parentMarker }))
  await page.waitForLoadState('load')
  expect(await page.locator('body').getAttribute('data-audit-marker')).toBeNull()
  const frame = page.locator('iframe')
  expect(await frame.count()).toBe(1)
  expect(await frame.getAttribute('sandbox')).toBe('')
  const child = page.frames().find(candidate => candidate.parentFrame())!
  expect(await child.locator('body').getAttribute('data-audit-marker')).toBeNull()
  expect(await child.evaluate(() => {
    try { return parent.document.body.tagName } catch { return 'blocked' }
  })).toBe('blocked')
})

it.each(['preview', 'send-test'] as const)('isolates the %s modal', async kind => {
  const component = kind === 'preview'
    ? <PreviewModal isOpen onClose={noop} html={parentMarker} />
    : <SendTestModal isOpen onClose={noop} html={parentMarker} defaultSubject="Fixture" />
  await page.setContent(renderToStaticMarkup(component))
  await page.waitForLoadState('load')
  expect(await page.locator('body').getAttribute('data-audit-marker')).toBeNull()
  expect(await page.locator('iframe').getAttribute('sandbox')).toBe('')
})

it('preserves legitimate rich text, links and images while rejecting unsafe attributes and CSS', async () => {
  const contentHtml = `<h2 style="text-align:center;color:#112233;font-size:24px">Olá <strong>Maria</strong></h2>
    <p><em>Oferta</em> <u>hoje</u> <s>antes</s> {{first_name}}</p>
    <ul><li>Item</li></ul><a href="https://example.test/oferta" target="_blank">Comprar</a>
    <a href="javascript:document.body.dataset.auditMarker='executed'">Inválido</a>
    <span style="position:fixed;inset:0;background-image:url(https://example.test/pixel)">Normal</span>`
  await page.setContent(blockMarkup('text', { contentHtml, align: 'center' }))
  expect(await page.locator('h2 strong').textContent()).toBe('Maria')
  expect(await page.locator('p em').textContent()).toBe('Oferta')
  expect(await page.locator('u').textContent()).toBe('hoje')
  expect(await page.locator('s').textContent()).toBe('antes')
  expect(await page.locator('li').textContent()).toBe('Item')
  expect(await page.getByRole('link', { name: 'Comprar' }).getAttribute('href')).toBe('https://example.test/oferta')
  expect(await page.locator('a').last().getAttribute('href')).toBeNull()
  expect(await page.locator('span').last().getAttribute('style')).toBeNull()
  expect(await page.locator('h2').evaluate(el => getComputedStyle(el).color)).toBe('rgb(17, 34, 51)')
  await page.setContent(blockMarkup('image', { src: 'https://example.test/image.png', alt: 'Produto' }))
  expect(await page.getByAltText('Produto').getAttribute('src')).toBe('https://example.test/image.png')
})

it('does not let persisted alignment escape the block CSS rule', async () => {
  await page.setContent(blockMarkup('text', {
    contentHtml: '<p>Texto</p>', align: 'left} body{--audit-marker:injected} .other{text-align:left',
  }))
  expect(await page.locator('body').evaluate(el => getComputedStyle(el).getPropertyValue('--audit-marker'))).toBe('')
})

it('keeps legacy HTML and rich text unchanged in the exported email and design', () => {
  const legacy = '<style>.legacy{color:purple}</style><table class="legacy"><tr><td>Legado</td></tr></table>'
  const doc = structuredClone(DEFAULT_DOCUMENT)
  doc.sections = [createSection()]
  doc.sections[0].columns[0].blocks = [
    { id: 'legacy', type: 'html', props: { code: legacy } },
    { id: 'text', type: 'text', props: { contentHtml: '<p><strong>Oferta</strong> {{first_name}}</p>' } },
  ]
  const before = JSON.stringify(doc)
  const exported = renderDocumentToHtml(doc)
  expect(exported).toContain(legacy)
  expect(exported).toContain('<strong>Oferta</strong> {{first_name}}')
  expect(JSON.stringify(doc)).toBe(before)
})
