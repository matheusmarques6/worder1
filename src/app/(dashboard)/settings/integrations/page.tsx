'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Loader2,
  Plug,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Integration definitions ──────────────────────────────────────────────────

const ShopifyIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
    <path
      d="M15.337 3.415c-.042-.33-.378-.504-.63-.504-.252 0-.504.042-.504.042s-1.092.126-1.512.168c-.294.42-.588.882-.882 1.512l-2.31 1.092c-.378.168-.546.504-.546.882v.042l-1.344 10.458c-.084.714.462 1.344 1.176 1.386h.042l6.888-.378c.714-.042 1.26-.672 1.218-1.386l-.84-12.6c-.042 0-.126-.042-.21-.084z"
      fill="#95BF47"
    />
  </svg>
);

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6">
    <circle cx="12" cy="12" r="12" fill="#1877F2" />
    <path
      fill="white"
      d="M16.5 12.5h-2.5v8h-3v-8h-2v-2.5h2v-1.5c0-2.5 1-4 3.5-4h2.5v2.5h-1.5c-1 0-1.5.5-1.5 1.5v1.5h3l-.5 2.5z"
    />
  </svg>
);

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83c.87-2.6 3.3-4.52 6.16-4.52z"
      fill="#EA4335"
    />
  </svg>
);

const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V9.05a8.27 8.27 0 004.84 1.55V7.17a4.85 4.85 0 01-1.07-.48z" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="#25D366">
    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm4.97 13.44c-.2.56-1.19 1.1-1.63 1.16-.44.06-.85.21-2.88-.6-2.43-.97-3.98-3.44-4.1-3.6-.12-.16-.98-1.3-.98-2.48s.62-1.76.84-2 .44-.28.6-.28c.15 0 .29.01.42.02.13.01.32-.05.5.38.19.44.65 1.59.71 1.71.06.11.1.25.02.4-.08.15-.12.24-.23.37l-.34.4c-.11.11-.23.24-.1.47.13.23.59.97 1.27 1.57.87.77 1.6 1.01 1.83 1.12.23.11.37.09.5-.05l.35-.42c.13-.16.26-.14.44-.08.18.06 1.14.54 1.33.63.2.1.33.14.38.22.05.08.05.47-.15 1.02z" />
  </svg>
);

interface IntegrationDef {
  slug: string;
  name: string;
  description: string;
  category: string;
  icon: React.ReactNode;
  connectHref: string;
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    slug: 'shopify',
    name: 'Shopify',
    description: 'Importe produtos, pedidos e clientes da sua loja Shopify.',
    category: 'E-commerce',
    icon: <ShopifyIcon />,
    connectHref: '/integrations/shopify',
  },
  {
    slug: 'facebook_ads',
    name: 'Facebook Ads',
    description: 'Sincronize audiências e rastreie conversões do Meta Ads.',
    category: 'Publicidade',
    icon: <FacebookIcon />,
    connectHref: '/integrations/facebook-ads',
  },
  {
    slug: 'google_ads',
    name: 'Google Ads',
    description: 'Importe dados de campanhas e conversões do Google Ads.',
    category: 'Publicidade',
    icon: <GoogleIcon />,
    connectHref: '/integrations/google-ads',
  },
  {
    slug: 'tiktok_ads',
    name: 'TikTok Ads',
    description: 'Conecte o TikTok Business Center para rastrear campanhas.',
    category: 'Publicidade',
    icon: <TikTokIcon />,
    connectHref: '/integrations/tiktok-ads',
  },
  {
    slug: 'whatsapp',
    name: 'WhatsApp',
    description: 'Conecte o WhatsApp Business para enviar mensagens e campanhas.',
    category: 'Mensagens',
    icon: <WhatsAppIcon />,
    connectHref: '/integrations/whatsapp',
  },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsIntegrationsPage() {
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchConnected() {
      try {
        const res = await fetch('/api/integrations/status');
        if (res.ok) {
          const data = await res.json();
          const raw = data?.integrations ?? {};
          // Map integration slugs to connected booleans
          const map: Record<string, boolean> = {};
          const slugMap: Record<string, string> = {
            shopify: 'shopify',
            facebook_ads: 'meta',
            google_ads: 'google',
            tiktok_ads: 'tiktok',
            whatsapp: 'whatsapp',
          };
          for (const [uiSlug, apiSlug] of Object.entries(slugMap)) {
            map[uiSlug] = raw[apiSlug]?.connected ?? false;
          }
          setConnected(map);
        }
      } catch {
        // silently ignore — show all as disconnected
      } finally {
        setLoading(false);
      }
    }
    fetchConnected();
  }, []);

  // Group by category
  const categories = Array.from(new Set(INTEGRATIONS.map(i => i.category)));

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Integrações</h1>
        <p className="text-sm text-gray-500 mt-1">
          Conecte sua conta com plataformas externas para sincronizar dados.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          {categories.map(category => (
            <section key={category}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {category}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {INTEGRATIONS.filter(i => i.category === category).map(integration => {
                  const isConnected = connected[integration.slug] ?? false;
                  return (
                    <div
                      key={integration.slug}
                      className="bg-white border border-gray-200 rounded-xl p-5 flex items-start justify-between gap-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center flex-shrink-0">
                          {integration.icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="text-sm font-semibold text-gray-900">{integration.name}</h3>
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                                isConnected
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-500'
                              )}
                            >
                              {isConnected ? (
                                <>
                                  <CheckCircle className="w-3 h-3" />
                                  Conectado
                                </>
                              ) : (
                                <>
                                  <Plug className="w-3 h-3" />
                                  Desconectado
                                </>
                              )}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">{integration.description}</p>
                        </div>
                      </div>
                      <Link
                        href={integration.connectHref}
                        className={cn(
                          'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                          isConnected
                            ? 'border border-gray-200 text-gray-600 bg-white hover:bg-gray-50'
                            : 'bg-orange-500 text-white hover:bg-orange-600'
                        )}
                      >
                        <ExternalLink className="w-3 h-3" />
                        {isConnected ? 'Gerenciar' : 'Conectar'}
                      </Link>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
