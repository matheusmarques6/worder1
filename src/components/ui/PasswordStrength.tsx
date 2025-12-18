'use client'

import { useMemo } from 'react'
import { Check, X, AlertCircle } from 'lucide-react'
import { validatePassword, type PasswordValidation } from '@/lib/password-validation'

interface PasswordStrengthIndicatorProps {
  password: string
  showRules?: boolean
  className?: string
}

export function PasswordStrengthIndicator({ 
  password, 
  showRules = true,
  className = '' 
}: PasswordStrengthIndicatorProps) {
  const validation = useMemo(() => validatePassword(password), [password])

  if (!password) {
    return null
  }

  return (
    <div className={`mt-2 space-y-2 ${className}`}>
      {/* Barra de força */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-dark-700 rounded-full overflow-hidden">
          <div 
            className={`h-full ${validation.strengthBgColor} ${validation.strengthWidth} transition-all duration-300`} 
          />
        </div>
        <span className={`text-xs font-medium ${validation.strengthColor} min-w-[80px] text-right`}>
          {validation.strengthLabel}
        </span>
      </div>

      {/* Lista de requisitos */}
      {showRules && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {validation.rules.map((rule) => (
            <div 
              key={rule.id}
              className={`flex items-center gap-1.5 text-xs transition-colors ${
                rule.passed ? 'text-green-400' : 'text-dark-500'
              }`}
            >
              {rule.passed ? (
                <Check className="w-3 h-3 flex-shrink-0" />
              ) : (
                <X className="w-3 h-3 flex-shrink-0" />
              )}
              <span>{rule.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface PasswordMatchIndicatorProps {
  password: string
  confirmation: string
  className?: string
}

export function PasswordMatchIndicator({ 
  password, 
  confirmation,
  className = '' 
}: PasswordMatchIndicatorProps) {
  if (!confirmation) {
    return null
  }

  const matches = password === confirmation

  return (
    <div className={`mt-2 flex items-center gap-1.5 text-xs ${className}`}>
      {matches ? (
        <>
          <Check className="w-3 h-3 text-green-400" />
          <span className="text-green-400">Senhas coincidem</span>
        </>
      ) : (
        <>
          <AlertCircle className="w-3 h-3 text-red-400" />
          <span className="text-red-400">Senhas não coincidem</span>
        </>
      )}
    </div>
  )
}

// Componente combinado para formulários
interface PasswordInputWithStrengthProps {
  password: string
  confirmation?: string
  showStrength?: boolean
  showMatch?: boolean
  showRules?: boolean
}

export function PasswordValidationFeedback({
  password,
  confirmation,
  showStrength = true,
  showMatch = true,
  showRules = true,
}: PasswordInputWithStrengthProps) {
  return (
    <div className="space-y-2">
      {showStrength && (
        <PasswordStrengthIndicator 
          password={password} 
          showRules={showRules}
        />
      )}
      {showMatch && confirmation !== undefined && (
        <PasswordMatchIndicator 
          password={password} 
          confirmation={confirmation}
        />
      )}
    </div>
  )
}
