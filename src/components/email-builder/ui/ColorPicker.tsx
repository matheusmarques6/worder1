'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Pipette } from 'lucide-react'

// ── Color conversion helpers ──
function hexToRgb(hex: string): [number, number, number] {
  hex = hex.replace('#', '')
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
  const n = parseInt(hex, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [h * 360, s * 100, l * 100]
}

function hslToHex(h: number, s: number, l: number): string {
  h /= 360; s /= 100; l /= 100
  let r, g, b
  if (s === 0) { r = g = b = l } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1/3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1/3)
  }
  return rgbToHex(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255))
}

// Recent colors persist in localStorage
const RECENT_KEY = 'worder_recent_colors'
function getRecentColors(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 8) } catch { return [] }
}
function addRecentColor(hex: string) {
  const recent = getRecentColors().filter(c => c.toLowerCase() !== hex.toLowerCase())
  recent.unshift(hex)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 8))) } catch {}
}

// ── Main Component ──
interface ColorPickerProps {
  value: string
  onChange: (hex: string) => void
  label?: string
}

export function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [hexInput, setHexInput] = useState(value || '#000000')
  const [hue, setHue] = useState(() => hexToHsl(value || '#000000')[0])
  const [mode, setMode] = useState<'hex' | 'rgb'>('hex')
  const popRef = useRef<HTMLDivElement>(null)
  const gradRef = useRef<HTMLCanvasElement>(null)

  const hex = value || '#000000'
  const [r, g, b] = hexToRgb(hex)
  const [, sat, lit] = hexToHsl(hex)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false)
        addRecentColor(hex)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, hex])

  // Sync hex input when value changes externally
  useEffect(() => { setHexInput(value || '#000000') }, [value])

  // Draw gradient canvas
  useEffect(() => {
    if (!open || !gradRef.current) return
    const canvas = gradRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width, h = canvas.height
    // Draw white→hue horizontal gradient
    const hueHex = hslToHex(hue, 100, 50)
    const gradH = ctx.createLinearGradient(0, 0, w, 0)
    gradH.addColorStop(0, '#FFFFFF')
    gradH.addColorStop(1, hueHex)
    ctx.fillStyle = gradH
    ctx.fillRect(0, 0, w, h)
    // Draw transparent→black vertical gradient
    const gradV = ctx.createLinearGradient(0, 0, 0, h)
    gradV.addColorStop(0, 'rgba(0,0,0,0)')
    gradV.addColorStop(1, '#000000')
    ctx.fillStyle = gradV
    ctx.fillRect(0, 0, w, h)
  }, [open, hue])

  const handleGradientClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    // x = saturation (0=white, 1=full hue), y = brightness (0=bright, 1=black)
    const s = x * 100
    const l = (1 - y) * (100 - s / 2) // approximation
    const newHex = hslToHex(hue, Math.min(100, s), Math.max(0, Math.min(100, l)))
    onChange(newHex)
    setHexInput(newHex)
  }, [hue, onChange])

  const handleHueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const h = +e.target.value
    setHue(h)
    const newHex = hslToHex(h, sat || 100, lit || 50)
    onChange(newHex)
    setHexInput(newHex)
  }

  const handleHexSubmit = (val: string) => {
    let clean = val.replace(/[^0-9a-fA-F#]/g, '')
    if (!clean.startsWith('#')) clean = '#' + clean
    if (clean.length === 4 || clean.length === 7) {
      onChange(clean)
      setHue(hexToHsl(clean)[0])
    }
    setHexInput(clean)
  }

  const handleRgbChange = (channel: 'r' | 'g' | 'b', val: number) => {
    const newR = channel === 'r' ? val : r
    const newG = channel === 'g' ? val : g
    const newB = channel === 'b' ? val : b
    const newHex = rgbToHex(newR, newG, newB)
    onChange(newHex)
    setHexInput(newHex)
    setHue(hexToHsl(newHex)[0])
  }

  const recent = getRecentColors()

  const eyeDropperSupported = typeof window !== 'undefined' && 'EyeDropper' in window

  const pickWithEyeDropper = useCallback(async () => {
    try {
      const ED = (window as any).EyeDropper
      if (!ED) return
      const result = await new ED().open()
      const picked = (result?.sRGBHex || '').toLowerCase()
      if (picked) {
        onChange(picked)
        setHexInput(picked)
        setHue(hexToHsl(picked)[0])
        addRecentColor(picked)
      }
    } catch {
      // user cancelled — no-op
    }
  }, [onChange])

  return (
    <div className="relative">
      {label && <label className="block text-[12px] font-medium text-zinc-700 mb-1">{label}</label>}
      <div className="flex items-center gap-2">
        {/* Swatch */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-7 h-7 rounded-sm border border-zinc-200 shadow-sm flex-shrink-0 cursor-pointer hover:border-zinc-400 transition-colors"
          style={{ backgroundColor: hex }}
          title="Abrir seletor de cor"
        />
        {/* Hex input inline */}
        <input
          type="text"
          value={hexInput}
          onChange={e => handleHexSubmit(e.target.value)}
          onBlur={() => handleHexSubmit(hexInput)}
          className="flex-1 font-mono text-[12px] text-zinc-800 border border-zinc-200 rounded-md px-2 py-1.5 h-[30px] focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/15 transition-colors"
          placeholder="#000000"
        />
        {/* Eyedropper button */}
        {eyeDropperSupported && (
          <button
            type="button"
            onClick={pickWithEyeDropper}
            className="w-7 h-7 rounded-sm border border-zinc-200 flex items-center justify-center text-zinc-500 hover:text-zinc-800 hover:border-zinc-400 transition-colors flex-shrink-0"
            title="Capturar cor da tela"
          >
            <Pipette className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Popover */}
      {open && (
        <div ref={popRef} className="absolute z-50 left-0 top-full mt-2 w-[260px] bg-white rounded-lg border border-zinc-200 shadow-xl p-3 space-y-3">
          {/* Gradient area */}
          <canvas
            ref={gradRef}
            width={234}
            height={130}
            className="w-full h-[130px] rounded-md cursor-crosshair border border-zinc-100"
            onClick={handleGradientClick}
            onMouseDown={e => { handleGradientClick(e); const mv = (ev: MouseEvent) => handleGradientClick(ev as any); const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up) }; document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up) }}
          />

          {/* Hue slider */}
          <input
            type="range" min={0} max={360} value={hue}
            onChange={handleHueChange}
            className="w-full h-3 rounded-full appearance-none cursor-pointer"
            style={{ background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)' }}
          />

          {/* HEX / RGB inputs */}
          <div className="flex items-center gap-2">
            {mode === 'hex' ? (
              <div className="flex items-center flex-1 border border-zinc-200 rounded-md overflow-hidden">
                <span className="px-2 text-[11px] text-zinc-400 bg-zinc-50">#</span>
                <input
                  type="text"
                  value={hexInput.replace('#', '')}
                  onChange={e => handleHexSubmit('#' + e.target.value)}
                  className="flex-1 px-2 py-1 text-[12px] font-mono text-zinc-800 outline-none"
                  maxLength={6}
                />
              </div>
            ) : (
              <div className="flex gap-1 flex-1">
                {[
                  { label: 'R', val: r, ch: 'r' as const },
                  { label: 'G', val: g, ch: 'g' as const },
                  { label: 'B', val: b, ch: 'b' as const },
                ].map(c => (
                  <div key={c.label} className="flex-1">
                    <span className="text-[9px] text-zinc-400 block text-center">{c.label}</span>
                    <input
                      type="number" min={0} max={255}
                      value={c.val}
                      onChange={e => handleRgbChange(c.ch, +e.target.value)}
                      className="w-full px-1 py-0.5 text-[11px] font-mono text-center border border-zinc-200 rounded outline-none focus:border-orange-400"
                    />
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setMode(mode === 'hex' ? 'rgb' : 'hex')}
              className="p-1 text-zinc-400 hover:text-zinc-700 rounded transition-colors"
              title={mode === 'hex' ? 'Trocar para RGB' : 'Trocar para HEX'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
            </button>
          </div>

          {/* Recent colors */}
          {recent.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Recentes</p>
              <div className="flex gap-1.5 flex-wrap">
                {recent.map(c => (
                  <button
                    key={c} type="button"
                    onClick={() => { onChange(c); setHexInput(c); setHue(hexToHsl(c)[0]) }}
                    className="w-6 h-6 rounded-sm border border-zinc-200 hover:border-zinc-400 transition-colors cursor-pointer"
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
