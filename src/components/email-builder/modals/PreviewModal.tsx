'use client'

import { useState } from 'react'
import { X, Monitor, Smartphone, Sun, Moon, Send } from 'lucide-react'

interface PreviewModalProps {
  isOpen: boolean
  onClose: () => void
  html: string
  onSendTest?: () => void
}

export function PreviewModal({ isOpen, onClose, html, onSendTest }: PreviewModalProps) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  if (!isOpen) return null

  const frameWidth = device === 'mobile' ? 375 : 600
  const bgColor = theme === 'dark' ? '#1a1a1a' : '#f3f4f6'

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-900">Preview do Email</h3>
            {/* Device toggle */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => setDevice('desktop')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${device === 'desktop' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                <Monitor className="w-3.5 h-3.5" /> Desktop
              </button>
              <button onClick={() => setDevice('mobile')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${device === 'mobile' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                <Smartphone className="w-3.5 h-3.5" /> Mobile
              </button>
            </div>
            {/* Theme toggle */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => setTheme('light')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${theme === 'light' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                <Sun className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setTheme('dark')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${theme === 'dark' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                <Moon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onSendTest && (
              <button onClick={onSendTest}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-xs font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                <Send className="w-3.5 h-3.5" /> Enviar Teste
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Preview area */}
        <div className="flex-1 overflow-auto p-6" style={{ backgroundColor: bgColor }}>
          <div className="mx-auto transition-all duration-300" style={{ maxWidth: frameWidth }}>
            {/* Device frame */}
            {device === 'mobile' && (
              <div className="rounded-[2rem] border-[8px] border-gray-800 bg-gray-800 p-1 shadow-xl">
                <div className="w-20 h-1 bg-gray-600 rounded-full mx-auto mb-1" />
                <div className="bg-white rounded-[1.5rem] overflow-hidden">
                  <iframe srcDoc={html} title="Preview" className="w-full border-0" style={{ height: 600 }} />
                </div>
              </div>
            )}
            {device === 'desktop' && (
              <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
                {/* Browser chrome */}
                <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 border-b border-gray-200">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                  <div className="flex-1 mx-4 h-5 bg-white rounded border border-gray-200 px-2 flex items-center">
                    <span className="text-[9px] text-gray-400">email-preview</span>
                  </div>
                </div>
                <iframe srcDoc={html} title="Preview" className="w-full border-0" style={{ height: 600 }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
