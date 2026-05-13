// =============================================
// Tiny confetti — no deps. Used to celebrate when a popup is
// published, an opt-in lands, an automation goes live, etc.
//
// Inspired by canvas-confetti's API: a single fire() call paints an
// overlay canvas on top of everything for ~1.2s and tears down after.
// Cheap to call multiple times (each invocation owns its own canvas).
// =============================================

interface FireOpts {
  particleCount?: number
  spread?: number
  startVelocity?: number
  /** 0 = top, 1 = bottom; default 0.6 = slightly below center */
  originY?: number
  /** Color palette. Defaults to a Worder-orange + accent mix. */
  colors?: string[]
}

const DEFAULT_COLORS = [
  '#F97316', // worder orange
  '#FB923C',
  '#FDE68A',
  '#10B981', // emerald
  '#34D399',
  '#A855F7', // violet
]

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vRot: number
  size: number
  color: string
  life: number
}

export function fireConfetti(opts: FireOpts = {}): void {
  if (typeof window === 'undefined') return
  const {
    particleCount = 100,
    spread = 70,
    startVelocity = 35,
    originY = 0.6,
    colors = DEFAULT_COLORS,
  } = opts

  const canvas = document.createElement('canvas')
  canvas.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:2147483647'
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return
  }

  const cx = canvas.width / 2
  const cy = canvas.height * originY

  const particles: Particle[] = []
  for (let i = 0; i < particleCount; i++) {
    // Random angle within the spread cone, biased upward.
    const angleDeg = -90 + (Math.random() - 0.5) * spread
    const angle = (angleDeg * Math.PI) / 180
    const speed = startVelocity * (0.6 + Math.random() * 0.7)
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI,
      vRot: (Math.random() - 0.5) * 0.4,
      size: 6 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 1,
    })
  }

  const startedAt = performance.now()
  const DURATION_MS = 1200
  const GRAVITY = 0.4
  const DRAG = 0.985

  function tick(now: number) {
    const elapsed = now - startedAt
    if (elapsed > DURATION_MS) {
      canvas.remove()
      return
    }
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const p of particles) {
      p.vx *= DRAG
      p.vy = p.vy * DRAG + GRAVITY
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vRot
      p.life = 1 - elapsed / DURATION_MS
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.globalAlpha = Math.max(0, p.life)
      ctx.fillStyle = p.color
      // Rectangular confetti — looks busier than circles for the
      // same particle count.
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      ctx.restore()
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
