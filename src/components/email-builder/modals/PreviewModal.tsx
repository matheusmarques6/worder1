'use client'

import { useState, useMemo } from 'react'
import { X, Monitor, Smartphone, Send, AlertTriangle, CheckCircle, Info, FileText, Clock, Zap } from 'lucide-react'

interface PreviewModalProps {
  isOpen: boolean
  onClose: () => void
  html: string
  subject?: string
  onSendTest?: () => void
}

// Email size/spam analysis
function analyzeEmail(html: string) {
  const sizeKB = new Blob([html]).size / 1024
  const imageCount = (html.match(/<img /gi) || []).length
  const linkCount = (html.match(/<a /gi) || []).length
  const hasUnsubscribe = /unsubscribe|descadastrar/i.test(html)
  const hasPreheader = /display:\s*none|mso-hide/i.test(html)
  const wordCount = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').length
  const imageToTextRatio = imageCount > 0 && wordCount > 0 ? (imageCount / (wordCount / 100)) : 0

  // Spam score (lower = better, 0-100)
  let spamScore = 0
  let issues: { level: 'success' | 'warning' | 'error'; text: string }[] = []

  // Size check
  if (sizeKB > 102) {
    spamScore += 25
    issues.push({ level: 'error', text: `Email muito grande (${sizeKB.toFixed(0)}KB). Gmail corta acima de 102KB.` })
  } else if (sizeKB > 80) {
    spamScore += 10
    issues.push({ level: 'warning', text: `Tamanho do email: ${sizeKB.toFixed(0)}KB. Recomendado: abaixo de 80KB.` })
  } else {
    issues.push({ level: 'success', text: `Tamanho OK: ${sizeKB.toFixed(0)}KB (limite Gmail: 102KB)` })
  }

  // Unsubscribe
  if (!hasUnsubscribe) {
    spamScore += 20
    issues.push({ level: 'error', text: 'Sem link de descadastro. Obrigatório por lei (LGPD/CAN-SPAM).' })
  } else {
    issues.push({ level: 'success', text: 'Link de descadastro encontrado.' })
  }

  // Image to text ratio
  if (imageCount > 0 && wordCount < 50) {
    spamScore += 15
    issues.push({ level: 'warning', text: 'Pouco texto em relação às imagens. Adicione mais texto.' })
  } else if (imageCount > 0) {
    issues.push({ level: 'success', text: `Proporção texto/imagem adequada (${wordCount} palavras, ${imageCount} imagens).` })
  }

  // Links
  if (linkCount > 20) {
    spamScore += 10
    issues.push({ level: 'warning', text: `Muitos links (${linkCount}). Mantenha abaixo de 20.` })
  }

  // Preheader
  if (!hasPreheader) {
    spamScore += 5
    issues.push({ level: 'warning', text: 'Sem texto de preheader. Ajuda na taxa de abertura.' })
  } else {
    issues.push({ level: 'success', text: 'Preheader text configurado.' })
  }

  const deliverability = Math.max(0, 100 - spamScore)
  const rating = deliverability >= 90 ? 'Excelente' : deliverability >= 70 ? 'Bom' : deliverability >= 50 ? 'Regular' : 'Precisa melhorar'
  const ratingColor = deliverability >= 90 ? 'text-emerald-600' : deliverability >= 70 ? 'text-blue-600' : deliverability >= 50 ? 'text-amber-600' : 'text-red-600'
  const ratingBg = deliverability >= 90 ? 'bg-emerald-50 border-emerald-200' : deliverability >= 70 ? 'bg-blue-50 border-blue-200' : deliverability >= 50 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'

  return { sizeKB, imageCount, linkCount, wordCount, deliverability, rating, ratingColor, ratingBg, issues, hasUnsubscribe }
}

export function PreviewModal({ isOpen, onClose, html, subject, onSendTest }: PreviewModalProps) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [activeTab, setActiveTab] = useState<'preview' | 'analysis'>('preview')

  const analysis = useMemo(() => analyzeEmail(html), [html])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="absolute inset-4 lg:inset-8 bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-semibold text-gray-900">Preview</h2>

            {/* Tabs: Preview | Análise */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeTab === 'preview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                <FileText className="w-3.5 h-3.5" /> Preview
              </button>
              <button onClick={() => setActiveTab('analysis')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeTab === 'analysis' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                <Zap className="w-3.5 h-3.5" /> Análise
                {analysis.deliverability < 70 && (
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                )}
              </button>
            </div>

            {/* Device toggle (only in preview tab) */}
            {activeTab === 'preview' && (
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                <button onClick={() => setDevice('desktop')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    device === 'desktop' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  <Monitor className="w-3.5 h-3.5" /> Desktop
                </button>
                <button onClick={() => setDevice('mobile')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    device === 'mobile' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  <Smartphone className="w-3.5 h-3.5" /> Mobile
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onSendTest && (
              <button onClick={onSendTest}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 text-white text-xs font-semibold rounded-lg hover:bg-brand-600 transition-colors">
                <Send className="w-3.5 h-3.5" /> Enviar Teste
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'preview' ? (
            <div className="h-full overflow-auto bg-gray-100 flex items-start justify-center p-6">
              {/* Device frames */}
              {device === 'desktop' ? (
                <div className="w-full max-w-[660px] bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
                  {/* Browser chrome */}
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-400" />
                      <div className="w-3 h-3 rounded-full bg-yellow-400" />
                      <div className="w-3 h-3 rounded-full bg-green-400" />
                    </div>
                    <div className="flex-1 mx-8 h-6 bg-white rounded-md border border-gray-200 px-3 flex items-center">
                      <span className="text-[10px] text-gray-400 truncate">{subject || 'email-preview'}</span>
                    </div>
                  </div>
                  <iframe srcDoc={html} title="Desktop Preview" className="w-full border-0"
                    style={{ height: 'calc(100vh - 220px)', minHeight: 500 }} />
                </div>
              ) : (
                <div className="mx-auto">
                  {/* Phone frame */}
                  <div className="w-[375px] rounded-[3rem] border-[10px] border-gray-800 bg-gray-800 shadow-2xl">
                    {/* Notch */}
                    <div className="flex justify-center pt-2 pb-1">
                      <div className="w-28 h-5 bg-gray-900 rounded-full" />
                    </div>
                    {/* Screen */}
                    <div className="bg-white rounded-[2rem] overflow-hidden mx-0.5 mb-0.5">
                      {/* Status bar */}
                      <div className="flex items-center justify-between px-6 py-1 bg-gray-50">
                        <span className="text-[10px] font-semibold text-gray-900">9:41</span>
                        <div className="flex gap-1">
                          <div className="w-4 h-2 bg-gray-900 rounded-sm" />
                          <div className="w-3 h-2 bg-gray-900 rounded-sm" />
                        </div>
                      </div>
                      {/* Email header mock */}
                      <div className="px-4 py-2 border-b border-gray-100 bg-white">
                        <p className="text-[11px] font-semibold text-gray-900 truncate">{subject || 'Assunto do email'}</p>
                        <p className="text-[10px] text-gray-500">De: Worder &lt;noreply@worder.com&gt;</p>
                      </div>
                      <iframe srcDoc={html} title="Mobile Preview" className="w-full border-0"
                        style={{ height: 'calc(100vh - 300px)', minHeight: 450 }} />
                    </div>
                    {/* Home indicator */}
                    <div className="flex justify-center py-2">
                      <div className="w-32 h-1 bg-gray-600 rounded-full" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── Analysis Tab ── */
            <div className="h-full overflow-auto p-6">
              <div className="max-w-2xl mx-auto space-y-6">
                {/* Score card */}
                <div className={`p-5 rounded-xl border ${analysis.ratingBg}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Pontuação de Entregabilidade</p>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className={`text-3xl font-bold ${analysis.ratingColor}`}>{analysis.deliverability}%</span>
                        <span className={`text-sm font-semibold ${analysis.ratingColor}`}>{analysis.rating}</span>
                      </div>
                    </div>
                    <div className="w-16 h-16 relative">
                      <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none" stroke="#E5E7EB" strokeWidth="3" />
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none" stroke={analysis.deliverability >= 90 ? '#22C55E' : analysis.deliverability >= 70 ? '#3B82F6' : analysis.deliverability >= 50 ? '#F59E0B' : '#EF4444'}
                          strokeWidth="3" strokeDasharray={`${analysis.deliverability}, 100`} strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Tamanho', value: `${analysis.sizeKB.toFixed(0)}KB`, sub: 'Limite: 102KB', ok: analysis.sizeKB < 102 },
                    { label: 'Palavras', value: String(analysis.wordCount), sub: 'Mín. recomendado: 50', ok: analysis.wordCount >= 50 },
                    { label: 'Imagens', value: String(analysis.imageCount), sub: 'Balanceado', ok: true },
                    { label: 'Links', value: String(analysis.linkCount), sub: 'Máx. recomendado: 20', ok: analysis.linkCount <= 20 },
                  ].map(stat => (
                    <div key={stat.label} className="bg-white border border-gray-200 rounded-lg p-3">
                      <p className="text-[10px] font-medium text-gray-500 uppercase">{stat.label}</p>
                      <p className={`text-lg font-bold mt-0.5 ${stat.ok ? 'text-gray-900' : 'text-amber-600'}`}>{stat.value}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{stat.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Issues list */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-900">Checklist de Entregabilidade</h3>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {analysis.issues.map((issue, i) => (
                      <div key={i} className="flex items-start gap-3 px-4 py-3">
                        {issue.level === 'success' ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                        ) : issue.level === 'warning' ? (
                          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        )}
                        <p className="text-xs text-gray-700">{issue.text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tips */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex gap-3">
                    <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-blue-900">Dicas para melhor entregabilidade</p>
                      <ul className="text-xs text-blue-700 mt-1 space-y-1 list-disc list-inside">
                        <li>Mantenha o email abaixo de 80KB para evitar corte pelo Gmail</li>
                        <li>Use proporção equilibrada de texto e imagens (60/40)</li>
                        <li>Sempre inclua link de descadastro (obrigatório por lei)</li>
                        <li>Adicione preheader text para melhorar taxa de abertura</li>
                        <li>Evite mais de 20 links no mesmo email</li>
                        <li>Teste o email em diferentes clientes antes de enviar</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
