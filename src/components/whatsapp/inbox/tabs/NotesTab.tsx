// src/components/whatsapp/inbox/tabs/NotesTab.tsx
// VERSÃO MELHORADA - Com suporte a anexos (imagens e documentos)
'use client'

import { useState, useEffect, useRef } from 'react'
import { 
  Plus, 
  MoreHorizontal, 
  Trash2, 
  Pin, 
  Clock, 
  Loader2,
  Send,
  Paperclip,
  Image,
  FileText,
  X,
  Download,
  Eye
} from 'lucide-react'
import type { InboxNote } from '@/types/inbox'

interface NotesTabProps {
  contactId: string
  notes: InboxNote[]
  isLoading: boolean
  onAddNote: (content: string, attachments?: NoteAttachment[]) => Promise<void>
  onDeleteNote?: (noteId: string) => Promise<void>
  onPinNote?: (noteId: string, pinned: boolean) => Promise<void>
}

interface NoteAttachment {
  type: 'image' | 'document'
  url: string
  name: string
  size?: number
}

export function NotesTab({
  contactId,
  notes,
  isLoading,
  onAddNote,
  onDeleteNote,
  onPinNote
}: NotesTabProps) {
  const [newNote, setNewNote] = useState('')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [attachments, setAttachments] = useState<NoteAttachment[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // CORREÇÃO: Limpar estado ao mudar de contato
  useEffect(() => {
    setNewNote('')
    setMenuOpen(null)
    setAttachments([])
  }, [contactId])

  const handleSubmit = async () => {
    if ((!newNote.trim() && attachments.length === 0) || isSaving) return
    
    // Verificar se há anexos que são blob URLs (não foram uploaded)
    const hasBlobAttachments = attachments.some(att => att.url.startsWith('blob:'))
    const hasRealAttachments = attachments.some(att => !att.url.startsWith('blob:'))
    
    // Se tem APENAS blob URLs (sem texto), mostrar erro
    if (!newNote.trim() && hasBlobAttachments && !hasRealAttachments) {
      alert('Anexos ainda não são suportados. Por favor, digite uma nota de texto.')
      return
    }
    
    setIsSaving(true)
    try {
      // Filtrar blob URLs (não persistem no servidor)
      const validAttachments = attachments.filter(att => !att.url.startsWith('blob:'))
      
      await onAddNote(newNote.trim(), validAttachments.length > 0 ? validAttachments : undefined)
      setNewNote('')
      setAttachments([])
    } catch (error) {
      console.error('Error adding note:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit()
    }
  }

  const handleFileUpload = async (files: FileList | null, type: 'image' | 'document') => {
    if (!files || files.length === 0) return

    setIsUploading(true)
    
    try {
      for (const file of Array.from(files)) {
        // Verificar tamanho (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          alert(`Arquivo ${file.name} é muito grande. Máximo: 10MB`)
          continue
        }

        // Criar URL temporária para preview
        const url = URL.createObjectURL(file)
        
        setAttachments(prev => [...prev, {
          type,
          url,
          name: file.name,
          size: file.size
        }])

        // TODO: Upload real para storage
        // const formData = new FormData()
        // formData.append('file', file)
        // const response = await fetch('/api/upload', { method: 'POST', body: formData })
        // const { url } = await response.json()
      }
    } catch (error) {
      console.error('Error uploading file:', error)
    } finally {
      setIsUploading(false)
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
      const newAttachments = [...prev]
      URL.revokeObjectURL(newAttachments[index].url)
      newAttachments.splice(index, 1)
      return newAttachments
    })
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Separar notas fixadas
  const pinnedNotes = notes.filter(n => n.is_pinned)
  const regularNotes = notes.filter(n => !n.is_pinned)

  return (
    <div className="flex flex-col h-full">
      {/* Input de nova nota */}
      <div className="p-4 border-b border-gray-200">
        <div className="bg-gray-100 rounded-xl overflow-hidden">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Adicionar uma nota..."
            rows={2}
            className="w-full px-4 py-3 bg-transparent text-white placeholder:text-gray-400 
                       resize-none focus:outline-none text-sm"
          />
          
          {/* Attachments preview */}
          {attachments.length > 0 && (
            <div className="px-4 pb-2">
              <div className="flex flex-wrap gap-2">
                {attachments.map((att, index) => (
                  <div 
                    key={index}
                    className="relative group bg-gray-200 rounded-lg overflow-hidden"
                  >
                    {att.type === 'image' ? (
                      <img 
                        src={att.url} 
                        alt={att.name}
                        className="w-16 h-16 object-cover"
                      />
                    ) : (
                      <div className="w-32 p-2 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-white truncate">{att.name}</p>
                          <p className="text-[10px] text-gray-500">{formatFileSize(att.size)}</p>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => removeAttachment(index)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full 
                                 flex items-center justify-center opacity-0 group-hover:opacity-100 
                                 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-gray-300/50">
            <div className="flex items-center gap-1">
              {/* Anexar imagem */}
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={isUploading}
                className="p-2 text-gray-500 hover:text-white hover:bg-gray-200 rounded-lg transition-colors"
                title="Anexar imagem (preview local)"
              >
                <Image className="w-4 h-4" />
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files, 'image')}
              />
              
              {/* Anexar documento */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="p-2 text-gray-500 hover:text-white hover:bg-gray-200 rounded-lg transition-colors"
                title="Anexar documento (preview local)"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                multiple
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files, 'document')}
              />
              
              {isUploading && (
                <Loader2 className="w-4 h-4 text-gray-500 animate-spin ml-2" />
              )}
              
              {/* Aviso de que anexos são preview */}
              {attachments.length > 0 && (
                <span className="text-[10px] text-yellow-500 ml-2" title="Anexos não serão salvos até implementar upload">
                  ⚠️ Preview
                </span>
              )}
            </div>
            
            <button
              onClick={handleSubmit}
              disabled={(!newNote.trim() && attachments.length === 0) || isSaving}
              className="p-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 
                         transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
        <p className="text-[10px] text-gray-400 mt-1 text-center">
          Ctrl+Enter para enviar
        </p>
      </div>

      {/* Lista de notas */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhuma nota ainda</p>
            <p className="text-xs mt-1">Adicione notas para lembrar de informações importantes</p>
          </div>
        ) : (
          <>
            {/* Notas fixadas */}
            {pinnedNotes.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 font-medium flex items-center gap-1">
                  <Pin className="w-3 h-3" /> Fixadas
                </p>
                {pinnedNotes.map((note) => (
                  <NoteCard 
                    key={note.id}
                    note={note}
                    menuOpen={menuOpen}
                    setMenuOpen={setMenuOpen}
                    onDelete={onDeleteNote}
                    onPin={onPinNote}
                    formatDate={formatDate}
                    isPinned
                  />
                ))}
              </div>
            )}
            
            {/* Notas regulares */}
            {regularNotes.map((note) => (
              <NoteCard 
                key={note.id}
                note={note}
                menuOpen={menuOpen}
                setMenuOpen={setMenuOpen}
                onDelete={onDeleteNote}
                onPin={onPinNote}
                formatDate={formatDate}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// Componente de Card de Nota
function NoteCard({ 
  note, 
  menuOpen, 
  setMenuOpen, 
  onDelete, 
  onPin,
  formatDate,
  isPinned
}: {
  note: InboxNote
  menuOpen: string | null
  setMenuOpen: (id: string | null) => void
  onDelete?: (noteId: string) => Promise<void>
  onPin?: (noteId: string, pinned: boolean) => Promise<void>
  formatDate: (date: string) => string
  isPinned?: boolean
}) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!onDelete) return
    setIsDeleting(true)
    try {
      await onDelete(note.id)
    } catch (error) {
      console.error('Error deleting note:', error)
    } finally {
      setIsDeleting(false)
      setMenuOpen(null)
    }
  }

  const handlePin = async () => {
    if (!onPin) return
    try {
      await onPin(note.id, !note.is_pinned)
    } catch (error) {
      console.error('Error pinning note:', error)
    } finally {
      setMenuOpen(null)
    }
  }

  return (
    <div className={`bg-gray-100 rounded-xl p-3 group ${isPinned ? 'border border-brand-300' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white whitespace-pre-wrap break-words">
            {note.content}
          </p>
          
          {/* Attachments */}
          {(note as any).attachments && (note as any).attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {(note as any).attachments.map((att: any, index: number) => (
                <div key={index} className="relative group/att">
                  {att.type === 'image' ? (
                    <a href={att.url} target="_blank" rel="noopener noreferrer">
                      <img 
                        src={att.url} 
                        alt={att.name}
                        className="w-20 h-20 object-cover rounded-lg hover:opacity-80 transition-opacity"
                      />
                    </a>
                  ) : (
                    <a 
                      href={att.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-gray-200 rounded-lg p-2 hover:bg-gray-300 transition-colors"
                    >
                      <FileText className="w-4 h-4 text-blue-400" />
                      <span className="text-xs text-white truncate max-w-[100px]">{att.name}</span>
                      <Download className="w-3 h-3 text-gray-500" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
          
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            <span>{formatDate(note.created_at)}</span>
            {note.created_by_name && (
              <>
                <span>•</span>
                <span>{note.created_by_name}</span>
              </>
            )}
          </div>
        </div>
        
        {(onDelete || onPin) && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen(menuOpen === note.id ? null : note.id)}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-200 rounded-lg 
                         opacity-0 group-hover:opacity-100 transition-all"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            
            {menuOpen === note.id && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 
                              rounded-lg shadow-xl py-1 min-w-[140px] z-10">
                {onPin && (
                  <button
                    onClick={handlePin}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 
                               hover:bg-gray-100 hover:text-white transition-colors"
                  >
                    <Pin className="w-4 h-4" />
                    {note.is_pinned ? 'Desafixar' : 'Fixar'}
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 
                               hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Excluir
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default NotesTab
