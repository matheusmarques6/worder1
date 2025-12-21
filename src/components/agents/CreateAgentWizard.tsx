'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  ChevronLeft,
  ChevronRight,
  User,
  Bot,
  Key,
  Shield,
  Eye,
  EyeOff,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Loader2,
  UserPlus,
  Copy,
  Check,
  MessageSquare,
  Settings,
  Lock,
} from 'lucide-react'
import { validatePassword, passwordsMatch } from '@/lib/password-validation'
import { PasswordStrengthIndicator, PasswordMatchIndicator } from '@/components/ui/PasswordStrength'
import CreateAgentModal from './CreateAgentModal'

// Types
interface WhatsAppNumber {
  id: string
  phone_number: string
  display_name?: string
  is_connected: boolean
}

interface Pipeline {
  id: string
  name: string
}

interface AIModel {
  id: string
  provider: string
  display_name: string
}

interface ApiKey {
  provider: string
  is_valid: boolean
}

interface CreateAgentWizardProps {
  organizationId: string
  onClose: () => void
  onSuccess: () => void
  aiModels: AIModel[]
  apiKeys: ApiKey[]
  humanAgentsCount: number
}

// Steps
const HUMAN_STEPS = ['type', 'info', 'password', 'permissions', 'review'] as const
const AI_STEPS = ['type', 'info', 'config', 'review'] as const

type HumanStep = typeof HUMAN_STEPS[number]
type AIStep = typeof AI_STEPS[number]

export function CreateAgentWizard({
  organizationId,
  onClose,
  onSuccess,
  aiModels,
  apiKeys,
  humanAgentsCount,
}: CreateAgentWizardProps) {
  // Wizard state
  const [agentType, setAgentType] = useState<'human' | 'ai' | null>(null)
  const [currentStep, setCurrentStep] = useState<string>('type')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successData, setSuccessData] = useState<{ password?: string } | null>(null)
  const [copied, setCopied] = useState(false)
  
  // Estado para mostrar o novo modal de AI
  const [showAIAgentModal, setShowAIAgentModal] = useState(false)

  // Data state
  const [whatsappNumbers, setWhatsappNumbers] = useState<WhatsAppNumber[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [loadingData, setLoadingData] = useState(false)

  // Human form state
  const [humanForm, setHumanForm] = useState({
    name: '',
    email: '',
    password: '',
    passwordConfirmation: '',
    showPassword: false,
    generatePassword: true,
  })

  // Permissions state
  const [permissions, setPermissions] = useState({
    accessLevel: 'agent' as 'agent' | 'admin',
    whatsappAccessAll: false,
    whatsappNumberIds: [] as string[],
    pipelineAccessAll: false,
    pipelineIds: [] as string[],
    canSendMessages: true,
    canTransferChats: true,
    canEditPipeline: false,
    canViewReports: false,
  })

  // AI form state
  const [aiForm, setAiForm] = useState({
    name: '',
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.3,
    systemPrompt: '',
    greetingMessage: '',
    transferKeywords: 'atendente, humano, pessoa',
  })

  // Options
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true)

  // Fetch data
  useEffect(() => {
    if (currentStep === 'permissions' || currentStep === 'review') {
      fetchData()
    }
  }, [currentStep])

  const fetchData = async () => {
    setLoadingData(true)
    try {
      // Fetch WhatsApp numbers
      const numbersRes = await fetch(`/api/whatsapp/numbers?organization_id=${organizationId}`)
      const numbersData = await numbersRes.json()
      setWhatsappNumbers(numbersData.numbers || [])

      // Fetch pipelines (if API exists)
      try {
        const pipelinesRes = await fetch(`/api/pipelines?organization_id=${organizationId}`)
        const pipelinesData = await pipelinesRes.json()
        setPipelines(pipelinesData.pipelines || [])
      } catch {
        // Pipeline API may not exist yet
        setPipelines([])
      }
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoadingData(false)
    }
  }

  // Password validation
  const passwordValidation = useMemo(() => validatePassword(humanForm.password), [humanForm.password])
  const passwordsDoMatch = useMemo(
    () => passwordsMatch(humanForm.password, humanForm.passwordConfirmation),
    [humanForm.password, humanForm.passwordConfirmation]
  )

  // Steps config
  const steps = agentType === 'human' ? HUMAN_STEPS : agentType === 'ai' ? AI_STEPS : ['type']
  const currentStepIndex = steps.indexOf(currentStep as any)
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === steps.length - 1

  // Navigation
  const goNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStep(steps[currentStepIndex + 1])
      setError('')
    }
  }

  const goBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(steps[currentStepIndex - 1])
      setError('')
    } else if (agentType) {
      setAgentType(null)
      setCurrentStep('type')
    }
  }

  // Validation per step
  const canProceed = (): boolean => {
    if (currentStep === 'type') {
      return agentType !== null
    }

    if (agentType === 'human') {
      if (currentStep === 'info') {
        return !!humanForm.name && !!humanForm.email && humanForm.email.includes('@')
      }
      if (currentStep === 'password') {
        if (humanForm.generatePassword) return true
        return passwordValidation.isValid && passwordsDoMatch
      }
      if (currentStep === 'permissions') {
        // At least some access must be defined
        return permissions.whatsappAccessAll || permissions.whatsappNumberIds.length > 0
      }
    }

    if (agentType === 'ai') {
      if (currentStep === 'info') {
        return !!aiForm.name
      }
      if (currentStep === 'config') {
        const hasApiKey = apiKeys.some(k => k.provider === aiForm.provider && k.is_valid)
        return !!aiForm.model && hasApiKey
      }
    }

    return true
  }

  // Handle type selection
  const handleSelectType = (type: 'human' | 'ai') => {
    if (type === 'human' && humanAgentsCount >= 3) {
      setError('Limite de 3 agentes humanos atingido')
      return
    }
    
    // Se for AI, abrir o novo modal avançado
    if (type === 'ai') {
      setShowAIAgentModal(true)
      return
    }
    
    setAgentType(type)
    setCurrentStep('info')
    setError('')
  }

  // Submit
  const handleSubmit = async () => {
    setLoading(true)
    setError('')

    try {
      const payload: any = {
        organization_id: organizationId,
        type: agentType,
        name: agentType === 'human' ? humanForm.name : aiForm.name,
      }

      if (agentType === 'human') {
        payload.email = humanForm.email
        payload.password = humanForm.generatePassword ? undefined : humanForm.password
        payload.force_password_change = true
        payload.send_welcome_email = sendWelcomeEmail
        payload.permissions = {
          access_level: permissions.accessLevel,
          whatsapp_access_all: permissions.whatsappAccessAll,
          whatsapp_number_ids: permissions.whatsappNumberIds,
          pipeline_access_all: permissions.pipelineAccessAll,
          pipeline_ids: permissions.pipelineIds,
          can_send_messages: permissions.canSendMessages,
          can_transfer_chats: permissions.canTransferChats,
          can_edit_pipeline: permissions.canEditPipeline,
        }
      }

      if (agentType === 'ai') {
        payload.ai_config = {
          provider: aiForm.provider,
          model: aiForm.model,
          temperature: aiForm.temperature,
          system_prompt: aiForm.systemPrompt,
          greeting_message: aiForm.greetingMessage,
          transfer_keywords: aiForm.transferKeywords.split(',').map(k => k.trim()),
          transfer_to_queue: true,
        }
      }

      const res = await fetch('/api/whatsapp/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao criar agente')
      }

      if (data.password_generated && data.temporary_password) {
        setSuccessData({ password: data.temporary_password })
      } else {
        onSuccess()
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Copy password
  const handleCopyPassword = () => {
    if (successData?.password) {
      navigator.clipboard.writeText(successData.password)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Success screen
  if (successData) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onSuccess}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-dark-800 rounded-2xl w-full max-w-md border border-dark-700/50 overflow-hidden"
        >
          <div className="p-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>

            <h2 className="text-xl font-semibold text-white text-center mb-2">
              Agente Criado com Sucesso!
            </h2>
            <p className="text-dark-400 text-center text-sm mb-6">
              Copie a senha temporária abaixo:
            </p>

            <div className="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-dark-400">Senha Temporária</span>
                <button
                  onClick={handleCopyPassword}
                  className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                >
                  {copied ? <><Check className="w-3 h-3" /> Copiado!</> : <><Copy className="w-3 h-3" /> Copiar</>}
                </button>
              </div>
              <code className="block text-lg font-mono text-white bg-dark-800 rounded-lg p-3 text-center select-all">
                {successData.password}
              </code>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 mb-6">
              <div className="flex gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-yellow-200">
                  <strong>Importante:</strong> Anote esta senha agora. Ela não será mostrada novamente.
                </div>
              </div>
            </div>

            <button
              onClick={onSuccess}
              className="w-full py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
            >
              Entendi, fechar
            </button>
          </div>
        </motion.div>
      </motion.div>
    )
  }

  // Step indicators
  const renderStepIndicator = () => {
    if (!agentType) return null

    const stepLabels = agentType === 'human' 
      ? { type: 'Tipo', info: 'Dados', password: 'Senha', permissions: 'Acesso', review: 'Revisar' }
      : { type: 'Tipo', info: 'Dados', config: 'Config', review: 'Revisar' }

    return (
      <div className="flex items-center justify-center gap-2 mb-6">
        {steps.slice(1).map((step, index) => {
          const stepIndex = index + 1
          const isActive = currentStepIndex === stepIndex
          const isCompleted = currentStepIndex > stepIndex

          return (
            <div key={step} className="flex items-center">
              {index > 0 && (
                <div className={`w-8 h-0.5 ${isCompleted ? 'bg-primary-500' : 'bg-dark-700'}`} />
              )}
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    isCompleted
                      ? 'bg-primary-500 text-white'
                      : isActive
                      ? 'bg-primary-500/20 text-primary-400 border-2 border-primary-500'
                      : 'bg-dark-700 text-dark-400'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : stepIndex}
                </div>
                <span className={`text-xs mt-1 ${isActive ? 'text-primary-400' : 'text-dark-500'}`}>
                  {stepLabels[step as keyof typeof stepLabels]}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Render current step content
  const renderStepContent = () => {
    // Type selection
    if (currentStep === 'type') {
      return (
        <div className="space-y-3">
          <button
            onClick={() => handleSelectType('human')}
            disabled={humanAgentsCount >= 3}
            className={`w-full p-4 rounded-xl border transition-all text-left ${
              humanAgentsCount >= 3
                ? 'border-dark-700/30 bg-dark-800/30 opacity-50 cursor-not-allowed'
                : 'border-dark-700/50 hover:border-blue-500/50 hover:bg-blue-500/5'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <User className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-white">Agente Humano</h3>
                  <span className="text-xs bg-dark-700 text-dark-400 px-2 py-0.5 rounded-full">
                    {humanAgentsCount}/3
                  </span>
                </div>
                <p className="text-sm text-dark-400 mt-1">Atendente com login próprio</p>
              </div>
              <ChevronRight className="w-5 h-5 text-dark-500" />
            </div>
          </button>

          <button
            onClick={() => handleSelectType('ai')}
            className="w-full p-4 rounded-xl border border-dark-700/50 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all text-left"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-purple-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-white">Agente de IA</h3>
                <p className="text-sm text-dark-400 mt-1">Respostas automáticas 24/7</p>
              </div>
              <ChevronRight className="w-5 h-5 text-dark-500" />
            </div>
          </button>
        </div>
      )
    }

    // Human info
    if (currentStep === 'info' && agentType === 'human') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Nome Completo *</label>
            <input
              type="text"
              value={humanForm.name}
              onChange={(e) => setHumanForm({ ...humanForm, name: e.target.value })}
              placeholder="Ex: João Silva"
              className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Email (será o login) *</label>
            <input
              type="email"
              value={humanForm.email}
              onChange={(e) => setHumanForm({ ...humanForm, email: e.target.value })}
              placeholder="joao@empresa.com"
              className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50"
            />
          </div>
        </div>
      )
    }

    // Human password
    if (currentStep === 'password' && agentType === 'human') {
      return (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setHumanForm({ ...humanForm, generatePassword: true, password: '', passwordConfirmation: '' })}
              className={`flex-1 py-2.5 px-3 rounded-xl text-sm transition-all ${
                humanForm.generatePassword
                  ? 'bg-primary-500/20 border-primary-500 text-primary-400 border'
                  : 'bg-dark-900/50 border-dark-700/50 text-dark-400 border hover:border-dark-600'
              }`}
            >
              <Sparkles className="w-4 h-4 inline mr-2" />
              Gerar Automaticamente
            </button>
            <button
              type="button"
              onClick={() => setHumanForm({ ...humanForm, generatePassword: false })}
              className={`flex-1 py-2.5 px-3 rounded-xl text-sm transition-all ${
                !humanForm.generatePassword
                  ? 'bg-primary-500/20 border-primary-500 text-primary-400 border'
                  : 'bg-dark-900/50 border-dark-700/50 text-dark-400 border hover:border-dark-600'
              }`}
            >
              <Key className="w-4 h-4 inline mr-2" />
              Definir Manualmente
            </button>
          </div>

          {humanForm.generatePassword ? (
            <div className="bg-dark-900/30 border border-dark-700/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-white font-medium">Senha será gerada automaticamente</p>
                  <p className="text-xs text-dark-400 mt-1">
                    Uma senha forte será criada e exibida após a criação do agente.
                    O agente deverá trocar a senha no primeiro acesso.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Senha *</label>
                <div className="relative">
                  <input
                    type={humanForm.showPassword ? 'text' : 'password'}
                    value={humanForm.password}
                    onChange={(e) => setHumanForm({ ...humanForm, password: e.target.value })}
                    placeholder="Digite a senha"
                    className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setHumanForm({ ...humanForm, showPassword: !humanForm.showPassword })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white"
                  >
                    {humanForm.showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <PasswordStrengthIndicator password={humanForm.password} showRules={true} />
              </div>

              {humanForm.password && passwordValidation.isValid && (
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Confirmar Senha *</label>
                  <input
                    type={humanForm.showPassword ? 'text' : 'password'}
                    value={humanForm.passwordConfirmation}
                    onChange={(e) => setHumanForm({ ...humanForm, passwordConfirmation: e.target.value })}
                    placeholder="Repita a senha"
                    className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50"
                  />
                  <PasswordMatchIndicator password={humanForm.password} confirmation={humanForm.passwordConfirmation} />
                </div>
              )}
            </>
          )}
        </div>
      )
    }

    // Human permissions
    if (currentStep === 'permissions' && agentType === 'human') {
      return (
        <div className="space-y-5">
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
                    onClick={() => setPermissions({ ...permissions, accessLevel: 'agent' })}
                    className={`p-3 rounded-xl border transition-all text-left ${
                      permissions.accessLevel === 'agent'
                        ? 'border-primary-500 bg-primary-500/10'
                        : 'border-dark-700/50 hover:border-dark-600'
                    }`}
                  >
                    <User className="w-5 h-5 text-blue-400 mb-2" />
                    <div className="font-medium text-white text-sm">Agente</div>
                    <div className="text-xs text-dark-400">Acesso limitado</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPermissions({ ...permissions, accessLevel: 'admin' })}
                    className={`p-3 rounded-xl border transition-all text-left ${
                      permissions.accessLevel === 'admin'
                        ? 'border-primary-500 bg-primary-500/10'
                        : 'border-dark-700/50 hover:border-dark-600'
                    }`}
                  >
                    <Shield className="w-5 h-5 text-purple-400 mb-2" />
                    <div className="font-medium text-white text-sm">Administrador</div>
                    <div className="text-xs text-dark-400">Acesso completo</div>
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
                    checked={permissions.whatsappAccessAll}
                    onChange={(e) => setPermissions({ 
                      ...permissions, 
                      whatsappAccessAll: e.target.checked,
                      whatsappNumberIds: e.target.checked ? [] : permissions.whatsappNumberIds
                    })}
                    className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500/50"
                  />
                  <span className="text-sm text-dark-300">Acesso a todos os números</span>
                </label>

                {!permissions.whatsappAccessAll && (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {whatsappNumbers.length === 0 ? (
                      <p className="text-sm text-dark-500 italic">Nenhum número cadastrado</p>
                    ) : (
                      whatsappNumbers.map((number) => (
                        <label
                          key={number.id}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-dark-800/50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={permissions.whatsappNumberIds.includes(number.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setPermissions({
                                  ...permissions,
                                  whatsappNumberIds: [...permissions.whatsappNumberIds, number.id]
                                })
                              } else {
                                setPermissions({
                                  ...permissions,
                                  whatsappNumberIds: permissions.whatsappNumberIds.filter(id => id !== number.id)
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
                <div className="space-y-2">
                  {[
                    { key: 'canSendMessages', label: 'Pode enviar mensagens' },
                    { key: 'canTransferChats', label: 'Pode transferir chats' },
                    { key: 'canViewReports', label: 'Pode ver relatórios' },
                  ].map((perm) => (
                    <label key={perm.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={permissions[perm.key as keyof typeof permissions] as boolean}
                        onChange={(e) => setPermissions({ ...permissions, [perm.key]: e.target.checked })}
                        className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500/50"
                      />
                      <span className="text-sm text-dark-300">{perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )
    }

    // AI info
    if (currentStep === 'info' && agentType === 'ai') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Nome do Agente *</label>
            <input
              type="text"
              value={aiForm.name}
              onChange={(e) => setAiForm({ ...aiForm, name: e.target.value })}
              placeholder="Ex: Bia - Assistente Virtual"
              className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50"
            />
          </div>
        </div>
      )
    }

    // AI config
    if (currentStep === 'config' && agentType === 'ai') {
      const modelsByProvider = aiModels.reduce((acc, model) => {
        if (!acc[model.provider]) acc[model.provider] = []
        acc[model.provider].push(model)
        return acc
      }, {} as Record<string, AIModel[]>)

      return (
        <div className="space-y-4">
          {/* Provider */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Provider</label>
            <div className="grid grid-cols-4 gap-2">
              {['openai', 'anthropic', 'google', 'groq'].map((provider) => {
                const hasKey = apiKeys.some(k => k.provider === provider && k.is_valid)
                return (
                  <button
                    key={provider}
                    onClick={() => setAiForm({ ...aiForm, provider, model: '' })}
                    className={`p-2 rounded-xl border transition-all relative text-xs ${
                      aiForm.provider === provider
                        ? 'border-primary-500 bg-primary-500/10'
                        : 'border-dark-700/50 hover:border-dark-600'
                    }`}
                  >
                    <span className="text-white capitalize">{provider}</span>
                    {hasKey ? (
                      <CheckCircle className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-green-400" />
                    ) : (
                      <AlertCircle className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-yellow-400" />
                    )}
                  </button>
                )
              })}
            </div>
            {!apiKeys.some(k => k.provider === aiForm.provider && k.is_valid) && (
              <p className="text-xs text-yellow-400 mt-2">
                ⚠️ Configure a API key em Configurações → API Keys
              </p>
            )}
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Modelo</label>
            <select
              value={aiForm.model}
              onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
              className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white focus:outline-none focus:border-primary-500/50"
            >
              <option value="">Selecione um modelo</option>
              {modelsByProvider[aiForm.provider]?.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.display_name}
                </option>
              ))}
            </select>
          </div>

          {/* Temperature */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Temperatura: {aiForm.temperature}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={aiForm.temperature}
              onChange={(e) => setAiForm({ ...aiForm, temperature: parseFloat(e.target.value) })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-dark-500">
              <span>Preciso</span>
              <span>Criativo</span>
            </div>
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Prompt do Sistema</label>
            <textarea
              value={aiForm.systemPrompt}
              onChange={(e) => setAiForm({ ...aiForm, systemPrompt: e.target.value })}
              placeholder="Instruções para o comportamento da IA..."
              rows={3}
              className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50 resize-none"
            />
          </div>
        </div>
      )
    }

    // Review
    if (currentStep === 'review') {
      return (
        <div className="space-y-4">
          {/* Agent info card */}
          <div className="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                agentType === 'human' ? 'bg-blue-500/20' : 'bg-purple-500/20'
              }`}>
                {agentType === 'human' ? (
                  <User className="w-6 h-6 text-blue-400" />
                ) : (
                  <Bot className="w-6 h-6 text-purple-400" />
                )}
              </div>
              <div>
                <h3 className="font-medium text-white">
                  {agentType === 'human' ? humanForm.name : aiForm.name}
                </h3>
                {agentType === 'human' && (
                  <p className="text-sm text-dark-400">{humanForm.email}</p>
                )}
                {agentType === 'ai' && (
                  <p className="text-sm text-dark-400">{aiForm.model}</p>
                )}
              </div>
            </div>
          </div>

          {/* Permissions summary for human */}
          {agentType === 'human' && (
            <>
              <div className="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
                <h4 className="text-sm font-medium text-dark-300 mb-2 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Números WhatsApp
                </h4>
                <p className="text-sm text-white">
                  {permissions.whatsappAccessAll
                    ? 'Acesso a todos os números'
                    : permissions.whatsappNumberIds.length > 0
                    ? `${permissions.whatsappNumberIds.length} número(s) selecionado(s)`
                    : 'Nenhum número selecionado'}
                </p>
              </div>

              <div className="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
                <h4 className="text-sm font-medium text-dark-300 mb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Permissões
                </h4>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs bg-dark-700 text-dark-300 px-2 py-1 rounded-full">
                    {permissions.accessLevel === 'admin' ? 'Administrador' : 'Agente'}
                  </span>
                  {permissions.canSendMessages && (
                    <span className="text-xs bg-dark-700 text-dark-300 px-2 py-1 rounded-full">Enviar mensagens</span>
                  )}
                  {permissions.canTransferChats && (
                    <span className="text-xs bg-dark-700 text-dark-300 px-2 py-1 rounded-full">Transferir chats</span>
                  )}
                </div>
              </div>

              {/* Email option */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendWelcomeEmail}
                  onChange={(e) => setSendWelcomeEmail(e.target.checked)}
                  className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500/50"
                />
                <span className="text-sm text-dark-300">Enviar email de boas-vindas com credenciais</span>
              </label>
            </>
          )}
        </div>
      )
    }

    return null
  }

  return (
    <>
      {/* Modal de criação de Agente de IA avançado */}
      {showAIAgentModal && (
        <CreateAgentModal
          organizationId={organizationId}
          onClose={() => {
            setShowAIAgentModal(false)
          }}
          onCreate={(agentId) => {
            setShowAIAgentModal(false)
            onSuccess()
          }}
        />
      )}
      
      {/* Wizard original (só aparece se não estiver mostrando o modal de AI) */}
      {!showAIAgentModal && (
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
        className="bg-dark-800 rounded-2xl w-full max-w-lg border border-dark-700/50 overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="p-4 border-b border-dark-700/50 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                onClick={goBack}
                className="p-1 hover:bg-dark-700 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-dark-400" />
              </button>
            )}
            <h2 className="text-lg font-semibold text-white">
              {currentStep === 'type' ? 'Novo Agente' : 
               agentType === 'human' ? 'Novo Agente Humano' : 'Novo Agente de IA'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-dark-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-dark-400" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 pt-4 flex-shrink-0">
          {renderStepIndicator()}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}
          
          {renderStepContent()}
        </div>

        {/* Footer */}
        {currentStep !== 'type' && (
          <div className="p-4 border-t border-dark-700/50 flex gap-3 flex-shrink-0">
            <button
              onClick={goBack}
              className="flex-1 py-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-xl font-medium transition-colors"
            >
              Voltar
            </button>
            {isLastStep ? (
              <button
                onClick={handleSubmit}
                disabled={loading || !canProceed()}
                className="flex-1 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:bg-dark-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                Criar Agente
              </button>
            ) : (
              <button
                onClick={goNext}
                disabled={!canProceed()}
                className="flex-1 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:bg-dark-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                Próximo
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
      )}
    </>
  )
}
