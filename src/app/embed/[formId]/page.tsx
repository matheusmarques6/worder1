'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { InternationalPhoneInput } from '@/components/ui/InternationalPhoneInput'

interface FormField {
  id: string
  field_type: string
  label: string
  placeholder: string | null
  description: string | null
  required: boolean
  position: number
  options: { label: string; value: string }[]
  validation: any
  conditional: any
}

interface FormData {
  id: string
  name: string
  description: string | null
  theme: {
    primaryColor: string
    backgroundColor: string
    textColor: string
    borderRadius: number
    fontFamily: string
    fontSize?: number
    hideLabels?: boolean
    hideTitle?: boolean
    inputBackgroundColor?: string
    inputBorderColor?: string
    inputHeight?: number
    headline?: string
    subheadline?: string
    buttonText?: string
    placeholderColor?: string
    inputTextColor?: string
  }
  logo_url: string | null
  success_message: string
  redirect_url: string | null
  facebook_pixel_id: string | null
  google_ads_id: string | null
  google_analytics_id: string | null
  fields: FormField[]
}

export default function EmbedFormPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const formId = params.formId as string

  const [form, setForm] = useState<FormData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, any>>({})

  // Fetch form
  const fetchForm = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch(`/api/public/forms/${formId}`)
      if (res.ok) {
        const data = await res.json()
        setForm(data.form)
      } else {
        setError('Formulario nao encontrado')
      }
    } catch (err) {
      setError('Erro ao carregar formulario')
    } finally {
      setIsLoading(false)
    }
  }, [formId])

  useEffect(() => {
    fetchForm()
  }, [fetchForm])

  // Load Google Font
  useEffect(() => {
    if (!form?.theme?.fontFamily) return
    const font = form.theme.fontFamily
    const systemFonts = ['Arial', 'Georgia', 'Times New Roman', 'Helvetica', 'Verdana']
    if (systemFonts.includes(font)) return

    const link = document.createElement('link')
    link.href = `https://fonts.googleapis.com/css2?family=${font.replace(/\s+/g, '+')}:wght@400;500;600;700&display=swap`
    link.rel = 'stylesheet'
    document.head.appendChild(link)

    return () => {
      document.head.removeChild(link)
    }
  }, [form?.theme?.fontFamily])

  // Initialize Facebook Pixel
  useEffect(() => {
    if (!form?.facebook_pixel_id) return

    const script = document.createElement('script')
    script.innerHTML = `
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', '${form.facebook_pixel_id}');
      fbq('track', 'PageView');
    `
    document.head.appendChild(script)

    return () => {
      document.head.removeChild(script)
    }
  }, [form?.facebook_pixel_id])

  // Initialize Google Ads
  useEffect(() => {
    if (!form?.google_ads_id) return

    const script = document.createElement('script')
    script.src = `https://www.googletagmanager.com/gtag/js?id=${form.google_ads_id}`
    script.async = true
    document.head.appendChild(script)

    const configScript = document.createElement('script')
    configScript.innerHTML = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${form.google_ads_id}');
    `
    document.head.appendChild(configScript)

    return () => {
      document.head.removeChild(script)
      document.head.removeChild(configScript)
    }
  }, [form?.google_ads_id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return

    setFieldError(null)
    setIsSubmitting(true)

    try {
      const res = await fetch(`/api/public/forms/${formId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          utm_source: searchParams.get('utm_source') || undefined,
          utm_medium: searchParams.get('utm_medium') || undefined,
          utm_campaign: searchParams.get('utm_campaign') || undefined,
          utm_term: searchParams.get('utm_term') || undefined,
          utm_content: searchParams.get('utm_content') || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setFieldError(data.error || 'Erro ao enviar formulario')
        return
      }

      // Fire client-side events
      if (data.tracking?.events) {
        for (const event of data.tracking.events) {
          if (event.platforms.facebook && form.facebook_pixel_id && typeof window !== 'undefined' && (window as any).fbq) {
            (window as any).fbq('track', event.name, event.value ? {
              value: event.value,
              currency: event.currency || 'BRL',
            } : undefined)
          }

          if (event.platforms.google && form.google_ads_id && typeof window !== 'undefined' && (window as any).gtag) {
            (window as any).gtag('event', 'conversion', {
              send_to: form.google_ads_id,
              value: event.value || undefined,
              currency: event.currency || 'BRL',
            })
          }
        }
      }

      // Redirect or show success
      if (data.redirect_url) {
        const redirectUrl = new URL(data.redirect_url)
        redirectUrl.searchParams.set('submission_id', data.submission_id)
        redirectUrl.searchParams.set('form_id', formId)
        window.location.href = redirectUrl.toString()
        return
      }

      setSubmitted(true)
    } catch (err) {
      setFieldError('Erro de conexao. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Check if field should be shown (conditional logic)
  const shouldShowField = (field: FormField): boolean => {
    if (!field.conditional) return true
    const { field_id, operator, value } = field.conditional
    const fieldValue = answers[field_id]
    if (fieldValue === undefined) return false

    switch (operator) {
      case 'equals': return String(fieldValue) === String(value)
      case 'not_equals': return String(fieldValue) !== String(value)
      case 'not_empty': return String(fieldValue).length > 0
      default: return true
    }
  }

  const theme = form?.theme || { primaryColor: '#6366f1', backgroundColor: '#ffffff', textColor: '#1f2937', borderRadius: 12, fontFamily: 'Inter' }
  const inputBg = theme.inputBackgroundColor || '#ffffff'
  const inputBorder = theme.inputBorderColor || '#e5e7eb'
  const hideLabels = theme.hideLabels || false
  const hideTitle = theme.hideTitle || false
  const fontSize = theme.fontSize || 14
  const inputHeight = theme.inputHeight || 44
  const headline = theme.headline || form?.name || ''
  const subheadline = theme.subheadline || form?.description || ''
  const buttonText = theme.buttonText || 'Enviar'
  const placeholderColor = theme.placeholderColor || '#9ca3af'
  const inputTextColor = theme.inputTextColor || '#1f2937'
  const bgIsTransparent = !theme.backgroundColor

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.backgroundColor }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: theme.primaryColor }} />
      </div>
    )
  }

  if (error || !form) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ backgroundColor: theme.backgroundColor }}>
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-lg font-medium" style={{ color: theme.textColor }}>{error || 'Formulario nao encontrado'}</p>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ backgroundColor: theme.backgroundColor, fontFamily: theme.fontFamily }}>
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: `${theme.primaryColor}20` }}>
            <CheckCircle className="w-8 h-8" style={{ color: theme.primaryColor }} />
          </div>
          <h2 className="text-2xl font-bold mb-3" style={{ color: theme.textColor }}>Enviado com sucesso!</h2>
          <p className="text-base" style={{ color: `${theme.textColor}99` }}>{form.success_message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8" style={{ backgroundColor: theme.backgroundColor || 'transparent', fontFamily: theme.fontFamily, fontSize }}>
      {/* CSS for placeholder and select colors */}
      <style>{`
        .embed-input-${form.id}::placeholder { color: ${placeholderColor} !important; opacity: 1; }
        .embed-select-${form.id} { color: ${placeholderColor} !important; }
        .embed-select-${form.id}:valid { color: ${inputTextColor} !important; }
        .embed-select-${form.id} option { color: ${inputTextColor}; background: ${inputBg || '#fff'}; }
        .embed-select-${form.id} option[value=""] { color: ${placeholderColor}; }
      `}</style>
      <div className="w-full max-w-lg">
        {/* Logo */}
        {form.logo_url && (
          <div className="mb-6 text-center">
            <img src={form.logo_url} alt="" className="h-12 mx-auto" />
          </div>
        )}

        {/* Form Header */}
        {!hideTitle && (
          <div className="mb-6">
            <h1 className="font-bold" style={{ color: theme.textColor, fontSize: fontSize + 8 }}>{headline}</h1>
            {subheadline && (
              <p className="mt-2" style={{ color: `${theme.textColor}80`, fontSize }}>{subheadline}</p>
            )}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {form.fields.filter(shouldShowField).map(field => (
            <div key={field.id}>
              {!hideLabels && (
                <label className="block font-medium mb-1.5" style={{ color: theme.textColor, fontSize: fontSize - 1 }}>
                  {field.label}
                  {field.required && <span style={{ color: '#ef4444' }}> *</span>}
                </label>
              )}
              {!hideLabels && field.description && (
                <p className="mb-1.5" style={{ color: `${theme.textColor}60`, fontSize: fontSize - 2 }}>{field.description}</p>
              )}

              {field.field_type === 'textarea' ? (
                <textarea
                  value={answers[field.id] || ''}
                  onChange={(e) => setAnswers(prev => ({ ...prev, [field.id]: e.target.value }))}
                  placeholder={hideLabels ? `${field.label}${field.required ? ' *' : ''}` : (field.placeholder || '')}
                  required={field.required}
                  rows={4}
                  className={`w-full px-4 border focus:outline-none focus:ring-2 embed-input-${form.id}`}
                  style={{
                    borderColor: inputBorder,
                    borderRadius: theme.borderRadius,
                    color: inputTextColor,
                    backgroundColor: inputBg || 'transparent',
                    fontSize: fontSize - 1,
                    paddingTop: (inputHeight - fontSize) / 2,
                    paddingBottom: (inputHeight - fontSize) / 2,
                  }}
                />
              ) : field.field_type === 'select' ? (
                <select
                  value={answers[field.id] || ''}
                  onChange={(e) => setAnswers(prev => ({ ...prev, [field.id]: e.target.value }))}
                  required={field.required}
                  className={`w-full px-4 border focus:outline-none focus:ring-2 embed-select-${form.id}`}
                  style={{ borderColor: inputBorder, borderRadius: theme.borderRadius, color: answers[field.id] ? inputTextColor : placeholderColor, backgroundColor: inputBg || 'transparent', fontSize: fontSize - 1, height: inputHeight }}
                >
                  <option value="">{hideLabels ? `${field.label}${field.required ? ' *' : ''}` : (field.placeholder || 'Selecione...')}</option>
                  {(field.options || []).map((opt, i) => (
                    <option key={i} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : field.field_type === 'radio' ? (
                <div className="space-y-2">
                  {hideLabels && (
                    <p style={{ color: theme.textColor, fontSize: fontSize - 1 }}>{field.label}{field.required && <span style={{ color: '#ef4444' }}> *</span>}</p>
                  )}
                  {(field.options || []).map((opt, i) => (
                    <label key={i} className="flex items-center gap-3 px-3 border cursor-pointer transition-colors" style={{ borderColor: inputBorder, borderRadius: theme.borderRadius, backgroundColor: inputBg || 'transparent', height: inputHeight }}>
                      <input
                        type="radio"
                        name={field.id}
                        value={opt.value}
                        checked={answers[field.id] === opt.value}
                        onChange={(e) => setAnswers(prev => ({ ...prev, [field.id]: e.target.value }))}
                        className="w-4 h-4"
                        style={{ accentColor: theme.primaryColor }}
                      />
                      <span style={{ color: inputTextColor, fontSize: fontSize - 1 }}>{opt.label}</span>
                    </label>
                  ))}
                </div>
              ) : field.field_type === 'checkbox' ? (
                <div className="space-y-2">
                  {hideLabels && (
                    <p style={{ color: theme.textColor, fontSize: fontSize - 1 }}>{field.label}{field.required && <span style={{ color: '#ef4444' }}> *</span>}</p>
                  )}
                  {(field.options || []).map((opt, i) => (
                    <label key={i} className="flex items-center gap-3 px-3 border cursor-pointer transition-colors" style={{ borderColor: inputBorder, borderRadius: theme.borderRadius, backgroundColor: inputBg || 'transparent', height: inputHeight }}>
                      <input
                        type="checkbox"
                        value={opt.value}
                        checked={(answers[field.id] || []).includes(opt.value)}
                        onChange={(e) => {
                          const current = answers[field.id] || []
                          const newValue = e.target.checked
                            ? [...current, opt.value]
                            : current.filter((v: string) => v !== opt.value)
                          setAnswers(prev => ({ ...prev, [field.id]: newValue }))
                        }}
                        className="w-4 h-4"
                        style={{ accentColor: theme.primaryColor }}
                      />
                      <span style={{ color: inputTextColor, fontSize: fontSize - 1 }}>{opt.label}</span>
                    </label>
                  ))}
                </div>
              ) : field.field_type === 'hidden' ? (
                <input type="hidden" value={answers[field.id] || field.placeholder || ''} />
              ) : (field.field_type === 'phone' || field.field_type === 'whatsapp') ? (
                <InternationalPhoneInput
                  value={answers[field.id] || ''}
                  onChange={(fullNumber, _formatted, _country) => {
                    setAnswers(prev => ({ ...prev, [field.id]: fullNumber }))
                  }}
                  placeholder={hideLabels ? `${field.label}${field.required ? ' *' : ''}` : (field.placeholder || undefined)}
                  required={field.required}
                  style={{
                    borderColor: inputBorder,
                    borderRadius: theme.borderRadius,
                    backgroundColor: inputBg,
                    textColor: theme.textColor,
                    fontSize: fontSize - 1,
                    height: inputHeight,
                  }}
                />
              ) : (
                <input
                  type={
                    field.field_type === 'email' ? 'email' :
                    field.field_type === 'number' ? 'number' :
                    field.field_type === 'date' ? 'date' :
                    field.field_type === 'url' ? 'url' : 'text'
                  }
                  value={answers[field.id] || ''}
                  onChange={(e) => setAnswers(prev => ({ ...prev, [field.id]: e.target.value }))}
                  placeholder={hideLabels ? `${field.label}${field.required ? ' *' : ''}` : (field.placeholder || '')}
                  required={field.required}
                  className={`w-full px-4 border focus:outline-none focus:ring-2 embed-input-${form.id}`}
                  style={{ borderColor: inputBorder, borderRadius: theme.borderRadius, color: inputTextColor, backgroundColor: inputBg || 'transparent', fontSize: fontSize - 1, height: inputHeight }}
                />
              )}
            </div>
          ))}

          {/* Error */}
          {fieldError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">
              {fieldError}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full text-white font-semibold transition-opacity disabled:opacity-50"
            style={{ backgroundColor: theme.primaryColor, borderRadius: theme.borderRadius, fontSize, height: inputHeight + 4 }}
          >
            {isSubmitting ? 'Enviando...' : buttonText}
          </button>
        </form>

        {/* Powered by */}
        <div className="mt-6 text-center">
          <p className="text-xs" style={{ color: `${theme.textColor}40` }}>
            Powered by Worder
          </p>
        </div>
      </div>
    </div>
  )
}
