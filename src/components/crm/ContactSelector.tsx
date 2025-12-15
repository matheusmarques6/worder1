'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, User, X, Plus, Check } from 'lucide-react'
import { useContacts } from '@/hooks'
import type { Contact } from '@/types'

interface ContactSelectorProps {
  selectedId?: string
  onSelect: (contactId: string | undefined) => void
  placeholder?: string
}

export function ContactSelector({ selectedId, onSelect, placeholder = 'Selecionar contato' }: ContactSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { contacts, loading } = useContacts({ search, limit: 10 })
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedContact = contacts.find((c: Contact) => c.id === selectedId)

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const getInitials = (contact: Contact) => {
    const first = contact.first_name?.[0] || ''
    const last = contact.last_name?.[0] || ''
    return (first + last).toUpperCase() || '?'
  }

  const getDisplayName = (contact: Contact) => {
    if (contact.first_name || contact.last_name) {
      return `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
    }
    return contact.email || 'Sem nome'
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Selected Contact / Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-left hover:border-slate-600 transition-colors"
      >
        {selectedContact ? (
          <>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">
                {getInitials(selectedContact)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white truncate">
                {getDisplayName(selectedContact)}
              </p>
              {selectedContact.email && (
                <p className="text-slate-500 text-sm truncate">{selectedContact.email}</p>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onSelect(undefined)
              }}
              className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <User className="w-5 h-5 text-slate-500" />
            <span className="text-slate-500">{placeholder}</span>
          </>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-20 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-slate-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-violet-500"
                placeholder="Buscar contato..."
                autoFocus
              />
            </div>
          </div>

          {/* Contacts List */}
          <div className="max-h-60 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-slate-500">
                <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                Carregando...
              </div>
            ) : contacts.length === 0 ? (
              <div className="p-4 text-center text-slate-500">
                {search ? 'Nenhum contato encontrado' : 'Nenhum contato'}
              </div>
            ) : (
              contacts.map((contact: Contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => {
                    onSelect(contact.id)
                    setIsOpen(false)
                    setSearch('')
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">
                      {getInitials(contact)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-white truncate">
                      {getDisplayName(contact)}
                    </p>
                    {contact.email && (
                      <p className="text-slate-500 text-sm truncate">{contact.email}</p>
                    )}
                  </div>
                  {selectedId === contact.id && (
                    <Check className="w-5 h-5 text-violet-400 flex-shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Create New */}
          <div className="p-2 border-t border-slate-700">
            <button
              type="button"
              onClick={() => {
                // TODO: Abrir modal de criar contato
                setIsOpen(false)
              }}
              className="w-full flex items-center gap-2 px-4 py-2 rounded-lg text-violet-400 hover:bg-violet-500/10 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm">Criar novo contato</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
