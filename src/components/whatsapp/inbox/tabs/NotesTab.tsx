'use client'

import { useState, useEffect } from 'react'
import { 
  FileText, 
  Send, 
  Pin, 
  Loader2, 
  Trash2,
  MoreVertical
} from 'lucide-react'
import type { InboxNote } from '@/types/inbox'

interface NotesTabProps {
  contactId: string
  notes: InboxNote[]
  isLoading: boolean
  onAddNote: (content: string) => Promise<void>
  onDeleteNote?: (noteId: string) => Promise<void>
  onPinNote?: (noteId: string, pinned: boolean) => Promise<void>
}

export function NotesTab({
  contactId,
  notes,
  isLoading,
  onAddNote,
  onDeleteNote,
  onPinNote,
}: NotesTabProps) {
  const [newNote, setNewNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  // ✅ CORREÇÃO: Limpar estado quando contactId mudar
  useEffect(() => {
    setNewNote('')
    setMenuOpen(null)
  }, [contactId])

  const handleSubmit = async () => {
    if (!newNote.trim() || isSaving) return
    
    setIsSaving(true)
    try {
      await onAddNote(newNote.trim())
      setNewNote('')
    } catch (error) {
      console.error('Error adding note:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const formatDate = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 60) return `há ${diffMins}min`
    if (diffHours < 24) return `há ${diffHours}h`
    if (diffDays < 7) return `há ${diffDays}d`
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  }

  // Separar notas fixadas
  const pinnedNotes = notes.filter(n => n.is_pinned)
  const regularNotes = notes.filter(n => !n.is_pinned)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Input de nova nota */}
      <div className="relative">
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Adicionar uma nota..."
          className="w-full px-4 py-3 pr-12 bg-dark-800 border border-dark-700 rounded-xl 
                     text-white placeholder:text-dark-500 resize-none
                     focus:outline-none focus:border-primary-500 transition-colors"
          rows={2}
        />
        <button
          onClick={handleSubmit}
          disabled={!newNote.trim() || isSaving}
          className="absolute right-3 bottom-3 p-2 bg-primary-500 text-white rounded-lg
                     hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Notas fixadas */}
      {pinnedNotes.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-dark-400 uppercase flex items-center gap-1">
            <Pin className="w-3 h-3" />
            Notas Fixadas
          </h4>
          {pinnedNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onDelete={onDeleteNote}
              onPin={onPinNote}
              formatDate={formatDate}
              menuOpen={menuOpen}
              setMenuOpen={setMenuOpen}
            />
          ))}
        </div>
      )}

      {/* Lista de notas */}
      {regularNotes.length > 0 ? (
        <div className="space-y-2">
          {pinnedNotes.length > 0 && (
            <h4 className="text-xs font-medium text-dark-400 uppercase">Outras Notas</h4>
          )}
          {regularNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onDelete={onDeleteNote}
              onPin={onPinNote}
              formatDate={formatDate}
              menuOpen={menuOpen}
              setMenuOpen={setMenuOpen}
            />
          ))}
        </div>
      ) : pinnedNotes.length === 0 ? (
        <div className="text-center py-8 text-dark-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma nota ainda</p>
          <p className="text-xs text-dark-500 mt-1">
            Adicione notas para lembrar de informações importantes
          </p>
        </div>
      ) : null}
    </div>
  )
}

// Componente de card de nota
function NoteCard({
  note,
  onDelete,
  onPin,
  formatDate,
  menuOpen,
  setMenuOpen,
}: {
  note: InboxNote
  onDelete?: (id: string) => Promise<void>
  onPin?: (id: string, pinned: boolean) => Promise<void>
  formatDate: (date: string) => string
  menuOpen: string | null
  setMenuOpen: (id: string | null) => void
}) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!onDelete) return
    setIsDeleting(true)
    try {
      await onDelete(note.id)
    } finally {
      setIsDeleting(false)
      setMenuOpen(null)
    }
  }

  const handlePin = async () => {
    if (!onPin) return
    await onPin(note.id, !note.is_pinned)
    setMenuOpen(null)
  }

  return (
    <div className={`p-3 bg-dark-800/50 rounded-xl border ${
      note.is_pinned ? 'border-primary-500/30 bg-primary-500/5' : 'border-dark-700/50'
    }`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm text-white whitespace-pre-wrap break-words flex-1">
          {note.content}
        </p>
        
        {/* Menu de ações */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(menuOpen === note.id ? null : note.id)}
            className="p-1 text-dark-500 hover:text-white rounded transition-colors"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          
          {menuOpen === note.id && (
            <div className="absolute right-0 top-full mt-1 w-32 bg-dark-700 rounded-lg shadow-lg 
                            border border-dark-600 py-1 z-10">
              {onPin && (
                <button
                  onClick={handlePin}
                  className="w-full px-3 py-1.5 text-left text-sm text-dark-300 
                             hover:bg-dark-600 flex items-center gap-2"
                >
                  <Pin className="w-4 h-4" />
                  {note.is_pinned ? 'Desafixar' : 'Fixar'}
                </button>
              )}
              {onDelete && (
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="w-full px-3 py-1.5 text-left text-sm text-red-400 
                             hover:bg-dark-600 flex items-center gap-2"
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
      </div>
      
      <div className="flex items-center justify-between text-xs text-dark-500">
        <span>{note.created_by_name || 'Você'}</span>
        <span>{formatDate(note.created_at)}</span>
      </div>
    </div>
  )
}

export default NotesTab
