'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, Play, Pause, Square, Trash2, BarChart2,
  Calendar, Users, MessageSquare, CheckCircle, XCircle, Clock, Loader2,
  RefreshCw, Send, FileText
} from 'lucide-react'
import { useWhatsAppCampaigns, useWhatsAppPhonebooks, useWhatsAppTemplates } from '@/hooks/useWhatsApp'

const statusColors: Record<string, { bg: string; text: string; icon: any }> = {
  PENDING: { bg: 'bg-slate-500/20', text: 'text-slate-400', icon: Clock },
  SCHEDULED: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: Calendar },
  RUNNING: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', icon: Play },
  PAUSED: { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: Pause },
  COMPLETED: { bg: 'bg-violet-500/20', text: 'text-violet-400', icon: CheckCircle },
  FAILED: { bg: 'bg-red-500/20', text: 'text-red-400', icon: XCircle },
  CANCELLED: { bg: 'bg-slate-500/20', text: 'text-slate-400', icon: Square },
}

export default function CampaignsPage() {
  const { campaigns, isLoading, fetchCampaigns, createCampaign, controlCampaign, deleteCampaign } = useWhatsAppCampaigns()
  const { phonebooks, fetchPhonebooks } = useWhatsAppPhonebooks()
  const { templates, fetchTemplates } = useWhatsAppTemplates()
  
  const [showModal, setShowModal] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [formData, setFormData] = useState({
    title: '',
    template_name: '',
    phonebook_id: '',
    scheduled_at: '',
    body_variables: [''],
  })

  useEffect(() => {
    fetchCampaigns()
    fetchPhonebooks()
    fetchTemplates({ status: 'APPROVED' })
  }, [])

  const handleCreate = async () => {
    if (!formData.title || !formData.template_name || !formData.phonebook_id) return
    try {
      await createCampaign({
        ...formData,
        body_variables: formData.body_variables.filter(v => v.trim()),
        scheduled_at: formData.scheduled_at || undefined,
      })
      setShowModal(false)
      setFormData({ title: '', template_name: '', phonebook_id: '', scheduled_at: '', body_variables: [''] })
    } catch (err) { console.error(err) }
  }

  const filtered = campaigns.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (search && !c.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Campanhas WhatsApp</h1>
          <p className="text-slate-400 mt-1">Disparos em massa com templates aprovados</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700">
          <Plus className="w-5 h-5" /> Nova Campanha
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: campaigns.length, icon: MessageSquare, color: 'violet' },
          { label: 'Em Execução', value: campaigns.filter(c => c.status === 'RUNNING').length, icon: Play, color: 'emerald' },
          { label: 'Agendadas', value: campaigns.filter(c => c.status === 'SCHEDULED').length, icon: Calendar, color: 'blue' },
          { label: 'Concluídas', value: campaigns.filter(c => c.status === 'COMPLETED').length, icon: CheckCircle, color: 'cyan' },
        ].map((stat) => (
          <div key={stat.label} className="p-4 bg-slate-900/50 rounded-xl border border-slate-800/50">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-${stat.color}-500/20`}>
                <stat.icon className={`w-5 h-5 text-${stat.color}-400`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-slate-400">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Buscar campanhas..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-violet-500/50" />
        </div>
        <div className="flex gap-2">
          {['all', 'RUNNING', 'SCHEDULED', 'COMPLETED'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-4 py-2.5 text-sm font-medium rounded-xl ${statusFilter === s ? 'bg-violet-600 text-white' : 'bg-slate-800/50 text-slate-400 hover:text-white'}`}>
              {s === 'all' ? 'Todas' : s}
            </button>
          ))}
        </div>
        <button onClick={() => fetchCampaigns()} className="p-2.5 rounded-xl bg-slate-800/50 text-slate-400 hover:text-white">
          <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-3">
        {isLoading && campaigns.length === 0 ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="w-8 h-8 text-violet-400 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500">
            <MessageSquare className="w-12 h-12 mb-3 opacity-50" /><p>Nenhuma campanha encontrada</p>
          </div>
        ) : (
          filtered.map(campaign => {
            const StatusConfig = statusColors[campaign.status] || statusColors.PENDING
            const progress = campaign.total_contacts > 0 ? Math.round((campaign.sent_count / campaign.total_contacts) * 100) : 0
            return (
              <motion.div key={campaign.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-slate-900/50 rounded-xl border border-slate-800/50 hover:border-slate-700/50">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-white truncate">{campaign.title}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 ${StatusConfig.bg} ${StatusConfig.text}`}>
                        <StatusConfig.icon className="w-3 h-3" />{campaign.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                      <span className="flex items-center gap-1.5"><FileText className="w-4 h-4" />{campaign.template_name}</span>
                      <span className="flex items-center gap-1.5"><Users className="w-4 h-4" />{campaign.total_contacts} contatos</span>
                    </div>
                  </div>
                  {campaign.status === 'RUNNING' && (
                    <div className="w-full md:w-48">
                      <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span>Enviados</span><span>{campaign.sent_count}/{campaign.total_contacts}</span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 rounded-full" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-center"><p className="font-bold text-emerald-400">{campaign.delivered_count}</p><p className="text-xs text-slate-500">Entregues</p></div>
                    <div className="text-center"><p className="font-bold text-cyan-400">{campaign.read_count}</p><p className="text-xs text-slate-500">Lidas</p></div>
                    <div className="text-center"><p className="font-bold text-red-400">{campaign.failed_count}</p><p className="text-xs text-slate-500">Falhas</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    {campaign.status === 'PENDING' && <button onClick={() => controlCampaign(campaign.id, 'start')} className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"><Play className="w-4 h-4" /></button>}
                    {campaign.status === 'RUNNING' && <button onClick={() => controlCampaign(campaign.id, 'pause')} className="p-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"><Pause className="w-4 h-4" /></button>}
                    {campaign.status === 'PAUSED' && <button onClick={() => controlCampaign(campaign.id, 'resume')} className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"><Play className="w-4 h-4" /></button>}
                    <button className="p-2 rounded-lg bg-slate-800/50 text-slate-400 hover:text-white"><BarChart2 className="w-4 h-4" /></button>
                    <button onClick={() => deleteCampaign(campaign.id)} className="p-2 rounded-lg bg-slate-800/50 text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </motion.div>
            )
          })
        )}
      </div>

      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg bg-slate-900 rounded-2xl border border-slate-800/50" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-slate-800/50"><h2 className="text-xl font-semibold text-white">Nova Campanha</h2></div>
              <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Título</label>
                  <input type="text" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="Ex: Black Friday 2024"
                    className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-violet-500/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Template</label>
                  <select value={formData.template_name} onChange={e => setFormData({ ...formData, template_name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-violet-500/50">
                    <option value="">Selecione um template</option>
                    {templates.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Lista de Contatos</label>
                  <select value={formData.phonebook_id} onChange={e => setFormData({ ...formData, phonebook_id: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-violet-500/50">
                    <option value="">Selecione uma lista</option>
                    {phonebooks.map(p => <option key={p.id} value={p.id}>{p.name} ({p.contact_count})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Agendar (opcional)</label>
                  <input type="datetime-local" value={formData.scheduled_at} onChange={e => setFormData({ ...formData, scheduled_at: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-violet-500/50" />
                </div>
              </div>
              <div className="p-6 border-t border-slate-800/50 flex gap-3">
                <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700">Cancelar</button>
                <button onClick={handleCreate} disabled={!formData.title || !formData.template_name || !formData.phonebook_id}
                  className="flex-1 px-4 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  <Send className="w-4 h-4" /> Criar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
