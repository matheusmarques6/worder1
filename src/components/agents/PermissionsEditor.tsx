'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Shield,
  Check,
  Phone,
  Layers,
  Eye,
  Edit,
  Send,
  ArrowLeftRight,
  Loader2,
  Info,
  Crown,
  User,
  Users,
  ChevronDown,
  ChevronRight,
  Lock,
  Unlock,
} from 'lucide-react'

interface Agent {
  id: string
  name: string
  type: 'human' | 'ai'
  email?: string
}

interface WhatsAppNumber {
  id: string
  phone_number: string
  display_name?: string
  provider: 'meta_cloud' | 'evolution'
  is_connected: boolean
}

interface Pipeline {
  id: string
  name: string
  stages_count?: number
}

interface Permissions {
  access_level: 'owner' | 'admin' | 'agent'
  whatsapp_access_all: boolean
  whatsapp_allowed_numbers: string[]
  whatsapp_can_send: boolean
  whatsapp_can_transfer: boolean
  pipeline_access_all: boolean
  pipeline_allowed_ids: string[]
  pipeline_can_edit: boolean
}

interface PermissionsEditorProps {
  agent: Agent
  isOpen: boolean
  onClose: () => void
  onSave: (permissions: Permissions) => Promise<void>
}

const accessLevelConfig = {
  owner: {
    label: 'Proprietário',
    description: 'Acesso total a todos os recursos',
    icon: Crown,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
  },
  admin: {
    label: 'Administrador',
    description: 'Pode gerenciar agentes e configurações',
    icon: Shield,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
  },
  agent: {
    label: 'Agente',
    description: 'Acesso limitado conforme configurado',
    icon: User,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
  },
}

export default function PermissionsEditor({
  agent,
  isOpen,
  onClose,
  onSave,
}: PermissionsEditorProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  
  // Data
  const [whatsappNumbers, setWhatsappNumbers] = useState<WhatsAppNumber[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  
  // Permissions state
  const [permissions, setPermissions] = useState<Permissions>({
    access_level: 'agent',
    whatsapp_access_all: false,
    whatsapp_allowed_numbers: [],
    whatsapp_can_send: true,
    whatsapp_can_transfer: true,
    pipeline_access_all: false,
    pipeline_allowed_ids: [],
    pipeline_can_edit: false,
  })

  // Sections
  const [expandedSections, setExpandedSections] = useState({
    whatsapp: true,
    pipelines: true,
  })

  // Fetch data
  useEffect(() => {
    if (!isOpen) return

    const fetchData = async () => {
      setLoading(true)
      try {
        // Fetch WhatsApp numbers
        const numbersRes = await fetch('/api/whatsapp/numbers')
        const numbersData = await numbersRes.json()
        setWhatsappNumbers(numbersData.numbers || [])

        // Fetch pipelines
        const pipelinesRes = await fetch('/api/pipelines')
        const pipelinesData = await pipelinesRes.json()
        setPipelines(pipelinesData.pipelines || [])

        // Fetch current permissions
        const permRes = await fetch(`/api/whatsapp/agents/${agent.id}/permissions`)
        const permData = await permRes.json()
        if (permData.permissions) {
          setPermissions(permData.permissions)
        }
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [isOpen, agent.id])

  // Toggle section
  const toggleSection = (section: 'whatsapp' | 'pipelines') => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  // Toggle WhatsApp number
  const toggleWhatsAppNumber = (numberId: string) => {
    setPermissions(prev => {
      const current = prev.whatsapp_allowed_numbers || []
      const isSelected = current.includes(numberId)
      return {
        ...prev,
        whatsapp_allowed_numbers: isSelected
          ? current.filter(id => id !== numberId)
          : [...current, numberId],
      }
    })
  }

  // Toggle Pipeline
  const togglePipeline = (pipelineId: string) => {
    setPermissions(prev => {
      const current = prev.pipeline_allowed_ids || []
      const isSelected = current.includes(pipelineId)
      return {
        ...prev,
        pipeline_allowed_ids: isSelected
          ? current.filter(id => id !== pipelineId)
          : [...current, pipelineId],
      }
    })
  }

  // Handle save
  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave(permissions)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar permissões')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const levelConfig = accessLevelConfig[permissions.access_level]
  const LevelIcon = levelConfig.icon

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-dark-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Permissões</h2>
              <p className="text-sm text-dark-400">{agent.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
            </div>
          ) : (
            <>
              {/* Access Level */}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-3">
                  Nível de Acesso
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['agent', 'admin', 'owner'] as const).map((level) => {
                    const config = accessLevelConfig[level]
                    const Icon = config.icon
                    const isSelected = permissions.access_level === level
                    const isDisabled = level === 'owner' // Owner só pode ser definido no banco

                    return (
                      <button
                        key={level}
                        onClick={() => !isDisabled && setPermissions(prev => ({ ...prev, access_level: level }))}
                        disabled={isDisabled}
                        className={`p-4 rounded-xl border transition-all text-left ${
                          isSelected
                            ? `border-primary-500 ${config.bgColor}`
                            : isDisabled
                            ? 'border-dark-700/50 opacity-50 cursor-not-allowed'
                            : 'border-dark-700/50 hover:border-dark-600'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className={`w-4 h-4 ${config.color}`} />
                          <span className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-dark-300'}`}>
                            {config.label}
                          </span>
                        </div>
                        <p className="text-xs text-dark-500">{config.description}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Info for owner/admin */}
              {permissions.access_level !== 'agent' && (
                <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                  <div className="flex gap-3">
                    <Info className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                    <p className="text-sm text-yellow-300">
                      {permissions.access_level === 'owner'
                        ? 'Proprietários têm acesso total e não podem ter permissões restritas.'
                        : 'Administradores têm acesso amplo. As configurações abaixo são opcionais.'}
                    </p>
                  </div>
                </div>
              )}

              {/* WhatsApp Permissions */}
              {permissions.access_level === 'agent' && (
                <div className="border border-dark-700/50 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleSection('whatsapp')}
                    className="w-full flex items-center justify-between p-4 hover:bg-dark-700/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                        <Phone className="w-4 h-4 text-green-400" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-white font-medium">WhatsApp</h3>
                        <p className="text-xs text-dark-400">
                          {permissions.whatsapp_access_all
                            ? 'Acesso a todos os números'
                            : `${permissions.whatsapp_allowed_numbers?.length || 0} números selecionados`}
                        </p>
                      </div>
                    </div>
                    {expandedSections.whatsapp ? (
                      <ChevronDown className="w-5 h-5 text-dark-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-dark-400" />
                    )}
                  </button>

                  <AnimatePresence>
                    {expandedSections.whatsapp && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-dark-700/50"
                      >
                        <div className="p-4 space-y-4">
                          {/* Access All Toggle */}
                          <label className="flex items-center justify-between p-3 bg-dark-900/50 rounded-lg cursor-pointer">
                            <div className="flex items-center gap-3">
                              {permissions.whatsapp_access_all ? (
                                <Unlock className="w-4 h-4 text-green-400" />
                              ) : (
                                <Lock className="w-4 h-4 text-dark-400" />
                              )}
                              <span className="text-sm text-white">Acesso a todos os números</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={permissions.whatsapp_access_all}
                              onChange={(e) => setPermissions(prev => ({
                                ...prev,
                                whatsapp_access_all: e.target.checked,
                              }))}
                              className="w-5 h-5 rounded bg-dark-700 border-dark-600 text-primary-500 focus:ring-primary-500/50"
                            />
                          </label>

                          {/* Numbers Selection */}
                          {!permissions.whatsapp_access_all && (
                            <div className="space-y-2">
                              <p className="text-xs text-dark-400 mb-2">Selecione os números que este agente pode acessar:</p>
                              {whatsappNumbers.length === 0 ? (
                                <p className="text-sm text-dark-500 text-center py-4">
                                  Nenhum número conectado
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
                                  {whatsappNumbers.map((number) => {
                                    const isSelected = permissions.whatsapp_allowed_numbers?.includes(number.id)
                                    return (
                                      <label
                                        key={number.id}
                                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                                          isSelected
                                            ? 'bg-green-500/10 border border-green-500/30'
                                            : 'bg-dark-900/50 border border-transparent hover:bg-dark-900'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => toggleWhatsAppNumber(number.id)}
                                          className="w-4 h-4 rounded bg-dark-700 border-dark-600 text-green-500 focus:ring-green-500/50"
                                        />
                                        <div className="flex-1">
                                          <p className="text-sm text-white">
                                            {number.display_name || number.phone_number}
                                          </p>
                                          <p className="text-xs text-dark-500">
                                            {number.phone_number} • {number.provider === 'meta_cloud' ? 'API Oficial' : 'Evolution'}
                                          </p>
                                        </div>
                                        <div className={`w-2 h-2 rounded-full ${
                                          number.is_connected ? 'bg-green-400' : 'bg-red-400'
                                        }`} />
                                      </label>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Additional Permissions */}
                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-dark-700/50">
                            <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-dark-900/50 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={permissions.whatsapp_can_send}
                                onChange={(e) => setPermissions(prev => ({
                                  ...prev,
                                  whatsapp_can_send: e.target.checked,
                                }))}
                                className="w-4 h-4 rounded bg-dark-700 border-dark-600 text-primary-500"
                              />
                              <Send className="w-4 h-4 text-dark-400" />
                              <span className="text-sm text-dark-300">Enviar mensagens</span>
                            </label>
                            <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-dark-900/50 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={permissions.whatsapp_can_transfer}
                                onChange={(e) => setPermissions(prev => ({
                                  ...prev,
                                  whatsapp_can_transfer: e.target.checked,
                                }))}
                                className="w-4 h-4 rounded bg-dark-700 border-dark-600 text-primary-500"
                              />
                              <ArrowLeftRight className="w-4 h-4 text-dark-400" />
                              <span className="text-sm text-dark-300">Transferir chats</span>
                            </label>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Pipeline Permissions */}
              {permissions.access_level === 'agent' && (
                <div className="border border-dark-700/50 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleSection('pipelines')}
                    className="w-full flex items-center justify-between p-4 hover:bg-dark-700/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                        <Layers className="w-4 h-4 text-purple-400" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-white font-medium">Pipelines</h3>
                        <p className="text-xs text-dark-400">
                          {permissions.pipeline_access_all
                            ? 'Acesso a todas as pipelines'
                            : `${permissions.pipeline_allowed_ids?.length || 0} pipelines selecionadas`}
                        </p>
                      </div>
                    </div>
                    {expandedSections.pipelines ? (
                      <ChevronDown className="w-5 h-5 text-dark-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-dark-400" />
                    )}
                  </button>

                  <AnimatePresence>
                    {expandedSections.pipelines && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-dark-700/50"
                      >
                        <div className="p-4 space-y-4">
                          {/* Access All Toggle */}
                          <label className="flex items-center justify-between p-3 bg-dark-900/50 rounded-lg cursor-pointer">
                            <div className="flex items-center gap-3">
                              {permissions.pipeline_access_all ? (
                                <Unlock className="w-4 h-4 text-purple-400" />
                              ) : (
                                <Lock className="w-4 h-4 text-dark-400" />
                              )}
                              <span className="text-sm text-white">Acesso a todas as pipelines</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={permissions.pipeline_access_all}
                              onChange={(e) => setPermissions(prev => ({
                                ...prev,
                                pipeline_access_all: e.target.checked,
                              }))}
                              className="w-5 h-5 rounded bg-dark-700 border-dark-600 text-primary-500 focus:ring-primary-500/50"
                            />
                          </label>

                          {/* Pipelines Selection */}
                          {!permissions.pipeline_access_all && (
                            <div className="space-y-2">
                              <p className="text-xs text-dark-400 mb-2">Selecione as pipelines que este agente pode acessar:</p>
                              {pipelines.length === 0 ? (
                                <p className="text-sm text-dark-500 text-center py-4">
                                  Nenhuma pipeline criada
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
                                  {pipelines.map((pipeline) => {
                                    const isSelected = permissions.pipeline_allowed_ids?.includes(pipeline.id)
                                    return (
                                      <label
                                        key={pipeline.id}
                                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                                          isSelected
                                            ? 'bg-purple-500/10 border border-purple-500/30'
                                            : 'bg-dark-900/50 border border-transparent hover:bg-dark-900'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => togglePipeline(pipeline.id)}
                                          className="w-4 h-4 rounded bg-dark-700 border-dark-600 text-purple-500 focus:ring-purple-500/50"
                                        />
                                        <div className="flex-1">
                                          <p className="text-sm text-white">{pipeline.name}</p>
                                          {pipeline.stages_count && (
                                            <p className="text-xs text-dark-500">
                                              {pipeline.stages_count} etapas
                                            </p>
                                          )}
                                        </div>
                                      </label>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Can Edit Toggle */}
                          <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-dark-900/50 cursor-pointer border-t border-dark-700/50 pt-4">
                            <input
                              type="checkbox"
                              checked={permissions.pipeline_can_edit}
                              onChange={(e) => setPermissions(prev => ({
                                ...prev,
                                pipeline_can_edit: e.target.checked,
                              }))}
                              className="w-4 h-4 rounded bg-dark-700 border-dark-600 text-primary-500"
                            />
                            <Edit className="w-4 h-4 text-dark-400" />
                            <span className="text-sm text-dark-300">Pode editar deals e mover entre etapas</span>
                          </label>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-dark-700">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-dark-700 hover:bg-dark-600 text-white rounded-xl font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 py-3 bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 disabled:from-dark-600 disabled:to-dark-600 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                Salvar Permissões
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
