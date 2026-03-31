import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const endDate = searchParams.get('end') || ''
  const style = searchParams.get('style') || 'dark'
  const numberColor = searchParams.get('nc') || ''
  const labelColor = searchParams.get('lc') || ''
  const boxColor = searchParams.get('bc') || ''
  const bgColor = searchParams.get('bg') || ''
  const separatorColor = searchParams.get('sc') || ''
  const boxRadius = Number(searchParams.get('br') || '12')
  const boxBorder = searchParams.get('bb') || ''
  const title = searchParams.get('title') || ''
  const titleColor = searchParams.get('tc') || ''
  const expiredText = searchParams.get('expired') || 'Oferta encerrada'
  const labelDays = searchParams.get('ld') || 'DIAS'
  const labelHours = searchParams.get('lh') || 'HORAS'
  const labelMin = searchParams.get('lm') || 'MIN'
  const labelSec = searchParams.get('ls') || 'SEG'
  const fontSize = Number(searchParams.get('fs') || '36')
  const labelFs = Number(searchParams.get('lfs') || '11')
  const w = Number(searchParams.get('w') || '600')

  // Calculate remaining time
  const end = new Date(endDate).getTime()
  const now = Date.now()
  const diff = Math.max(0, end - now)
  const isExpired = diff <= 0

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  // Style presets
  const presets: Record<string, { numColor: string; lblColor: string; bxColor: string; background: string; sepColor: string; ttlColor: string }> = {
    dark: {
      numColor: '#FFFFFF', lblColor: '#9CA3AF', bxColor: '#1F2937',
      background: '#111827', sepColor: '#6B7280', ttlColor: '#F9FAFB',
    },
    light: {
      numColor: '#111827', lblColor: '#6B7280', bxColor: '#F3F4F6',
      background: '#FFFFFF', sepColor: '#D1D5DB', ttlColor: '#111827',
    },
    brand: {
      numColor: '#FFFFFF', lblColor: 'rgba(255,255,255,0.7)', bxColor: '#EA580C',
      background: '#F97316', sepColor: 'rgba(255,255,255,0.5)', ttlColor: '#FFFFFF',
    },
    minimal: {
      numColor: '#111827', lblColor: '#9CA3AF', bxColor: 'transparent',
      background: 'transparent', sepColor: '#D1D5DB', ttlColor: '#374151',
    },
    urgent: {
      numColor: '#FFFFFF', lblColor: 'rgba(255,255,255,0.8)', bxColor: '#991B1B',
      background: '#DC2626', sepColor: 'rgba(255,255,255,0.4)', ttlColor: '#FFFFFF',
    },
  }

  const preset = presets[style] || presets.dark
  const nc = numberColor || preset.numColor
  const lc = labelColor || preset.lblColor
  const bc = boxColor || preset.bxColor
  const bg = bgColor || preset.background
  const sc = separatorColor || preset.sepColor
  const tc = titleColor || preset.ttlColor

  const units = [
    { value: days, label: labelDays },
    { value: hours, label: labelHours },
    { value: minutes, label: labelMin },
    { value: seconds, label: labelSec },
  ]

  const h = title ? 160 : 120

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: w,
          height: h,
          backgroundColor: bg,
          fontFamily: 'Arial, sans-serif',
        }}
      >
        {isExpired ? (
          <div style={{ fontSize: 24, fontWeight: 'bold', color: nc }}>
            {expiredText}
          </div>
        ) : (
          <>
            {title && (
              <div
                style={{
                  display: 'flex',
                  fontSize: 14,
                  fontWeight: 700,
                  color: tc,
                  letterSpacing: 3,
                  textTransform: 'uppercase' as const,
                  marginBottom: 16,
                }}
              >
                {title}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {units.map((unit, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {i > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        marginBottom: 16,
                      }}
                    >
                      <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: sc }} />
                      <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: sc }} />
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      backgroundColor: bc,
                      borderRadius: boxRadius,
                      padding: '14px 20px 10px',
                      minWidth: 72,
                      border: boxBorder ? `2px solid ${boxBorder}` : 'none',
                    }}
                  >
                    <div
                      style={{
                        fontSize,
                        fontWeight: 800,
                        color: nc,
                        lineHeight: 1,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {String(unit.value).padStart(2, '0')}
                    </div>
                    <div
                      style={{
                        fontSize: labelFs,
                        fontWeight: 600,
                        color: lc,
                        marginTop: 6,
                        letterSpacing: 1.5,
                        textTransform: 'uppercase' as const,
                      }}
                    >
                      {unit.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    ),
    {
      width: w,
      height: h,
    }
  )
}
