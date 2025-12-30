'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, User, Mail, Phone, Building2 } from 'lucide-react'
import { CustomFieldsForm, useCustomFields, validateCustomFields } from './CustomFieldRenderer'

interface CreateContactModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (contact: {
    first_name: string
    last_name: string
    email: string
    phone?: string
    company?: string
    custom_fields?: Record<string, any>
  }) => Promise<void>
  initialEmail?: string
  organizationId?: string
}

export function CreateContactModal({ isOpen, onClose, onCreate, initialEmail = '', organizationId }: CreateContactModalProps) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState(initialEmail)
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Fetch custom field definitions
  const { fields: customFields } = useCustomFields('contact', organizationId)

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFirstName('')
      setLastName('')
      setEmail(initialEmail)
      setPhone('')
      setCompany('')
      setCustomFieldValues({})
      setError(null)
    }
  }, [isOpen, initialEmail])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!firstName.trim() && !email.trim()) {
      setError('Informe pelo menos o nome ou email do contato')
      return
    }

    // Validate custom fields
    const customFieldErrors = validateCustomFields(customFields, customFieldValues)
    if (Object.keys(customFieldErrors).length > 0) {
      setError(Object.values(customFieldErrors)[0])
      return
    }

    setLoading(true)
    setError(null)

    try {
      await onCreate({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        company: company.trim() || undefined,
        custom_fields: Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined,
      })
      
      // Reset form
      setFirstName('')
      setLastName('')
      setEmail('')
      setPhone('')
      setCompany('')
      setCustomFieldValues({})
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar contato')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      setError(null)
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
            >
              <form onSubmit={handleSubmit}>
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-dark-700">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                      <User className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="text-lg font-semibold text-white">
                      Novo Contato
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={loading}
                    className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors disabled:opacity-50"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-5 space-y-4">
                  {/* Error */}
                  {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                      {error}
                    </div>
                  )}

                  {/* Name Fields */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-1.5">
                        Nome
                      </label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-dark-800/50 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 transition-colors"
                        placeholder="João"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-1.5">
                        Sobrenome
                      </label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-dark-800/50 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 transition-colors"
                        placeholder="Silva"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-1.5">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-dark-800/50 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 transition-colors"
                        placeholder="joao@empresa.com"
                      />
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-1.5">
                      Telefone
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-dark-800/50 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 transition-colors"
                        placeholder="(11) 99999-9999"
                      />
                    </div>
                  </div>

                  {/* Company */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-1.5">
                      Empresa
                    </label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                      <input
                        type="text"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-dark-800/50 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 transition-colors"
                        placeholder="Nome da empresa"
                      />
                    </div>
                  </div>

                  {/* Custom Fields */}
                  {organizationId && customFields.length > 0 && (
                    <div className="pt-4 border-t border-dark-700">
                      <CustomFieldsForm
                        entityType="contact"
                        organizationId={organizationId}
                        values={customFieldValues}
                        onChange={setCustomFieldValues}
                      />
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-dark-700 bg-dark-900/50">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={loading}
                    className="px-4 py-2.5 rounded-xl bg-dark-800 hover:bg-dark-700 text-white transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading || (!firstName.trim() && !email.trim())}
                    className="px-5 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-primary-500/20"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Criando...
                      </>
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
