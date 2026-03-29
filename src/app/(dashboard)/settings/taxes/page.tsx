'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Settings,
  DollarSign,
  Percent,
  CreditCard,
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
  Info,
} from 'lucide-react'

interface TaxSettings {
  default_cost_percentage: number
  default_cost_currency: string
  payment_gateway_fee: number
  payment_fixed_fee: number
  sales_tax_percentage: number
  marketplace_fee: number
  default_shipping_cost: number
  monthly_fixed_costs: number
}

interface CustomFee {
  id?: string
  name: string
  description: string
  fee_type: 'percentage' | 'fixed'
  fee_value: number
  applies_to: string
  per_order: boolean
  is_active: boolean
}

const CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP', 'CNY']

const InfoTooltip = ({ text }: { text: string }) => (
  <div className="group relative inline-block ml-1">
    <Info className="w-4 h-4 text-gray-400 cursor-help" />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-100 rounded-lg text-xs text-gray-900 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-dark-700" />
    </div>
  </div>
)

const InputField = ({
  label,
  value,
  onChange,
  type = 'number',
  prefix,
  suffix,
  tooltip,
  step = '0.01',
}: {
  label: string
  value: number | string
  onChange: (value: string) => void
  type?: string
  prefix?: string
  suffix?: string
  tooltip?: string
  step?: string
}) => (
  <div>
    <label className="flex items-center text-sm text-gray-500 mb-2">
      {label}
      {tooltip && <InfoTooltip text={tooltip} />}
    </label>
    <div className="relative">
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{prefix}</span>
      )}
      <input
        type={type}
        step={step}
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-orange-500 ${
          prefix ? 'pl-10' : ''
        } ${suffix ? 'pr-10' : ''}`}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{suffix}</span>
      )}
    </div>
  </div>
)

const CustomFeeModal = ({
  fee,
  onSave,
  onClose,
}: {
  fee?: CustomFee
  onSave: (fee: CustomFee) => void
  onClose: () => void
}) => {
  const [formData, setFormData] = useState<CustomFee>(
    fee || {
      name: '',
      description: '',
      fee_type: 'percentage',
      fee_value: 0,
      applies_to: 'revenue',
      per_order: true,
      is_active: true,
    }
  )

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative bg-white rounded-2xl border border-gray-200 p-6 w-full max-w-md"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-900">
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-semibold text-gray-900 mb-6">
          {fee?.id ? 'Editar Taxa' : 'Nova Taxa Customizada'}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-500 mb-2">Nome da Taxa</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Taxa Shopify, Embalagem"
              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-2">Descrição (opcional)</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descrição da taxa"
              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-2">Tipo</label>
              <select
                value={formData.fee_type}
                onChange={(e) => setFormData({ ...formData, fee_type: e.target.value as 'percentage' | 'fixed' })}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-orange-500"
              >
                <option value="percentage">Porcentagem (%)</option>
                <option value="fixed">Valor Fixo (R$)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-2">Valor</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.fee_value}
                  onChange={(e) => setFormData({ ...formData, fee_value: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-orange-500 pr-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {formData.fee_type === 'percentage' ? '%' : 'R$'}
                </span>
              </div>
            </div>
          </div>

          {formData.fee_type === 'percentage' && (
            <div>
              <label className="block text-sm text-gray-500 mb-2">Aplicar sobre</label>
              <select
                value={formData.applies_to}
                onChange={(e) => setFormData({ ...formData, applies_to: e.target.value })}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-orange-500"
              >
                <option value="revenue">Receita Total</option>
                <option value="subtotal">Subtotal (sem frete)</option>
                <option value="shipping">Apenas Frete</option>
              </select>
            </div>
          )}

          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-gray-500">Taxa ativa</span>
            <button
              onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
              className={`w-12 h-6 rounded-full transition-colors ${
                formData.is_active ? 'bg-orange-500' : 'bg-gray-100'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  formData.is_active ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <button
            onClick={() => onSave(formData)}
            disabled={!formData.name}
            className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            Salvar Taxa
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function TaxSettingsPage() {
  const [settings, setSettings] = useState<TaxSettings>({
    default_cost_percentage: 35,
    default_cost_currency: 'BRL',
    payment_gateway_fee: 0,
    payment_fixed_fee: 0,
    sales_tax_percentage: 0,
    marketplace_fee: 0,
    default_shipping_cost: 0,
    monthly_fixed_costs: 0,
  })
  const [customFees, setCustomFees] = useState<CustomFee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editingFee, setEditingFee] = useState<CustomFee | null>(null)
  const [showFeeModal, setShowFeeModal] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/settings/taxes')
      const data = await response.json()

      if (response.ok) {
        setSettings(data.settings)
        setCustomFees(data.customFees || [])
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const saveSettings = async () => {
    try {
      setIsSaving(true)
      const response = await fetch('/api/settings/taxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      if (response.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch (error) {
      console.error('Error saving settings:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const saveCustomFee = async (fee: CustomFee) => {
    try {
      const response = await fetch('/api/settings/taxes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: fee.id ? 'update' : 'create',
          fee,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (fee.id) {
          setCustomFees(prev => prev.map(f => f.id === fee.id ? data.fee : f))
        } else {
          setCustomFees(prev => [...prev, data.fee])
        }
        setShowFeeModal(false)
        setEditingFee(null)
      }
    } catch (error) {
      console.error('Error saving custom fee:', error)
    }
  }

  const deleteCustomFee = async (feeId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta taxa?')) return

    try {
      const response = await fetch('/api/settings/taxes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          fee: { id: feeId },
        }),
      })

      if (response.ok) {
        setCustomFees(prev => prev.filter(f => f.id !== feeId))
      }
    } catch (error) {
      console.error('Error deleting custom fee:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configurações de Taxas</h1>
          <p className="text-gray-500 mt-1">Configure as taxas para cálculo de lucro real</p>
        </div>

        <button
          onClick={saveSettings}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-100 text-white rounded-xl font-medium transition-colors"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saved ? 'Salvo!' : 'Salvar Configurações'}
        </button>
      </div>

      {/* Custo Padrão */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 bg-white rounded-2xl border border-gray-200"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-orange-50">
            <Percent className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Custo Padrão</h2>
            <p className="text-sm text-gray-500">Para produtos sem custo cadastrado</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InputField
            label="Porcentagem do Preço de Venda"
            value={settings.default_cost_percentage}
            onChange={(v) => setSettings({ ...settings, default_cost_percentage: parseFloat(v) || 0 })}
            suffix="%"
            tooltip="Porcentagem do preço de venda que será considerada como custo para produtos sem custo cadastrado"
          />

          <div>
            <label className="block text-sm text-gray-500 mb-2">Moeda Padrão para Custos</label>
            <select
              value={settings.default_cost_currency}
              onChange={(e) => setSettings({ ...settings, default_cost_currency: e.target.value })}
              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-orange-500"
            >
              {CURRENCIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </motion.div>

      {/* Taxas de Pagamento */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="p-6 bg-white rounded-2xl border border-gray-200"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-green-500/20">
            <CreditCard className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Taxas de Pagamento</h2>
            <p className="text-sm text-gray-500">Gateway de pagamento e taxas por transação</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InputField
            label="Taxa do Gateway (%)"
            value={settings.payment_gateway_fee}
            onChange={(v) => setSettings({ ...settings, payment_gateway_fee: parseFloat(v) || 0 })}
            suffix="%"
            tooltip="Taxa percentual cobrada pelo gateway (ex: Mercado Pago, PagSeguro)"
          />

          <InputField
            label="Taxa Fixa por Transação"
            value={settings.payment_fixed_fee}
            onChange={(v) => setSettings({ ...settings, payment_fixed_fee: parseFloat(v) || 0 })}
            prefix="R$"
            tooltip="Valor fixo cobrado por cada transação"
          />
        </div>
      </motion.div>

      {/* Outras Taxas */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="p-6 bg-white rounded-2xl border border-gray-200"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-orange-500/20">
            <DollarSign className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Outras Taxas</h2>
            <p className="text-sm text-gray-500">Impostos, marketplace e custos fixos</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InputField
            label="Impostos sobre Vendas (%)"
            value={settings.sales_tax_percentage}
            onChange={(v) => setSettings({ ...settings, sales_tax_percentage: parseFloat(v) || 0 })}
            suffix="%"
            tooltip="Porcentagem de impostos sobre as vendas (ICMS, ISS, etc)"
          />

          <InputField
            label="Taxa de Marketplace (%)"
            value={settings.marketplace_fee}
            onChange={(v) => setSettings({ ...settings, marketplace_fee: parseFloat(v) || 0 })}
            suffix="%"
            tooltip="Taxa cobrada por marketplaces (Shopify, etc)"
          />

          <InputField
            label="Custo de Frete Padrão"
            value={settings.default_shipping_cost}
            onChange={(v) => setSettings({ ...settings, default_shipping_cost: parseFloat(v) || 0 })}
            prefix="R$"
            tooltip="Custo médio de frete quando não informado no pedido"
          />

          <InputField
            label="Custos Fixos Mensais"
            value={settings.monthly_fixed_costs}
            onChange={(v) => setSettings({ ...settings, monthly_fixed_costs: parseFloat(v) || 0 })}
            prefix="R$"
            tooltip="Custos fixos mensais que serão rateados pelos pedidos"
          />
        </div>
      </motion.div>

      {/* Taxas Customizadas */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="p-6 bg-white rounded-2xl border border-gray-200"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Settings className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Taxas Customizadas</h2>
              <p className="text-sm text-gray-500">Adicione taxas específicas do seu negócio</p>
            </div>
          </div>

          <button
            onClick={() => { setEditingFee(null); setShowFeeModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Adicionar Taxa
          </button>
        </div>

        {customFees.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>Nenhuma taxa customizada cadastrada</p>
          </div>
        ) : (
          <div className="space-y-3">
            {customFees.map((fee) => (
              <div
                key={fee.id}
                className="flex items-center justify-between p-4 bg-white rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${fee.is_active ? 'bg-green-400' : 'bg-gray-400'}`} />
                  <div>
                    <p className="font-medium text-gray-900">{fee.name}</p>
                    <p className="text-sm text-gray-500">
                      {fee.fee_type === 'percentage'
                        ? `${fee.fee_value}% sobre ${fee.applies_to === 'revenue' ? 'receita' : fee.applies_to === 'subtotal' ? 'subtotal' : 'frete'}`
                        : `R$ ${fee.fee_value.toFixed(2)} por ${fee.per_order ? 'pedido' : 'item'}`
                      }
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditingFee(fee); setShowFeeModal(true); }}
                    className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => fee.id && deleteCustomFee(fee.id)}
                    className="p-2 hover:bg-red-500/20 rounded-lg text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Fee Modal */}
      {showFeeModal && (
        <CustomFeeModal
          fee={editingFee || undefined}
          onSave={saveCustomFee}
          onClose={() => { setShowFeeModal(false); setEditingFee(null); }}
        />
      )}
    </div>
  )
}
