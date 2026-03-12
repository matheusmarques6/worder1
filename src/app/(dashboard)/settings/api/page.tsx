'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Code,
  Key,
  Copy,
  CheckCircle,
  Eye,
  EyeSlash,
  Plus,
  Trash,
  ArrowRight,
  Globe,
  Lock,
  Clock,
  Lightning,
  BookOpen,
  Terminal,
} from '@phosphor-icons/react'

const apiKeys = [
  { id: '1', name: 'Produção', key: 'wdr_live_sk_...a4f2', created: '15 Jan 2026', lastUsed: '2h atrás', status: 'active' },
  { id: '2', name: 'Desenvolvimento', key: 'wdr_test_sk_...b7e1', created: '20 Feb 2026', lastUsed: '5d atrás', status: 'active' },
]

const endpoints = [
  {
    method: 'GET',
    path: '/api/v1/contacts',
    description: 'Listar contatos',
    params: 'page, limit, search, segment_id',
  },
  {
    method: 'POST',
    path: '/api/v1/contacts',
    description: 'Criar contato',
    params: 'email, first_name, last_name, phone, tags',
  },
  {
    method: 'GET',
    path: '/api/v1/contacts/:id',
    description: 'Buscar contato por ID',
    params: 'id',
  },
  {
    method: 'PUT',
    path: '/api/v1/contacts/:id',
    description: 'Atualizar contato',
    params: 'id, fields to update',
  },
  {
    method: 'POST',
    path: '/api/v1/campaigns',
    description: 'Criar campanha',
    params: 'name, channel, segment_id, template_id, schedule_at',
  },
  {
    method: 'GET',
    path: '/api/v1/campaigns/:id/report',
    description: 'Relatório de campanha',
    params: 'id',
  },
  {
    method: 'POST',
    path: '/api/v1/events',
    description: 'Enviar evento de tracking',
    params: 'event, properties, contact_id',
  },
  {
    method: 'GET',
    path: '/api/v1/segments',
    description: 'Listar segmentos',
    params: 'page, limit',
  },
  {
    method: 'GET',
    path: '/api/v1/automations',
    description: 'Listar automações',
    params: 'status, page, limit',
  },
  {
    method: 'POST',
    path: '/api/v1/messages/send',
    description: 'Enviar mensagem avulsa',
    params: 'channel, to, template_id, variables',
  },
]

const codeExamples: Record<string, string> = {
  curl: `curl -X GET "https://api.worder.com.br/v1/contacts?limit=10" \\
  -H "Authorization: Bearer wdr_live_sk_..." \\
  -H "Content-Type: application/json"`,
  node: `import Worder from '@worder/sdk';

const worder = new Worder('wdr_live_sk_...');

const contacts = await worder.contacts.list({
  limit: 10,
  segment_id: 'seg_abc123'
});

console.log(contacts.data);`,
  python: `from worder import Worder

client = Worder(api_key="wdr_live_sk_...")

contacts = client.contacts.list(
    limit=10,
    segment_id="seg_abc123"
)

for contact in contacts.data:
    print(contact.email)`,
}

const methodColors: Record<string, string> = {
  GET: 'bg-emerald-500/10 text-emerald-400',
  POST: 'bg-blue-500/10 text-blue-400',
  PUT: 'bg-yellow-500/10 text-yellow-400',
  DELETE: 'bg-red-500/10 text-red-400',
}

const rateLimits = [
  { plan: 'Starter', requests: '100/min', burst: '20/s' },
  { plan: 'Growth', requests: '500/min', burst: '50/s' },
  { plan: 'Pro', requests: '2.000/min', burst: '200/s' },
]

export default function APIDocsPage() {
  const [showKey, setShowKey] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [lang, setLang] = useState<'curl' | 'node' | 'python'>('node')

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
            <Code size={22} className="text-[#F26B2A]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-white">API & Documentação</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Integre a Worder com seus sistemas</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="#"
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors text-sm"
          >
            <BookOpen size={16} />
            Docs Completos
          </a>
        </div>
      </div>

      {/* API Keys */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Key size={16} className="text-[#F26B2A]" />
            API Keys
          </h3>
          <button className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-xs">
            <Plus size={14} />
            Nova Key
          </button>
        </div>
        <div className="space-y-3">
          {apiKeys.map((key) => (
            <div key={key.id} className="flex items-center justify-between bg-zinc-800/30 rounded-lg p-4">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm text-white font-medium">{key.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs text-zinc-400 font-mono">
                      {showKey === key.id ? 'wdr_live_sk_abc123def456' : key.key}
                    </code>
                    <button onClick={() => setShowKey(showKey === key.id ? null : key.id)}>
                      {showKey === key.id ? (
                        <EyeSlash size={14} className="text-zinc-500" />
                      ) : (
                        <Eye size={14} className="text-zinc-500" />
                      )}
                    </button>
                    <button onClick={() => handleCopy(key.key, key.id)}>
                      {copied === key.id ? (
                        <CheckCircle size={14} className="text-emerald-400" />
                      ) : (
                        <Copy size={14} className="text-zinc-500" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-500">Criada em {key.created}</p>
                <p className="text-xs text-zinc-600">Último uso: {key.lastUsed}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Start */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Terminal size={16} className="text-[#F26B2A]" />
          Quick Start
        </h3>
        <div className="flex gap-2 mb-4">
          {(['curl', 'node', 'python'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                lang === l ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {l === 'curl' ? 'cURL' : l === 'node' ? 'Node.js' : 'Python'}
            </button>
          ))}
        </div>
        <div className="relative">
          <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-xs text-zinc-400 overflow-x-auto leading-relaxed">
            {codeExamples[lang]}
          </pre>
          <button
            onClick={() => handleCopy(codeExamples[lang], 'code')}
            className="absolute top-3 right-3 p-1.5 bg-zinc-800 rounded-md hover:bg-zinc-700 transition-colors"
          >
            {copied === 'code' ? (
              <CheckCircle size={14} className="text-emerald-400" />
            ) : (
              <Copy size={14} className="text-zinc-400" />
            )}
          </button>
        </div>
      </div>

      {/* Endpoints */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Globe size={16} className="text-[#F26B2A]" />
          Endpoints Disponíveis
        </h3>
        <div className="space-y-2">
          {endpoints.map((ep, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-center gap-3 py-3 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20 px-2 rounded transition-colors"
            >
              <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${methodColors[ep.method]}`}>
                {ep.method}
              </span>
              <code className="text-sm text-white font-mono flex-1">{ep.path}</code>
              <span className="text-xs text-zinc-500 hidden md:block">{ep.description}</span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Rate Limits & Auth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Clock size={16} className="text-[#F26B2A]" />
            Rate Limits
          </h3>
          <div className="space-y-3">
            {rateLimits.map((rl) => (
              <div key={rl.plan} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                <span className="text-sm text-white font-medium">{rl.plan}</span>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-zinc-400">{rl.requests}</span>
                  <span className="text-xs text-zinc-600">burst: {rl.burst}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Lock size={16} className="text-[#F26B2A]" />
            Autenticação
          </h3>
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">Todas as requisições devem incluir o header:</p>
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
              <code className="text-xs text-zinc-400 font-mono">
                Authorization: Bearer {'<your-api-key>'}
              </code>
            </div>
            <p className="text-sm text-zinc-400">Base URL:</p>
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
              <code className="text-xs text-zinc-400 font-mono">
                https://api.worder.com.br/v1
              </code>
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
              <Lock size={12} />
              Todas as requisições usam HTTPS. HTTP não é suportado.
            </div>
          </div>
        </div>
      </div>

      {/* Webhooks */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Lightning size={16} className="text-[#F26B2A]" />
          Webhooks
        </h3>
        <p className="text-sm text-zinc-400 mb-4">
          Receba notificações em tempo real sobre eventos da sua conta.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            'contact.created', 'contact.updated',
            'campaign.sent', 'campaign.completed',
            'email.opened', 'email.clicked',
            'order.created', 'cart.abandoned',
          ].map((event) => (
            <div key={event} className="bg-zinc-800/30 rounded-lg p-3">
              <code className="text-xs text-[#F5A623] font-mono">{event}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
