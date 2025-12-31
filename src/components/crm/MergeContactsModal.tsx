'use client'

// =============================================
// Merge Contacts Modal
// src/components/crm/MergeContactsModal.tsx
// =============================================

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Users,
  Merge,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Mail,
  Phone,
  Building,
  Loader2,
  Zap,
} from 'lucide-react'
import { useAuthStore } from '@/stores'

interface Contact {
  id: string
  email: string | null
  phone: string | null
  first_name: string | null
  last_name: string | null
  company: string | null
  total_orders: number
  total_spent: number
  created_at: string
}

interface DuplicateGroup {
  matchType: 'email' | 'phone' | 'name'
  matchValue: string
  confidence: 'high' | 'medium' | 'low'
  contacts: Contact[]
}

interface MergeContactsModalProps {
  isOpen: boolean
  onClose: () => void
  onMergeComplete?: () => void
  preselectedContacts?: Contact[]
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function MergeContactsModal({
  isOpen,
  onClose,
  onMergeComplete,
  preselectedContacts,
}: MergeContactsModalProps) {
  const { user } = useAuthStore()
  const organizationId = user?.organization_id
  
  const [step, setStep] = useState<'detect' | 'select' | 'confirm' | 'done' | 'merging_all'>('detect')
  const [loading, setLoading] = useState(false)
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([])
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null)
  const [primaryContactId, setPrimaryContactId] = useState<string | null>(null)
  const [mergeResult, setMergeResult] = useState<any>(null)
  
  // Estado para merge em lote
  const [mergeAllProgress, setMergeAllProgress] = useState({
    current: 0,
    total: 0,
    success: 0,
    failed: 0,
    currentGroup: '',
  })
  
  // Detectar duplicados ao abrir
  useEffect(() => {
    if (isOpen && organizationId && !preselectedContacts) {
      detectDuplicates()
    } else if (preselectedContacts && preselectedContacts.length > 1) {
      setSelectedGroup({
        matchType: 'email',
        matchValue: 'Seleção manual',
        confidence: 'high',
        contacts: preselectedContacts,
      })
      setPrimaryContactId(preselectedContacts[0].id)
      setStep('confirm')
    }
  }, [isOpen, organizationId, preselectedContacts])
  
  const detectDuplicates = async () => {
    if (!organizationId) return
    
    setLoading(true)
    try {
      const res = await fetch(`/api/contacts/merge?organizationId=${organizationId}`)
      const data = await res.json()
      setDuplicates(data.duplicates || [])
    } catch (error) {
      console.error('Error detecting duplicates:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const handleSelectGroup = (group: DuplicateGroup) => {
    setSelectedGroup(group)
    // Selecionar automaticamente o contato com mais pedidos como primário
    const sorted = [...group.contacts].sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0))
    setPrimaryContactId(sorted[0].id)
    setStep('select')
  }
  
  const handleMerge = async () => {
    if (!organizationId || !primaryContactId || !selectedGroup) return
    
    const secondaryIds = selectedGroup.contacts
      .filter(c => c.id !== primaryContactId)
      .map(c => c.id)
    
    setLoading(true)
    try {
      const res = await fetch('/api/contacts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          primaryContactId,
          secondaryContactIds: secondaryIds,
        }),
      })
      
      const result = await res.json()
      
      if (result.success) {
        setMergeResult(result)
        setStep('done')
        onMergeComplete?.()
      } else {
        alert(result.error || 'Erro ao mesclar contatos')
      }
    } catch (error) {
      console.error('Error merging:', error)
      alert('Erro ao mesclar contatos')
    } finally {
      setLoading(false)
    }
  }
  
  // =============================================
  // MERGE ALL - Mesclar todos os grupos de uma vez
  // =============================================
  const handleMergeAll = async () => {
    if (!organizationId || duplicates.length === 0) return
    
    // Filtrar apenas grupos de alta confiança para segurança
    const highConfidenceGroups = duplicates.filter(g => g.confidence === 'high')
    
    if (highConfidenceGroups.length === 0) {
      alert('Nenhum grupo de alta confiança encontrado. Mescle manualmente os grupos de média/baixa confiança.')
      return
    }
    
    const confirmMessage = `Você está prestes a mesclar ${highConfidenceGroups.length} grupo(s) de contatos duplicados (apenas alta confiança).\n\nEsta ação não pode ser desfeita.\n\nDeseja continuar?`
    
    if (!confirm(confirmMessage)) return
    
    setStep('merging_all')
    setMergeAllProgress({
      current: 0,
      total: highConfidenceGroups.length,
      success: 0,
      failed: 0,
      currentGroup: '',
    })
    
    let successCount = 0
    let failedCount = 0
    
    for (let i = 0; i < highConfidenceGroups.length; i++) {
      const group = highConfidenceGroups[i]
      
      // Atualizar progresso
      setMergeAllProgress(prev => ({
        ...prev,
        current: i + 1,
        currentGroup: group.matchValue,
      }))
      
      // Selecionar o contato com maior valor gasto como primário
      const sorted = [...group.contacts].sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0))
      const primaryId = sorted[0].id
      const secondaryIds = sorted.slice(1).map(c => c.id)
      
      try {
        const res = await fetch('/api/contacts/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationId,
            primaryContactId: primaryId,
            secondaryContactIds: secondaryIds,
          }),
        })
        
        const result = await res.json()
        
        if (result.success) {
          successCount++
        } else {
          failedCount++
          console.error(`Erro ao mesclar grupo ${group.matchValue}:`, result.error)
        }
      } catch (error) {
        failedCount++
        console.error(`Erro ao mesclar grupo ${group.matchValue}:`, error)
      }
      
      // Atualizar contadores
      setMergeAllProgress(prev => ({
        ...prev,
        success: successCount,
        failed: failedCount,
      }))
      
      // Pequeno delay para não sobrecarregar
      await new Promise(r => setTimeout(r, 300))
    }
    
    // Finalizado
    setMergeResult({
      success: true,
      message: `${successCount} grupo(s) mesclado(s) com sucesso${failedCount > 0 ? `, ${failedCount} falha(s)` : ''}`,
      merged: successCount,
      failed: failedCount,
    })
    setStep('done')
    onMergeComplete?.()
  }
  
  const handleClose = () => {
    setStep('detect')
    setSelectedGroup(null)
    setPrimaryContactId(null)
    setMergeResult(null)
    setMergeAllProgress({ current: 0, total: 0, success: 0, failed: 0, currentGroup: '' })
    onClose()
  }
  
  if (!isOpen) return null
  
  // Contar grupos de alta confiança
  const highConfidenceCount = duplicates.filter(g => g.confidence === 'high').length
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-dark-900 rounded-2xl border border-dark-700 w-full max-w-2xl max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-dark-700">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary-500/20">
                <Merge className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Mesclar Contatos</h2>
                <p className="text-sm text-dark-400">
                  {step === 'detect' && 'Contatos duplicados detectados'}
                  {step === 'select' && 'Selecione o contato principal'}
                  {step === 'confirm' && 'Confirme a mesclagem'}
                  {step === 'merging_all' && 'Mesclando todos os contatos...'}
                  {step === 'done' && 'Mesclagem concluída'}
                </p>
              </div>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-dark-800 rounded-lg transition-colors">
              <X className="w-5 h-5 text-dark-400" />
            </button>
          </div>
          
          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[60vh]">
            {/* Step: Detect */}
            {step === 'detect' && (
              <div>
                {loading ? (
                  <div className="text-center py-8">
                    <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-dark-400">Procurando duplicados...</p>
                  </div>
                ) : duplicates.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">Nenhum duplicado encontrado</h3>
                    <p className="text-dark-400">Seus contatos estão organizados!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-dark-400 mb-4">
                      Encontramos {duplicates.length} grupo(s) de possíveis duplicados:
                    </p>
                    
                    {duplicates.map((group, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSelectGroup(group)}
                        className="w-full p-4 bg-dark-800 hover:bg-dark-750 rounded-xl border border-dark-700 hover:border-dark-600 transition-all group text-left"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`
                              text-xs font-medium px-2 py-1 rounded
                              ${group.confidence === 'high' 
                                ? 'bg-green-500/20 text-green-400' 
                                : group.confidence === 'medium'
                                  ? 'bg-yellow-500/20 text-yellow-400'
                                  : 'bg-red-500/20 text-red-400'}
                            `}>
                              {group.confidence === 'high' ? 'Alta' :
                               group.confidence === 'medium' ? 'Média' : 'Baixa'} confiança
                            </div>
                            <span className="text-sm text-dark-400">
                              {group.matchType === 'email' ? 'Email' :
                               group.matchType === 'phone' ? 'Telefone' : 'Nome'}: {group.matchValue}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white">{group.contacts.length} contatos</span>
                            <ChevronRight className="w-4 h-4 text-dark-400 group-hover:text-primary-400 transition-colors" />
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {group.contacts.slice(0, 3).map(contact => (
                            <span key={contact.id} className="text-xs bg-dark-700 px-2 py-1 rounded">
                              {contact.first_name} {contact.last_name}
                            </span>
                          ))}
                          {group.contacts.length > 3 && (
                            <span className="text-xs text-dark-400">
                              +{group.contacts.length - 3} mais
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* Step: Merging All (Progress) */}
            {step === 'merging_all' && (
              <div className="py-8">
                <div className="flex flex-col items-center">
                  <Loader2 className="w-12 h-12 text-primary-400 animate-spin mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">
                    Mesclando contatos...
                  </h3>
                  <p className="text-dark-400 mb-6">
                    Processando: {mergeAllProgress.currentGroup}
                  </p>
                  
                  {/* Progress Bar */}
                  <div className="w-full max-w-md">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-dark-400">Progresso</span>
                      <span className="text-white">
                        {mergeAllProgress.current} / {mergeAllProgress.total}
                      </span>
                    </div>
                    <div className="h-3 bg-dark-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary-500 rounded-full transition-all duration-300"
                        style={{ width: `${(mergeAllProgress.current / mergeAllProgress.total) * 100}%` }}
                      />
                    </div>
                    
                    <div className="flex justify-center gap-6 mt-4 text-sm">
                      <span className="text-green-400">
                        ✓ {mergeAllProgress.success} sucesso
                      </span>
                      {mergeAllProgress.failed > 0 && (
                        <span className="text-red-400">
                          ✗ {mergeAllProgress.failed} falha(s)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Step: Select Primary */}
            {step === 'select' && selectedGroup && (
              <div className="space-y-4">
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="text-yellow-400 font-medium">Selecione o contato principal</p>
                      <p className="text-dark-300">Os outros serão mesclados nele e depois excluídos.</p>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  {selectedGroup.contacts.map(contact => (
                    <button
                      key={contact.id}
                      onClick={() => setPrimaryContactId(contact.id)}
                      className={`
                        w-full p-4 rounded-xl border transition-all text-left
                        ${primaryContactId === contact.id 
                          ? 'bg-primary-500/10 border-primary-500' 
                          : 'bg-dark-800 border-dark-700 hover:border-dark-600'}
                      `}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-white">
                            {contact.first_name} {contact.last_name}
                          </p>
                          <div className="flex flex-wrap gap-3 mt-2 text-sm text-dark-400">
                            {contact.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {contact.email}
                              </span>
                            )}
                            {contact.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {contact.phone}
                              </span>
                            )}
                            {contact.company && (
                              <span className="flex items-center gap-1">
                                <Building className="w-3 h-3" />
                                {contact.company}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-success-400 font-medium">
                            {formatCurrency(contact.total_spent || 0)}
                          </p>
                          <p className="text-xs text-dark-400">
                            {contact.total_orders || 0} pedidos
                          </p>
                        </div>
                      </div>
                      {primaryContactId === contact.id && (
                        <div className="mt-3 flex items-center gap-2 text-primary-400">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-sm font-medium">Contato principal</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Step: Confirm */}
            {step === 'confirm' && selectedGroup && primaryContactId && (
              <div className="space-y-4">
                <div className="p-4 bg-dark-800 rounded-xl">
                  <h3 className="text-sm font-medium text-white mb-3">Resumo da mesclagem:</h3>
                  <ul className="space-y-2 text-sm text-dark-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      {selectedGroup.contacts.length - 1} contato(s) serão mesclados
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      Todos os pedidos e conversas serão transferidos
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      Tags serão combinadas
                    </li>
                    <li className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-400" />
                      Esta ação não pode ser desfeita
                    </li>
                  </ul>
                </div>
              </div>
            )}
            
            {/* Step: Done */}
            {step === 'done' && mergeResult && (
              <div className="text-center py-8">
                <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">Mesclagem concluída!</h3>
                <p className="text-dark-400">{mergeResult.message}</p>
                {mergeResult.failed > 0 && (
                  <p className="text-yellow-400 text-sm mt-2">
                    {mergeResult.failed} grupo(s) não puderam ser mesclados. Verifique manualmente.
                  </p>
                )}
              </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-dark-700">
            {step === 'detect' && (
              <>
                <button onClick={handleClose} className="px-4 py-2 text-dark-400 hover:text-white transition-colors">
                  Fechar
                </button>
                <div className="flex items-center gap-3">
                  <button
                    onClick={detectDuplicates}
                    disabled={loading}
                    className="px-4 py-2 bg-dark-700 text-white rounded-lg hover:bg-dark-600 transition-colors"
                  >
                    Atualizar
                  </button>
                  
                  {/* BOTÃO MESCLAR TODOS */}
                  {highConfidenceCount > 0 && (
                    <button
                      onClick={handleMergeAll}
                      disabled={loading}
                      className="px-5 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors flex items-center gap-2 font-medium shadow-lg shadow-primary-500/20"
                    >
                      <Zap className="w-4 h-4" />
                      Mesclar Todos ({highConfidenceCount})
                    </button>
                  )}
                </div>
              </>
            )}
            
            {step === 'select' && (
              <>
                <button 
                  onClick={() => setStep('detect')}
                  className="px-4 py-2 text-dark-400 hover:text-white transition-colors"
                >
                  Voltar
                </button>
                <button
                  onClick={() => setStep('confirm')}
                  disabled={!primaryContactId}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors disabled:opacity-50"
                >
                  Continuar
                </button>
              </>
            )}
            
            {step === 'confirm' && (
              <>
                <button 
                  onClick={() => setStep('select')}
                  className="px-4 py-2 text-dark-400 hover:text-white transition-colors"
                >
                  Voltar
                </button>
                <button
                  onClick={handleMerge}
                  disabled={loading}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Mesclando...' : 'Confirmar Mesclagem'}
                </button>
              </>
            )}
            
            {step === 'merging_all' && (
              <p className="text-dark-400 text-sm w-full text-center">
                Por favor, aguarde enquanto processamos todos os grupos...
              </p>
            )}
            
            {step === 'done' && (
              <button
                onClick={handleClose}
                className="ml-auto px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
              >
                Fechar
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
