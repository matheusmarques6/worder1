'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
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
  Lock,
  Unlock,
} from 'lucide-react'
import { AgentsTheme } from './ui/AgentsTheme'
import { AccordionItem } from './ui/primitives'

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
  provider: 'meta_cloud'
  is_connected: boolean
}

interface Pipeline {
  id: string
  name: string
  stages_count?: number
}

interface Permissions {
  access_level: 'owner' | 'admin' | 'agent'
  // WhatsApp
  whatsapp_access_all: boolean
  whatsapp_allowed_numbers: string[]
  whatsapp_can_send: boolean
  whatsapp_can_transfer: boolean
  // CRM
  can_access_crm: boolean
  can_access_pipelines: boolean
  can_create_deals: boolean
  can_manage_tags: boolean
  pipeline_access_all: boolean
  pipeline_allowed_ids: string[]
  pipeline_can_edit: boolean
  // Analytics
  can_view_analytics: boolean
  can_view_reports: boolean
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
    // WhatsApp
    whatsapp_access_all: false,
    whatsapp_allowed_numbers: [],
    whatsapp_can_send: true,
    whatsapp_can_transfer: true,
    // CRM
    can_access_crm: false,
    can_access_pipelines: false,
    can_create_deals: false,
    can_manage_tags: false,
    pipeline_access_all: false,
    pipeline_allowed_ids: [],
    pipeline_can_edit: false,
    // Analytics
    can_view_analytics: false,
    can_view_reports: false,
  })

  // Sections
  const [expandedSections, setExpandedSections] = useState({
    whatsapp: true,
    crm: true,
    analytics: true,
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
  const toggleSection = (section: 'whatsapp' | 'crm' | 'analytics') => {
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
    <AgentsTheme>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="modal-overlay"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="modal"
        style={{ maxWidth: 672 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-head">
          <div className="flex items-center gap-3">
            <div className="act-ico" style={{ background: 'var(--brand-tint)', color: 'var(--brand)' }}>
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Permissões</h2>
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>{agent.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="modal-x">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="modal-body space-y-6">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--brand)' }} />
            </div>
          ) : (
            <>
              {/* Access Level */}
              <div>
                <label className="label">Nível de Acesso</label>
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
                        className={`selcard ${isSelected ? 'on' : ''}`}
                        style={isDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className={`w-4 h-4 ${config.color}`} />
                          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                            {config.label}
                          </span>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--text-3)' }}>{config.description}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Info for owner/admin */}
              {permissions.access_level !== 'agent' && (
                <div className="callout amber">
                  <Info className="w-5 h-5 flex-shrink-0" />
                  <p>
                    {permissions.access_level === 'owner'
                      ? 'Proprietários têm acesso total e não podem ter permissões restritas.'
                      : 'Administradores têm acesso amplo. As configurações abaixo são opcionais.'}
                  </p>
                </div>
              )}

              {/* WhatsApp Permissions */}
              {permissions.access_level === 'agent' && (
                <AccordionItem
                  open={expandedSections.whatsapp}
                  onToggle={() => toggleSection('whatsapp')}
                  title={
                    <div className="flex items-center gap-3">
                      <div className="act-ico" style={{ background: 'var(--green-tint)', color: 'var(--green)' }}>
                        <Phone className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-medium" style={{ color: 'var(--text)' }}>WhatsApp</h3>
                        <p className="text-xs" style={{ color: 'var(--text-3)', fontWeight: 500 }}>
                          {permissions.whatsapp_access_all
                            ? 'Acesso a todos os números'
                            : `${permissions.whatsapp_allowed_numbers?.length || 0} números selecionados`}
                        </p>
                      </div>
                    </div>
                  }
                >
                  <div className="space-y-4">
                    {/* Access All Toggle */}
                    <label className="flex items-center justify-between p-3 rounded-lg cursor-pointer" style={{ background: 'var(--surface-2)' }}>
                      <div className="flex items-center gap-3">
                        {permissions.whatsapp_access_all ? (
                          <Unlock className="w-4 h-4" style={{ color: 'var(--green)' }} />
                        ) : (
                          <Lock className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
                        )}
                        <span className="text-sm" style={{ color: 'var(--text-2)' }}>Acesso a todos os números</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={permissions.whatsapp_access_all}
                        onChange={(e) => setPermissions(prev => ({
                          ...prev,
                          whatsapp_access_all: e.target.checked,
                        }))}
                      />
                    </label>

                    {/* Numbers Selection */}
                    {!permissions.whatsapp_access_all && (
                      <div className="space-y-2">
                        <p className="text-xs mb-2" style={{ color: 'var(--text-3)' }}>Selecione os números que este agente pode acessar:</p>
                        {whatsappNumbers.length === 0 ? (
                          <p className="text-sm text-center py-4" style={{ color: 'var(--text-3)' }}>
                            Nenhum número conectado
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
                            {whatsappNumbers.map((number) => {
                              const isSelected = permissions.whatsapp_allowed_numbers?.includes(number.id)
                              return (
                                <label
                                  key={number.id}
                                  className={`selcard ${isSelected ? 'on' : ''} flex items-center gap-3`}
                                  style={{ padding: 12 }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleWhatsAppNumber(number.id)}
                                  />
                                  <div className="flex-1">
                                    <p className="text-sm" style={{ color: 'var(--text)' }}>
                                      {number.display_name || number.phone_number}
                                    </p>
                                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                                      {number.phone_number} • API Oficial
                                    </p>
                                  </div>
                                  <div className="w-2 h-2 rounded-full" style={{ background: number.is_connected ? 'var(--green)' : 'var(--red)' }} />
                                </label>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Additional Permissions */}
                    <div className="grid grid-cols-2 gap-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                      <label className="flex items-center gap-2 p-2 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={permissions.whatsapp_can_send}
                          onChange={(e) => setPermissions(prev => ({
                            ...prev,
                            whatsapp_can_send: e.target.checked,
                          }))}
                        />
                        <Send className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
                        <span className="text-sm" style={{ color: 'var(--text-2)' }}>Enviar mensagens</span>
                      </label>
                      <label className="flex items-center gap-2 p-2 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={permissions.whatsapp_can_transfer}
                          onChange={(e) => setPermissions(prev => ({
                            ...prev,
                            whatsapp_can_transfer: e.target.checked,
                          }))}
                        />
                        <ArrowLeftRight className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
                        <span className="text-sm" style={{ color: 'var(--text-2)' }}>Transferir chats</span>
                      </label>
                    </div>
                  </div>
                </AccordionItem>
              )}

              {/* CRM & Pipelines Permissions */}
              {permissions.access_level === 'agent' && (
                <AccordionItem
                  open={expandedSections.crm}
                  onToggle={() => toggleSection('crm')}
                  title={
                    <div className="flex items-center gap-3">
                      <div className="act-ico" style={{ background: 'var(--purple-tint)', color: 'var(--purple)' }}>
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-medium" style={{ color: 'var(--text)' }}>CRM & Pipelines</h3>
                        <p className="text-xs" style={{ color: 'var(--text-3)', fontWeight: 500 }}>
                          {permissions.can_access_crm ? 'Acesso ao CRM liberado' : 'Sem acesso ao CRM'}
                        </p>
                      </div>
                    </div>
                  }
                >
                  <div className="space-y-4">
                    {/* CRM Access Toggle */}
                    <label className="flex items-center justify-between p-3 rounded-lg cursor-pointer" style={{ background: 'var(--surface-2)' }}>
                      <div className="flex items-center gap-3">
                        <Users className="w-4 h-4" style={{ color: 'var(--purple)' }} />
                        <span className="text-sm" style={{ color: 'var(--text-2)' }}>Pode acessar o CRM</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={permissions.can_access_crm}
                        onChange={(e) => setPermissions(prev => ({
                          ...prev,
                          can_access_crm: e.target.checked,
                        }))}
                      />
                    </label>

                    {permissions.can_access_crm && (
                      <>
                        {/* CRM Sub-permissions */}
                        <div className="space-y-2 pl-4" style={{ borderLeft: '2px solid var(--purple)' }}>
                          <label className="flex items-center gap-2 p-2 rounded-lg cursor-pointer">
                            <input
                              type="checkbox"
                              checked={permissions.can_access_pipelines}
                              onChange={(e) => setPermissions(prev => ({
                                ...prev,
                                can_access_pipelines: e.target.checked,
                              }))}
                            />
                            <Layers className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
                            <span className="text-sm" style={{ color: 'var(--text-2)' }}>Pode acessar Pipelines</span>
                          </label>

                          <label className="flex items-center gap-2 p-2 rounded-lg cursor-pointer">
                            <input
                              type="checkbox"
                              checked={permissions.can_create_deals}
                              onChange={(e) => setPermissions(prev => ({
                                ...prev,
                                can_create_deals: e.target.checked,
                              }))}
                            />
                            <Edit className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
                            <span className="text-sm" style={{ color: 'var(--text-2)' }}>Pode criar deals</span>
                          </label>

                          <label className="flex items-center gap-2 p-2 rounded-lg cursor-pointer">
                            <input
                              type="checkbox"
                              checked={permissions.can_manage_tags}
                              onChange={(e) => setPermissions(prev => ({
                                ...prev,
                                can_manage_tags: e.target.checked,
                              }))}
                            />
                            <span className="text-sm" style={{ color: 'var(--text-2)' }}>Pode gerenciar tags</span>
                          </label>
                        </div>

                        {/* Pipelines Access */}
                        {permissions.can_access_pipelines && (
                          <div className="space-y-3 mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                            <p className="text-xs" style={{ color: 'var(--text-3)' }}>Selecionar pipelines específicas:</p>

                            <label className="flex items-center justify-between p-3 rounded-lg cursor-pointer" style={{ background: 'var(--surface-2)' }}>
                              <div className="flex items-center gap-3">
                                {permissions.pipeline_access_all ? (
                                  <Unlock className="w-4 h-4" style={{ color: 'var(--purple)' }} />
                                ) : (
                                  <Lock className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
                                )}
                                <span className="text-sm" style={{ color: 'var(--text-2)' }}>Acesso a todas as pipelines</span>
                              </div>
                              <input
                                type="checkbox"
                                checked={permissions.pipeline_access_all}
                                onChange={(e) => setPermissions(prev => ({
                                  ...prev,
                                  pipeline_access_all: e.target.checked,
                                }))}
                              />
                            </label>

                            {!permissions.pipeline_access_all && (
                              <div className="space-y-2">
                                {pipelines.length === 0 ? (
                                  <p className="text-sm text-center py-4" style={{ color: 'var(--text-3)' }}>
                                    Nenhuma pipeline criada
                                  </p>
                                ) : (
                                  <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
                                    {pipelines.map((pipeline) => {
                                      const isSelected = permissions.pipeline_allowed_ids?.includes(pipeline.id)
                                      return (
                                        <label
                                          key={pipeline.id}
                                          className={`selcard ${isSelected ? 'on' : ''} flex items-center gap-3`}
                                          style={{ padding: 12 }}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => togglePipeline(pipeline.id)}
                                          />
                                          <div className="flex-1">
                                            <p className="text-sm" style={{ color: 'var(--text)' }}>{pipeline.name}</p>
                                            {pipeline.stages_count && (
                                              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
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

                            <label className="flex items-center gap-2 p-2 rounded-lg cursor-pointer">
                              <input
                                type="checkbox"
                                checked={permissions.pipeline_can_edit}
                                onChange={(e) => setPermissions(prev => ({
                                  ...prev,
                                  pipeline_can_edit: e.target.checked,
                                }))}
                              />
                              <Edit className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
                              <span className="text-sm" style={{ color: 'var(--text-2)' }}>Pode editar deals e mover entre etapas</span>
                            </label>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </AccordionItem>
              )}

              {/* Analytics Permissions */}
              {permissions.access_level === 'agent' && (
                <AccordionItem
                  open={expandedSections.analytics}
                  onToggle={() => toggleSection('analytics')}
                  title={
                    <div className="flex items-center gap-3">
                      <div className="act-ico" style={{ background: 'var(--blue-tint)', color: 'var(--blue)' }}>
                        <Eye className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-medium" style={{ color: 'var(--text)' }}>Analytics</h3>
                        <p className="text-xs" style={{ color: 'var(--text-3)', fontWeight: 500 }}>
                          {permissions.can_view_analytics ? 'Pode ver relatórios' : 'Sem acesso a analytics'}
                        </p>
                      </div>
                    </div>
                  }
                >
                  <div className="space-y-3">
                    <label className="flex items-center justify-between p-3 rounded-lg cursor-pointer" style={{ background: 'var(--surface-2)' }}>
                      <div className="flex items-center gap-3">
                        <Eye className="w-4 h-4" style={{ color: 'var(--blue)' }} />
                        <span className="text-sm" style={{ color: 'var(--text-2)' }}>Pode ver Analytics</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={permissions.can_view_analytics}
                        onChange={(e) => setPermissions(prev => ({
                          ...prev,
                          can_view_analytics: e.target.checked,
                        }))}
                      />
                    </label>

                    {permissions.can_view_analytics && (
                      <label className="flex items-center gap-2 p-2 rounded-lg cursor-pointer pl-4" style={{ borderLeft: '2px solid var(--blue)' }}>
                        <input
                          type="checkbox"
                          checked={permissions.can_view_reports}
                          onChange={(e) => setPermissions(prev => ({
                            ...prev,
                            can_view_reports: e.target.checked,
                          }))}
                        />
                        <span className="text-sm" style={{ color: 'var(--text-2)' }}>Pode ver relatórios detalhados</span>
                      </label>
                    )}
                  </div>
                </AccordionItem>
              )}

              {/* Error */}
              {error && (
                <div className="callout red">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="modal-foot">
          <button onClick={onClose} className="btn btn-soft btn-block">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="btn btn-primary btn-block"
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
    </AgentsTheme>
  )
}
