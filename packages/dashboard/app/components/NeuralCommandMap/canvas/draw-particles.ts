/**
 * Neural Command Map — Ambient Particle System
 *
 * Draws two layers:
 *   1. Burst particles (from agent events) — short-lived, bright
 *   2. Background drift particles — slow ambient sparkle grid
 */

import type { NCMParticle } from '../lib/ncm-types'
import { NCM_PALETTE } from '../lib/ncm-types'

// ─── Drift particles (persistent ambient layer) ─────────────────────────────

interface DriftParticle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  alpha: number
  alphaDir: number
  color: string
}

const DRIFT_COUNT = 60
let driftParticles: DriftParticle[] = []

const DRIFT_COLORS = [
  NCM_PALETTE.accent + '40',
  NCM_PALETTE.hot + '30',
  NCM_PALETTE.info + '30',
  NCM_PALETTE.blush + '20',
]

export const initDriftParticles = (width: number, height: number): void => {
  driftParticles = Array.from({ length: DRIFT_COUNT }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    size: Math.random() * 1.5 + 0.5,
    alpha: Math.random() * 0.5 + 0.1,
    alphaDir: Math.random() > 0.5 ? 1 : -1,
    color: DRIFT_COLORS[Math.floor(Math.random() * DRIFT_COLORS.length)],
  }))
}

export const tickDriftParticles = (width: number, height: number): void => {
  for (const p of driftParticles) {
    p.x = (p.x + p.vx + width) % width
    p.y = (p.y + p.vy + height) % height
    p.alpha += p.alphaDir * 0.005
    if (p.alpha > 0.6 || p.alpha < 0.05) p.alphaDir *= -1
  }
}

const drawDriftParticles = (ctx: CanvasRenderingContext2D): void => {
  for (const p of driftParticles) {
    ctx.save()
    ctx.globalAlpha = p.alpha
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fillStyle = p.color
    ctx.fill()
    ctx.restore()
  }
}

// ─── Burst particles (from NCMSimulationState.particles) ────────────────────

const drawBurstParticle = (ctx: CanvasRenderingContext2D, p: NCMParticle): void => {
  const alpha = p.life / p.maxLife
  if (alpha < 0.02) return

  ctx.save()
  ctx.globalAlpha = alpha

  const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2)
  grd.addColorStop(0, p.color + 'FF')
  grd.addColorStop(1, p.color + '00')

  ctx.beginPath()
  ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2)
  ctx.fillStyle = grd
  ctx.fill()

  ctx.beginPath()
  ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()

  ctx.restore()
}

// ─── Public API ─────────────────────────────────────────────────────────────

export const drawParticles = (
  ctx: CanvasRenderingContext2D,
  burstParticles: NCMParticle[],
  width: number,
  height: number,
): void => {
  // 1 — Drift layer (back)
  drawDriftParticles(ctx)

  // 2 — Burst layer (front)
  for (const p of burstParticles) {
    drawBurstParticle(ctx, p)
  }
}

export { tickDriftParticles as tickDrift }
