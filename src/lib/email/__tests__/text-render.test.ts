// =============================================================
// Tests for the text-based email renderer. Covers the core
// invariants:
//   - empty / malformed input produces a valid HTML document
//   - merge-tag chips serialize to {{tag}} / {{tag|fallback}} literals
//   - the plain-text alternative does NOT HTML-escape characters and
//     preserves link destinations in `text (url)` form
//   - preheader is emitted as a hidden snippet
// =============================================================

import { describe, it, expect, vi } from 'vitest';
import {
  renderTextEmailToHtml,
  renderTextEmailToPlain,
  renderPlainWithMergeData,
  type TextDoc,
} from '../text-render';

// Regression guard: the text editor imports this module in the browser,
// so it must never pull in a server-only module. supabase-admin throws
// at import time when `window` is defined — re-importing text-render with
// a faked window must NOT throw, which it would if './render' (and thus
// supabase-admin) crept back into the import graph.
describe('text-render client safety', () => {
  it('imports cleanly when window is defined', async () => {
    vi.resetModules();
    (globalThis as any).window = {};
    try {
      const mod = await import('../text-render');
      expect(typeof mod.renderTextEmailToHtml).toBe('function');
    } finally {
      delete (globalThis as any).window;
      vi.resetModules();
    }
  });
});

const buildDoc = (...nodes: any[]): TextDoc => ({ type: 'doc', content: nodes });
const p = (...children: any[]) => ({ type: 'paragraph', content: children });
const t = (text: string, marks?: any[]) => ({ type: 'text', text, marks });

describe('renderTextEmailToHtml', () => {
  it('returns a complete HTML document for an empty doc', () => {
    const html = renderTextEmailToHtml(buildDoc(p()));
    expect(html).toMatch(/^<!DOCTYPE html/);
    expect(html).toContain('</html>');
    expect(html).toContain('viewport');
  });

  it('renders a paragraph with bold + link inline', () => {
    const html = renderTextEmailToHtml(
      buildDoc(p(
        t('Hi '),
        t('Mary', [{ type: 'bold' }]),
        t(' — '),
        t('click here', [{ type: 'link', attrs: { href: 'https://example.com' } }]),
      ))
    );
    expect(html).toContain('<strong>Mary</strong>');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('click here');
  });

  it('serializes merge-tag nodes as {{tag}} literals so the send pipeline can resolve them', () => {
    const html = renderTextEmailToHtml(
      buildDoc(p(
        t('Olá '),
        { type: 'mergeTag', attrs: { tag: 'contact.first_name', fallback: 'amigo' } },
        t(',')
      ))
    );
    expect(html).toContain('{{contact.first_name|amigo}}');
    // We do NOT want a literal HTML-escaped fallback in the source
    expect(html).not.toContain('amigo}}&quot;');
  });

  it('emits the preheader as a hidden, zero-height snippet', () => {
    const html = renderTextEmailToHtml(buildDoc(p(t('body'))), {
      preheader: 'Um abraço da Maria',
    });
    expect(html).toMatch(/display:none[^"]*/);
    expect(html).toContain('Um abraço da Maria');
  });

  it('escapes user content to prevent XSS injection through the body', () => {
    const html = renderTextEmailToHtml(buildDoc(p(t('<script>alert(1)</script>'))));
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('drops dangerous URL schemes on links', () => {
    const html = renderTextEmailToHtml(
      buildDoc(p(t('clique', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])))
    );
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="#"');
  });

  it('keeps valid http links and merge-tag URLs', () => {
    const html = renderTextEmailToHtml(
      buildDoc(p(
        t('a', [{ type: 'link', attrs: { href: 'https://loja.com' } }]),
        t('b', [{ type: 'link', attrs: { href: '{{store_url}}' } }]),
      ))
    );
    expect(html).toContain('href="https://loja.com"');
    expect(html).toContain('{{store_url}}');
  });
});

describe('renderTextEmailToPlain', () => {
  it('returns the text without HTML markup', () => {
    const text = renderTextEmailToPlain(
      buildDoc(
        { type: 'heading', attrs: { level: 1 }, content: [t('Bem-vinda')] },
        p(t('Que bom te ver por aqui.'))
      )
    );
    expect(text).toContain('Bem-vinda');
    expect(text).toContain('Que bom te ver por aqui.');
    expect(text).not.toContain('<');
  });

  it('preserves link destinations as "label (url)"', () => {
    const text = renderTextEmailToPlain(
      buildDoc(p(
        t('Acesse: '),
        t('a loja', [{ type: 'link', attrs: { href: 'https://loja.com' } }])
      ))
    );
    expect(text).toContain('a loja (https://loja.com)');
  });

  it('renders bullet lists with leading dashes', () => {
    const text = renderTextEmailToPlain(
      buildDoc({
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [p(t('Um'))] },
          { type: 'listItem', content: [p(t('Dois'))] },
        ],
      })
    );
    expect(text).toContain('- Um');
    expect(text).toContain('- Dois');
  });

  it('keeps nested list structure in HTML', () => {
    const doc = buildDoc({
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            p(t('Pai')),
            { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('Filho'))] }] },
          ],
        },
      ],
    });
    const html = renderTextEmailToHtml(doc);
    // Outer + inner <ul> both present → nesting preserved.
    expect((html.match(/<ul/g) || []).length).toBe(2);
    expect(html).toContain('Pai');
    expect(html).toContain('Filho');
  });

  it('serializes merge-tag chips to {{tag|fallback}} for downstream resolution', () => {
    const text = renderTextEmailToPlain(
      buildDoc(p(
        t('Olá '),
        { type: 'mergeTag', attrs: { tag: 'contact.first_name', fallback: 'amigo' } }
      ))
    );
    expect(text).toContain('{{contact.first_name|amigo}}');
  });
});

describe('renderPlainWithMergeData', () => {
  it('replaces tags with values without HTML-escaping ampersands', () => {
    const out = renderPlainWithMergeData(
      'Olá {{first_name|amigo}}, vista hoje & ganhe 10%',
      { first_name: 'Maria & Co' }
    );
    expect(out).toBe('Olá Maria & Co, vista hoje & ganhe 10%');
  });

  it('uses the fallback when the merge value is missing', () => {
    const out = renderPlainWithMergeData(
      'Oi {{first_name|amigo}}',
      {}
    );
    expect(out).toBe('Oi amigo');
  });
});
