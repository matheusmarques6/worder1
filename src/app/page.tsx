'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Zap,
  BarChart3,
  MessageSquare,
  Users,
  CheckCircle,
  TrendingUp,
  DollarSign,
  AlertCircle,
} from 'lucide-react';

// Worder Logo Component
const WorderLogo = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  // Logo original: 900x173 (proporção ~5.2:1)
  const sizes = {
    sm: { width: 100, height: 19 },
    md: { width: 130, height: 25 },
    lg: { width: 180, height: 35 },
  };
  
  return (
    <Image
      src="/logo.png"
      alt="Worder"
      width={sizes[size].width}
      height={sizes[size].height}
      className="object-contain"
      priority
    />
  );
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'login',
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao fazer login');
      }

      // Redirect to dashboard on success
      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Erro ao fazer login. Verifique suas credenciais.');
      setIsLoading(false);
    }
  };

  const features = [
    { icon: BarChart3, title: 'Analytics Financeiro', description: 'Receita, lucro e ROI em tempo real' },
    { icon: Zap, title: 'Automações', description: 'Fluxos de e-mail e WhatsApp' },
    { icon: MessageSquare, title: 'WhatsApp Business', description: 'Conversas centralizadas' },
    { icon: Users, title: 'CRM Completo', description: 'Pipeline visual de vendas' },
  ];

  return (
    <div className="min-h-screen bg-dark-950 flex">
      {/* Left Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {/* Logo */}
          <div className="flex flex-col gap-1 mb-8">
            <WorderLogo size="md" />
            <p className="text-xs text-dark-500">by Convertfy</p>
          </div>

          {/* Welcome Text */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white">Bem-vindo de volta</h2>
            <p className="text-dark-400 mt-2">
              Acesse sua conta para gerenciar suas campanhas
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full pl-10 pr-4 py-3 bg-dark-900/50 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-12 py-3 bg-dark-900/50 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-dark-700 bg-dark-900 text-primary-500 focus:ring-primary-500/20"
                />
                <span className="text-sm text-dark-400">Lembrar de mim</span>
              </label>
              <a href="#" className="text-sm text-primary-400 hover:text-primary-300 transition-colors">
                Esqueceu a senha?
              </a>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-400 hover:to-primary-500 rounded-xl text-white font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary-500/25"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Entrar
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Demo Account */}
          <div className="mt-6 p-4 bg-dark-900/50 border border-dark-800 rounded-xl">
            <p className="text-sm text-dark-400 mb-2">Conta demo:</p>
            <div className="flex items-center gap-2 text-sm">
              <code className="px-2 py-1 bg-dark-800 rounded text-dark-300">demo@worder.com</code>
              <code className="px-2 py-1 bg-dark-800 rounded text-dark-300">demo123</code>
            </div>
          </div>

          {/* Sign Up Link */}
          <p className="mt-6 text-center text-dark-400">
            Não tem uma conta?{' '}
            <Link href="/signup" className="text-primary-400 hover:text-primary-300 transition-colors font-medium">
              Criar conta grátis
            </Link>
          </p>
        </motion.div>
      </div>

      {/* Right Side - Features */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-dark-900 via-dark-900 to-primary-950/30 items-center justify-center p-12 relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-500/10 rounded-full blur-3xl" />
          {/* Grid pattern */}
          <div className="absolute inset-0 grid-pattern opacity-30" />
        </div>

        <div className="relative z-10 max-w-lg">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {/* Large Logo */}
            <div className="mb-8">
              <WorderLogo size="lg" />
              <p className="text-sm text-dark-500 mt-1">by Convertfy</p>
            </div>
            
            <h2 className="text-3xl font-bold text-white mb-4">
              Transforme dados em{' '}
              <span className="text-gradient-worder">receita</span>
            </h2>
            <p className="text-lg text-dark-300 mb-8">
              Plataforma completa para e-commerce: analytics financeiro, automações, CRM e WhatsApp em um só lugar.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 gap-4">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                className="p-4 bg-dark-800/30 backdrop-blur-sm border border-dark-700/50 rounded-xl hover:border-primary-500/30 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center mb-3">
                  <feature.icon className="w-5 h-5 text-primary-400" />
                </div>
                <h3 className="font-semibold text-white mb-1">{feature.title}</h3>
                <p className="text-sm text-dark-400">{feature.description}</p>
              </motion.div>
            ))}
          </div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="mt-8 flex items-center gap-8"
          >
            {[
              { value: '500+', label: 'Lojas ativas' },
              { value: 'R$ 50M+', label: 'Receita gerada' },
              { value: '42%', label: 'Aumento médio' },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-sm text-dark-400">{stat.label}</p>
              </div>
            ))}
          </motion.div>

          {/* Testimonial */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="mt-8 p-4 bg-dark-800/30 backdrop-blur-sm border border-dark-700/50 rounded-xl"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                <span className="text-white font-semibold text-sm">MS</span>
              </div>
              <div>
                <p className="font-medium text-white">Marina Santos</p>
                <p className="text-xs text-dark-400">CEO, ModaStyle</p>
              </div>
              <div className="ml-auto flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-4 h-4 text-accent-400 fill-accent-400" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
            </div>
            <p className="text-sm text-dark-300">
              "O Worder transformou nossa operação. Aumentamos 65% a receita de email marketing em 3 meses."
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
