'use client';

// =============================================================
// Worder — Text-based email editor (founder-style).
//
// Standalone editor for the "text" email flavor: minimal Tiptap surface
// (paragraph, heading, lists, link, image, blockquote, merge-tag chip),
// system-font preview, and the same save/autosave/back contract the
// drag-and-drop editor exposes. Mounts behind the same overlay path —
// pages and flow panels dispatch by editor_type without changing call
// sites.
//
// Surfaces (right-side panel):
//   - Subject (with merge-tag inserter — shared MergeTagPicker)
//   - Preview text (rendered as the inbox preheader)
//   - Variable picker (drops a chip at the cursor — shared MergeTagPicker)
//   - "Send test" action — reuses the existing modal
//
// Sender identity is configured at send time (automation node /
// PropertiesPanel or campaign), NOT on the template, so no sender fields
// live here.
// =============================================================

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
// StarterKit v3 already bundles Link and Underline, so they're
// configured through it below rather than added as separate extensions
// (which would register duplicates). Placeholder and TextAlign are NOT
// in StarterKit, so they stay as standalone imports.
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import {
  ArrowLeft,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Link as LinkIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Tag,
  Send,
  Eye,
  Smartphone,
  Monitor,
  Loader2,
  CheckCircle,
  AlertCircle,
  Type,
  Undo2,
  Redo2,
  Maximize2,
  Minimize2,
  History,
} from 'lucide-react';

import { MergeTag } from './MergeTagNode';
import { useSlashMenu } from './SlashCommands';
import { VersionHistoryModal } from './VersionHistoryModal';
import { type TextDoc, renderTextEmailToHtml } from '@/lib/email/text-render';
// Client-safe sample values for the static (campaign) preview — resolves
// {{tags}} to the same examples the catalogs advertise.
import { getSampleMergeData } from '@/lib/email/merge-tags';
import { useEmailAutosave } from '@/components/email-builder/hooks/useEmailAutosave';
import { SendTestModal } from '@/components/email-builder/modals/SendTestModal';
// Shared merge-tag picker — the SAME component the drag-and-drop editor
// uses, so both flavors offer identical canonical/trigger/custom tags.
import { MergeTagPicker } from '@/components/email-builder/modals/MergeTagPicker';
// Real-payload live preview (lead selection + resolved event data) — the
// same panel the block editor opens from a flow.
import { EmailPreviewMode } from '@/components/flow-builder/panels/EmailPreviewMode';

// ---- Types ---------------------------------------------------

export interface TextEmailDesign {
  /** Tiptap / ProseMirror JSON doc. */
  doc: TextDoc;
  /** Header metadata. Subject and preview text are also persisted on
   *  email_templates.subject / preview_text columns — keeping a mirror
   *  here lets the design payload round-trip cleanly. */
  subject?: string;
  previewText?: string;
  /** Container max width — exposed so a future "wider" preset can land
   *  without breaking the renderer signature. */
  maxWidth?: number;
}

export interface TextEmailEditorHandle {
  save: () => Promise<void>;
}

interface TextEmailEditorProps {
  templateName: string;
  templateId?: string;
  design?: TextEmailDesign | Record<string, any> | null;
  storeId?: string;
  organizationId?: string;
  /** Automation context — mirrors the block editor. When present the merge
   *  picker runs in 'automation' mode (trigger + custom tags) and the live
   *  preview switches to real-payload EmailPreviewMode. Campaign mode
   *  (standalone edit route) leaves this undefined. */
  flowContext?: {
    templateId: string;
    triggerType: string;
    organizationId: string;
    /** Loja do fluxo — o preview com dados reais usa o catálogo dela. */
    storeId?: string | null;
  };
  onSave: (design: TextEmailDesign, html: string) => Promise<boolean>;
  onBack: () => void;
  onRename?: (name: string) => Promise<void> | void;
  flowName?: string;
}

// Empty document seed. A single empty paragraph is the canonical
// "nothing typed yet" state for ProseMirror — no content array would
// fail schema validation in some Tiptap versions.
const EMPTY_DOC: TextDoc = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

function coerceDesign(input?: TextEmailDesign | Record<string, any> | null): TextEmailDesign {
  if (!input) return { doc: JSON.parse(JSON.stringify(EMPTY_DOC)) };
  // Legacy / pre-migration documents may have stored the bare Tiptap doc
  // at the top level instead of the {doc, subject, …} envelope. Detect
  // by the presence of `type === 'doc'` on the root.
  if ((input as any).type === 'doc') {
    return { doc: input as TextDoc };
  }
  const d = input as TextEmailDesign;
  return {
    doc: (d.doc && (d.doc as any).type === 'doc') ? d.doc : JSON.parse(JSON.stringify(EMPTY_DOC)),
    subject: d.subject,
    previewText: d.previewText,
    maxWidth: d.maxWidth,
  };
}

// ---- Component -----------------------------------------------

const TextEmailEditor = forwardRef<TextEmailEditorHandle, TextEmailEditorProps>(function TextEmailEditor(
  { templateName, templateId, design, storeId, organizationId, flowContext, onSave, onBack, onRename, flowName },
  ref,
) {
  const initial = useMemo(() => coerceDesign(design), [design]);
  const [name, setName] = useState(templateName);
  const [editingName, setEditingName] = useState(false);
  const [subject, setSubject] = useState(initial.subject || '');
  const [previewText, setPreviewText] = useState(initial.previewText || '');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [showPreview, setShowPreview] = useState(false);
  // Which field the shared MergeTagPicker inserts into when a tag is
  // chosen. null = picker closed.
  const [pickerTarget, setPickerTarget] = useState<'subject' | 'body' | null>(null);
  // Real-payload live preview (automation only).
  const [showFlowPreview, setShowFlowPreview] = useState(false);
  const [showSendTest, setShowSendTest] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // Distraction-free writing: hides the sidebar + top chrome so the
  // founder note is the only thing on screen. Toggled with ⌘/ (Ctrl+/ on
  // Windows/Linux).
  const [zenMode, setZenMode] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  // Platform-aware modifier label for keyboard hints. Handlers accept
  // both metaKey and ctrlKey; only the DISPLAYED hint changes. Set in an
  // effect (default ⌘) to avoid SSR/hydration mismatches.
  const [modKey, setModKey] = useState('⌘');
  useEffect(() => {
    const platform =
      (navigator as any).userAgentData?.platform || navigator.platform || '';
    if (!/Mac|iPhone|iPad|iPod/i.test(platform)) setModKey('Ctrl+');
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false, // keep the toolbar lean — code is rare in marketing emails
        // Link + Underline ship inside StarterKit v3 — configure here
        // instead of registering separate extensions.
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: 'noopener', target: '_blank' },
        },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({
        placeholder: 'Escreva seu e-mail aqui — como se estivesse falando direto com seu cliente.\n\nDica: digite "/" para inserir títulos, listas e variáveis.',
      }),
      MergeTag,
    ],
    content: initial.doc,
    autofocus: 'end',
    editorProps: {
      attributes: {
        // Tailwind `prose` would conflict with our inline styling so we
        // hand-style only what we need. min-h gives the canvas weight.
        class: 'focus:outline-none min-h-[400px] text-[16px] leading-[1.6] text-zinc-900',
        style: 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;',
      },
    },
  });

  // Track body edits → dirty. Seeding `content` in useEditor does NOT
  // emit an 'update', so every fired event is a genuine user edit — no
  // need to swallow a "first" one (doing so dropped single-edit changes).
  // Monotonic edit counter — lets the autosave hook detect edits that
  // land while a save is in flight and re-save instead of losing them.
  const revisionRef = useRef(0);
  useEffect(() => {
    if (!editor) return;
    const handler = () => { revisionRef.current++; setIsDirty(true); };
    editor.on('update', handler);
    return () => {
      editor.off('update', handler);
    };
  }, [editor]);

  // Mark dirty on metadata changes (subject, preview, sender) so the
  // autosave fires even when the user only tweaks the side panel without
  // touching the body. A ref skips the first run (initial mount values)
  // so loading a template doesn't immediately mark it dirty.
  const metaMounted = useRef(false);
  useEffect(() => {
    if (!metaMounted.current) {
      metaMounted.current = true;
      return;
    }
    revisionRef.current++;
    setIsDirty(true);
  }, [subject, previewText]);

  const buildDesign = useCallback((): TextEmailDesign => {
    const doc = editor ? (editor.getJSON() as TextDoc) : initial.doc;
    return {
      doc,
      subject,
      previewText,
    };
  }, [editor, initial.doc, subject, previewText]);

  const buildHtml = useCallback((d: TextEmailDesign): string => {
    return renderTextEmailToHtml(d.doc, {
      preheader: d.previewText || undefined,
    });
  }, []);

  const doSave = useCallback(async () => {
    const d = buildDesign();
    const html = buildHtml(d);
    return onSave(d, html);
  }, [buildDesign, buildHtml, onSave]);

  const { saveStatus, lastSavedAt, flush } = useEmailAutosave({
    onSave: doSave,
    isDirty,
    onSaved: () => setIsDirty(false),
    debounceMs: 1500,
    getDirtyToken: () => revisionRef.current,
  });

  useImperativeHandle(ref, () => ({ save: async () => { await flush(); } }), [flush]);

  // Slash command menu. "/" at the start of a block opens a palette;
  // selecting "Variável" defers to the shared MergeTagPicker (body target).
  const slashMenu = useSlashMenu(editor, () => setPickerTarget('body'));

  // Live preview HTML — re-renders only when the doc, preview text, or
  // device toggle change so we don't allocate a 5KB string on every
  // keystroke when the preview pane is open. In campaign/static mode
  // (no flowContext) {{tags}} are substituted with SAMPLE values so the
  // merchant never stares at raw braces; unknown tags stay literal.
  const previewHtml = useMemo(() => {
    if (!editor) return '';
    const doc = editor.getJSON() as TextDoc;
    let html = renderTextEmailToHtml(doc, { preheader: previewText || undefined });
    if (!flowContext) {
      const samples = getSampleMergeData();
      html = html.replace(
        /\{\{\s*([^}|]+?)\s*(?:\|([^}]*))?\}\}/g,
        (match, tag: string, fallback?: string) => {
          const key = tag.trim();
          if (samples[key] !== undefined) return samples[key];
          if (fallback !== undefined && fallback.trim()) return fallback.trim();
          return match; // unknown tag, no fallback → keep literal
        },
      );
    }
    return html;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor?.state.doc, previewText, showPreview, flowContext]);

  // Subject input ref + the selection captured when the picker opened for
  // the subject — lets the chosen tag land at the cursor instead of always
  // being appended to the end.
  const subjectInputRef = useRef<HTMLInputElement | null>(null);
  const subjectSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const openSubjectPicker = useCallback(() => {
    const el = subjectInputRef.current;
    subjectSelectionRef.current = el
      ? {
          start: el.selectionStart ?? el.value.length,
          end: el.selectionEnd ?? el.value.length,
        }
      : null;
    setPickerTarget('subject');
  }, []);

  // Called by the shared MergeTagPicker with a full `{{ ... }}` string
  // (e.g. "{{ CheckoutURL }}", "{{ trigger.foo }}", "{{ custom.segment }}")
  // plus, when the catalog knows it, the human-friendly name.
  // Subject → splice the literal string at the captured cursor position
  // (renderer substitutes it later; we don't render chips in plain inputs).
  // Body → insert a MergeTagNode chip labeled with the friendly name
  // (falling back to the raw path when absent).
  const handleTagSelect = useCallback(
    (tagValue: string, label?: string) => {
      const target = pickerTarget;
      if (target === 'subject') {
        setSubject((s) => {
          const sel = subjectSelectionRef.current;
          if (sel && sel.start >= 0 && sel.start <= s.length && sel.end <= s.length) {
            return s.slice(0, sel.start) + tagValue + s.slice(sel.end);
          }
          return `${s}${tagValue}`;
        });
        subjectSelectionRef.current = null;
      } else if (target === 'body' && editor) {
        // Parse the inner name (strip {{ }} and optional |fallback).
        const inner = tagValue.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '');
        const [rawTag, fallback] = inner.split('|');
        const tag = (rawTag || '').trim();
        (editor.chain() as any).insertMergeTag({
          tag,
          label: (label || '').trim() || tag,
          fallback: (fallback || '').trim(),
        }).run();
      }
      setPickerTarget(null);
    },
    [editor, pickerTarget],
  );

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('URL do link:', prev);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  }, [editor]);

  // Keyboard shortcuts: ⌘S saves, ⌘/ toggles distraction-free mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        flush();
      } else if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setZenMode((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flush]);

  const handleBack = useCallback(async () => {
    try { await flush(); } catch {}
    onBack();
  }, [flush, onBack]);

  // Flush the pending autosave debounce BEFORE opening the real-payload
  // preview or the send-test modal — both should reflect what the user
  // just typed, not the last persisted snapshot (autosave debounces at
  // ~1.5s, so "type → preview" raced the save). `flush()` cancels the
  // pending timer and awaits the save when dirty; a failure is non-fatal
  // (the surface still opens, matching handleBack's behavior).
  const openFlowPreview = useCallback(async () => {
    try { await flush(); } catch {}
    setShowFlowPreview(true);
  }, [flush]);

  const openSendTest = useCallback(async () => {
    try { await flush(); } catch {}
    setShowSendTest(true);
  }, [flush]);

  // Apply a restored version (already persisted server-side) to the live
  // editor: swap the doc and re-hydrate the metadata fields. We mark the
  // editor clean afterwards since the server row is already up to date.
  const applyRestored = useCallback((restoredTemplate: any) => {
    const restored = coerceDesign(restoredTemplate?.design_json || restoredTemplate?.design);
    if (editor && restored.doc) {
      editor.commands.setContent(restored.doc, { emitUpdate: false });
    }
    setSubject(restored.subject || restoredTemplate?.subject || '');
    setPreviewText(restored.previewText || restoredTemplate?.preview_text || '');
    setIsDirty(false);
  }, [editor]);

  // ---- Render -------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-50">
      {/* Top bar */}
      <header className="flex items-center gap-3 h-14 px-4 bg-white border-b border-zinc-200">
        <button
          onClick={handleBack}
          className="p-2 -ml-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-md transition-colors"
          title="Voltar"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          {editingName ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={async () => {
                setEditingName(false);
                const trimmed = name.trim();
                if (trimmed && trimmed !== templateName && onRename) {
                  await onRename(trimmed);
                }
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="text-sm font-semibold text-zinc-900 bg-transparent border-b border-zinc-300 focus:outline-none focus:border-zinc-900"
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="text-sm font-semibold text-zinc-900 hover:bg-zinc-50 px-2 py-1 rounded truncate max-w-[260px]"
              title={name}
            >
              {name || 'Sem título'}
            </button>
          )}
          {flowName && (
            <span className="text-xs text-zinc-400">no fluxo · {flowName}</span>
          )}
          <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-zinc-100 text-zinc-600 rounded">
            <Type className="w-3 h-3" />
            Texto
          </span>
        </div>

        <div className="flex-1" />

        {/* Save status */}
        <div className="flex items-center gap-1.5 text-xs text-zinc-500 mr-2 min-w-[110px] justify-end">
          {saveStatus === 'saving' && (<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando…</>)}
          {saveStatus === 'pending' && (<><Loader2 className="w-3.5 h-3.5 opacity-50" /> Mudanças não salvas</>)}
          {saveStatus === 'saved' && lastSavedAt && (<><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Salvo</>)}
          {saveStatus === 'error' && (<><AlertCircle className="w-3.5 h-3.5 text-red-500" /> Erro</>)}
        </div>

        {/* Device toggle */}
        <div className="flex items-center gap-0.5 bg-zinc-100 rounded-md p-0.5">
          <button
            onClick={() => setDevice('desktop')}
            className={`p-1.5 rounded ${device === 'desktop' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500'}`}
            title="Desktop"
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDevice('mobile')}
            className={`p-1.5 rounded ${device === 'mobile' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500'}`}
            title="Mobile"
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* In automation context, open the real-payload preview (lead
            selection + resolved event data) — same as the block editor.
            Campaign mode falls back to the inline static preview. */}
        {flowContext ? (
          <button
            onClick={openFlowPreview}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors text-zinc-700 hover:bg-zinc-100"
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
          </button>
        ) : (
          <button
            onClick={() => setShowPreview((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              showPreview ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-100'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
          </button>
        )}

        {templateId && (
          <button
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors"
            title="Histórico de versões"
          >
            <History className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={() => setZenMode((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
            zenMode ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-100'
          }`}
          title={`Modo foco (${modKey}/)`}
        >
          {zenMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={openSendTest}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
          Enviar teste
        </button>
      </header>

      {/* Editor + sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Canvas */}
        <main className="flex-1 overflow-auto bg-zinc-100">
          <div className={`mx-auto transition-all ${zenMode ? 'my-12' : 'my-8'} ${device === 'mobile' ? 'max-w-[380px]' : zenMode ? 'max-w-[720px]' : 'max-w-[680px]'}`}>
            {/* Subject preview strip — mimics inbox header */}
            <div className="bg-white rounded-t-lg border border-b-0 border-zinc-200 px-6 py-4">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">Assunto</span>
                <span className="text-sm font-medium text-zinc-900 truncate">
                  {subject || (<span className="text-zinc-400 italic">Sem assunto</span>)}
                </span>
              </div>
              {previewText && (
                <div className="text-xs text-zinc-500 mt-1.5 truncate">{previewText}</div>
              )}
            </div>

            {/* Toolbar */}
            {!showPreview && editor && (
              <div className="bg-white border-x border-zinc-200 px-2 py-1.5 flex items-center gap-0.5 flex-wrap sticky top-0 z-10">
                <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="Desfazer" disabled={!editor.can().undo()}>
                  <Undo2 className="w-4 h-4" />
                </ToolBtn>
                <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="Refazer" disabled={!editor.can().redo()}>
                  <Redo2 className="w-4 h-4" />
                </ToolBtn>
                <Divider />
                <ToolBtn active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Título 1">
                  <Heading1 className="w-4 h-4" />
                </ToolBtn>
                <ToolBtn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Título 2">
                  <Heading2 className="w-4 h-4" />
                </ToolBtn>
                <ToolBtn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Título 3">
                  <Heading3 className="w-4 h-4" />
                </ToolBtn>
                <Divider />
                <ToolBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title={`Negrito (${modKey}B)`}>
                  <Bold className="w-4 h-4" />
                </ToolBtn>
                <ToolBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title={`Itálico (${modKey}I)`}>
                  <Italic className="w-4 h-4" />
                </ToolBtn>
                <ToolBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title={`Sublinhado (${modKey}U)`}>
                  <UnderlineIcon className="w-4 h-4" />
                </ToolBtn>
                <ToolBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Tachado">
                  <Strikethrough className="w-4 h-4" />
                </ToolBtn>
                <Divider />
                <ToolBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista">
                  <List className="w-4 h-4" />
                </ToolBtn>
                <ToolBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Lista numerada">
                  <ListOrdered className="w-4 h-4" />
                </ToolBtn>
                <ToolBtn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Citação">
                  <Quote className="w-4 h-4" />
                </ToolBtn>
                <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divisor">
                  <Minus className="w-4 h-4" />
                </ToolBtn>
                <Divider />
                <ToolBtn active={editor.isActive('link')} onClick={setLink} title="Link">
                  <LinkIcon className="w-4 h-4" />
                </ToolBtn>
                <ToolBtn
                  active={pickerTarget === 'body'}
                  onClick={() => setPickerTarget('body')}
                  title="Inserir variável"
                >
                  <Tag className="w-4 h-4" />
                </ToolBtn>
              </div>
            )}

            {/* Body — editor or preview */}
            {showPreview ? (
              <div className="bg-white border border-zinc-200 rounded-b-lg overflow-hidden">
                {!flowContext && (
                  <div className="px-4 py-1.5 bg-zinc-50 border-b border-zinc-100 text-[10px] text-zinc-400">
                    Valores de exemplo — as variáveis são substituídas pelos dados reais no envio.
                  </div>
                )}
                <iframe
                  title="Preview"
                  srcDoc={previewHtml}
                  className="w-full bg-white"
                  style={{ height: 'calc(100vh - 280px)', border: 0 }}
                />
              </div>
            ) : (
              <div
                className="bg-white border border-zinc-200 rounded-b-lg px-8 py-10 min-h-[500px]"
                onClick={() => editor?.commands.focus()}
              >
                <style>{`
                  .ProseMirror p.is-editor-empty:first-child::before {
                    content: attr(data-placeholder);
                    float: left;
                    color: #a1a1aa;
                    white-space: pre-line;
                    pointer-events: none;
                    height: 0;
                  }
                  .ProseMirror h1 { font-size: 28px; line-height: 1.3; font-weight: 700; margin: 0 0 12px; }
                  .ProseMirror h2 { font-size: 22px; line-height: 1.3; font-weight: 700; margin: 20px 0 10px; }
                  .ProseMirror h3 { font-size: 18px; line-height: 1.4; font-weight: 600; margin: 16px 0 8px; }
                  .ProseMirror p { margin: 0 0 14px; }
                  .ProseMirror ul, .ProseMirror ol { margin: 0 0 14px; padding-left: 22px; }
                  .ProseMirror li { margin-bottom: 4px; }
                  .ProseMirror blockquote { border-left: 3px solid #e4e4e7; padding-left: 14px; color: #71717a; font-style: italic; margin: 0 0 14px; }
                  .ProseMirror hr { border: 0; border-top: 1px solid #e4e4e7; margin: 22px 0; }
                  .ProseMirror a { color: #2563eb; text-decoration: underline; }
                  .ProseMirror img { max-width: 100%; height: auto; display: block; margin: 8px 0; }
                  .ProseMirror:focus { outline: none; }
                `}</style>
                <EditorContent editor={editor} />
              </div>
            )}
          </div>
        </main>

        {/* Sidebar — hidden in distraction-free mode so the note is the
            only thing on screen. */}
        <aside className={`w-[340px] border-l border-zinc-200 bg-white flex-col overflow-hidden ${zenMode ? 'hidden' : 'flex'}`}>
          <div className="px-5 py-4 border-b border-zinc-200">
            <h3 className="text-xs font-semibold text-zinc-900 uppercase tracking-wider">Configurações do e-mail</h3>
          </div>

          <div className="flex-1 overflow-auto px-5 py-5 space-y-5">
            {/* Subject */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-zinc-700">Assunto</label>
                <button
                  onClick={openSubjectPicker}
                  className="text-[10px] text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                >
                  <Tag className="w-3 h-3" /> Variável
                </button>
              </div>
              <div className="relative">
                <input
                  ref={subjectInputRef}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex: uma nota rápida"
                  className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-md text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <p className="text-[10px] text-zinc-400 mt-1">Dica: assuntos curtos e em letras minúsculas parecem mais pessoais.</p>
              {flowContext && (
                <p className="text-[10px] text-zinc-400 mt-1">Se o nó do flow definir um assunto, ele tem prioridade.</p>
              )}
            </div>

            {/* Preview text */}
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1.5">Texto de preview</label>
              <textarea
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                rows={2}
                placeholder="Aparece ao lado do assunto na inbox"
                className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-md text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
              />
            </div>

            {/* Variables — opens the SHARED MergeTagPicker (same canonical /
                trigger / custom tags as the drag-and-drop editor). */}
            <div className="pt-4 border-t border-zinc-100">
              <h4 className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">Variáveis disponíveis</h4>
              <button
                onClick={() => setPickerTarget('body')}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
              >
                <Tag className="w-3.5 h-3.5" />
                Inserir variável
              </button>
              <p className="text-[10px] text-zinc-400 mt-2">
                {flowContext ? (
                  <>
                    Abra o seletor para inserir tags canônicas ({`{{ CheckoutURL }}`}), do
                    gatilho e personalizadas. No corpo, digite “/” para o mesmo menu.
                  </>
                ) : (
                  <>
                    Abra o seletor para inserir tags de contato, compras, loja e
                    sistema. No corpo, digite “/” para o mesmo menu.
                  </>
                )}
              </p>
            </div>
          </div>
        </aside>
      </div>

      {/* Slash command palette — rendered at the root so its fixed
          positioning is relative to the viewport, not the canvas. */}
      {slashMenu}

      {/* Shared merge-tag picker — identical tags in both editors. In
          automation context it shows canonical + trigger + custom tags; in
          campaign context, canonical + static catalog. onSelect routes to
          the active target (subject input or body chip). */}
      <MergeTagPicker
        isOpen={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
        onSelect={handleTagSelect}
        context={flowContext ? 'automation' : 'campaign'}
        triggerType={flowContext?.triggerType}
      />

      {/* Real-payload live preview (automation only) — lead selection +
          resolved event data, same as the block editor. */}
      {showFlowPreview && flowContext && (
        <EmailPreviewMode
          templateId={flowContext.templateId}
          triggerType={flowContext.triggerType}
          organizationId={flowContext.organizationId}
          storeId={flowContext.storeId}
          onClose={() => setShowFlowPreview(false)}
        />
      )}

      {/* Version history */}
      {showHistory && templateId && (
        <VersionHistoryModal
          templateId={templateId}
          onClose={() => setShowHistory(false)}
          onRestored={applyRestored}
        />
      )}

      {/* Send test modal */}
      {showSendTest && (
        <SendTestModal
          isOpen={showSendTest}
          onClose={() => setShowSendTest(false)}
          defaultSubject={subject || name}
          html={renderTextEmailToHtml(
            (editor?.getJSON() as TextDoc) || initial.doc,
            { preheader: previewText || undefined },
          )}
        />
      )}
    </div>
  );
});

export default TextEmailEditor;

// ---- Small helpers -------------------------------------------

function ToolBtn({
  active, onClick, disabled, title, children, refProp,
}: {
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  refProp?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      ref={refProp}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        'p-1.5 rounded transition-colors',
        active ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
        disabled ? 'opacity-40 cursor-not-allowed' : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-zinc-200 mx-0.5" />;
}
