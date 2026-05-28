'use client'

import { useState, useEffect } from 'react'
import {
  Smartphone, QrCode, Plus, Trash2, Loader2, Wifi, WifiOff, Copy, Check,
} from 'lucide-react'
import { useStoreStore } from '@/stores'

interface Instance {
  id: string
  title: string
  unique_id: string
  phone_number?: string
  status: 'GENERATING' | 'ACTIVE' | 'INACTIVE' | 'BANNED'
  online_status?: 'available' | 'unavailable'
  api_type: 'META' | 'EVOLUTION'
  qr_code?: string
  api_url?: string
}

interface InstancesTabProps {
  organizationId: string
}

/**
 * InstancesTab — Lista numeros conectados (Cloud + Evolution) e permite gerenciar.
 * Suporta multi-numero: cada WABA / instancia eh listada e administrada aqui.
 */
export function InstancesTab({ organizationId }: InstancesTabProps) {
  const { currentStore } = useStoreStore()
  const [instances, setInstances] = useState<Instance[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewInstance, setShowNewInstance] = useState(false)
  const [newInstanceTitle, setNewInstanceTitle] = useState('')
  const [evolutionUrl, setEvolutionUrl] = useState('')
  const [evolutionKey, setEvolutionKey] = useState('')
  const [qrLoading, setQrLoading] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/whatsapp/meta/webhook`
    : ''

  useEffect(() => {
    loadInstances()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, currentStore?.id])

  async function loadInstances() {
    setLoading(true)
    try {
      const res = await fetch(`/api/whatsapp/instances?organization_id=${organizationId}`)
      const data = await res.json()
      setInstances(data.instances || [])
    } catch (e) {
      console.error('Error loading instances:', e)
    } finally {
      setLoading(false)
    }
  }

  async function createInstance() {
    if (!newInstanceTitle) return
    try {
      const res = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          organization_id: organizationId,
          store_id: currentStore?.id,
          title: newInstanceTitle,
          api_type: 'EVOLUTION',
          api_url: evolutionUrl,
          api_key: evolutionKey,
        }),
      })
      const data = await res.json()
      if (data.instance) {
        setInstances([data.instance, ...instances])
        setShowNewInstance(false)
        setNewInstanceTitle('')
        setEvolutionUrl('')
        setEvolutionKey('')
      }
    } catch (e) {
      console.error('Error creating instance:', e)
    }
  }

  async function generateQR(instanceId: string) {
    setQrLoading(instanceId)
    try {
      const res = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'qr', instance_id: instanceId }),
      })
      const data = await res.json()
      if (data.qr_code) {
        setInstances(instances.map(i =>
          i.id === instanceId ? { ...i, qr_code: data.qr_code, status: 'GENERATING' } : i,
        ))
      } else if (data.status === 'ACTIVE') {
        setInstances(instances.map(i =>
          i.id === instanceId ? { ...i, status: 'ACTIVE', phone_number: data.phone_number } : i,
        ))
      }
    } catch (e) {
      console.error('Error generating QR:', e)
    } finally {
      setQrLoading(null)
    }
  }

  async function deleteInstance(instanceId: string) {
    if (!confirm('Tem certeza que deseja excluir esta instancia?')) return
    try {
      await fetch(`/api/whatsapp/instances?id=${instanceId}&organization_id=${organizationId}`, {
        method: 'DELETE',
      })
      setInstances(instances.filter(i => i.id !== instanceId))
    } catch (e) {
      console.error('Error deleting instance:', e)
    }
  }

  function copyWebhook() {
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-primary-500" />
          Numeros WhatsApp
        </h3>
      </div>

      {/* Webhook URL */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">URL do Webhook (Meta Business Suite)</h4>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-white px-3 py-2 rounded border text-sm font-mono break-all">{webhookUrl}</code>
          <button
            onClick={copyWebhook}
            className="px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 flex items-center gap-1"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
        <p className="text-xs text-blue-700 mt-2">
          Configure este URL no Meta Business Suite ao conectar um novo numero WhatsApp.
        </p>
      </div>

      {/* Adicionar Nova Instancia (Evolution / QR) */}
      {!showNewInstance ? (
        <button
          onClick={() => setShowNewInstance(true)}
          className="w-full p-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:text-gray-700 hover:border-primary-500 flex items-center justify-center gap-2 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Adicionar Conexao QR Code (Evolution)
        </button>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Nova Conexao</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Nome da Instancia</label>
              <input
                type="text"
                value={newInstanceTitle}
                onChange={e => setNewInstanceTitle(e.target.value)}
                placeholder="Ex: WhatsApp Principal"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Evolution API URL</label>
              <input
                type="text"
                value={evolutionUrl}
                onChange={e => setEvolutionUrl(e.target.value)}
                placeholder="Ex: https://evolution.seudominio.com"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Evolution API Key</label>
              <input
                type="password"
                value={evolutionKey}
                onChange={e => setEvolutionKey(e.target.value)}
                placeholder="Sua API Key"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-primary-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowNewInstance(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-600 font-medium rounded-xl hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                onClick={createInstance}
                className="flex-1 py-3 bg-primary-500 text-white font-medium rounded-xl hover:bg-primary-600"
              >
                Criar Instancia
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de Instancias */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      ) : instances.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <QrCode className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Nenhum numero conectado</p>
          <p className="text-xs mt-1">Adicione uma conexao Cloud (Meta API) ou Evolution (QR Code) acima.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {instances.map(instance => (
            <div key={instance.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl ${instance.status === 'ACTIVE' ? 'bg-green-100' : 'bg-gray-100'}`}>
                    {instance.status === 'ACTIVE' ? (
                      <Wifi className="w-5 h-5 text-green-600" />
                    ) : (
                      <WifiOff className="w-5 h-5 text-gray-500" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{instance.title}</h3>
                    <p className="text-sm text-gray-500">
                      {instance.phone_number || instance.unique_id}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {instance.api_type === 'META' ? 'Cloud API (Meta)' : 'Evolution (QR)'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    instance.status === 'ACTIVE'
                      ? 'bg-green-100 text-green-700'
                      : instance.status === 'GENERATING'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-600'
                  }`}>
                    {instance.status}
                  </span>
                  <button
                    onClick={() => deleteInstance(instance.id)}
                    className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* QR Code para instancias Evolution */}
              {instance.status !== 'ACTIVE' && instance.api_type === 'EVOLUTION' && (
                <div className="mt-4">
                  {instance.qr_code ? (
                    <div className="flex flex-col items-center p-4 bg-gray-50 rounded-xl">
                      <img
                        src={instance.qr_code.startsWith('data:') ? instance.qr_code : `data:image/png;base64,${instance.qr_code}`}
                        alt="QR Code"
                        className="w-64 h-64"
                      />
                      <p className="mt-2 text-sm text-gray-600">Escaneie com o WhatsApp</p>
                    </div>
                  ) : (
                    <button
                      onClick={() => generateQR(instance.id)}
                      disabled={qrLoading === instance.id}
                      className="w-full py-3 bg-primary-500 text-white font-medium rounded-xl hover:bg-primary-600 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {qrLoading === instance.id ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <QrCode className="w-5 h-5" />
                          Gerar QR Code
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default InstancesTab
