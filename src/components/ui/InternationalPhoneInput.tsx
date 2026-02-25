'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import {
  Country,
  getSortedCountries,
  getDefaultCountry,
  getCountryByCode,
  applyPhoneMask,
  getPhoneDigits,
  formatForWhatsApp,
} from '@/lib/countries'

interface InternationalPhoneInputProps {
  value?: string
  onChange?: (value: string, formatted: string, country: Country) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  defaultCountry?: string
  style?: {
    borderColor?: string
    borderRadius?: number
    backgroundColor?: string
    textColor?: string
    fontSize?: number
    height?: number
  }
  className?: string
}

export function InternationalPhoneInput({
  value = '',
  onChange,
  placeholder,
  required = false,
  disabled = false,
  defaultCountry,
  style = {},
  className = '',
}: InternationalPhoneInputProps) {
  const [countries] = useState(() => getSortedCountries())
  const [selectedCountry, setSelectedCountry] = useState<Country>(() => {
    if (defaultCountry) {
      const c = getCountryByCode(defaultCountry)
      if (c) return c
    }
    return getDefaultCountry()
  })
  const [phoneNumber, setPhoneNumber] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-detect country on mount
  useEffect(() => {
    if (!defaultCountry && typeof navigator !== 'undefined') {
      const detected = getDefaultCountry()
      setSelectedCountry(detected)
    }
  }, [defaultCountry])

  // Parse initial value if provided
  useEffect(() => {
    if (value && !phoneNumber) {
      // Try to extract country code from value
      const digits = getPhoneDigits(value)
      for (const country of countries) {
        const dialDigits = getPhoneDigits(country.dialCode)
        if (digits.startsWith(dialDigits)) {
          setSelectedCountry(country)
          const localNumber = digits.slice(dialDigits.length)
          setPhoneNumber(applyPhoneMask(localNumber, country.mask))
          break
        }
      }
    }
  }, [value, countries, phoneNumber])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handlePhoneChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value
    const digits = getPhoneDigits(input)
    const formatted = applyPhoneMask(digits, selectedCountry.mask)
    setPhoneNumber(formatted)

    // Return full number with country code
    const fullNumber = formatForWhatsApp(selectedCountry.dialCode, formatted)
    onChange?.(fullNumber, `${selectedCountry.dialCode} ${formatted}`, selectedCountry)
  }, [selectedCountry, onChange])

  const handleCountrySelect = useCallback((country: Country) => {
    setSelectedCountry(country)
    setIsOpen(false)
    setSearch('')

    // Re-apply mask with new country format
    const digits = getPhoneDigits(phoneNumber)
    const formatted = applyPhoneMask(digits, country.mask)
    setPhoneNumber(formatted)

    // Focus input after selection
    setTimeout(() => inputRef.current?.focus(), 100)

    // Emit new value
    const fullNumber = formatForWhatsApp(country.dialCode, formatted)
    onChange?.(fullNumber, `${country.dialCode} ${formatted}`, country)
  }, [phoneNumber, onChange])

  const filteredCountries = countries.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.dialCode.includes(search) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  )

  const {
    borderColor = '#e5e7eb',
    borderRadius = 8,
    backgroundColor = '#ffffff',
    textColor = '#1f2937',
    fontSize = 14,
    height = 44,
  } = style

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <div
        className="flex items-stretch border overflow-hidden"
        style={{
          borderColor,
          borderRadius,
          backgroundColor,
          height,
        }}
      >
        {/* Country selector button */}
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className="flex items-center gap-1 px-3 border-r hover:bg-black/5 transition-colors shrink-0"
          style={{
            borderColor,
            color: textColor,
            fontSize: fontSize - 1,
          }}
        >
          <span className="text-lg">{selectedCountry.flag}</span>
          <span className="font-medium">{selectedCountry.dialCode}</span>
          <ChevronDown className="w-3 h-3 opacity-50" />
        </button>

        {/* Phone input */}
        <input
          ref={inputRef}
          type="tel"
          value={phoneNumber}
          onChange={handlePhoneChange}
          placeholder={placeholder || selectedCountry.mask.replace(/9/g, '_')}
          required={required}
          disabled={disabled}
          className="flex-1 px-3 outline-none bg-transparent"
          style={{
            color: textColor,
            fontSize,
          }}
        />
      </div>

      {/* Country dropdown */}
      {isOpen && (
        <div
          className="absolute top-full left-0 right-0 mt-1 border shadow-lg z-50 max-h-64 overflow-hidden flex flex-col"
          style={{
            borderColor,
            borderRadius,
            backgroundColor,
          }}
        >
          {/* Search */}
          <div className="p-2 border-b" style={{ borderColor }}>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" style={{ color: textColor }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar pais..."
                autoFocus
                className="w-full pl-8 pr-3 py-2 text-sm outline-none bg-transparent"
                style={{
                  color: textColor,
                  fontSize: fontSize - 2,
                }}
              />
            </div>
          </div>

          {/* Country list */}
          <div className="overflow-y-auto flex-1">
            {filteredCountries.map((country) => (
              <button
                key={country.code}
                type="button"
                onClick={() => handleCountrySelect(country)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-black/5 transition-colors text-left"
                style={{
                  color: textColor,
                  fontSize: fontSize - 1,
                  backgroundColor: country.code === selectedCountry.code ? 'rgba(0,0,0,0.05)' : 'transparent',
                }}
              >
                <span className="text-lg">{country.flag}</span>
                <span className="flex-1">{country.name}</span>
                <span className="opacity-50">{country.dialCode}</span>
              </button>
            ))}
            {filteredCountries.length === 0 && (
              <div className="px-3 py-4 text-center opacity-50" style={{ color: textColor, fontSize: fontSize - 1 }}>
                Nenhum pais encontrado
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default InternationalPhoneInput
