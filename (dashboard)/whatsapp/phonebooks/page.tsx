'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, Trash2, Upload, Users, Phone, Mail, Edit2, Loader2, Check, FileSpreadsheet } from 'lucide-react'
import { useWhatsAppPhonebooks } from '@/hooks/useWhatsApp'

export default function PhonebooksPage() {
  const { phonebooks, contacts, isLoading, fetchPhonebooks, fetchContacts, createPhonebook, addContacts, importCSV, deletePhonebook } = useWhatsAppPhonebooks()
  const [selectedPhonebook, setSelectedPhonebook] = useState<any>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAddContactModal, setShowAddContactModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [search, setSearch] = useState('')
  const [formData, setFormData] = useState({ name: '', description: '' })
  const [contactForm, setContactForm] = useState({ name: '', mobile: '', email: '' })
  const [csvData, setCsvData] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchPhonebooks() }, [])
  useEffect(() => { if (selectedPhonebook) fetchContacts(selectedPhonebook.id) }, [selectedPhonebook])

  const handleCreatePhonebook = async () => {
    if (!formData.name) return
    const pb = await createPhonebook(formData.name, formData.description)
    setShowCreateModal(false); setFormData({ name: '', description: '' }); setSelectedPhonebook(pb)
  }

  const handleAddContact = async () => {
    if (!contactForm.mobile || !selectedPhonebook) return
    await addContacts(selectedPhonebook.id, [contactForm])
    await fetchContacts(selectedPhonebook.id); await fetchPhonebooks()
    setShowAddContactModal(false); setContactForm({ name: '', mobile: '', email: '' })
  }

  const handleImportCSV = async () => {
    if (!csvData || !selectedPhonebook) return
    const result = await importCSV(selectedPhonebook.id, csvData)
    await fetchContacts(selectedPhonebook.id); await fetchPhonebooks()
    setShowImportModal(false); setCsvData(''); alert(`${result.imported} contatos importados!`)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => setCsvData(e.target?.result as string)
    reader.readAsText(file)
  }

  const formatPhone = (p: string) => {
    if (!p) return ''; const c = p.replace(/\D/g, '')
    if (c.length === 13) return `+${c.slice(0,2)} ${c.slice(2,4)} ${c.slice(4,9)}-${c.slice(9)}`
    return p
  }

  const filteredContacts = contacts.filter(c => c.name?.toLowerCase().includes(search.toLowerCase()) || c.mobile?.includes(search) || c.email?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex h-[calc(100vh-120px)] gap-6">
      <div className="w-80 flex-shrink-0 bg-slate-900/50 rounded-2xl border border-slate-800/50 flex flex-col">
        <div className="p-4 border-b border-slate-800/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Listas</h2>
            <button onClick={() => setShowCreateModal(true)} className="p-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700"><Plus className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading && phonebooks.length === 0 ? <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
          : phonebooks.length === 0 ? <div className="flex flex-col items-center justify-center h-32 text-slate-500"><Users className="w-10 h-10 mb-2 opacity-50" /><p className="text-sm">Nenhuma lista</p></div>
          : phonebooks.map(pb => (
            <button key={pb.id} onClick={() => setSelectedPhonebook(pb)}
              className={`w-full p-3 rounded-xl text-left transition-colors mb-2 ${selectedPhonebook?.id === pb.id ? 'bg-violet-600/20 border border-violet-500/30' : 'hover:bg-slate-800/50'}`}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-slate-800/50"><Users className="w-4 h-4 text-violet-400" /></div>
                <div className="flex-1 min-w-0"><p className="font-medium text-white truncate">{pb.name}</p><p className="text-xs text-slate-400">{pb.contact_count} contatos</p></div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-slate-900/50 rounded-2xl border border-slate-800/50 flex flex-col">
        {selectedPhonebook ? (
          <>
            <div className="p-4 border-b border-slate-800/50">
              <div className="flex items-center justify-between mb-4">
                <div><h2 className="text-lg font-semibold text-white">{selectedPhonebook.name}</h2><p className="text-sm text-slate-400">{selectedPhonebook.contact_count} contatos</p></div>
                <div className="flex gap-2">
                  <button onClick={() => setShowImportModal(true)} className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 text-slate-300 rounded-lg hover:bg-slate-800 text-sm"><Upload className="w-4 h-4" /> Importar</button>
                  <button onClick={() => setShowAddContactModal(true)} className="flex items-center gap-2 px-3 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm"><Plus className="w-4 h-4" /> Adicionar</button>
                  <button onClick={() => deletePhonebook(selectedPhonebook.id)} className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="Buscar contatos..." value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-violet-500/50" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
              : filteredContacts.length === 0 ? <div className="flex flex-col items-center justify-center h-32 text-slate-500"><Users className="w-10 h-10 mb-2 opacity-50" /><p className="text-sm">Nenhum contato</p></div>
              : <div className="space-y-2">{filteredContacts.map(contact => (
                <div key={contact.id} className="p-3 bg-slate-800/30 rounded-xl flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-semibold text-sm">{(contact.name || contact.mobile)?.[0]?.toUpperCase() || '?'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{contact.name || 'Sem nome'}</p>
                    <div className="flex gap-4 text-sm text-slate-400">
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {formatPhone(contact.mobile)}</span>
                      {contact.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {contact.email}</span>}
                    </div>
                  </div>
                  <button className="p-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white"><Edit2 className="w-4 h-4" /></button>
                </div>
              ))}</div>}
            </div>
          </>
        ) : <div className="flex-1 flex items-center justify-center text-slate-500"><div className="text-center"><Users className="w-16 h-16 mx-auto mb-4 opacity-50" /><p>Selecione uma lista</p></div></div>}
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-800/50" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-slate-800/50"><h2 className="text-xl font-semibold text-white">Nova Lista</h2></div>
              <div className="p-6 space-y-4">
                <div><label className="block text-sm font-medium text-slate-300 mb-2">Nome</label><input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Ex: Clientes VIP" className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-violet-500/50" /></div>
                <div><label className="block text-sm font-medium text-slate-300 mb-2">Descrição</label><textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Descrição" rows={3} className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-violet-500/50 resize-none" /></div>
              </div>
              <div className="p-6 border-t border-slate-800/50 flex gap-3">
                <button onClick={() => setShowCreateModal(false)} className="flex-1 px-4 py-2.5 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700">Cancelar</button>
                <button onClick={handleCreatePhonebook} disabled={!formData.name} className="flex-1 px-4 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50">Criar</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddContactModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAddContactModal(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-800/50" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-slate-800/50"><h2 className="text-xl font-semibold text-white">Adicionar Contato</h2></div>
              <div className="p-6 space-y-4">
                <div><label className="block text-sm font-medium text-slate-300 mb-2">Nome</label><input type="text" value={contactForm.name} onChange={e => setContactForm({ ...contactForm, name: e.target.value })} placeholder="Nome" className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-violet-500/50" /></div>
                <div><label className="block text-sm font-medium text-slate-300 mb-2">Telefone *</label><input type="text" value={contactForm.mobile} onChange={e => setContactForm({ ...contactForm, mobile: e.target.value })} placeholder="5511999999999" className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-violet-500/50" /></div>
                <div><label className="block text-sm font-medium text-slate-300 mb-2">Email</label><input type="email" value={contactForm.email} onChange={e => setContactForm({ ...contactForm, email: e.target.value })} placeholder="email@exemplo.com" className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-violet-500/50" /></div>
              </div>
              <div className="p-6 border-t border-slate-800/50 flex gap-3">
                <button onClick={() => setShowAddContactModal(false)} className="flex-1 px-4 py-2.5 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700">Cancelar</button>
                <button onClick={handleAddContact} disabled={!contactForm.mobile} className="flex-1 px-4 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50">Adicionar</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showImportModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowImportModal(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="w-full max-w-lg bg-slate-900 rounded-2xl border border-slate-800/50" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-slate-800/50"><h2 className="text-xl font-semibold text-white">Importar CSV</h2></div>
              <div className="p-6 space-y-4">
                <div className="p-4 bg-slate-800/30 rounded-xl border border-dashed border-slate-700/50 text-center">
                  <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-400 mb-3" />
                  <p className="text-sm text-slate-400 mb-3">Selecione um arquivo CSV</p>
                  <input type="file" ref={fileInputRef} accept=".csv" onChange={handleFileUpload} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-violet-600/20 text-violet-400 rounded-lg hover:bg-violet-600/30 text-sm">Selecionar</button>
                </div>
                <div className="text-xs text-slate-500"><p className="font-medium mb-1">Formato:</p><p>nome,telefone,email</p></div>
                {csvData && <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl"><div className="flex items-center gap-2 text-emerald-400 text-sm"><Check className="w-4 h-4" /> Arquivo carregado ({csvData.split('\n').length - 1} linhas)</div></div>}
              </div>
              <div className="p-6 border-t border-slate-800/50 flex gap-3">
                <button onClick={() => { setShowImportModal(false); setCsvData('') }} className="flex-1 px-4 py-2.5 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700">Cancelar</button>
                <button onClick={handleImportCSV} disabled={!csvData} className="flex-1 px-4 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2"><Upload className="w-4 h-4" /> Importar</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
