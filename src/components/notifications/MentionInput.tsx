'use client'

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMention } from '@/types/notifications'
import type { MentionableUser } from '@/types/notifications'

interface MentionInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  placeholder?: string
  organizationId: string
  className?: string
  disabled?: boolean
  rows?: number
}

export function MentionInput({ value, onChange, onSubmit, placeholder = 'Digite uma mensagem... Use @ para mencionar', organizationId, className, disabled = false, rows = 2 }: MentionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [showMentions, setShowMentions] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const [mentionStartIndex, setMentionStartIndex] = useState(-1)
  const [users, setUsers] = useState<MentionableUser[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  
  const searchUsers = useCallback(async (query: string) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/users/search?organization_id=${organizationId}&q=${encodeURIComponent(query)}&limit=10`)
      if (response.ok) { const data = await response.json(); setUsers(data.users || []) }
    } catch (err) { setUsers([]) }
    finally { setIsLoading(false) }
  }, [organizationId])
  
  const updateDropdownPosition = () => {
    if (!textareaRef.current) return
    const rect = textareaRef.current.getBoundingClientRect()
    setDropdownPosition({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX })
  }
  
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const cursorPos = e.target.selectionStart || 0
    onChange(newValue)
    const textBeforeCursor = newValue.slice(0, cursorPos)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex)
      if (!textAfterAt.includes(' ') && !textAfterAt.includes(']')) {
        const search = textAfterAt.slice(1)
        setMentionSearch(search); setMentionStartIndex(lastAtIndex); setShowMentions(true); setSelectedIndex(0)
        searchUsers(search); updateDropdownPosition(); return
      }
    }
    setShowMentions(false)
  }
  
  const insertMention = (user: MentionableUser) => {
    if (mentionStartIndex === -1) return
    const mention = formatMention(user.id, user.name || user.email)
    const before = value.slice(0, mentionStartIndex)
    const after = value.slice(mentionStartIndex + mentionSearch.length + 1)
    onChange(before + mention + ' ' + after)
    setShowMentions(false); setMentionSearch(''); setMentionStartIndex(-1)
    setTimeout(() => { if (textareaRef.current) { const pos = before.length + mention.length + 1; textareaRef.current.focus(); textareaRef.current.setSelectionRange(pos, pos) } }, 0)
  }
  
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showMentions || users.length === 0) { if (e.key === 'Enter' && !e.shiftKey && onSubmit) { e.preventDefault(); onSubmit() } return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(prev => (prev + 1) % users.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(prev => (prev - 1 + users.length) % users.length) }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (users[selectedIndex]) insertMention(users[selectedIndex]) }
    else if (e.key === 'Escape') { e.preventDefault(); setShowMentions(false) }
  }
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) && textareaRef.current && !textareaRef.current.contains(event.target as Node)) setShowMentions(false)
    }
    if (showMentions) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMentions])
  
  return (
    <div className="relative">
      <textarea ref={textareaRef} value={value} onChange={handleInput} onKeyDown={handleKeyDown} placeholder={placeholder} disabled={disabled} rows={rows}
        className={cn('w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg resize-none placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed', className)} />
      {showMentions && typeof document !== 'undefined' && createPortal(
        <div ref={dropdownRef} className="fixed z-[9999] w-64 max-h-48 overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg" style={{ top: dropdownPosition.top, left: dropdownPosition.left }}>
          {isLoading ? <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 text-gray-400 animate-spin" /></div>
          : users.length === 0 ? <div className="py-3 px-4 text-sm text-gray-500 text-center">{mentionSearch ? 'Nenhum usuário encontrado' : 'Digite para buscar'}</div>
          : users.map((user, index) => (
            <button key={user.id} onClick={() => insertMention(user)} className={cn('w-full flex items-center gap-3 px-3 py-2 text-left transition-colors', index === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800')}>
              {user.avatar_url ? <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center"><User className="w-4 h-4 text-gray-500" /></div>}
              <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user.name || 'Sem nome'}</p><p className="text-xs text-gray-500 truncate">{user.email}</p></div>
            </button>
          ))}
        </div>, document.body
      )}
    </div>
  )
}

export function MentionText({ text, className }: { text: string; className?: string }) {
  const regex = /@\[([^\]]+)\]\(([a-f0-9-]+)\)/g
  const parts: Array<{ type: 'text' | 'mention'; content: string }> = []
  let lastIndex = 0, match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    parts.push({ type: 'mention', content: match[1] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push({ type: 'text', content: text.slice(lastIndex) })
  return <span className={className}>{parts.map((p, i) => p.type === 'mention' ? <span key={i} className="inline-flex items-center px-1.5 py-0.5 mx-0.5 text-xs font-medium text-blue-700 bg-blue-100 rounded">@{p.content}</span> : <span key={i}>{p.content}</span>)}</span>
}
