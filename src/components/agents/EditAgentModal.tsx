'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  X,
  User,
  Bot,
  Shield,
  Lock,
  Activity,
  Settings,
  MessageSquare,
  Save,
  Loader2,
  Trash2,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Power,
  PowerOff,
  Clock,
  TrendingUp,
  Mail,
  Calendar,
  Key,
} from 'lucide-react'

// Types
interface Agent {
  id: string
  organization_id: string
  type: 'human' | 'ai'
  name: string
  email?: string
  status: 'online' | 'offline' | 'away' | 'busy'
  is_active: boolean
  max_concurrent_chats?: number
  auto_assign?: boolean
  total_conversations?: number
  total_messages?: number
  avg_response_time_seconds?: number
  created_at: string
  last_seen_at?: string
  ai_config?: any
}

interface AgentPermissions {
  access_level: 'agent' | 'admin'
  whatsapp_access_all: boolean
  whatsapp_number_ids: string[]
  pipeline_access_all: boolean
  pipeline_ids: string[]
  can_send_messages: boolean
  can_transfer_chats: boolean
  can_edit_pipeline: boolean
}

interface WhatsAppNumber {
  id: string
  phone_number: string
  display_name?: string
  is_connected: boolean
}

interface EditAgentModalProps {
  agent: Agent
  organizationId: string
  onClose: () => void
  onUpdate: () => void
  onDelete: () => void
}

type Tab = 'general' | 'permissions' | 'security' | 'activity'

export function EditAgentModal({
  agent,
  organizationId,
  onClose,
  onUpdate,
  onDelete,
}: EditAgentModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('general')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Form state
  const [form, setForm] = useState({
    name: agent.name,
    email: agent.email || '',
    status: agent.status,
    max_concurrent_chats: agent.max_concurrent_chats || 5,
    auto_assign: agent.auto_assign !== false,
  })

  // Permissions state
  const [permissions, setPermissions] = useState<AgentPermissions>({
    access_level: 'agent',
    whatsapp_access_all: false,
    whatsapp_number_ids: [],
    pipeline_access_all: false,
    pipeline_ids: [],
    can_send_messages: true,
    can_transfer_chats: true,
    can_edit_pipeline: false,
  })

  // Data
  const [whatsappNumbers, setWhatsappNumbers] = useState<WhatsAppNumber[]>([])
  const [loadingData, setLoadingData] = useState(false)

  // Fetch permissions and numbers
  useEffect(() => {
    if (activeTab === 'permissions' && agent.type === 'human') {
      fetchPermissionsData()
    }
  }, [activeTab, agent.type])

  const fetchPermissionsData = async () => {
    setLoadingData(true)
    try {
      // Fetch WhatsApp numbers
      const numbersRes = await fetch(`/api/whatsapp/numbers?organization_id=${organizationId}`)
      const numbersData = await numbersRes.json()
      setWhatsappNumbers(numbersData.numbers || [])

      // Fetch agent permissions
      const permRes = await fetch(`/api/whatsapp/agents/permissions?agent_id=${agent.id}&organization_id=${organizationId}`)
      if (permRes.ok) {
        const permData = await permRes.json()
        if (permData.permissions) {
          setPermissions(permData.permissions)
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoadingData(false)
    }
  }

  // Save general info
  const handleSaveGeneral = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/whatsapp/agents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: agent.id,
          organization_id: organizationId,
          name: form.name,
          status: form.status,
          max_concurrent_chats: form.max_concurrent_chats,
          auto_assign: form.auto_assign,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao salvar')
      }

      setSuccess('Alterações salvas!')
      setTimeout(() => setSuccess(''), 3000)
      onUpdate()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Save permissions
  const handleSavePermissions = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/whatsapp/agents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: agent.id,
          organization_id: organizationId,
          permissions,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao salvar')
      }

      setSuccess('Permissões salvas!')
      setTimeout(() => setSuccess(''), 3000)
      onUpdate()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Reset password
  const handleResetPassword = async () => {
    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/whatsapp/agents/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agent.id,
          organization_id: organizationId,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao redefinir senha')
      }

      const data = await res.json()
      setSuccess(`Nova senha: ${data.temporary_password}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Delete agent
  const handleDelete = async () => {
    setSaving(true)
    setError('')

    try {
      const res = await fetch(`/api/whatsapp/agents?id=${agent.id}&organization_id=${organizationId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao excluir')
      }

      onDelete()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Format time
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatResponseTime = (seconds?: number) => {
    if (!seconds) return '-'
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  // Status options
  const statusOptions = [
    { value: 'online', label: 'Online', color: 'bg-green-500' },
    { value: 'away', label: 'Ausente', color: 'bg-yellow-500' },
    { value: 'busy', label: 'Ocupado', color: 'bg-red-500' },
    { value: 'offline', label: 'Offline', color: 'bg-dark-500' },
  ]

  // Tabs config
  const tabs: { id: Tab; label: string; icon: any; show: boolean }[] = [
    { id: 'general', label: 'Geral', icon: Settings, show: true },
    { id: 'permissions', label: 'Permissões', icon: Shield, show: agent.type === 'human' },
    { id: 'security', label: 'Segurança', icon: Lock, show: agent.type === 'human' },
    { id: 'activity', label: 'Atividade', icon: Activity, show: true },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-dark-800 rounded-2xl w-full max-w-2xl border border-dark-700/50 overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="p-4 border-b border-dark-700/50 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              agent.type === 'human' ? 'bg-blue-500/20' : 'bg-purple-500/20'
            }`}>
              {agent.type === 'human' ? (
                <User className="w-5 h-5 text-blue-400" />
              ) : (
                <Bot className="w-5 h-5 text-purple-400" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{agent.name}</h2>
              <p className="text-sm text-dark-400">
                {agent.type === 'human' ? 'Agente Humano' : 'Agente de IA'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-dark-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-dark-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-dark-700/50 flex-shrink-0">
          {tabs.filter(t => t.show).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === tab.id
                  ? 'text-primary-400 border-b-2 border-primary-500 bg-primary-500/5'
                  : 'text-dark-400 hover:text-white hover:bg-dark-700/50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Messages */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              {success}
            </div>
          )}

          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* Status */}
              {agent.type === 'human' && (
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-3">Status</label>
                  <div className="grid grid-cols-4 gap-2">
                    {statusOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setForm({ ...form, status: opt.value as any })}
                        className={`p-3 rounded-xl border transition-all ${
                          form.status === opt.value
                            ? 'border-primary-500 bg-primary-500/10'
                            : 'border-dark-700/50 hover:border-dark-600'
                        }`}
                      >
                        <div className={`w-3 h-3 rounded-full ${opt.color} mx-auto mb-1`} />
                        <div className="text-xs text-white text-center">{opt.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Basic Info */}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Nome</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50"
                />
              </div>

              {agent.type === 'human' && (
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    disabled
                    className="w-full px-4 py-2.5 bg-dark-900/30 border border-dark-700/30 rounded-xl text-dark-400 cursor-not-allowed"
                  />
                  <p className="text-xs text-dark-500 mt-1">O email não pode ser alterado</p>
                </div>
              )}

              {/* Limits */}
              {agent.type === 'human' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Máx. chats simultâneos
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={form.max_concurrent_chats}
                      onChange={(e) => setForm({ ...form, max_concurrent_chats: parseInt(e.target.value) || 5 })}
                      className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white focus:outline-none focus:border-primary-500/50"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer p-2.5">
                      <input
                        type="checkbox"
                        checked={form.auto_assign}
                        onChange={(e) => setForm({ ...form, auto_assign: e.target.checked })}
                        className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500/50"
                      />
                      <span className="text-sm text-dark-300">Atribuição automática</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Info */}
              <div className="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-dark-400">Criado em:</span>
                    <span className="text-white ml-2">{formatDate(agent.created_at)}</span>
                  </div>
                  {agent.last_seen_at && (
                    <div>
                      <span className="text-dark-400">Último acesso:</span>
                      <span className="text-white ml-2">{formatDate(agent.last_seen_at)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Save button */}
              <button
                onClick={handleSaveGeneral}
                disabled={saving}
                className="w-full py-2.5 bg-primary-500 hover:bg-primary-600 disabled:bg-dark-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Alterações
              </button>
            </div>
          )}

          {/* Permissions Tab */}
          {activeTab === 'permissions' && agent.type === 'human' && (
            <div className="space-y-6">
              {loadingData ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
                </div>
              ) : (
                <>
                  {/* Access Level */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-3">Nível de Acesso</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setPermissions({ ...permissions, access_level: 'agent' })}
                        className={`p-4 rounded-xl border transition-all text-left ${
                          permissions.access_level === 'agent'
                            ? 'border-primary-500 bg-primary-500/10'
                            : 'border-dark-700/50 hover:border-dark-600'
                        }`}
                      >
                        <User className="w-5 h-5 text-blue-400 mb-2" />
                        <div className="font-medium text-white">Agente</div>
                        <div className="text-xs text-dark-400 mt-1">Acesso limitado às permissões definidas</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPermissions({ ...permissions, access_level: 'admin' })}
                        className={`p-4 rounded-xl border transition-all text-left ${
                          permissions.access_level === 'admin'
                            ? 'border-primary-500 bg-primary-500/10'
                            : 'border-dark-700/50 hover:border-dark-600'
                        }`}
                      >
                        <Shield className="w-5 h-5 text-purple-400 mb-2" />
                        <div className="font-medium text-white">Administrador</div>
                        <div className="text-xs text-dark-400 mt-1">Acesso completo ao sistema</div>
                      </button>
                    </div>
                  </div>

                  {/* WhatsApp Numbers */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-3">
                      <MessageSquare className="w-4 h-4 inline mr-2" />
                      Números WhatsApp
                    </label>
                    
                    <label className="flex items-center gap-2 mb-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={permissions.whatsapp_access_all}
                        onChange={(e) => setPermissions({ 
                          ...permissions, 
                          whatsapp_access_all: e.target.checked,
                          whatsapp_number_ids: e.target.checked ? [] : permissions.whatsapp_number_ids
                        })}
                        className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500/50"
                      />
                      <span className="text-sm text-dark-300">Acesso a todos os números</span>
                    </label>

                    {!permissions.whatsapp_access_all && (
                      <div className="space-y-2 max-h-48 overflow-y-auto bg-dark-900/30 rounded-xl p-3">
                        {whatsappNumbers.length === 0 ? (
                          <p className="text-sm text-dark-500 italic text-center py-2">Nenhum número cadastrado</p>
                        ) : (
                          whatsappNumbers.map((number) => (
                            <label
                              key={number.id}
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-dark-800/50 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={permissions.whatsapp_number_ids.includes(number.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setPermissions({
                                      ...permissions,
                                      whatsapp_number_ids: [...permissions.whatsapp_number_ids, number.id]
                                    })
                                  } else {
                                    setPermissions({
                                      ...permissions,
                                      whatsapp_number_ids: permissions.whatsapp_number_ids.filter(id => id !== number.id)
                                    })
                                  }
                                }}
                                className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500/50"
                              />
                              <div className="flex-1">
                                <div className="text-sm text-white">{number.phone_number}</div>
                                {number.display_name && (
                                  <div className="text-xs text-dark-400">{number.display_name}</div>
                                )}
                              </div>
                              <div className={`w-2 h-2 rounded-full ${number.is_connected ? 'bg-green-500' : 'bg-dark-500'}`} />
                            </label>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Additional Permissions */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-3">
                      <Lock className="w-4 h-4 inline mr-2" />
                      Permissões Adicionais
                    </label>
                    <div className="space-y-2 bg-dark-900/30 rounded-xl p-3">
                      {[
                        { key: 'can_send_messages', label: 'Pode enviar mensagens' },
                        { key: 'can_transfer_chats', label: 'Pode transferir chats' },
                        { key: 'can_edit_pipeline', label: 'Pode editar pipelines' },
                      ].map((perm) => (
                        <label key={perm.key} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-dark-800/50 rounded-lg">
                          <input
                            type="checkbox"
                            checked={permissions[perm.key as keyof AgentPermissions] as boolean}
                            onChange={(e) => setPermissions({ ...permissions, [perm.key]: e.target.checked })}
                            className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500/50"
                          />
                          <span className="text-sm text-dark-300">{perm.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Save button */}
                  <button
                    onClick={handleSavePermissions}
                    disabled={saving}
                    className="w-full py-2.5 bg-primary-500 hover:bg-primary-600 disabled:bg-dark-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Salvar Permissões
                  </button>
                </>
              )}
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && agent.type === 'human' && (
            <div className="space-y-6">
              {/* Password */}
              <div className="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
                <h3 className="font-medium text-white mb-3 flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  Senha
                </h3>
                <p className="text-sm text-dark-400 mb-4">
                  Gere uma nova senha temporária para o agente. Ele será solicitado a trocar no próximo login.
                </p>
                <button
                  onClick={handleResetPassword}
                  disabled={saving}
                  className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Redefinir Senha
                </button>
              </div>

              {/* Danger Zone */}
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                <h3 className="font-medium text-red-400 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Zona de Perigo
                </h3>
                <p className="text-sm text-dark-400 mb-4">
                  Esta ação não pode ser desfeita. Todas as conversas atribuídas serão desvinculadas.
                </p>
                
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-colors flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir Agente
                  </button>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-red-400">Tem certeza?</span>
                    <button
                      onClick={handleDelete}
                      disabled={saving}
                      className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Sim, excluir
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-sm transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && (
            <div className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-white">{agent.total_conversations || 0}</div>
                  <div className="text-xs text-dark-400 mt-1">Conversas</div>
                </div>
                <div className="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-white">{agent.total_messages || 0}</div>
                  <div className="text-xs text-dark-400 mt-1">Mensagens</div>
                </div>
                <div className="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-white">
                    {formatResponseTime(agent.avg_response_time_seconds)}
                  </div>
                  <div className="text-xs text-dark-400 mt-1">Tempo Resp.</div>
                </div>
              </div>

              {/* Timeline placeholder */}
              <div className="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
                <h3 className="font-medium text-white mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Atividade Recente
                </h3>
                <div className="text-center py-8 text-dark-500">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Histórico de atividade em breve</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
