'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Mail,
  Phone,
  User,
  Pencil,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  Users,
  DollarSign,
  Download,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  UserPlus,
} from 'lucide-react'
import { useContacts, useDeals } from '@/hooks'
import { useAuthStore } from '@/stores'
import { ContactDrawer } from '@/components/crm'
import type { Contact } from '@/types'

// ==========================================
// CONTACT MODAL (Create/Edit)
// ==========================================

interface ContactModalProps {
  isOpen: boolean
  contact?: Contact | null
  onClose: () => void
  onSave: (data: {
    first_name: string
    last_name: string
    email: string
    phone?: string
  }) => Promise<void>
}

function ContactModal({ isOpen, contact, onClose, onSave }: ContactModalProps) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!contact

  useEffect(() => {
    if (isOpen) {
      if (contact) {
        setFirstName(contact.first_name || '')
        setLastName(contact.last_name || '')
        setEmail(contact.email || '')
        setPhone(contact.phone || '')
      } else {
        setFirstName('')
        setLastName('')
        setEmail('')
        setPhone('')
      }
      setError(null)
    }
  }, [contact, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!firstName.trim() && !email.trim()) {
      setError('Informe pelo menos o nome ou email')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await onSave({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar contato')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !loading && onClose()}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
            >
              <form onSubmit={handleSubmit}>
                <div className="flex items-center justify-between p-5 border-b border-dark-700">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                      <User className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="text-lg font-semibold text-white">
                      {isEditing ? 'Editar Contato' : 'Novo Contato'}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                      {error}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-1.5">Nome</label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-dark-800/50 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
                        placeholder="João"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-1.5">Sobrenome</label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-dark-800/50 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
                        placeholder="Silva"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-1.5">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-dark-800/50 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
                        placeholder="joao@empresa.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-1.5">Telefone</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-dark-800/50 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
                        placeholder="(11) 99999-9999"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 p-5 border-t border-dark-700 bg-dark-900/50">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="px-4 py-2.5 rounded-xl bg-dark-800 hover:bg-dark-700 text-white transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading || (!firstName.trim() && !email.trim())}
                    className="px-5 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Salvando...
                      </>
                    ) : isEditing ? (
                      'Salvar'
                    ) : (
                      'Criar Contato'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

// ==========================================
// CONTACT ROW
// ==========================================

interface ContactRowProps {
  contact: Contact
  onEdit: () => void
  onDelete: () => void
  onClick: () => void
}

function ContactRow({ contact, onEdit, onDelete, onClick }: ContactRowProps) {
  const [showMenu, setShowMenu] = useState(false)
  
  const getInitials = () => {
    const first = contact.first_name?.[0] || ''
    const last = contact.last_name?.[0] || ''
    return (first + last).toUpperCase() || '?'
  }

  const getDisplayName = () => {
    if (contact.first_name || contact.last_name) {
      return `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
    }
    return contact.email || 'Sem nome'
  }

  return (
    <div 
      onClick={onClick}
      className="flex items-center gap-4 p-4 bg-dark-800/30 border border-dark-700/50 rounded-xl hover:bg-dark-800/50 transition-colors group cursor-pointer"
    >
      {/* Avatar */}
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0">
        <span className="text-white font-bold">{getInitials()}</span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-white font-medium truncate">{getDisplayName()}</h3>
          {/* Tags inline */}
          {contact.tags && contact.tags.length > 0 && (
            <div className="flex items-center gap-1">
              {contact.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    tag === 'vip' ? 'bg-amber-500/20 text-amber-400' :
                    tag === 'cliente' ? 'bg-cyan-500/20 text-cyan-400' :
                    tag === 'lead' ? 'bg-blue-500/20 text-blue-400' :
                    tag === 'novo' ? 'bg-green-500/20 text-green-400' :
                    'bg-dark-600/50 text-dark-300'
                  }`}
                >
                  {tag}
                </span>
              ))}
              {contact.tags.length > 2 && (
                <span className="text-[10px] text-dark-500">+{contact.tags.length - 2}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 mt-1">
          {contact.email && (
            <div className="flex items-center gap-1.5 text-dark-400 text-sm">
              <Mail className="w-3.5 h-3.5" />
              <span className="truncate max-w-[200px]">{contact.email}</span>
            </div>
          )}
          {contact.phone && (
            <div className="flex items-center gap-1.5 text-dark-400 text-sm">
              <Phone className="w-3.5 h-3.5" />
              <span>{contact.phone}</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6 text-sm">
        <div className="text-center">
          <p className="text-dark-500 text-xs">Deals</p>
          <p className="text-white font-medium">{contact.deals_count || 0}</p>
        </div>
        <div className="text-center">
          <p className="text-dark-500 text-xs">Valor</p>
          <p className="text-success-400 font-medium">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(
              contact.total_spent || 0
            )}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors opacity-0 group-hover:opacity-100"
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>

        <AnimatePresence>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute right-0 top-full mt-1 w-40 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-20 overflow-hidden"
              >
                <button
                  onClick={() => {
                    setShowMenu(false)
                    onEdit()
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-dark-300 hover:bg-dark-700 hover:text-white transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                  Editar
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false)
                    onDelete()
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Excluir
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ==========================================
// MAIN PAGE
// ==========================================

export default function ContactsPage() {
  const { user } = useAuthStore()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const { contacts, pagination, loading, refetch, createContact, updateContact, deleteContact } = useContacts({ 
    search, 
    page,
    limit: 20 
  })
  
  // Get pipelines and deal functions for the contact drawer
  const { pipelines, createDeal, deleteDeal, refetch: refetchDeals } = useDeals()
  
  const [showModal, setShowModal] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; errors: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Stats from API
  const [stats, setStats] = useState({
    totalContacts: 0,
    newThisMonth: 0,
    totalValue: 0,
  })
  
  // Fetch stats from API
  useEffect(() => {
    const fetchStats = async () => {
      if (!user?.organization_id) return
      try {
        const res = await fetch(`/api/contacts/stats?organizationId=${user.organization_id}`)
        const data = await res.json()
        if (data.success && data.stats) {
          setStats({
            totalContacts: data.stats.totalContacts || 0,
            newThisMonth: data.stats.newThisMonth || 0,
            totalValue: data.stats.totalValue || 0,
          })
        }
      } catch (error) {
        console.error('Error fetching stats:', error)
      }
    }
    fetchStats()
  }, [user?.organization_id, contacts.length]) // Refetch when contacts change

  // Update contact tags
  const handleUpdateTags = async (contactId: string, tags: string[]) => {
    await updateContact(contactId, { tags })
    // Update selected contact locally for immediate UI feedback
    if (selectedContact && selectedContact.id === contactId) {
      setSelectedContact({ ...selectedContact, tags })
    }
    await refetch()
  }

  // Create deal from contact drawer
  const handleCreateDeal = async (data: any) => {
    await createDeal(data)
  }

  // Delete deal from contact drawer
  const handleDeleteDeal = async (dealId: string) => {
    await deleteDeal(dealId)
  }

  // Export contacts to CSV
  const [exporting, setExporting] = useState(false)

  // Export contacts to Excel
  const handleExportExcel = async () => {
    if (!user?.organization_id) return
    
    setExporting(true)
    try {
      const response = await fetch(`/api/contacts/export?organizationId=${user.organization_id}`)
      
      if (!response.ok) {
        throw new Error('Failed to export')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `contatos_${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting:', error)
      alert('Erro ao exportar contatos')
    } finally {
      setExporting(false)
    }
  }

  // Download CSV template
  const handleDownloadTemplate = () => {
    const template = 'first_name,last_name,email,phone\nJoão,Silva,joao@email.com,11999999999\nMaria,Santos,maria@email.com,11888888888'
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'template_contatos.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Import contacts from CSV
  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportLoading(true)
    setImportResult(null)

    try {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
      
      let success = 0
      let errors = 0

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || []
        const cleanValues = values.map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"'))
        
        const contact: any = {}
        headers.forEach((header, idx) => {
          if (cleanValues[idx]) {
            contact[header] = cleanValues[idx]
          }
        })

        if (contact.email || contact.first_name) {
          try {
            await createContact({
              first_name: contact.first_name || '',
              last_name: contact.last_name || '',
              email: contact.email || '',
              phone: contact.phone || '',
            })
            success++
          } catch {
            errors++
          }
        }
      }

      setImportResult({ success, errors })
      await refetch()
    } catch (err) {
      setImportResult({ success: 0, errors: 1 })
    } finally {
      setImportLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleCreateContact = async (data: any) => {
    await createContact(data)
    setShowModal(false)
  }

  const handleUpdateContact = async (data: any) => {
    if (editingContact) {
      await updateContact(editingContact.id, data)
      setEditingContact(null)
    }
  }

  const handleDeleteContact = async (contact: Contact) => {
    const name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email || 'este contato'
    if (confirm(`Tem certeza que deseja excluir ${name}?`)) {
      await deleteContact(contact.id)
    }
  }

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact)
  }

  return (
    <div className="space-y-6">
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleImportCSV}
        className="hidden"
      />

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
            <input
              type="text"
              placeholder="Buscar contatos..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="w-full pl-10 pr-4 py-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:border-primary-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Download Template */}
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 px-3 py-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl text-dark-300 hover:text-white hover:border-dark-600 transition-colors"
            title="Baixar modelo CSV"
          >
            <FileSpreadsheet className="w-4 h-4" />
          </button>

          {/* Import */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importLoading}
            className="flex items-center gap-2 px-3 py-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl text-dark-300 hover:text-white hover:border-dark-600 transition-colors disabled:opacity-50"
            title="Importar CSV"
          >
            <Upload className={`w-4 h-4 ${importLoading ? 'animate-pulse' : ''}`} />
            <span className="text-sm">Importar</span>
          </button>

          {/* Export Excel */}
          <button
            onClick={handleExportExcel}
            disabled={contacts.length === 0 || exporting}
            className="flex items-center gap-2 px-3 py-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl text-dark-300 hover:text-white hover:border-dark-600 transition-colors disabled:opacity-50"
            title="Exportar Excel"
          >
            {exporting ? (
              <div className="w-4 h-4 border-2 border-dark-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span className="text-sm">{exporting ? 'Exportando...' : 'Exportar'}</span>
          </button>

          {/* New Contact */}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 rounded-xl text-white font-medium transition-colors shadow-lg shadow-primary-500/20"
          >
            <Plus className="w-5 h-5" />
            <span>Novo Contato</span>
          </button>
        </div>
      </div>

      {/* Import Result Notification */}
      <AnimatePresence>
        {importResult && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-4 rounded-xl flex items-center gap-3 ${
              importResult.errors > 0 && importResult.success === 0
                ? 'bg-red-500/10 border border-red-500/20'
                : 'bg-green-500/10 border border-green-500/20'
            }`}
          >
            {importResult.errors > 0 && importResult.success === 0 ? (
              <AlertCircle className="w-5 h-5 text-red-400" />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-400" />
            )}
            <span className={importResult.errors > 0 && importResult.success === 0 ? 'text-red-300' : 'text-green-300'}>
              {importResult.success > 0 && `${importResult.success} contato(s) importado(s) com sucesso.`}
              {importResult.errors > 0 && ` ${importResult.errors} erro(s) durante importação.`}
            </span>
            <button
              onClick={() => setImportResult(null)}
              className="ml-auto text-dark-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-dark-800/30 border border-dark-700/50 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <p className="text-sm text-dark-400">Total de Contatos</p>
              <p className="text-xl font-bold text-white">{stats.totalContacts}</p>
            </div>
          </div>
        </div>
        <div className="p-4 bg-dark-800/30 border border-dark-700/50 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent-500/20 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-accent-400" />
            </div>
            <div>
              <p className="text-sm text-dark-400">Novos Este Mês</p>
              <p className="text-xl font-bold text-white">{stats.newThisMonth}</p>
            </div>
          </div>
        </div>
        <div className="p-4 bg-dark-800/30 border border-dark-700/50 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success-500/20 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-success-400" />
            </div>
            <div>
              <p className="text-sm text-dark-400">Valor Total</p>
              <p className="text-xl font-bold text-success-400">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(stats.totalValue)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Contacts List */}
      <div className="space-y-3">
        {loading && contacts.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-dark-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-dark-500" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">
              {search ? 'Nenhum contato encontrado' : 'Nenhum contato ainda'}
            </h3>
            <p className="text-dark-400 mb-4">
              {search ? 'Tente uma busca diferente' : 'Crie seu primeiro contato para começar'}
            </p>
            {!search && (
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 rounded-lg text-white font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Criar Contato
              </button>
            )}
          </div>
        ) : (
          contacts.map((contact) => (
            <ContactRow
              key={contact.id}
              contact={contact}
              onEdit={() => handleEdit(contact)}
              onDelete={() => handleDeleteContact(contact)}
              onClick={() => setSelectedContact(contact)}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-dark-700/50">
          <p className="text-sm text-dark-400">
            Mostrando {((page - 1) * pagination.limit) + 1} a {Math.min(page * pagination.limit, pagination.total)} de {pagination.total} contatos
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg bg-dark-800 text-dark-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="px-3 py-1 text-sm text-white">
              {page} / {pagination.totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={page === pagination.totalPages}
              className="p-2 rounded-lg bg-dark-800 text-dark-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Modal Create */}
      <ContactModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleCreateContact}
      />

      {/* Modal Edit */}
      <ContactModal
        isOpen={!!editingContact}
        contact={editingContact}
        onClose={() => setEditingContact(null)}
        onSave={handleUpdateContact}
      />

      {/* Contact Drawer */}
      {selectedContact && (
        <ContactDrawer
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          onUpdateTags={handleUpdateTags}
          pipelines={pipelines}
          onCreateDeal={handleCreateDeal}
          onDeleteDeal={handleDeleteDeal}
          onRefreshDeals={refetchDeals}
        />
      )}
    </div>
  )
}
