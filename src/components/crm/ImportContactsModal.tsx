'use client'

// =============================================
// Import Contacts Modal
// src/components/crm/ImportContactsModal.tsx
// =============================================

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Tag,
  RefreshCw,
} from 'lucide-react'
import { useAuthStore } from '@/stores'

interface ColumnMapping {
  [csvColumn: string]: string
}

interface ImportContactsModalProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete?: () => void
}

const DB_COLUMNS = [
  { key: 'email', label: 'Email', required: false },
  { key: 'phone', label: 'Telefone', required: false },
  { key: 'first_name', label: 'Nome', required: false },
  { key: 'last_name', label: 'Sobrenome', required: false },
  { key: 'company', label: 'Empresa', required: false },
  { key: 'tags', label: 'Tags', required: false },
  { key: '_skip', label: '(Ignorar)', required: false },
]

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split('\n')
  if (lines.length === 0) return { headers: [], rows: [] }
  
  // Detectar separador
  const firstLine = lines[0]
  const separator = firstLine.includes(';') ? ';' : ','
  
  const headers = firstLine.split(separator).map(h => h.trim().replace(/^"|"$/g, ''))
  
  const rows = lines.slice(1).map(line => {
    const values = line.split(separator).map(v => v.trim().replace(/^"|"$/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = values[index] || ''
    })
    return row
  }).filter(row => Object.values(row).some(v => v !== ''))
  
  return { headers, rows }
}

export function ImportContactsModal({
  isOpen,
  onClose,
  onImportComplete,
}: ImportContactsModalProps) {
  const { user } = useAuthStore()
  const organizationId = user?.organization_id
  
  const [step, setStep] = useState<'upload' | 'mapping' | 'options' | 'importing' | 'done'>('upload')
  const [csvData, setCsvData] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null)
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({})
  const [options, setOptions] = useState({
    skipDuplicates: true,
    duplicateField: 'email' as 'email' | 'phone',
    updateExisting: false,
    defaultTags: [] as string[],
  })
  const [newTag, setNewTag] = useState('')
  const [importResult, setImportResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const data = parseCSV(text)
      setCsvData(data)
      
      // Auto-mapear colunas conhecidas
      const autoMapping: ColumnMapping = {}
      data.headers.forEach(header => {
        const normalizedHeader = header.toLowerCase().trim()
        
        if (['email', 'e-mail', 'e_mail', 'mail'].includes(normalizedHeader)) {
          autoMapping[header] = 'email'
        } else if (['phone', 'telefone', 'tel', 'celular', 'mobile', 'whatsapp'].includes(normalizedHeader)) {
          autoMapping[header] = 'phone'
        } else if (['first_name', 'firstname', 'nome', 'name', 'primeiro nome'].includes(normalizedHeader)) {
          autoMapping[header] = 'first_name'
        } else if (['last_name', 'lastname', 'sobrenome', 'surname', 'último nome'].includes(normalizedHeader)) {
          autoMapping[header] = 'last_name'
        } else if (['company', 'empresa', 'organization', 'org'].includes(normalizedHeader)) {
          autoMapping[header] = 'company'
        } else if (['tags', 'tag', 'labels'].includes(normalizedHeader)) {
          autoMapping[header] = 'tags'
        }
      })
      
      setColumnMapping(autoMapping)
      setStep('mapping')
    }
    reader.readAsText(file)
  }, [])
  
  const handleMappingChange = (csvColumn: string, dbColumn: string) => {
    setColumnMapping(prev => ({
      ...prev,
      [csvColumn]: dbColumn,
    }))
  }
  
  const handleAddTag = () => {
    if (newTag.trim() && !options.defaultTags.includes(newTag.trim())) {
      setOptions(prev => ({
        ...prev,
        defaultTags: [...prev.defaultTags, newTag.trim()],
      }))
      setNewTag('')
    }
  }
  
  const handleRemoveTag = (tag: string) => {
    setOptions(prev => ({
      ...prev,
      defaultTags: prev.defaultTags.filter(t => t !== tag),
    }))
  }
  
  const handleImport = async () => {
    if (!organizationId || !csvData) return
    
    setLoading(true)
    setStep('importing')
    
    try {
      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          contacts: csvData.rows,
          columnMapping,
          options,
        }),
      })
      
      const result = await res.json()
      setImportResult(result)
      setStep('done')
      
      if (result.success) {
        onImportComplete?.()
      }
    } catch (error) {
      console.error('Import error:', error)
      setImportResult({ success: false, error: 'Erro ao importar contatos' })
      setStep('done')
    } finally {
      setLoading(false)
    }
  }
  
  const handleClose = () => {
    setStep('upload')
    setCsvData(null)
    setColumnMapping({})
    setImportResult(null)
    setOptions({
      skipDuplicates: true,
      duplicateField: 'email',
      updateExisting: false,
      defaultTags: [],
    })
    onClose()
  }
  
  if (!isOpen) return null
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-dark-900 rounded-2xl border border-dark-700 w-full max-w-3xl max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-dark-700">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary-500/20">
                <Upload className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Importar Contatos</h2>
                <p className="text-sm text-dark-400">
                  {step === 'upload' && 'Faça upload de um arquivo CSV'}
                  {step === 'mapping' && 'Mapeie as colunas do arquivo'}
                  {step === 'options' && 'Configure as opções de importação'}
                  {step === 'importing' && 'Importando contatos...'}
                  {step === 'done' && 'Importação concluída'}
                </p>
              </div>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-dark-800 rounded-lg transition-colors">
              <X className="w-5 h-5 text-dark-400" />
            </button>
          </div>
          
          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[60vh]">
            {/* Step: Upload */}
            {step === 'upload' && (
              <div className="text-center py-8">
                <label className="cursor-pointer">
                  <div className="w-full p-12 border-2 border-dashed border-dark-600 rounded-xl hover:border-primary-500/50 transition-colors">
                    <FileSpreadsheet className="w-16 h-16 text-dark-400 mx-auto mb-4" />
                    <p className="text-white font-medium mb-2">Arraste um arquivo CSV aqui</p>
                    <p className="text-dark-400 text-sm mb-4">ou clique para selecionar</p>
                    <span className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm">
                      Selecionar arquivo
                    </span>
                  </div>
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                
                <div className="mt-6 text-left p-4 bg-dark-800 rounded-xl">
                  <h3 className="text-sm font-medium text-white mb-2">Formato esperado:</h3>
                  <ul className="text-sm text-dark-400 space-y-1">
                    <li>• Arquivo CSV separado por vírgula ou ponto-e-vírgula</li>
                    <li>• Primeira linha deve conter os nomes das colunas</li>
                    <li>• Cada contato deve ter email ou telefone</li>
                  </ul>
                </div>
              </div>
            )}
            
            {/* Step: Mapping */}
            {step === 'mapping' && csvData && (
              <div className="space-y-6">
                <div className="p-4 bg-dark-800 rounded-xl">
                  <p className="text-sm text-dark-400">
                    <strong className="text-white">{csvData.rows.length}</strong> contatos encontrados no arquivo
                  </p>
                </div>
                
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-white">Mapeamento de colunas:</h3>
                  {csvData.headers.map(header => (
                    <div key={header} className="flex items-center gap-4 p-3 bg-dark-800 rounded-lg">
                      <div className="flex-1">
                        <span className="text-sm text-white">{header}</span>
                        <span className="text-xs text-dark-500 ml-2">
                          Ex: {csvData.rows[0]?.[header] || '-'}
                        </span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-dark-500" />
                      <select
                        value={columnMapping[header] || '_skip'}
                        onChange={(e) => handleMappingChange(header, e.target.value)}
                        className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                      >
                        {DB_COLUMNS.map(col => (
                          <option key={col.key} value={col.key}>{col.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                
                {/* Preview */}
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-white mb-3">Preview (primeiros 3 contatos):</h3>
                  <div className="bg-dark-800 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-dark-700">
                        <tr>
                          {Object.entries(columnMapping)
                            .filter(([_, v]) => v !== '_skip')
                            .map(([_, dbCol]) => (
                              <th key={dbCol} className="px-4 py-2 text-left text-dark-400 font-medium">
                                {DB_COLUMNS.find(c => c.key === dbCol)?.label}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvData.rows.slice(0, 3).map((row, index) => (
                          <tr key={index} className="border-t border-dark-700">
                            {Object.entries(columnMapping)
                              .filter(([_, v]) => v !== '_skip')
                              .map(([csvCol]) => (
                                <td key={csvCol} className="px-4 py-2 text-white">
                                  {row[csvCol] || '-'}
                                </td>
                              ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            
            {/* Step: Options */}
            {step === 'options' && (
              <div className="space-y-6">
                {/* Duplicatas */}
                <div className="p-4 bg-dark-800 rounded-xl space-y-4">
                  <h3 className="text-sm font-medium text-white">Tratamento de duplicados</h3>
                  
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={options.skipDuplicates}
                      onChange={(e) => setOptions(prev => ({ ...prev, skipDuplicates: e.target.checked }))}
                      className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-sm text-dark-300">Ignorar contatos que já existem</span>
                  </label>
                  
                  {options.skipDuplicates && (
                    <div className="ml-7">
                      <label className="text-xs text-dark-400 mb-2 block">Detectar duplicado por:</label>
                      <select
                        value={options.duplicateField}
                        onChange={(e) => setOptions(prev => ({ ...prev, duplicateField: e.target.value as any }))}
                        className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                      >
                        <option value="email">Email</option>
                        <option value="phone">Telefone</option>
                      </select>
                    </div>
                  )}
                  
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={options.updateExisting}
                      onChange={(e) => setOptions(prev => ({ ...prev, updateExisting: e.target.checked }))}
                      className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-sm text-dark-300">Atualizar contatos existentes</span>
                  </label>
                </div>
                
                {/* Tags */}
                <div className="p-4 bg-dark-800 rounded-xl space-y-4">
                  <h3 className="text-sm font-medium text-white">Tags padrão</h3>
                  <p className="text-xs text-dark-400">Adicione tags a todos os contatos importados</p>
                  
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                      placeholder="Digite uma tag..."
                      className="flex-1 bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                    />
                    <button
                      onClick={handleAddTag}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-500 transition-colors"
                    >
                      Adicionar
                    </button>
                  </div>
                  
                  {options.defaultTags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {options.defaultTags.map(tag => (
                        <span
                          key={tag}
                          className="flex items-center gap-1 px-3 py-1 bg-primary-500/20 text-primary-400 rounded-full text-sm"
                        >
                          <Tag className="w-3 h-3" />
                          {tag}
                          <button
                            onClick={() => handleRemoveTag(tag)}
                            className="ml-1 hover:text-primary-300"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Step: Importing */}
            {step === 'importing' && (
              <div className="text-center py-12">
                <RefreshCw className="w-12 h-12 text-primary-400 animate-spin mx-auto mb-4" />
                <p className="text-white font-medium">Importando contatos...</p>
                <p className="text-dark-400 text-sm">Isso pode levar alguns segundos</p>
              </div>
            )}
            
            {/* Step: Done */}
            {step === 'done' && importResult && (
              <div className="text-center py-8">
                {importResult.success ? (
                  <>
                    <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">Importação concluída!</h3>
                    <p className="text-dark-400 mb-6">{importResult.message}</p>
                    
                    <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
                      <div className="p-4 bg-dark-800 rounded-xl">
                        <p className="text-2xl font-bold text-green-400">{importResult.summary?.inserted || 0}</p>
                        <p className="text-xs text-dark-400">Importados</p>
                      </div>
                      <div className="p-4 bg-dark-800 rounded-xl">
                        <p className="text-2xl font-bold text-yellow-400">{importResult.summary?.duplicates || 0}</p>
                        <p className="text-xs text-dark-400">Duplicados</p>
                      </div>
                      <div className="p-4 bg-dark-800 rounded-xl">
                        <p className="text-2xl font-bold text-red-400">{importResult.summary?.invalid || 0}</p>
                        <p className="text-xs text-dark-400">Inválidos</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">Erro na importação</h3>
                    <p className="text-dark-400">{importResult.error}</p>
                  </>
                )}
              </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-dark-700">
            {step === 'upload' && (
              <button onClick={handleClose} className="px-4 py-2 text-dark-400 hover:text-white transition-colors">
                Cancelar
              </button>
            )}
            
            {step === 'mapping' && (
              <>
                <button 
                  onClick={() => setStep('upload')}
                  className="px-4 py-2 text-dark-400 hover:text-white transition-colors"
                >
                  Voltar
                </button>
                <button
                  onClick={() => setStep('options')}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
                >
                  Continuar
                </button>
              </>
            )}
            
            {step === 'options' && (
              <>
                <button 
                  onClick={() => setStep('mapping')}
                  className="px-4 py-2 text-dark-400 hover:text-white transition-colors"
                >
                  Voltar
                </button>
                <button
                  onClick={handleImport}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
                >
                  Importar {csvData?.rows.length} contatos
                </button>
              </>
            )}
            
            {step === 'done' && (
              <button
                onClick={handleClose}
                className="ml-auto px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
              >
                Fechar
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
