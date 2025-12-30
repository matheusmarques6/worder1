'use client'

import { useState, useEffect } from 'react'
import { 
  Type, 
  Hash, 
  Calendar, 
  List, 
  CheckSquare, 
  Link, 
  Mail, 
  Phone,
  ChevronDown,
  X,
  Plus
} from 'lucide-react'

// Types
export interface CustomFieldDefinition {
  id: string
  organization_id: string
  entity_type: 'contact' | 'deal' | 'company'
  field_key: string
  field_name: string
  field_type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean' | 'url' | 'email' | 'phone'
  options?: string[]
  default_value?: any
  is_required: boolean
  placeholder?: string
  help_text?: string
  position: number
  is_active: boolean
  created_at: string
}

interface CustomFieldRendererProps {
  field: CustomFieldDefinition
  value: any
  onChange: (value: any) => void
  disabled?: boolean
  error?: string
}

// Icons for each field type
const FIELD_ICONS: Record<string, any> = {
  text: Type,
  number: Hash,
  date: Calendar,
  select: List,
  multiselect: List,
  boolean: CheckSquare,
  url: Link,
  email: Mail,
  phone: Phone,
}

export function CustomFieldRenderer({ 
  field, 
  value, 
  onChange, 
  disabled = false,
  error 
}: CustomFieldRendererProps) {
  const Icon = FIELD_ICONS[field.field_type] || Type

  const baseInputClass = `w-full px-4 py-3 bg-dark-800/50 border rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 transition-colors ${
    error ? 'border-red-500' : 'border-dark-700'
  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`

  const renderField = () => {
    switch (field.field_type) {
      case 'text':
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || `Digite ${field.field_name.toLowerCase()}`}
            disabled={disabled}
            className={baseInputClass}
          />
        )

      case 'number':
        return (
          <input
            type="number"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
            placeholder={field.placeholder || '0'}
            disabled={disabled}
            className={baseInputClass}
          />
        )

      case 'date':
        return (
          <input
            type="date"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={baseInputClass}
          />
        )

      case 'email':
        return (
          <input
            type="email"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || 'email@exemplo.com'}
            disabled={disabled}
            className={baseInputClass}
          />
        )

      case 'phone':
        return (
          <input
            type="tel"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || '(00) 00000-0000'}
            disabled={disabled}
            className={baseInputClass}
          />
        )

      case 'url':
        return (
          <input
            type="url"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || 'https://'}
            disabled={disabled}
            className={baseInputClass}
          />
        )

      case 'boolean':
        return (
          <button
            type="button"
            onClick={() => !disabled && onChange(!value)}
            disabled={disabled}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
              value 
                ? 'bg-primary-500/20 border-primary-500/50 text-primary-400' 
                : 'bg-dark-800/50 border-dark-700 text-dark-400'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-dark-600'}`}
          >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              value ? 'bg-primary-500 border-primary-500' : 'border-dark-500'
            }`}>
              {value && <CheckSquare className="w-3 h-3 text-white" />}
            </div>
            <span>{value ? 'Sim' : 'Não'}</span>
          </button>
        )

      case 'select':
        return (
          <div className="relative">
            <select
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              className={`${baseInputClass} appearance-none pr-10`}
            >
              <option value="">Selecione...</option>
              {field.options?.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400 pointer-events-none" />
          </div>
        )

      case 'multiselect':
        const selectedValues = Array.isArray(value) ? value : []
        return (
          <div className="space-y-2">
            {/* Selected tags */}
            {selectedValues.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedValues.map((v: string) => (
                  <span
                    key={v}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-500/20 text-primary-400 rounded-lg text-sm"
                  >
                    {v}
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => onChange(selectedValues.filter((sv: string) => sv !== v))}
                        className="hover:text-primary-300"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            {/* Options */}
            <div className="flex flex-wrap gap-2">
              {field.options?.filter(opt => !selectedValues.includes(opt)).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => !disabled && onChange([...selectedValues, option])}
                  disabled={disabled}
                  className="px-3 py-1.5 bg-dark-800/50 border border-dark-700 hover:border-dark-600 rounded-lg text-sm text-dark-300 hover:text-white transition-colors disabled:opacity-50"
                >
                  <Plus className="w-3 h-3 inline mr-1" />
                  {option}
                </button>
              ))}
            </div>
          </div>
        )

      default:
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            className={baseInputClass}
          />
        )
    }
  }

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium text-dark-300">
        <Icon className="w-4 h-4" />
        {field.field_name}
        {field.is_required && <span className="text-red-400">*</span>}
      </label>
      
      {renderField()}
      
      {field.help_text && (
        <p className="text-xs text-dark-500">{field.help_text}</p>
      )}
      
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  )
}

// Hook to fetch and manage custom fields
export function useCustomFields(entityType: 'contact' | 'deal' | 'company', organizationId?: string) {
  const [fields, setFields] = useState<CustomFieldDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!organizationId) {
      setLoading(false)
      return
    }

    const fetchFields = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/custom-fields?organizationId=${organizationId}&entityType=${entityType}`)
        
        if (!res.ok) {
          throw new Error('Erro ao carregar campos personalizados')
        }
        
        const data = await res.json()
        setFields(data.fields || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
      } finally {
        setLoading(false)
      }
    }

    fetchFields()
  }, [organizationId, entityType])

  return { fields, loading, error }
}

// Component to render all custom fields for an entity
interface CustomFieldsFormProps {
  entityType: 'contact' | 'deal' | 'company'
  organizationId?: string
  values: Record<string, any>
  onChange: (values: Record<string, any>) => void
  disabled?: boolean
  errors?: Record<string, string>
}

export function CustomFieldsForm({
  entityType,
  organizationId,
  values,
  onChange,
  disabled = false,
  errors = {}
}: CustomFieldsFormProps) {
  const { fields, loading, error } = useCustomFields(entityType, organizationId)

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-24 bg-dark-700 rounded" />
            <div className="h-12 bg-dark-700 rounded-xl" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
        {error}
      </div>
    )
  }

  if (fields.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-dark-400 uppercase tracking-wider">
        Campos Personalizados
      </h4>
      
      {fields.map((field) => (
        <CustomFieldRenderer
          key={field.id}
          field={field}
          value={values[field.field_key]}
          onChange={(value) => onChange({ ...values, [field.field_key]: value })}
          disabled={disabled}
          error={errors[field.field_key]}
        />
      ))}
    </div>
  )
}

// Validate custom fields
export function validateCustomFields(
  fields: CustomFieldDefinition[],
  values: Record<string, any>
): Record<string, string> {
  const errors: Record<string, string> = {}

  for (const field of fields) {
    const value = values[field.field_key]

    // Required validation
    if (field.is_required && (value === undefined || value === null || value === '')) {
      errors[field.field_key] = `${field.field_name} é obrigatório`
      continue
    }

    // Skip other validations if empty and not required
    if (!value) continue

    // Type-specific validations
    switch (field.field_type) {
      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors[field.field_key] = 'E-mail inválido'
        }
        break

      case 'url':
        try {
          new URL(value)
        } catch {
          errors[field.field_key] = 'URL inválida'
        }
        break

      case 'phone':
        if (!/^[\d\s()+-]+$/.test(value)) {
          errors[field.field_key] = 'Telefone inválido'
        }
        break

      case 'number':
        if (isNaN(Number(value))) {
          errors[field.field_key] = 'Número inválido'
        }
        break
    }
  }

  return errors
}
