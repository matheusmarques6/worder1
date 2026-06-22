'use client';

// =============================================================
// Worder text email editor — slash command menu.
//
// A "/" at the start of a block (or after whitespace) opens a filterable
// command palette to insert headings, lists, quote, divider, image, or a
// merge-tag variable — the table-stakes UX every modern block editor
// (Notion, Beehiiv, Ghost, Loops) ships.
//
// Implemented without @tiptap/suggestion (not installed) to avoid adding
// a dependency: we read the text before the cursor on every editor
// transaction, match a slash query, and position a fixed popup at the
// caret via ProseMirror's coordsAtPos.
// =============================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Heading1, Heading2, Heading3, List, ListOrdered, Quote, Minus, Image as ImageIcon, Tag, Type,
} from 'lucide-react';

export interface SlashCommand {
  key: string;
  label: string;
  hint: string;
  aliases: string[];
  icon: React.ComponentType<{ className?: string }>;
  /** Runs after the slash query text has already been deleted. */
  run: (editor: Editor) => void;
}

interface SlashState {
  query: string;
  from: number;
  to: number;
  top: number;
  left: number;
  flip: boolean;
}

const ITEM_HEIGHT = 40;
const MENU_MAX = 320;

/** Detect a slash trigger at the current cursor. Returns null when the
 *  caret isn't sitting after a `/query` token. */
function detectSlash(editor: Editor): Omit<SlashState, 'flip'> | null {
  const { selection } = editor.state;
  if (!selection.empty) return null;

  const $from = selection.$from;
  // Only fire inside text blocks (paragraph / heading), never in e.g. a
  // code block or at a node boundary.
  if (!$from.parent.isTextblock) return null;

  // Atomic leaf nodes (the merge-tag chip) serialize to '\0' here, so a
  // slash immediately after a chip has no whitespace before it and
  // correctly won't trigger.
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\n', '\0');
  const match = /(?:^|\s)\/([\p{L}\p{N}]*)$/u.exec(textBefore);
  if (!match) return null;

  const query = match[1];
  const cursorPos = selection.from;
  const from = cursorPos - (query.length + 1); // include the slash
  const to = cursorPos;

  let coords: { bottom: number; left: number };
  try {
    coords = editor.view.coordsAtPos(cursorPos);
  } catch {
    return null;
  }
  return { query, from, to, top: coords.bottom, left: coords.left };
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { key: 'h1', label: 'Título 1', hint: 'Cabeçalho grande', aliases: ['titulo', 'heading', 'h1'], icon: Heading1,
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { key: 'h2', label: 'Título 2', hint: 'Cabeçalho médio', aliases: ['titulo', 'heading', 'h2'], icon: Heading2,
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { key: 'h3', label: 'Título 3', hint: 'Cabeçalho pequeno', aliases: ['titulo', 'heading', 'h3'], icon: Heading3,
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { key: 'text', label: 'Texto', hint: 'Parágrafo normal', aliases: ['paragrafo', 'paragraph', 'normal'], icon: Type,
    run: (e) => e.chain().focus().setParagraph().run() },
  { key: 'ul', label: 'Lista', hint: 'Lista com marcadores', aliases: ['lista', 'bullet', 'ul'], icon: List,
    run: (e) => e.chain().focus().toggleBulletList().run() },
  { key: 'ol', label: 'Lista numerada', hint: 'Lista ordenada', aliases: ['lista', 'numero', 'ordered', 'ol'], icon: ListOrdered,
    run: (e) => e.chain().focus().toggleOrderedList().run() },
  { key: 'quote', label: 'Citação', hint: 'Bloco de citação', aliases: ['citacao', 'quote', 'blockquote'], icon: Quote,
    run: (e) => e.chain().focus().toggleBlockquote().run() },
  { key: 'hr', label: 'Divisor', hint: 'Linha separadora', aliases: ['divisor', 'divider', 'hr', 'linha'], icon: Minus,
    run: (e) => e.chain().focus().setHorizontalRule().run() },
  { key: 'image', label: 'Imagem', hint: 'Inserir imagem por URL', aliases: ['imagem', 'image', 'foto'], icon: ImageIcon,
    run: (e) => {
      const url = window.prompt('URL da imagem:');
      if (url) e.chain().focus().insertContent({ type: 'image', attrs: { src: url, alt: '' } }).run();
    } },
];

/**
 * Hook that wires slash detection + keyboard nav to an editor and a
 * variable-insertion callback. Returns the menu element to render.
 */
export function useSlashMenu(
  editor: Editor | null,
  onPickVariable: () => void,
): React.ReactNode {
  const [state, setState] = useState<SlashState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // The "Variável" entry needs the parent's var picker, so it's appended
  // here rather than in the static list.
  const variableCommand: SlashCommand = {
    key: 'variable', label: 'Variável', hint: 'Inserir {{contato}}', aliases: ['variavel', 'variable', 'merge', 'tag'], icon: Tag,
    run: () => onPickVariable(),
  };
  const allCommands = [...SLASH_COMMANDS, variableCommand];

  const filtered = state
    ? allCommands.filter((c) => {
        const q = state.query.toLowerCase();
        if (!q) return true;
        return (
          c.label.toLowerCase().includes(q) ||
          c.aliases.some((a) => a.includes(q))
        );
      })
    : [];

  // Keep refs fresh for the capture-phase keydown handler.
  const filteredRef = useRef(filtered);
  const activeRef = useRef(activeIndex);
  const stateRef = useRef(state);
  filteredRef.current = filtered;
  activeRef.current = activeIndex;
  stateRef.current = state;

  const close = useCallback(() => setState(null), []);

  const select = useCallback(
    (cmd: SlashCommand) => {
      const s = stateRef.current;
      if (!editor || !s) return;
      // Delete the "/query" text first, then run the block command so it
      // applies to the now-clean block.
      editor.chain().focus().deleteRange({ from: s.from, to: s.to }).run();
      cmd.run(editor);
      setState(null);
    },
    [editor],
  );

  // Detect on every transaction (typing + caret moves).
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      const hit = detectSlash(editor);
      if (!hit) {
        setState((prev) => (prev ? null : prev));
        return;
      }
      // Flip above the caret if it would overflow the viewport bottom.
      const flip = hit.top + MENU_MAX > window.innerHeight;
      setState({ ...hit, flip });
      setActiveIndex(0);
    };
    editor.on('transaction', handler);
    return () => {
      editor.off('transaction', handler);
    };
  }, [editor]);

  // Reset highlight when the filtered set shrinks below the active index.
  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(0);
  }, [filtered.length, activeIndex]);

  // Capture-phase keyboard nav so we intercept Enter/Arrows before
  // ProseMirror inserts a newline or moves the caret.
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      const list = filteredRef.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setState(null);
        return;
      }
      if (list.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => (i + 1) % list.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => (i - 1 + list.length) % list.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const cmd = list[activeRef.current] || list[0];
        if (cmd) select(cmd);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [state, select]);

  if (!state || filtered.length === 0) return null;

  const menuTop = state.flip ? undefined : state.top + 6;
  const menuBottom = state.flip ? window.innerHeight - state.top + 18 : undefined;

  return (
    <div
      // Fixed positioning at the caret — coords are viewport-relative.
      style={{
        position: 'fixed',
        top: menuTop,
        bottom: menuBottom,
        left: Math.min(state.left, window.innerWidth - 280),
        zIndex: 60,
        width: 264,
      }}
      className="bg-white border border-zinc-200 rounded-lg shadow-xl overflow-hidden"
      onMouseDown={(e) => e.preventDefault()} // keep editor focus
    >
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-400 border-b border-zinc-100">
        {state.query ? `Comandos · "${state.query}"` : 'Comandos'}
      </div>
      <div className="max-h-72 overflow-auto py-1">
        {filtered.map((cmd, i) => {
          const Icon = cmd.icon;
          const active = i === activeIndex;
          return (
            <button
              key={cmd.key}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => select(cmd)}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                active ? 'bg-blue-50' : 'hover:bg-zinc-50'
              }`}
            >
              <span className={`flex items-center justify-center w-7 h-7 rounded border ${active ? 'border-blue-200 bg-white text-blue-600' : 'border-zinc-200 bg-zinc-50 text-zinc-500'}`}>
                <Icon className="w-4 h-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-zinc-800 truncate">{cmd.label}</span>
                <span className="block text-[10px] text-zinc-400 truncate">{cmd.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
