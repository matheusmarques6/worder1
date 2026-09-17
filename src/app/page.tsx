'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, Zap, BarChart3,
  MessageSquare, Users, AlertCircle,
} from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [mfaStep, setMfaStep] = useState(false)
  const [mfaCode, setMfaCode] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao fazer login')
      if (data.mfaRequired) {
        // Senha certa; falta o código do app autenticador.
        setMfaStep(true)
        setIsLoading(false)
        return
      }
      router.push(data.mfaSetupRequired ? '/settings/security?require2fa=1' : '/dashboard')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer login. Verifique suas credenciais.')
      setIsLoading(false)
    }
  }

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mfa-verify', code: mfaCode }),
      })
      const data = await response.json()
      if (!response.ok) {
        if (response.status === 401 && /expirad|inválida\./i.test(data.error || '')) { setMfaStep(false); setMfaCode('') }
        throw new Error(data.error || 'Código inválido')
      }
      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Código inválido')
      setIsLoading(false)
    }
  }

  const features = [
    { icon: BarChart3, title: 'Analytics Financeiro', desc: 'Receita, lucro e ROI em tempo real' },
    { icon: Zap, title: 'Automações', desc: 'Fluxos de e-mail e WhatsApp' },
    { icon: MessageSquare, title: 'WhatsApp Business', desc: 'Conversas centralizadas' },
    { icon: Users, title: 'CRM Completo', desc: 'Pipeline visual de vendas' },
  ]

  return (
    <div className="min-h-screen flex">
      {/* Left — Login Form */}
      <div className="w-full lg:w-[480px] xl:w-[520px] flex flex-col justify-center px-8 sm:px-12 lg:px-16 bg-white">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm mx-auto"
        >
          {/* Logo */}
          <div className="mb-10 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">W</span>
            </div>
            <span className="text-xl font-bold text-gray-900">Worder</span>
          </div>

          {mfaStep ? (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Verificação em duas etapas</h1>
              <p className="text-sm text-gray-500 mb-8">
                Abra o app autenticador e digite o código de 6 dígitos de <b className="text-gray-700">{email}</b>.
              </p>
              <form onSubmit={handleMfa} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Código</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-lg tracking-[0.4em] text-center text-gray-900 placeholder:text-gray-300 bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all"
                  />
                </div>
                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isLoading || mfaCode.length !== 6}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-500 hover:bg-brand-600 rounded-lg text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>Confirmar<ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setMfaStep(false); setMfaCode(''); setError('') }}
                  className="w-full text-sm text-gray-500 hover:text-gray-700 py-1"
                >
                  Voltar e entrar com outra conta
                </button>
              </form>
            </>
          ) : (
          <>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Bem-vindo de volta</h1>
          <p className="text-sm text-gray-500 mb-8">
            Acesse sua conta para gerenciar sua operação.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500/20"
                />
                <span className="text-sm text-gray-500">Lembrar de mim</span>
              </label>
              <Link
                href="/forgot-password"
                className="text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors"
              >
                Esqueceu a senha?
              </Link>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-500 hover:bg-brand-600 rounded-lg text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Entrar
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-gray-500">
            Não tem uma conta?{' '}
            <Link href="/signup" className="text-brand-600 hover:text-brand-700 font-semibold transition-colors">
              Criar conta grátis
            </Link>
          </p>
          </>
          )}
        </motion.div>
      </div>

      {/* Right — Feature showcase */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 items-center justify-center p-12 relative overflow-hidden">
        {/* Subtle glow */}
        <div className="absolute top-1/3 left-1/3 w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-brand-600/8 rounded-full blur-[100px]" />

        <div className="relative z-10 max-w-lg">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Image
              src="/logo.png"
              alt="Worder"
              width={160}
              height={31}
              className="object-contain mb-8"
            />

            <h2 className="text-3xl font-bold text-white mb-3">
              Transforme dados em{' '}
              <span className="text-brand-400">receita</span>
            </h2>
            <p className="text-gray-400 text-lg mb-10 leading-relaxed">
              Plataforma completa para e-commerce: analytics financeiro,
              automações, CRM e WhatsApp em um só lugar.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 gap-3">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.08 }}
                className="p-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl hover:bg-white/8 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-brand-500/15 flex items-center justify-center mb-3">
                  <f.icon className="w-[18px] h-[18px] text-brand-400" />
                </div>
                <h3 className="font-semibold text-white text-sm mb-0.5">{f.title}</h3>
                <p className="text-xs text-gray-400">{f.desc}</p>
              </motion.div>
            ))}
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="mt-10 text-xs text-gray-500 text-center"
          >
            Usado por e-commerces que querem crescer com dados.
          </motion.p>
        </div>
      </div>
    </div>
  )
}
