/**
 * Neural Command Map — Edge Drawing
 *
 * Draws communication edges between agents with animated
 * flow particles running along active edges.
 */

import type { NCMEdge, NCMAgent } from '../lib/ncm-types'
import { NCM_PALETTE } from '../lib/ncm-types'
import { roundRect } from './canvas-utils'

interface FlowParticle {
  t: number      // 0..1 along the edge
  speed: number
  size: number
  color: string
}

// In-module particle state keyed by edge ID
const edgeParticles = new Map<string, FlowParticle[]>()

const ensureParticles = (edgeId: string): FlowParticle[] => {
  if (!edgeParticles.has(edgeId)) {
    edgeParticles.set(edgeId, [
      { t: 0, speed: 0.004 + Math.random() * 0.003, size: 2.5, color: NCM_PALETTE.accent },
      { t: 0.4, speed: 0.003 + Math.random() * 0.003, size: 2, color: NCM_PALETTE.hot },
    ])
  }
  return edgeParticles.get(edgeId)!
}

/** Advance all edge flow particles. Called each animation frame. */
export const tickEdgeParticles = (): void => {
  for (const [, particles] of edgeParticles) {
    for (const p of particles) {
      p.t = (p.t + p.speed) % 1
    }
  }
}

/** Remove particles for a stale edge that is no longer in the simulation. */
export const pruneEdgeParticles = (activeIds: Set<string>): void => {
  for (const id of edgeParticles.keys()) {
    if (!activeIds.has(id)) edgeParticles.delete(id)
  }
}

const lerpPoint = (
  x1: number, y1: number,
  x2: number, y2: number,
  cx: number, cy: number,
  t: number,
): [number, number] => {
  // Quadratic bezier
  const mt = 1 - t
  const x = mt * mt * x1 + 2 * mt * t * cx + t * t * x2
  const y = mt * mt * y1 + 2 * mt * t * cy + t * t * cy  // intentional: use cy for y only
  // simpler: straight lerp with slight curve
  void x; void y
  return [
    (1 - t) * x1 + t * x2,
    (1 - t) * y1 + t * y2 + Math.sin(t * Math.PI) * (cx - x1) * 0.15,
  ]
}

/** Draw a single edge between two agents. */
const drawEdge = (
  ctx: CanvasRenderingContext2D,
  edge: NCMEdge,
  source: NCMAgent,
  target: NCMAgent,
): void => {
  const { x: x1, y: y1 } = source
  const { x: x2, y: y2 } = target
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2

  const opacity = edge.active ? 0.7 : 0.2

  // Edge line
  ctx.save()
  ctx.globalAlpha = opacity

  const grad = ctx.createLinearGradient(x1, y1, x2, y2)
  grad.addColorStop(0, NCM_PALETTE.accent + '80')
  grad.addColorStop(0.5, NCM_PALETTE.hot + 'CC')
  grad.addColorStop(1, NCM_PALETTE.info + '80')

  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.quadraticCurveTo(mx, my, x2, y2)
  ctx.strokeStyle = edge.active ? grad : NCM_PALETTE.border
  ctx.lineWidth = edge.active ? 1.5 : 0.75
  ctx.setLineDash(edge.active ? [] : [3, 4])
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()

  // Message count badge
  if (edge.messageCount > 0) {
    const label = edge.messageCount > 99 ? '99+' : String(edge.messageCount)
    ctx.save()
    ctx.globalAlpha = 0.7
    ctx.font = '8px "Inter", sans-serif'
    const tw = ctx.measureText(label).width + 6
    const bh = 12
    ctx.beginPath()
    roundRect(ctx, mx - tw / 2, my - bh / 2, tw, bh, 3)
    ctx.fillStyle = NCM_PALETTE.surface2
    ctx.fill()
    ctx.fillStyle = NCM_PALETTE.muted
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, mx, my)
    ctx.restore()
  }

  // Flow particles along active edges
  if (edge.active) {
    const particles = ensureParticles(edge.id)
    for (const p of particles) {
      const [px, py] = lerpPoint(x1, y1, x2, y2, mx, my, p.t)
      ctx.save()
      ctx.globalAlpha = 0.9

      const grd = ctx.createRadialGradient(px, py, 0, px, py, p.size * 2)
      grd.addColorStop(0, p.color + 'FF')
      grd.addColorStop(1, p.color + '00')

      ctx.beginPath()
      ctx.arc(px, py, p.size * 2, 0, Math.PI * 2)
      ctx.fillStyle = grd
      ctx.fill()

      ctx.beginPath()
      ctx.arc(px, py, p.size * 0.6, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'
      ctx.fill()
      ctx.restore()
    }
  }
}

/** Draw all edges in the simulation. */
export const drawEdges = (
  ctx: CanvasRenderingContext2D,
  edges: Map<string, NCMEdge>,
  agents: Map<string, NCMAgent>,
): void => {
  for (const edge of edges.values()) {
    const source = agents.get(edge.sourceId)
    const target = agents.get(edge.targetId)
    if (!source || !target) continue
    drawEdge(ctx, edge, source, target)
  }
}
