'use client';

import { useState, useEffect } from 'react';
import { CreditCard, Zap, Loader2, CheckCircle, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BillingInfo {
  plan: 'free' | 'pro' | 'enterprise';
  emailsSent: number;
  emailsLimit: number;
  nextBillingDate: string | null;
  billingEmail: string | null;
}

const PLAN_CONFIG = {
  free: {
    label: 'Free',
    badgeClass: 'bg-gray-100 text-gray-700',
    description: 'Ideal para começar. Envie até 1.000 e-mails por mês gratuitamente.',
    color: 'text-gray-600',
  },
  pro: {
    label: 'Pro',
    badgeClass: 'bg-orange-100 text-orange-700',
    description: 'Para equipes que precisam de mais recursos e volume de envio.',
    color: 'text-orange-600',
  },
  enterprise: {
    label: 'Enterprise',
    badgeClass: 'bg-purple-100 text-purple-700',
    description: 'Solução completa para grandes organizações com suporte dedicado.',
    color: 'text-purple-600',
  },
};

const PRO_FEATURES = [
  'Até 50.000 e-mails/mês',
  'Rastreamento avançado',
  'Atribuição multicanal',
  'Suporte prioritário',
  'Domínios ilimitados',
  'API access completo',
];

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingInfo>({
    plan: 'free',
    emailsSent: 0,
    emailsLimit: 1000,
    nextBillingDate: null,
    billingEmail: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBilling() {
      try {
        const res = await fetch('/api/settings/billing');
        if (res.ok) {
          const data = await res.json();
          setBilling(prev => ({ ...prev, ...data }));
        }
      } catch {
        // use defaults
      } finally {
        setLoading(false);
      }
    }
    fetchBilling();
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  const plan = PLAN_CONFIG[billing.plan] || PLAN_CONFIG.free;
  const usagePercent = billing.emailsLimit > 0
    ? Math.min(100, Math.round((billing.emailsSent / billing.emailsLimit) * 100))
    : 0;
  const isOverHalf = usagePercent >= 50;
  const isNearLimit = usagePercent >= 80;

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Faturamento</h1>
        <p className="text-gray-500 mt-1">Gerencie seu plano e informações de pagamento.</p>
      </div>

      <div className="space-y-6">
        {/* Current Plan Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-orange-50 rounded-lg">
                <CreditCard className="w-5 h-5 text-orange-500" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Plano Atual</h2>
            </div>
            <span className={cn('px-3 py-1 rounded-full text-sm font-semibold', plan.badgeClass)}>
              {plan.label}
            </span>
          </div>

          <p className="text-gray-600 text-sm mb-6">{plan.description}</p>

          {/* Usage Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">E-mails enviados este mês</span>
              <span className="text-sm text-gray-500">
                {billing.emailsSent.toLocaleString('pt-BR')} / {billing.emailsLimit.toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div
                className={cn(
                  'h-2.5 rounded-full transition-all',
                  isNearLimit ? 'bg-red-500' : isOverHalf ? 'bg-orange-400' : 'bg-orange-500'
                )}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            {isNearLimit && (
              <p className="text-xs text-red-500 mt-1.5">
                Atenção: você usou {usagePercent}% do seu limite mensal.
              </p>
            )}
          </div>

          {billing.nextBillingDate && (
            <div className="text-sm text-gray-500 mb-4">
              Próxima cobrança em:{' '}
              <span className="font-medium text-gray-700">
                {new Date(billing.nextBillingDate).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </div>
          )}

          {billing.billingEmail && (
            <div className="text-sm text-gray-500">
              E-mail de cobrança:{' '}
              <span className="font-medium text-gray-700">{billing.billingEmail}</span>
            </div>
          )}
        </div>

        {/* Upgrade Card — shown only on free plan */}
        {billing.plan === 'free' && (
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <Zap className="w-5 h-5 text-orange-500" />
              <h2 className="text-lg font-semibold text-gray-900">Upgrade para Pro</h2>
            </div>
            <p className="text-gray-600 text-sm mb-5">
              Desbloqueie todo o potencial da plataforma com recursos avançados de marketing.
            </p>

            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
              {PRO_FEATURES.map(feature => (
                <li key={feature} className="flex items-center gap-2 text-sm text-gray-700">
                  <CheckCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>

            <button
              className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition-colors"
              onClick={() => window.open('mailto:sales@worder.com.br?subject=Upgrade para Pro', '_blank')}
            >
              <Zap className="w-4 h-4" />
              Fazer Upgrade
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Manage Subscription — shown on paid plans */}
        {billing.plan !== 'free' && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Gerenciar Assinatura</h2>
            <p className="text-sm text-gray-500 mb-4">
              Atualize seu método de pagamento, cancele ou altere seu plano pelo portal de cobrança.
            </p>
            <button
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              onClick={() => alert('Portal de cobrança em breve')}
            >
              <CreditCard className="w-4 h-4" />
              Acessar Portal de Cobrança
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
