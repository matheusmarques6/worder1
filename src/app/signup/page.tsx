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
  User,
  Building,
  CheckCircle,
  AlertCircle,
  Zap,
  BarChart3,
  MessageSquare,
  Users,
} from 'lucide-react';

// Worder Logo Component
const WorderLogo = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
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

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    companyName: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Validate password
    if (formData.password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'signup',
          email: formData.email,
          password: formData.password,
          firstName: formData.firstName,
          lastName: formData.lastName,
          companyName: formData.companyName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar conta');
      }

      // Show success message
      setSuccess(true);
      
      // Redirect to onboarding
      setTimeout(() => {
        router.push('/onboarding');
        router.refresh();
      }, 1500);
    } catch (err: any) {
      console.error('Signup error:', err);
      setError(err.message || 'Erro ao criar conta. Tente novamente.');
      setIsLoading(false);
    }
  };

  const features = [
    { icon: BarChart3, text: 'Analytics financeiro em tempo real' },
    { icon: Zap, text: 'Automações de e-mail e WhatsApp' },
    { icon: MessageSquare, text: 'WhatsApp Business integrado' },
    { icon: Users, text: 'CRM completo com pipeline visual' },
  ];

  if (success) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md text-center"
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Conta criada com sucesso!</h2>
          <p className="text-dark-400 mb-6">
            Configurando sua conta...
          </p>
          <Link
            href="/"
            className="text-primary-400 hover:text-primary-300 transition-colors"
          >
            Ir para o login
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-950 flex">
      {/* Left Side - Signup Form */}
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
            <h2 className="text-2xl font-bold text-white">Crie sua conta</h2>
            <p className="text-dark-400 mt-2">
              Comece gratuitamente e escale suas vendas
            </p>
          </div>

          {/* Signup Form */}
          <form onSubmit={handleSignup} className="space-y-4">
            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Nome
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    placeholder="Seu nome"
                    className="w-full pl-10 pr-4 py-3 bg-dark-900/50 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 transition-all"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Sobrenome
                </label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  placeholder="Sobrenome"
                  className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 transition-all"
                  required
                />
              </div>
            </div>

            {/* Company Name */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Nome da Empresa
              </label>
              <div className="relative">
                <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                <input
                  type="text"
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleChange}
                  placeholder="Sua empresa"
                  className="w-full pl-10 pr-4 py-3 bg-dark-900/50 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 transition-all"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="seu@email.com"
                  className="w-full pl-10 pr-4 py-3 bg-dark-900/50 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 transition-all"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full pl-10 pr-12 py-3 bg-dark-900/50 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 transition-all"
                  required
                  minLength={6}
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

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Terms */}
            <p className="text-xs text-dark-500">
              Ao criar sua conta, você concorda com nossos{' '}
              <a href="#" className="text-primary-400 hover:underline">Termos de Uso</a>
              {' '}e{' '}
              <a href="#" className="text-primary-400 hover:underline">Política de Privacidade</a>.
            </p>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-400 hover:to-primary-500 rounded-xl text-white font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary-500/25"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Criar conta grátis
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Login Link */}
          <p className="mt-6 text-center text-dark-400">
            Já tem uma conta?{' '}
            <Link href="/" className="text-primary-400 hover:text-primary-300 transition-colors font-medium">
              Fazer login
            </Link>
          </p>
        </motion.div>
      </div>

      {/* Right Side - Features */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-dark-900 to-dark-950 p-12 items-center justify-center relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }} />
        </div>

        {/* Gradient Orbs */}
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-primary-500/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-accent-500/20 rounded-full blur-[100px]" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative z-10 max-w-md"
        >
          {/* Large Logo */}
          <div className="mb-8">
            <WorderLogo size="lg" />
            <p className="text-sm text-dark-500 mt-1">by Convertfy</p>
          </div>
          
          <h2 className="text-3xl font-bold text-white mb-4">
            Tudo que você precisa para{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-accent-400">
              vender mais
            </span>
          </h2>
          <p className="text-lg text-dark-300 mb-8">
            Plataforma completa para e-commerce com analytics, automações, CRM e WhatsApp.
          </p>

          {/* Features List */}
          <div className="space-y-4">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                className="flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center">
                  <feature.icon className="w-5 h-5 text-primary-400" />
                </div>
                <span className="text-dark-200">{feature.text}</span>
              </motion.div>
            ))}
          </div>

          {/* Trust Badge */}
          <div className="mt-12 pt-8 border-t border-dark-800">
            <p className="text-dark-500 text-sm mb-3">Confiado por empresas como:</p>
            <div className="flex items-center gap-6 text-dark-600">
              <span className="font-semibold">Shopify</span>
              <span className="font-semibold">Nuvemshop</span>
              <span className="font-semibold">VTEX</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
