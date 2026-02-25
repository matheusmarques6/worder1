// Country data with phone codes and flags
export interface Country {
  code: string      // ISO 3166-1 alpha-2
  name: string
  dialCode: string
  flag: string      // Emoji flag
  mask: string      // Phone mask pattern (9 = digit)
  priority?: number // For sorting (lower = higher priority)
}

export const countries: Country[] = [
  // Priority countries (most common in LatAm)
  { code: 'BR', name: 'Brasil', dialCode: '+55', flag: '🇧🇷', mask: '(99) 99999-9999', priority: 1 },
  { code: 'US', name: 'Estados Unidos', dialCode: '+1', flag: '🇺🇸', mask: '(999) 999-9999', priority: 2 },
  { code: 'PT', name: 'Portugal', dialCode: '+351', flag: '🇵🇹', mask: '999 999 999', priority: 3 },
  { code: 'AR', name: 'Argentina', dialCode: '+54', flag: '🇦🇷', mask: '99 9999-9999', priority: 4 },
  { code: 'MX', name: 'México', dialCode: '+52', flag: '🇲🇽', mask: '99 9999 9999', priority: 5 },
  { code: 'CO', name: 'Colombia', dialCode: '+57', flag: '🇨🇴', mask: '999 999 9999', priority: 6 },
  { code: 'CL', name: 'Chile', dialCode: '+56', flag: '🇨🇱', mask: '9 9999 9999', priority: 7 },
  { code: 'PE', name: 'Peru', dialCode: '+51', flag: '🇵🇪', mask: '999 999 999', priority: 8 },

  // Other countries alphabetically
  { code: 'AF', name: 'Afeganistão', dialCode: '+93', flag: '🇦🇫', mask: '99 999 9999' },
  { code: 'AL', name: 'Albânia', dialCode: '+355', flag: '🇦🇱', mask: '99 999 9999' },
  { code: 'DE', name: 'Alemanha', dialCode: '+49', flag: '🇩🇪', mask: '999 99999999' },
  { code: 'AD', name: 'Andorra', dialCode: '+376', flag: '🇦🇩', mask: '999 999' },
  { code: 'AO', name: 'Angola', dialCode: '+244', flag: '🇦🇴', mask: '999 999 999' },
  { code: 'SA', name: 'Arábia Saudita', dialCode: '+966', flag: '🇸🇦', mask: '99 999 9999' },
  { code: 'DZ', name: 'Argélia', dialCode: '+213', flag: '🇩🇿', mask: '999 99 99 99' },
  { code: 'AU', name: 'Austrália', dialCode: '+61', flag: '🇦🇺', mask: '9999 999 999' },
  { code: 'AT', name: 'Áustria', dialCode: '+43', flag: '🇦🇹', mask: '999 9999999' },
  { code: 'BE', name: 'Bélgica', dialCode: '+32', flag: '🇧🇪', mask: '999 99 99 99' },
  { code: 'BO', name: 'Bolívia', dialCode: '+591', flag: '🇧🇴', mask: '9 999 9999' },
  { code: 'CA', name: 'Canadá', dialCode: '+1', flag: '🇨🇦', mask: '(999) 999-9999' },
  { code: 'CN', name: 'China', dialCode: '+86', flag: '🇨🇳', mask: '999 9999 9999' },
  { code: 'KR', name: 'Coreia do Sul', dialCode: '+82', flag: '🇰🇷', mask: '99-9999-9999' },
  { code: 'CR', name: 'Costa Rica', dialCode: '+506', flag: '🇨🇷', mask: '9999 9999' },
  { code: 'CU', name: 'Cuba', dialCode: '+53', flag: '🇨🇺', mask: '9 999 9999' },
  { code: 'DK', name: 'Dinamarca', dialCode: '+45', flag: '🇩🇰', mask: '99 99 99 99' },
  { code: 'EC', name: 'Equador', dialCode: '+593', flag: '🇪🇨', mask: '99 999 9999' },
  { code: 'EG', name: 'Egito', dialCode: '+20', flag: '🇪🇬', mask: '99 9999 9999' },
  { code: 'AE', name: 'Emirados Árabes', dialCode: '+971', flag: '🇦🇪', mask: '99 999 9999' },
  { code: 'ES', name: 'Espanha', dialCode: '+34', flag: '🇪🇸', mask: '999 99 99 99' },
  { code: 'FR', name: 'França', dialCode: '+33', flag: '🇫🇷', mask: '9 99 99 99 99' },
  { code: 'GR', name: 'Grécia', dialCode: '+30', flag: '🇬🇷', mask: '999 999 9999' },
  { code: 'GT', name: 'Guatemala', dialCode: '+502', flag: '🇬🇹', mask: '9999 9999' },
  { code: 'HN', name: 'Honduras', dialCode: '+504', flag: '🇭🇳', mask: '9999-9999' },
  { code: 'HK', name: 'Hong Kong', dialCode: '+852', flag: '🇭🇰', mask: '9999 9999' },
  { code: 'IN', name: 'Índia', dialCode: '+91', flag: '🇮🇳', mask: '99999 99999' },
  { code: 'ID', name: 'Indonésia', dialCode: '+62', flag: '🇮🇩', mask: '999-999-9999' },
  { code: 'IE', name: 'Irlanda', dialCode: '+353', flag: '🇮🇪', mask: '99 999 9999' },
  { code: 'IL', name: 'Israel', dialCode: '+972', flag: '🇮🇱', mask: '99-999-9999' },
  { code: 'IT', name: 'Itália', dialCode: '+39', flag: '🇮🇹', mask: '999 999 9999' },
  { code: 'JP', name: 'Japão', dialCode: '+81', flag: '🇯🇵', mask: '99-9999-9999' },
  { code: 'MZ', name: 'Moçambique', dialCode: '+258', flag: '🇲🇿', mask: '99 999 9999' },
  { code: 'NL', name: 'Países Baixos', dialCode: '+31', flag: '🇳🇱', mask: '9 99999999' },
  { code: 'PA', name: 'Panamá', dialCode: '+507', flag: '🇵🇦', mask: '9999-9999' },
  { code: 'PY', name: 'Paraguai', dialCode: '+595', flag: '🇵🇾', mask: '999 999 999' },
  { code: 'PH', name: 'Filipinas', dialCode: '+63', flag: '🇵🇭', mask: '999 999 9999' },
  { code: 'PL', name: 'Polônia', dialCode: '+48', flag: '🇵🇱', mask: '999 999 999' },
  { code: 'GB', name: 'Reino Unido', dialCode: '+44', flag: '🇬🇧', mask: '9999 999999' },
  { code: 'DO', name: 'República Dominicana', dialCode: '+1', flag: '🇩🇴', mask: '(999) 999-9999' },
  { code: 'RU', name: 'Rússia', dialCode: '+7', flag: '🇷🇺', mask: '999 999-99-99' },
  { code: 'SG', name: 'Singapura', dialCode: '+65', flag: '🇸🇬', mask: '9999 9999' },
  { code: 'ZA', name: 'África do Sul', dialCode: '+27', flag: '🇿🇦', mask: '99 999 9999' },
  { code: 'SE', name: 'Suécia', dialCode: '+46', flag: '🇸🇪', mask: '99-999 99 99' },
  { code: 'CH', name: 'Suíça', dialCode: '+41', flag: '🇨🇭', mask: '99 999 99 99' },
  { code: 'TW', name: 'Taiwan', dialCode: '+886', flag: '🇹🇼', mask: '9 9999 9999' },
  { code: 'TH', name: 'Tailândia', dialCode: '+66', flag: '🇹🇭', mask: '99 999 9999' },
  { code: 'TR', name: 'Turquia', dialCode: '+90', flag: '🇹🇷', mask: '999 999 9999' },
  { code: 'UA', name: 'Ucrânia', dialCode: '+380', flag: '🇺🇦', mask: '99 999 9999' },
  { code: 'UY', name: 'Uruguai', dialCode: '+598', flag: '🇺🇾', mask: '9 999 9999' },
  { code: 'VE', name: 'Venezuela', dialCode: '+58', flag: '🇻🇪', mask: '999-9999999' },
  { code: 'VN', name: 'Vietnã', dialCode: '+84', flag: '🇻🇳', mask: '99 999 99 99' },
]

// Get country by code
export function getCountryByCode(code: string): Country | undefined {
  return countries.find(c => c.code === code)
}

// Get country by dial code
export function getCountryByDialCode(dialCode: string): Country | undefined {
  return countries.find(c => c.dialCode === dialCode)
}

// Get default country based on browser locale
export function getDefaultCountry(): Country {
  if (typeof navigator !== 'undefined') {
    const locale = navigator.language || (navigator as any).userLanguage || 'pt-BR'
    const countryCode = locale.split('-')[1]?.toUpperCase()

    if (countryCode) {
      const country = getCountryByCode(countryCode)
      if (country) return country
    }

    // Fallback based on language
    const lang = locale.split('-')[0].toLowerCase()
    if (lang === 'pt') return getCountryByCode('BR')!
    if (lang === 'es') return getCountryByCode('ES')!
    if (lang === 'en') return getCountryByCode('US')!
  }

  return getCountryByCode('BR')!
}

// Sort countries by priority then name
export function getSortedCountries(): Country[] {
  return [...countries].sort((a, b) => {
    if (a.priority && b.priority) return a.priority - b.priority
    if (a.priority) return -1
    if (b.priority) return 1
    return a.name.localeCompare(b.name)
  })
}

// Apply mask to phone number
export function applyPhoneMask(value: string, mask: string): string {
  const digits = value.replace(/\D/g, '')
  let result = ''
  let digitIndex = 0

  for (let i = 0; i < mask.length && digitIndex < digits.length; i++) {
    if (mask[i] === '9') {
      result += digits[digitIndex]
      digitIndex++
    } else {
      result += mask[i]
    }
  }

  return result
}

// Get raw digits from formatted phone
export function getPhoneDigits(value: string): string {
  return value.replace(/\D/g, '')
}

// Format full phone number for WhatsApp (with country code, no special chars)
export function formatForWhatsApp(dialCode: string, phone: string): string {
  const countryDigits = dialCode.replace(/\D/g, '')
  const phoneDigits = phone.replace(/\D/g, '')
  return countryDigits + phoneDigits
}
