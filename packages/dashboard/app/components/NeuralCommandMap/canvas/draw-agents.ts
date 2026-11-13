/**
 * Neural Command Map — Agent Node Drawing
 *
 * Draws each agent as a layered glow node:
 *   outer halo → state ring → core circle → label → token arc
 */

import type { NCMAgent, AgentState } from '../lib/ncm-types'
import { NCM_PALETTE, stateColor } from '../lib/ncm-types'
import { roundRect } from './canvas-utils'

const TAU = Math.PI * 2
const NODE_RADIUS = 28
const RING_WIDTH = 3
const TOKEN_ARC_RADIUS = 36

/** Radius of an agent node at scale = 1 */
export const AGENT_RADIUS = NODE_RADIUS + RING_WIDTH + 2

/** Draw a pulsing halo behind a node when it is active. */
const drawHalo = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  t: number,
  state: AgentState,
): void => {
  const pulse =
    state === 'thinking' || state === 'tool_calling'
      ? 0.4 + 0.3 * Math.sin(t * 0.004)
      : 0.15
  const r = NODE_RADIUS + 14 + (state === 'thinking' ? 4 * Math.sin(t * 0.003) : 0)

  const grad = ctx.createRadialGradient(x, y, NODE_RADIUS * 0.5, x, y, r)
  grad.addColorStop(0, color + Math.round(pulse * 255).toString(16).padStart(2, '0'))
  grad.addColorStop(1, color + '00')

  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fillStyle = grad
  ctx.fill()
}

/** Draw the token-usage arc around the node. */
const drawTokenArc = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tokensUsed: number,
  tokensMax: number,
  color: string,
): void => {
  const pct = Math.min(1, tokensUsed / (tokensMax || 1))
  const startAngle = -Math.PI / 2
  const endAngle = startAngle + TAU * pct

  // Background track
  ctx.beginPath()
  ctx.arc(x, y, TOKEN_ARC_RADIUS, 0, TAU)
  ctx.strokeStyle = NCM_PALETTE.border
  ctx.lineWidth = 2
  ctx.stroke()

  if (pct > 0.01) {
    ctx.beginPath()
    ctx.arc(x, y, TOKEN_ARC_RADIUS, startAngle, endAngle)
    // Colour shifts from info → hot as usage climbs
    const arcColor = pct > 0.8 ? NCM_PALETTE.hot : pct > 0.5 ? NCM_PALETTE.accent : color
    ctx.strokeStyle = arcColor
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

/** Draw a small floating message bubble above the node. */
const drawBubble = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  opacity: number,
): void => {
  if (opacity < 0.05) return
  const pad = 6
  ctx.font = '10px "Inter", sans-serif'
  const tw = ctx.measureText(text).width
  const bw = tw + pad * 2
  const bh = 18
  const bx = x - bw / 2
  const by = y - NODE_RADIUS - bh - 10

  ctx.globalAlpha = opacity * 0.9
  ctx.beginPath()
  roundRect(ctx, bx, by, bw, bh, 4)
  ctx.fillStyle = NCM_PALETTE.surface2
  ctx.fill()
  ctx.strokeStyle = NCM_PALETTE.border
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = NCM_PALETTE.cream
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, by + bh / 2)
  ctx.globalAlpha = 1
}

/** Draw an agent's current tool call badge. */
const drawToolBadge = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  toolName: string,
): void => {
  const label = toolName.length > 12 ? toolName.slice(0, 11) + '…' : toolName
  ctx.font = '9px "Inter", sans-serif'
  const tw = ctx.measureText(label).width
  const bw = tw + 10
  const bh = 14
  const bx = x + NODE_RADIUS - 2
  const by = y - bh / 2

  ctx.beginPath()
  roundRect(ctx, bx, by, bw, bh, 3)
  ctx.fillStyle = NCM_PALETTE.info + 'CC'
  ctx.fill()

  ctx.fillStyle = '#fff'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, bx + 5, by + bh / 2)
}

export interface DrawAgentOptions {
  ctx: CanvasRenderingContext2D
  agent: NCMAgent
  t: number       // monotonic timestamp (ms)
  selected: boolean
  dpr: number
}

/** Draw one agent node at its simulation position. */
export const drawAgent = ({ ctx, agent, t, selected }: DrawAgentOptions): void => {
  const { x, y, state, opacity, scale, tokensUsed, tokensMax } = agent

  if (opacity < 0.02) return

  ctx.save()
  ctx.globalAlpha = opacity
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.translate(-x, -y)

  const color = stateColor(state)

  // 1 — Halo
  drawHalo(ctx, x, y, color, t, state)

  // 2 — Token arc
  drawTokenArc(ctx, x, y, tokensUsed, tokensMax, color)

  // 3 — Selection ring (outer)
  if (selected) {
    ctx.beginPath()
    ctx.arc(x, y, NODE_RADIUS + RING_WIDTH + 4, 0, TAU)
    ctx.strokeStyle = NCM_PALETTE.cream
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.stroke()
    ctx.setLineDash([])
  }

  // 4 — State ring
  ctx.beginPath()
  ctx.arc(x, y, NODE_RADIUS + RING_WIDTH, 0, TAU)
  ctx.strokeStyle = color
  ctx.lineWidth = RING_WIDTH
  ctx.stroke()

  // 5 — Node body
  const bodyGrad = ctx.createRadialGradient(x - 6, y - 6, 2, x, y, NODE_RADIUS)
  bodyGrad.addColorStop(0, NCM_PALETTE.surface2)
  bodyGrad.addColorStop(1, NCM_PALETTE.surface1)
  ctx.beginPath()
  ctx.arc(x, y, NODE_RADIUS, 0, TAU)
  ctx.fillStyle = bodyGrad
  ctx.fill()
  ctx.strokeStyle = NCM_PALETTE.border
  ctx.lineWidth = 1
  ctx.stroke()

  // 6 — Agent runtime icon (letter)
  const initials = (agent.runtime ?? 'ai').slice(0, 2).toUpperCase()
  ctx.font = `bold 11px "Inter", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(initials, x, y - 2)

  // 7 — Name label below node
  ctx.font = '10px "Inter", sans-serif'
  ctx.fillStyle = NCM_PALETTE.cream
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const displayName = agent.name.length > 14 ? agent.name.slice(0, 13) + '…' : agent.name
  ctx.fillText(displayName, x, y + NODE_RADIUS + RING_WIDTH + 5)

  // 8 — Tool badge
  if (state === 'tool_calling' && agent.currentTool) {
    drawToolBadge(ctx, x, y, agent.currentTool)
  }

  ctx.restore()

  // 9 — Message bubble (outside the saved transform so it stays screen-space)
  if (agent.messageBubbles.length > 0) {
    const latest = agent.messageBubbles[agent.messageBubbles.length - 1]
    const age = Date.now() - latest.time
    const bubbleOpacity = Math.max(0, 1 - age / 3000) * opacity
    if (bubbleOpacity > 0.05) {
      const preview =
        latest.text.length > 32 ? latest.text.slice(0, 31) + '…' : latest.text
      drawBubble(ctx, x, y, preview, bubbleOpacity)
    }
  }
}

/** Draw all agents in the simulation. */
export const drawAgents = (
  ctx: CanvasRenderingContext2D,
  agents: Map<string, NCMAgent>,
  t: number,
  selectedId: string | null,
  dpr: number,
): void => {
  for (const agent of agents.values()) {
    drawAgent({ ctx, agent, t, selected: agent.id === selectedId, dpr })
  }
}
