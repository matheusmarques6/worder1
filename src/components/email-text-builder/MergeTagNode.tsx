'use client';

// =============================================================
// Worder text email editor — atomic merge-tag chip node.
//
// Inline, atomic Tiptap node that renders a styled "chip" representing
// a merge tag like {{contact.first_name|amigo}}. The chip is selectable,
// draggable, and round-trips losslessly through getJSON / setContent.
//
// Serialization:
//   - JSON  : { type: 'mergeTag', attrs: { tag, label, fallback } }
//   - HTML  : <span data-merge-tag="tag" data-fallback="…">label</span>
//   - text  : "{{tag|fallback}}" (handled by text-render.ts)
//
// The chip lives in the editor DOM so writers see what they'll get; the
// text-render pipeline strips the chip back to its `{{...}}` literal so
// prepareEmailHtml() can resolve it per-recipient.
//
// Interaction model:
//   - click        → opens a small popover: raw tag (read-only), a
//                    "Valor padrão (se vazio)" input bound to the
//                    `fallback` attr, and a "Remover variável" button.
//   - alt+click    → removes the chip immediately (power-user shortcut).
//   - Esc / click outside → closes the popover.
// =============================================================

// Import from @tiptap/react (a direct dependency) rather than
// @tiptap/core — @tiptap/react re-exports all of core via `export *`,
// and core is only a transitive dep, which pnpm's strict resolution on
// Vercel won't resolve from a bare '@tiptap/core' specifier.
import {
  Node,
  mergeAttributes,
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';

export interface MergeTagAttrs {
  tag: string;
  label?: string;
  fallback?: string;
}

// The chip serializes to the literal `{{tag|fallback}}` — `{`, `}` and `|`
// inside the fallback (or the custom-field path) would break that syntax
// (renderMergeTags' fallback regex stops at the first `}`), so strip them
// at input time.
function sanitizeFallbackValue(value: string): string {
  return value.replace(/[{}|]/g, '');
}

function sanitizeCustomField(value: string): string {
  // Whitelist alinhada ao regex de tags do renderMergeTags
  // ([a-zA-Z0-9_.]) — caracteres fora dele (acentos, `!`, etc.) fariam a
  // tag nunca casar e o literal {{custom.João!}} vazar no e-mail.
  return value.replace(/[^a-zA-Z0-9_.]/g, '');
}

function MergeTagChip({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const tag = (node.attrs.tag as string) || '';
  const label = (node.attrs.label as string) || tag;
  const fallback = (node.attrs.fallback as string) || '';
  const rawTag = fallback ? `{{${tag}|${fallback}}}` : `{{${tag}}}`;
  // Custom-field chips ({{custom.<campo>}}) expose the path after `custom.`
  // as an editable "Campo" input — the picker copy promises "troque
  // nome_do_campo pelo seu campo" and this is where that happens.
  const isCustom = tag.startsWith('custom.');
  const customField = isCustom ? tag.slice('custom.'.length) : '';

  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLElement | null>(null);

  // Close on Esc / click outside while the popover is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const root = wrapperRef.current;
      if (root && e.target instanceof Element && !root.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <NodeViewWrapper
      as="span"
      ref={wrapperRef as any}
      className="merge-tag-chip"
      data-tag={tag}
      contentEditable={false}
      title={rawTag}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 8px',
        margin: '0 1px',
        borderRadius: 6,
        background: '#eff6ff',
        color: '#1d4ed8',
        border: '1px solid #bfdbfe',
        fontSize: '0.92em',
        fontWeight: 500,
        lineHeight: 1.35,
        whiteSpace: 'nowrap',
        maxWidth: 240,
        verticalAlign: 'baseline',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onClick={(e: React.MouseEvent) => {
        // Alt-click removes — quick way to delete an inserted chip
        // without picking the cursor up. The editor's standard
        // backspace also removes it because the node is `atom: true`.
        if (e.altKey) {
          deleteNode();
          return;
        }
        setOpen((v) => !v);
      }}
    >
      <span aria-hidden="true" style={{ opacity: 0.7 }}>{'{'}</span>
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 190,
          display: 'inline-block',
        }}
      >
        {label}
      </span>
      <span aria-hidden="true" style={{ opacity: 0.7 }}>{'}'}</span>

      {open && (
        <span
          // Popover — positioned by the chip. Rendered inside the NodeView
          // (contentEditable=false) so ProseMirror ignores it entirely.
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 60,
            display: 'block',
            width: 280,
            padding: 12,
            background: '#ffffff',
            border: '1px solid #e4e4e7',
            borderRadius: 10,
            boxShadow: '0 8px 24px -6px rgba(0,0,0,0.18)',
            whiteSpace: 'normal',
            cursor: 'default',
            fontWeight: 400,
            color: '#18181b',
            textAlign: 'left',
          }}
        >
          <span style={{ display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#a1a1aa', marginBottom: 4 }}>
            Variável
          </span>
          <code
            style={{
              display: 'block',
              fontSize: 11,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              background: '#f4f4f5',
              color: '#3f3f46',
              padding: '4px 6px',
              borderRadius: 6,
              marginBottom: 10,
              overflowWrap: 'anywhere',
            }}
          >
            {rawTag}
          </code>
          {isCustom && (
            <>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#3f3f46', marginBottom: 4 }}>
                Campo
              </label>
              <input
                value={customField}
                onChange={(e) => {
                  const field = sanitizeCustomField(e.target.value);
                  updateAttributes({
                    tag: `custom.${field}`,
                    label: field ? `custom.${field}` : 'Campo Custom',
                  });
                }}
                placeholder="Ex: nome_do_campo"
                style={{
                  display: 'block',
                  width: '100%',
                  boxSizing: 'border-box',
                  fontSize: 12,
                  padding: '5px 8px',
                  border: '1px solid #d4d4d8',
                  borderRadius: 6,
                  outline: 'none',
                  marginBottom: 10,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
              />
            </>
          )}
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#3f3f46', marginBottom: 4 }}>
            Valor padrão (se vazio)
          </label>
          <input
            value={fallback}
            onChange={(e) => updateAttributes({ fallback: sanitizeFallbackValue(e.target.value) })}
            placeholder="Ex: Cliente"
            style={{
              display: 'block',
              width: '100%',
              boxSizing: 'border-box',
              fontSize: 12,
              padding: '5px 8px',
              border: '1px solid #d4d4d8',
              borderRadius: 6,
              outline: 'none',
              marginBottom: 10,
            }}
          />
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              type="button"
              onClick={() => deleteNode()}
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: '#dc2626',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              Remover variável
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: '#3f3f46',
                background: '#f4f4f5',
                border: '1px solid #e4e4e7',
                borderRadius: 6,
                padding: '3px 10px',
                cursor: 'pointer',
              }}
            >
              Pronto
            </button>
          </span>
        </span>
      )}
    </NodeViewWrapper>
  );
}

export const MergeTag = Node.create({
  name: 'mergeTag',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      tag: { default: '' },
      label: { default: '' },
      fallback: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-merge-tag]',
        getAttrs: (el) => {
          const node = el as HTMLElement;
          return {
            tag: node.getAttribute('data-merge-tag') || '',
            label: node.textContent || '',
            fallback: node.getAttribute('data-fallback') || '',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const tag = (node.attrs.tag as string) || '';
    const label = (node.attrs.label as string) || tag;
    const fallback = (node.attrs.fallback as string) || '';
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-merge-tag': tag,
        'data-fallback': fallback,
        // The styling here only matters if the chip ever makes it into
        // the saved HTML — normally the text-render pipeline replaces
        // it with the literal `{{tag}}` before the email ships.
        style:
          'display:inline;padding:1px 6px;border-radius:4px;background:#eff6ff;color:#1d4ed8;font-weight:500;',
      }),
      label,
    ];
  },

  renderText({ node }) {
    const tag = (node.attrs.tag as string) || '';
    const fallback = (node.attrs.fallback as string) || '';
    if (!tag) return '';
    return fallback ? `{{${tag}|${fallback}}}` : `{{${tag}}}`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(MergeTagChip);
  },

  addCommands() {
    return {
      insertMergeTag:
        (attrs: MergeTagAttrs) =>
        ({ chain }: any) => {
          return chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: {
                tag: attrs.tag,
                label: attrs.label || attrs.tag,
                fallback: attrs.fallback || '',
              },
            })
            .insertContent(' ') // trailing space keeps caret outside the chip
            .run();
        },
    } as any;
  },
});

export default MergeTag;
