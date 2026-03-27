'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  Upload,
  ArrowLeft,
  FileText,
  FileCsv,
  CheckCircle,
  Warning,
  XCircle,
  ArrowRight,
  DownloadSimple,
  Lightning,
  UsersThree,
  MagnifyingGlass,
  Tag,
} from '@phosphor-icons/react'

const steps = [
  { id: 1, title: 'Upload', description: 'Envie seu arquivo' },
  { id: 2, title: 'Mapeamento', description: 'Mapeie os campos' },
  { id: 3, title: 'Revisão', description: 'Confirme a importação' },
]

const sampleFields = [
  { csvColumn: 'email', mappedTo: 'email', status: 'mapped' },
  { csvColumn: 'nome', mappedTo: 'first_name', status: 'mapped' },
  { csvColumn: 'sobrenome', mappedTo: 'last_name', status: 'mapped' },
  { csvColumn: 'telefone', mappedTo: 'phone', status: 'mapped' },
  { csvColumn: 'cidade', mappedTo: 'city', status: 'mapped' },
  { csvColumn: 'data_compra', mappedTo: '—', status: 'unmapped' },
  { csvColumn: 'valor_total', mappedTo: '—', status: 'unmapped' },
]

const worderFields = ['email', 'first_name', 'last_name', 'phone', 'city', 'state', 'country', 'tags', 'custom_1', 'custom_2', 'Ignorar']

const recentImports = [
  { id: '1', file: 'clientes_shopify_mar.csv', contacts: 2450, new: 1840, updated: 610, failed: 12, date: '10 Mar 2026', status: 'completed' },
  { id: '2', file: 'leads_instagram.csv', contacts: 890, new: 856, updated: 34, failed: 0, date: '05 Mar 2026', status: 'completed' },
  { id: '3', file: 'newsletter_backup.csv', contacts: 5200, new: 3100, updated: 2080, failed: 20, date: '01 Mar 2026', status: 'completed' },
]

export default function ContactsImportPage() {
  const [currentStep, setCurrentStep] = useState(1)
  const [hasFile, setHasFile] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>(['Importação Mar/2026'])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/contacts" className="p-2 rounded-lg hover:bg-zinc-800 transition-colors">
            <ArrowLeft size={18} className="text-zinc-400" />
          </Link>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Upload size={22} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-white">Importar Contatos</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Importe contatos via CSV ou planilha</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-xs">
          <DownloadSimple size={14} />
          Baixar Modelo CSV
        </button>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-4">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-center gap-3 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              currentStep > step.id ? 'bg-emerald-500 text-white' :
              currentStep === step.id ? 'bg-[#F26B2A] text-white' :
              'bg-zinc-800 text-zinc-500'
            }`}>
              {currentStep > step.id ? <CheckCircle size={18} weight="fill" /> : step.id}
            </div>
            <div className="flex-1">
              <p className={`text-sm font-medium ${currentStep >= step.id ? 'text-white' : 'text-zinc-500'}`}>{step.title}</p>
              <p className="text-xs text-zinc-600">{step.description}</p>
            </div>
            {i < steps.length - 1 && <div className={`h-px flex-1 ${currentStep > step.id ? 'bg-emerald-500' : 'bg-zinc-800'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <div
            onClick={() => setHasFile(true)}
            className="border-2 border-dashed border-zinc-700 rounded-xl p-12 flex flex-col items-center justify-center hover:border-[#F26B2A]/50 transition-colors cursor-pointer"
          >
            {!hasFile ? (
              <>
                <FileCsv size={48} className="text-zinc-600 mb-3" />
                <p className="text-sm text-zinc-400 mb-1">Arraste seu arquivo CSV aqui ou clique para selecionar</p>
                <p className="text-xs text-zinc-600">Suporta CSV, XLS, XLSX — Máximo 50MB / 100.000 linhas</p>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <FileCsv size={32} className="text-emerald-400" />
                <div>
                  <p className="text-sm text-white font-medium">clientes_loja_mar2026.csv</p>
                  <p className="text-xs text-zinc-500">3.420 linhas · 245 KB</p>
                </div>
                <CheckCircle size={20} className="text-emerald-400" weight="fill" />
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Configurações de Importação</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Comportamento para duplicados</label>
                <select className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F26B2A]">
                  <option>Atualizar existentes</option>
                  <option>Pular duplicados</option>
                  <option>Criar duplicados</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Tags automáticas</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={selectedTags.join(', ')}
                    readOnly
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                  />
                  <button className="p-2 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700">
                    <Tag size={16} className="text-zinc-400" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Mapping */}
      {currentStep === 2 && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Mapeamento de Campos</h3>
          <p className="text-xs text-zinc-500 mb-4">Mapeamos automaticamente os campos detectados. Revise e ajuste se necessário.</p>
          <div className="space-y-2">
            {sampleFields.map((field) => (
              <div key={field.csvColumn} className="flex items-center gap-4 py-2 border-b border-zinc-800/50 last:border-0">
                <div className="w-40">
                  <code className="text-xs text-zinc-300 bg-zinc-800 px-2 py-1 rounded font-mono">{field.csvColumn}</code>
                </div>
                <ArrowRight size={14} className="text-zinc-600" />
                <select className={`flex-1 bg-zinc-800 border rounded-lg px-3 py-1.5 text-sm focus:outline-none ${
                  field.status === 'mapped' ? 'border-emerald-500/30 text-white' : 'border-yellow-500/30 text-yellow-400'
                }`}>
                  {worderFields.map((wf) => (
                    <option key={wf} selected={wf === field.mappedTo}>{wf}</option>
                  ))}
                </select>
                {field.status === 'mapped' ? (
                  <CheckCircle size={16} className="text-emerald-400" weight="fill" />
                ) : (
                  <Warning size={16} className="text-yellow-400" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {currentStep === 3 && (
        <div className="space-y-4">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-white mb-4">Resumo da Importação</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-zinc-800/30 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-white">3.420</p>
                <p className="text-xs text-zinc-500">Total de linhas</p>
              </div>
              <div className="bg-zinc-800/30 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-emerald-400">2.680</p>
                <p className="text-xs text-zinc-500">Novos contatos</p>
              </div>
              <div className="bg-zinc-800/30 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-blue-400">720</p>
                <p className="text-xs text-zinc-500">Atualizações</p>
              </div>
              <div className="bg-zinc-800/30 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-red-400">20</p>
                <p className="text-xs text-zinc-500">Erros (ignorados)</p>
              </div>
            </div>
          </div>

          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle size={18} className="text-emerald-400 mt-0.5" weight="fill" />
            <div>
              <p className="text-sm text-emerald-400 font-medium">Pronto para importar</p>
              <p className="text-xs text-zinc-500">5 campos mapeados, 2 campos ignorados. Tags: Importação Mar/2026</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => currentStep > 1 && setCurrentStep(currentStep - 1)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
            currentStep > 1 ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'invisible'
          }`}
        >
          <ArrowLeft size={16} />
          Voltar
        </button>
        {currentStep < 3 ? (
          <button
            onClick={() => hasFile && setCurrentStep(currentStep + 1)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              hasFile ? 'bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white hover:opacity-90' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            Próximo
            <ArrowRight size={16} />
          </button>
        ) : (
          <button className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium">
            <Lightning size={16} />
            Iniciar Importação
          </button>
        )}
      </div>

      {/* Recent Imports */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Importações Recentes</h3>
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left text-xs text-zinc-500 font-medium pb-3">Arquivo</th>
              <th className="text-right text-xs text-zinc-500 font-medium pb-3">Contatos</th>
              <th className="text-right text-xs text-zinc-500 font-medium pb-3">Novos</th>
              <th className="text-right text-xs text-zinc-500 font-medium pb-3">Atualizados</th>
              <th className="text-right text-xs text-zinc-500 font-medium pb-3">Erros</th>
              <th className="text-right text-xs text-zinc-500 font-medium pb-3">Data</th>
            </tr>
          </thead>
          <tbody>
            {recentImports.map((imp) => (
              <tr key={imp.id} className="border-b border-zinc-800/50">
                <td className="py-3 text-sm text-white flex items-center gap-2">
                  <FileCsv size={16} className="text-emerald-400" />
                  {imp.file}
                </td>
                <td className="py-3 text-sm text-zinc-400 text-right">{imp.contacts.toLocaleString('pt-BR')}</td>
                <td className="py-3 text-sm text-emerald-400 text-right">{imp.new.toLocaleString('pt-BR')}</td>
                <td className="py-3 text-sm text-blue-400 text-right">{imp.updated.toLocaleString('pt-BR')}</td>
                <td className="py-3 text-sm text-right">{imp.failed > 0 ? <span className="text-red-400">{imp.failed}</span> : <span className="text-zinc-600">0</span>}</td>
                <td className="py-3 text-sm text-zinc-500 text-right">{imp.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
