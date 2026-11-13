/**
 * Neural Command Map — Execution Pipeline Mode
 *
 * Renders a horizontal pipeline: Plan → Design → Build → Test → Review → Deploy
 * Each stage shows its status, any active agents assigned, and progress.
 */

import type { NCMPipelineNode, MissionStatus } from '../lib/ncm-types'
// NCMPipelineNode.status uses MissionStatus; ensure both are imported
import { NCM_PALETTE } from '../lib/ncm-types'
import { roundRect } from './canvas-utils'

const STAGE_W = 110
const STAGE_H = 72
const STAGE_GAP = 32
const CONNECTOR_H = 3
const STAGES_DEFAULT: NCMPipelineNode[] = [
  { id: 'plan', label: 'Plan', status: 'not_started', agentIds: [], progress: 0 },
  { id: 'design', label: 'Design', status: 'not_started', agentIds: [], progress: 0 },
  { id: 'build', label: 'Build', status: 'not_started', agentIds: [], progress: 0 },
  { id: 'test', label: 'Test', status: 'not_started', agentIds: [], progress: 0 },
  { id: 'review', label: 'Review', status: 'not_started', agentIds: [], progress: 0 },
  { id: 'deploy', label: 'Deploy', status: 'not_started', agentIds: [], progress: 0 },
]

const STATUS_COLORS: Record<MissionStatus, string> = {
  not_started: NCM_PALETTE.muted,
  in_progress: NCM_PALETTE.accent,
  blocked: NCM_PALETTE.hot,
  complete: NCM_PALETTE.success,
  cancelled: NCM_PALETTE.border,
  paused: NCM_PALETTE.info,
}

/** Draw a stage pill with its status and progress bar. */
const drawStage = (
  ctx: CanvasRenderingContext2D,
  node: NCMPipelineNode,
  x: number,
  y: number,
  t: number,
): void => {
  const color = STATUS_COLORS[node.status]
  const isActive = node.status === 'in_progress'

  // Outer glow for active stage
  if (isActive) {
    const pulse = 0.3 + 0.15 * Math.sin(t * 0.003)
    const grd = ctx.createRadialGradient(
      x + STAGE_W / 2, y + STAGE_H / 2, STAGE_H * 0.2,
      x + STAGE_W / 2, y + STAGE_H / 2, STAGE_W * 0.8,
    )
    grd.addColorStop(0, color + Math.round(pulse * 255).toString(16).padStart(2, '0'))
    grd.addColorStop(1, color + '00')
    ctx.beginPath()
    roundRect(ctx, x - 10, y - 10, STAGE_W + 20, STAGE_H + 20, 14)
    ctx.fillStyle = grd
    ctx.fill()
  }

  // Stage box
  ctx.beginPath()
  roundRect(ctx, x, y, STAGE_W, STAGE_H, 8)
  ctx.fillStyle = NCM_PALETTE.surface2
  ctx.fill()
  ctx.strokeStyle = isActive ? color : NCM_PALETTE.border
  ctx.lineWidth = isActive ? 1.5 : 0.75
  ctx.stroke()

  // Status stripe at top
  ctx.beginPath()
  roundRect(ctx, x, y, STAGE_W, 4, [8, 8, 0, 0])
  ctx.fillStyle = color
  ctx.fill()

  // Label
  ctx.font = 'bold 11px "Inter"'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = NCM_PALETTE.cream
  ctx.fillText(node.label, x + STAGE_W / 2, y + 12)

  // Progress bar
  const barY = y + STAGE_H - 14
  const barW = STAGE_W - 16
  const barX = x + 8

  ctx.beginPath()
  roundRect(ctx, barX, barY, barW, 4, 2)
  ctx.fillStyle = NCM_PALETTE.border
  ctx.fill()

  if (node.progress > 0) {
    ctx.beginPath()
    roundRect(ctx, barX, barY, barW * node.progress, 4, 2)
    ctx.fillStyle = color
    ctx.fill()
  }

  // Agent dot indicators
  const nAgents = node.agentIds.length
  if (nAgents > 0) {
    const dotR = 4
    const dotY = y + STAGE_H / 2
    const startX = x + STAGE_W / 2 - ((nAgents - 1) * (dotR * 2 + 3)) / 2
    for (let i = 0; i < nAgents; i++) {
      const dotX = startX + i * (dotR * 2 + 3)
      ctx.beginPath()
      ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    }
  }

  // Status icon for complete / blocked
  if (node.status === 'complete') {
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.fillText('✓', x + STAGE_W - 6, y + 10)
  } else if (node.status === 'blocked') {
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.fillStyle = NCM_PALETTE.hot
    ctx.fillText('⚠', x + STAGE_W - 6, y + 10)
  }
}

/** Draw the connector arrow between two stages. */
const drawConnector = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  x2: number,
  y: number,
  sourceStatus: MissionStatus,
  t: number,
): void => {
  const isFlowing = sourceStatus === 'complete' || sourceStatus === 'in_progress'
  const cx = (x1 + x2) / 2
  const cy = y + STAGE_H / 2

  ctx.beginPath()
  ctx.moveTo(x1, cy)
  ctx.lineTo(x2, cy)
  ctx.strokeStyle = isFlowing ? NCM_PALETTE.accent + 'CC' : NCM_PALETTE.border + '80'
  ctx.lineWidth = CONNECTOR_H
  ctx.stroke()

  if (isFlowing) {
    // Animated chevron
    const chevronX = cx + 10 * Math.sin(t * 0.004)
    ctx.beginPath()
    ctx.moveTo(chevronX - 5, cy - 5)
    ctx.lineTo(chevronX, cy)
    ctx.lineTo(chevronX - 5, cy + 5)
    ctx.strokeStyle = NCM_PALETTE.hot
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

export const drawPipeline = (
  ctx: CanvasRenderingContext2D,
  nodes: NCMPipelineNode[] | undefined,
  width: number,
  height: number,
  t: number,
): void => {
  const pipeline = nodes?.length ? nodes : STAGES_DEFAULT
  const totalW = pipeline.length * STAGE_W + (pipeline.length - 1) * STAGE_GAP
  const startX = (width - totalW) / 2
  const startY = height / 2 - STAGE_H / 2

  // Section header
  ctx.font = 'bold 12px "Inter"'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = NCM_PALETTE.muted
  ctx.fillText('EXECUTION PIPELINE', startX, startY - 14)

  for (let i = 0; i < pipeline.length; i++) {
    const sx = startX + i * (STAGE_W + STAGE_GAP)

    if (i < pipeline.length - 1) {
      drawConnector(ctx, sx + STAGE_W, sx + STAGE_W + STAGE_GAP, startY, pipeline[i].status, t)
    }

    drawStage(ctx, pipeline[i], sx, startY, t)
  }
}
