'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  User,
  Mail,
  Phone,
  Building,
  Shield,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { useAuthStore } from '@/stores'

export default function ProfilePage() {
  const { user, setUser } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
  })

  // Check if user is agent
  const isAgent = user?.user_metadata?.is_agent === true
  const userRole = isAgent ? 'Atendente' : (user?.role === 'owner' ? 'Owner' : 'Admin')

  // Load user data
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || user.user_metadata?.name || '',
        email: user.email || '',
        phone: user.user_metadata?.phone || '',
      })
    }
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess(false)

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          phone: formData.phone,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao atualizar perfil')
      }

      // Update local state
      setUser({
        ...user!,
        name: formData.name,
        user_metadata: {
          ...user?.user_metadata,
          name: formData.name,
          phone: formData.phone,
        },
      })

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Get initials
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Profile Card */}
        <div className="bg-dark-900/50 backdrop-blur-xl border border-dark-800 rounded-2xl overflow-hidden">
          {/* Cover & Avatar */}
          <div className="h-24 bg-gradient-to-r from-primary-600 to-accent-600" />
          <div className="px-6 pb-6">
            <div className="flex items-end gap-4 -mt-10">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center border-4 border-dark-900 shadow-xl">
                <span className="text-white font-bold text-2xl">
                  {getInitials(formData.name || 'U')}
                </span>
              </div>
              <div className="pb-2">
                <h2 className="text-lg font-semibold text-white">
                  {formData.name || 'Usuário'}
                </h2>
                <span className={`inline-block px-2.5 py-0.5 text-xs font-medium rounded-full ${
                  isAgent 
                    ? 'bg-blue-500/20 text-blue-400' 
                    : userRole === 'Owner' 
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'bg-primary-500/20 text-primary-400'
                }`}>
                  {userRole}
                </span>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-5">
            {/* Success Message */}
            {success && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400"
              >
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm">Perfil atualizado com sucesso!</span>
              </motion.div>
            )}

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400"
              >
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">{error}</span>
              </motion.div>
            )}

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Nome Completo
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full pl-11 pr-4 py-3 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 transition-all"
                  placeholder="Seu nome"
                />
              </div>
            </div>

            {/* Email (read-only) */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                <input
                  type="email"
                  value={formData.email}
                  disabled
                  className="w-full pl-11 pr-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl text-dark-400 cursor-not-allowed"
                />
              </div>
              <p className="text-xs text-dark-500 mt-1">O e-mail não pode ser alterado</p>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Telefone
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full pl-11 pr-4 py-3 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 transition-all"
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>

            {/* Organization Info (read-only) */}
            {user?.organization_id && (
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Organização
                </label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                  <input
                    type="text"
                    value={user.organization_id}
                    disabled
                    className="w-full pl-11 pr-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl text-dark-400 cursor-not-allowed font-mono text-sm"
                  />
                </div>
              </div>
            )}

            {/* Role Info */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Permissões
              </label>
              <div className="relative">
                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                <input
                  type="text"
                  value={userRole}
                  disabled
                  className="w-full pl-11 pr-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl text-dark-400 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Salvar Alterações
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
