// =====================================================
// PASSWORD VALIDATION UTILITIES
// =====================================================

export interface PasswordRule {
  id: string
  label: string
  test: (password: string) => boolean
}

export interface PasswordValidation {
  isValid: boolean
  score: number // 0-5
  errors: string[]
  rules: { id: string; label: string; passed: boolean }[]
  strength: 'empty' | 'weak' | 'medium' | 'strong' | 'very-strong'
  strengthLabel: string
  strengthColor: string
  strengthBgColor: string
  strengthWidth: string
}

// Regras de validação
const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'length',
    label: 'Mínimo 8 caracteres',
    test: (p) => p.length >= 8,
  },
  {
    id: 'uppercase',
    label: 'Letra maiúscula',
    test: (p) => /[A-Z]/.test(p),
  },
  {
    id: 'lowercase',
    label: 'Letra minúscula',
    test: (p) => /[a-z]/.test(p),
  },
  {
    id: 'number',
    label: 'Número',
    test: (p) => /[0-9]/.test(p),
  },
  {
    id: 'special',
    label: 'Caractere especial (!@#$%...)',
    test: (p) => /[!@#$%^&*(),.?":{}|<>\-_=+\[\]\\;'/`~]/.test(p),
  },
]

// Configuração de força
const STRENGTH_CONFIG = {
  empty: {
    label: '',
    color: 'text-dark-500',
    bgColor: 'bg-dark-700',
    width: 'w-0',
  },
  weak: {
    label: 'Fraca',
    color: 'text-red-400',
    bgColor: 'bg-red-500',
    width: 'w-1/4',
  },
  medium: {
    label: 'Média',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500',
    width: 'w-2/4',
  },
  strong: {
    label: 'Forte',
    color: 'text-green-400',
    bgColor: 'bg-green-500',
    width: 'w-3/4',
  },
  'very-strong': {
    label: 'Muito Forte',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500',
    width: 'w-full',
  },
}

/**
 * Valida uma senha e retorna informações detalhadas
 */
export function validatePassword(password: string): PasswordValidation {
  if (!password) {
    return {
      isValid: false,
      score: 0,
      errors: ['Senha é obrigatória'],
      rules: PASSWORD_RULES.map(r => ({ id: r.id, label: r.label, passed: false })),
      strength: 'empty',
      strengthLabel: '',
      strengthColor: STRENGTH_CONFIG.empty.color,
      strengthBgColor: STRENGTH_CONFIG.empty.bgColor,
      strengthWidth: STRENGTH_CONFIG.empty.width,
    }
  }

  const errors: string[] = []
  const rules = PASSWORD_RULES.map(rule => {
    const passed = rule.test(password)
    if (!passed) {
      errors.push(rule.label)
    }
    return { id: rule.id, label: rule.label, passed }
  })

  const score = rules.filter(r => r.passed).length

  // Determinar força baseado no score
  let strength: PasswordValidation['strength']
  if (score <= 1) {
    strength = 'weak'
  } else if (score === 2) {
    strength = 'weak'
  } else if (score === 3) {
    strength = 'medium'
  } else if (score === 4) {
    strength = 'strong'
  } else {
    strength = 'very-strong'
  }

  const config = STRENGTH_CONFIG[strength]

  return {
    isValid: errors.length === 0,
    score,
    errors,
    rules,
    strength,
    strengthLabel: config.label,
    strengthColor: config.color,
    strengthBgColor: config.bgColor,
    strengthWidth: config.width,
  }
}

/**
 * Verifica se duas senhas coincidem
 */
export function passwordsMatch(password: string, confirmation: string): boolean {
  return password === confirmation && password.length > 0
}

/**
 * Gera uma senha forte aleatória
 */
export function generateStrongPassword(length: number = 12): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lowercase = 'abcdefghijklmnopqrstuvwxyz'
  const numbers = '0123456789'
  const special = '!@#$%^&*()_+-='
  
  const allChars = uppercase + lowercase + numbers + special
  
  // Garantir pelo menos um de cada tipo
  let password = ''
  password += uppercase[Math.floor(Math.random() * uppercase.length)]
  password += lowercase[Math.floor(Math.random() * lowercase.length)]
  password += numbers[Math.floor(Math.random() * numbers.length)]
  password += special[Math.floor(Math.random() * special.length)]
  
  // Preencher o resto
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)]
  }
  
  // Embaralhar
  return password.split('').sort(() => Math.random() - 0.5).join('')
}

/**
 * Verifica se o email é válido
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}
