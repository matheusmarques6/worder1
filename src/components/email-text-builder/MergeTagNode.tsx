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
// =============================================================

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

export interface MergeTagAttrs {
  tag: string;
  label?: string;
  fallback?: string;
}

function MergeTagChip({ node, deleteNode }: NodeViewProps) {
  const tag = (node.attrs.tag as string) || '';
  const label = (node.attrs.label as string) || tag;
  const fallback = (node.attrs.fallback as string) || '';
  return (
    <NodeViewWrapper
      as="span"
      className="merge-tag-chip"
      data-tag={tag}
      contentEditable={false}
      title={fallback ? `${tag} (fallback: ${fallback})` : tag}
      style={{
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
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onClick={(e: React.MouseEvent) => {
        // Alt-click removes — quick way to delete an inserted chip
        // without picking the cursor up. The editor's standard
        // backspace also removes it because the node is `atom: true`.
        if (e.altKey) deleteNode();
      }}
    >
      <span aria-hidden="true" style={{ opacity: 0.7 }}>{'{'}</span>
      <span>{label}</span>
      <span aria-hidden="true" style={{ opacity: 0.7 }}>{'}'}</span>
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
