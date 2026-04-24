'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import LinkExtension from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, Link, Type, Tag } from 'lucide-react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { MergeTagQuickPicker } from '../modals/MergeTagQuickPicker'

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  onInsertMergeTag?: () => void
  placeholder?: string
}

export function RichTextEditor({ content, onChange, onInsertMergeTag, placeholder }: RichTextEditorProps) {
  const [showQuickPicker, setShowQuickPicker] = useState(false)
  const [quickPickerRect, setQuickPickerRect] = useState<{ top: number; left: number; bottom: number } | undefined>()
  const tagButtonRef = useRef<HTMLButtonElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      LinkExtension.configure({ openOnClick: false }),
      Underline,
      Placeholder.configure({ placeholder: placeholder || 'Escreva seu texto...' }),
    ],
    content: content || '<p></p>',
    autofocus: 'end',
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[80px] px-3 py-2 text-gray-900',
      },
    },
  })

  // Sync external content changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '<p></p>', { emitUpdate: false })
    }
  }, [content, editor])

  const handleToggleQuickPicker = useCallback(() => {
    if (showQuickPicker) {
      setShowQuickPicker(false)
      return
    }
    if (tagButtonRef.current && toolbarRef.current) {
      const btnRect = tagButtonRef.current.getBoundingClientRect()
      const toolbarRect = toolbarRef.current.getBoundingClientRect()
      setQuickPickerRect({
        top: btnRect.top - toolbarRect.top,
        left: btnRect.left - toolbarRect.left,
        bottom: btnRect.bottom - toolbarRect.top,
      })
    }
    setShowQuickPicker(true)
  }, [showQuickPicker])

  const handleQuickPickerSelect = useCallback((tag: string) => {
    editor?.chain().focus().insertContent(tag).run()
    setShowQuickPicker(false)
  }, [editor])

  const handleCloseQuickPicker = useCallback(() => {
    setShowQuickPicker(false)
  }, [])

  const handleOpenFullPicker = useCallback(() => {
    setShowQuickPicker(false)
    onInsertMergeTag?.()
  }, [onInsertMergeTag])

  if (!editor) return null

  const ToolbarButton = ({ active, onClick, children, title, buttonRef }: { active?: boolean; onClick: () => void; children: React.ReactNode; title: string; buttonRef?: React.Ref<HTMLButtonElement> }) => (
    <button type="button" ref={buttonRef} onClick={onClick} title={title}
      className={`p-1 rounded transition-colors ${active ? 'bg-brand-100 text-brand-700' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
      {children}
    </button>
  )

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Toolbar */}
      <div ref={toolbarRef} className="relative flex items-center gap-0.5 px-1.5 py-1 border-b border-gray-100 bg-gray-50 flex-wrap">
        <select
          value={editor.isActive('heading', { level: 1 }) ? 'h1' : editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p'}
          onChange={e => {
            const v = e.target.value
            if (v === 'p') editor.chain().focus().setParagraph().run()
            else editor.chain().focus().toggleHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run()
          }}
          className="text-[10px] border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-700 focus:outline-none mr-1"
        >
          <option value="p">Normal</option>
          <option value="h1">Título 1</option>
          <option value="h2">Título 2</option>
          <option value="h3">Título 3</option>
        </select>

        <div className="w-px h-4 bg-gray-200 mx-0.5" />

        <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrito">
          <Bold className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Itálico">
          <Italic className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Sublinhado">
          <UnderlineIcon className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Tachado">
          <Strikethrough className="w-3.5 h-3.5" />
        </ToolbarButton>

        <div className="w-px h-4 bg-gray-200 mx-0.5" />

        <ToolbarButton active={editor.isActive('link')} onClick={() => {
          const url = window.prompt('URL do link:', editor.getAttributes('link').href || '')
          if (url === null) return
          if (url === '') { editor.chain().focus().unsetLink().run(); return }
          editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
        }} title="Link">
          <Link className="w-3.5 h-3.5" />
        </ToolbarButton>

        <ToolbarButton active={showQuickPicker} onClick={handleToggleQuickPicker} title="Inserir Merge Tag" buttonRef={tagButtonRef}>
          <Tag className="w-3.5 h-3.5" />
        </ToolbarButton>

        {showQuickPicker && (
          <MergeTagQuickPicker
            onSelect={handleQuickPickerSelect}
            onOpenFull={onInsertMergeTag ? handleOpenFullPicker : undefined}
            onClose={handleCloseQuickPicker}
            anchorRect={quickPickerRect}
          />
        )}
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />
    </div>
  )
}
