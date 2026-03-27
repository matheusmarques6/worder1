'use client'

import { useState, useRef } from 'react'
import {
  FileText,
  Plus,
  Upload,
  Download,
  Eye,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  ExternalLink,
  File,
} from 'lucide-react'
import type { InboxInvoice } from '@/types/inbox'

interface InvoicesTabProps {
  contactId: string
  invoices: InboxInvoice[]
  isLoading: boolean
  onUploadInvoice: (data: FormData) => Promise<void>
  onDeleteInvoice: (invoiceId: string) => Promise<void>
  onRefresh: () => void
}

// Helpers
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

const formatDate = (date?: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'issued':
      return { 
        label: 'Emitida', 
        color: 'text-green-400 bg-green-500/10',
        icon: CheckCircle 
      }
    case 'pending':
      return { 
        label: 'Pendente', 
        color: 'text-yellow-400 bg-yellow-500/10',
        icon: Clock 
      }
    case 'cancelled':
      return { 
        label: 'Cancelada', 
        color: 'text-red-400 bg-red-500/10',
        icon: XCircle 
      }
    case 'rejected':
      return { 
        label: 'Rejeitada', 
        color: 'text-red-400 bg-red-500/10',
        icon: AlertCircle 
      }
    default:
      return { 
        label: status, 
        color: 'text-gray-400 bg-gray-500/10',
        icon: FileText 
      }
  }
}

const getInvoiceTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    nfe: 'NF-e',
    nfce: 'NFC-e',
    nfse: 'NFS-e',
    outros: 'Outros',
  }
  return labels[type] || type.toUpperCase()
}

export function InvoicesTab({
  contactId,
  invoices,
  isLoading,
  onUploadInvoice,
  onDeleteInvoice,
  onRefresh,
}: InvoicesTabProps) {
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Calcular totais
  const totals = invoices.reduce((acc, inv) => ({
    count: acc.count + 1,
    value: acc.value + (inv.total_value || 0),
    issued: acc.issued + (inv.status === 'issued' ? 1 : 0),
  }), { count: 0, value: 0, issued: 0 })

  const handleDelete = async (invoiceId: string) => {
    if (!confirm('Tem certeza que deseja remover esta nota fiscal?')) return
    
    setDeletingId(invoiceId)
    try {
      await onDeleteInvoice(invoiceId)
      onRefresh()
    } finally {
      setDeletingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-900 flex items-center gap-2">
          <FileText className="w-4 h-4 text-brand-600" />
          Notas Fiscais
          {invoices.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-gray-100 rounded-md">
              {invoices.length}
            </span>
          )}
        </h4>
        <button
          onClick={() => setShowUploadModal(true)}
          className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Resumo */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-500">Total em NFs</p>
            <p className="text-lg font-semibold text-gray-900">{formatCurrency(totals.value)}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-500">Emitidas</p>
            <p className="text-lg font-semibold text-green-400">{totals.issued}</p>
          </div>
        </div>
      )}

      {/* Lista de NFs */}
      {invoices.length > 0 ? (
        <div className="space-y-2">
          {invoices.map(invoice => (
            <InvoiceCard
              key={invoice.id}
              invoice={invoice}
              onDelete={() => handleDelete(invoice.id)}
              isDeleting={deletingId === invoice.id}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 
                          flex items-center justify-center">
            <FileText className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 mb-3">Nenhuma nota fiscal</p>
          <button
            onClick={() => setShowUploadModal(true)}
            className="text-sm text-brand-600 hover:text-brand-500 font-medium"
          >
            Adicionar NF
          </button>
        </div>
      )}

      {/* Modal de Upload */}
      {showUploadModal && (
        <UploadInvoiceModal
          contactId={contactId}
          onClose={() => setShowUploadModal(false)}
          onUpload={async (data) => {
            await onUploadInvoice(data)
            setShowUploadModal(false)
            onRefresh()
          }}
        />
      )}
    </div>
  )
}

// Invoice Card Component
function InvoiceCard({
  invoice,
  onDelete,
  isDeleting,
}: {
  invoice: InboxInvoice
  onDelete: () => void
  isDeleting: boolean
}) {
  const statusConfig = getStatusConfig(invoice.status)
  const StatusIcon = statusConfig.icon

  return (
    <div className="p-3 bg-gray-50 rounded-xl">
      <div className="flex items-start gap-3">
        {/* Ícone */}
        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-brand-600" />
        </div>

        {/* Conteúdo */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-500">
              {getInvoiceTypeLabel(invoice.invoice_type)}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 ${statusConfig.color}`}>
              <StatusIcon className="w-3 h-3" />
              {statusConfig.label}
            </span>
          </div>

          <p className="text-sm text-white font-medium mb-1">
            {invoice.invoice_number || invoice.invoice_key?.slice(-8) || 'Sem número'}
          </p>

          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>{formatDate(invoice.issue_date)}</span>
            <span className="text-white font-medium">
              {formatCurrency(invoice.total_value || 0)}
            </span>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1">
          {invoice.pdf_url && (
            <a
              href={invoice.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-100 rounded-lg transition-colors"
              title="Ver PDF"
            >
              <Eye className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Remover"
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// Upload Invoice Modal
function UploadInvoiceModal({
  contactId,
  onClose,
  onUpload,
}: {
  contactId: string
  onClose: () => void
  onUpload: (data: FormData) => Promise<void>
}) {
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceType, setInvoiceType] = useState('nfe')
  const [invoiceKey, setInvoiceKey] = useState('')
  const [totalValue, setTotalValue] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      
      // Se for XML, tentar extrair dados
      if (selectedFile.name.endsWith('.xml')) {
        const reader = new FileReader()
        reader.onload = (event) => {
          try {
            const xmlText = event.target?.result as string
            // Extrair número da NF do XML (simplificado)
            const nNFMatch = xmlText.match(/<nNF>(\d+)<\/nNF>/)
            if (nNFMatch) setInvoiceNumber(nNFMatch[1])
            
            // Extrair chave de acesso
            const chaveMatch = xmlText.match(/<chNFe>(\d+)<\/chNFe>/) || xmlText.match(/Id="NFe(\d+)"/)
            if (chaveMatch) setInvoiceKey(chaveMatch[1])
            
            // Extrair valor total
            const valorMatch = xmlText.match(/<vNF>([\d.]+)<\/vNF>/)
            if (valorMatch) setTotalValue(valorMatch[1])
            
            // Extrair data de emissão
            const dataMatch = xmlText.match(/<dhEmi>(\d{4}-\d{2}-\d{2})/)
            if (dataMatch) setIssueDate(dataMatch[1])
          } catch (err) {
            console.warn('Erro ao parsear XML:', err)
          }
        }
        reader.readAsText(selectedFile)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const formData = new FormData()
    formData.append('contact_id', contactId)
    formData.append('invoice_number', invoiceNumber)
    formData.append('invoice_type', invoiceType)
    formData.append('invoice_key', invoiceKey)
    formData.append('total_value', totalValue)
    formData.append('issue_date', issueDate)
    formData.append('notes', notes)
    formData.append('status', 'issued')
    if (file) {
      formData.append('file', file)
    }

    setIsSubmitting(true)
    try {
      await onUpload(formData)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-gray-200 sticky top-0 bg-white">
          <h3 className="text-lg font-semibold text-gray-900">Adicionar Nota Fiscal</h3>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Upload de arquivo */}
          <div>
            <label className="block text-sm text-gray-500 mb-2">
              Arquivo (PDF ou XML)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xml"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`w-full p-4 border-2 border-dashed rounded-xl transition-colors ${
                file 
                  ? 'border-primary-500 bg-brand-50' 
                  : 'border-gray-300 hover:border-gray-300'
              }`}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2 text-brand-600">
                  <File className="w-5 h-5" />
                  <span className="text-sm">{file.name}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-gray-500">
                  <Upload className="w-6 h-6" />
                  <span className="text-sm">Clique para selecionar</span>
                </div>
              )}
            </button>
            <p className="text-xs text-gray-400 mt-1">
              XMLs terão os dados extraídos automaticamente
            </p>
          </div>

          {/* Tipo e Número */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Tipo</label>
              <select
                value={invoiceType}
                onChange={(e) => setInvoiceType(e.target.value)}
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg 
                           text-white focus:outline-none focus:border-primary-500"
              >
                <option value="nfe">NF-e</option>
                <option value="nfce">NFC-e</option>
                <option value="nfse">NFS-e</option>
                <option value="outros">Outros</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Número</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="123456"
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg 
                           text-white placeholder:text-gray-400 focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          {/* Chave de Acesso */}
          <div>
            <label className="block text-sm text-gray-500 mb-1">Chave de Acesso</label>
            <input
              type="text"
              value={invoiceKey}
              onChange={(e) => setInvoiceKey(e.target.value)}
              placeholder="44 dígitos"
              maxLength={44}
              className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg 
                         text-white placeholder:text-gray-400 focus:outline-none focus:border-primary-500
                         font-mono text-sm"
            />
          </div>

          {/* Valor e Data */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Valor Total</label>
              <input
                type="number"
                step="0.01"
                value={totalValue}
                onChange={(e) => setTotalValue(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg 
                           text-white placeholder:text-gray-400 focus:outline-none focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Data Emissão</label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg 
                           text-white focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-sm text-gray-500 mb-1">Observações</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anotações sobre esta NF..."
              rows={2}
              className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg 
                         text-white placeholder:text-gray-400 focus:outline-none focus:border-primary-500
                         resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-100 text-white rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-primary-500 text-white rounded-lg 
                         hover:bg-primary-600 transition-colors disabled:opacity-50
                         flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Adicionar
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default InvoicesTab
