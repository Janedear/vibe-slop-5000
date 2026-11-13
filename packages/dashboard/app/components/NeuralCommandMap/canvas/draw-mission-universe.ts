/**
 * Neural Command Map — Mission Universe Mode
 *
 * Renders the Fusion mission hierarchy as a solar-system orbital map:
 *   • Center sun = active mission
 *   • Inner orbit ring = milestones
 *   • Outer orbit rings = slices per milestone
 *   • Status color drives every body's fill
 */

import type { NCMMission, MissionStatus } from '../lib/ncm-types'
import { NCM_PALETTE } from '../lib/ncm-types'

const TAU = Math.PI * 2

const STATUS_COLOR: Record<MissionStatus, string> = {
  not_started: NCM_PALETTE.muted,
  in_progress: NCM_PALETTE.accent,
  blocked: NCM_PALETTE.hot,
  complete: NCM_PALETTE.success,
  cancelled: NCM_PALETTE.border,
  paused: NCM_PALETTE.info,
}

const MILESTONE_ORBIT = 110
const SLICE_ORBIT_BASE = 165
const SLICE_ORBIT_STEP = 32
const BODY_R = { mission: 32, milestone: 16, slice: 9, feature: 5 }

interface OrbitalBody {
  x: number
  y: number
  r: number
  label: string
  color: string
  status: MissionStatus
  kind: 'mission' | 'milestone' | 'slice'
}

/** Compute (x, y) for a body on an orbit at given angle and radius. */
const orbitPoint = (
  cx: number,
  cy: number,
  radius: number,
  angle: number,
): [number, number] => [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]

/** Build the full list of orbital bodies from mission data. */
const buildBodies = (
  mission: NCMMission,
  cx: number,
  cy: number,
  t: number,
): OrbitalBody[] => {
  const bodies: OrbitalBody[] = []

  // Sun
  bodies.push({
    x: cx,
    y: cy,
    r: BODY_R.mission,
    label: mission.title,
    color: STATUS_COLOR[mission.status],
    status: mission.status,
    kind: 'mission',
  })

  const nMilestones = mission.milestones.length
  if (!nMilestones) return bodies

  mission.milestones.forEach((ms, mi) => {
    const msAngle = (mi / nMilestones) * TAU + t * 0.00008
    const [mx, my] = orbitPoint(cx, cy, MILESTONE_ORBIT, msAngle)

    bodies.push({
      x: mx,
      y: my,
      r: BODY_R.milestone,
      label: ms.title,
      color: STATUS_COLOR[ms.status],
      status: ms.status,
      kind: 'milestone',
    })

    ms.slices.forEach((sl, si) => {
      const sliceOrbit = SLICE_ORBIT_BASE + si * SLICE_ORBIT_STEP
      const nSlices = ms.slices.length
      const slAngle = msAngle + ((si / nSlices - 0.5) * 0.6) + t * 0.00014 * (si % 2 ? 1 : -1)
      const [sx, sy] = orbitPoint(cx, cy, sliceOrbit, slAngle)

      bodies.push({
        x: sx,
        y: sy,
        r: BODY_R.slice,
        label: sl.title,
        color: STATUS_COLOR[sl.status],
        status: sl.status,
        kind: 'slice',
      })
    })
  })

  return bodies
}

/** Draw orbit rings (decorative circles around the sun). */
const drawOrbits = (ctx: CanvasRenderingContext2D, cx: number, cy: number): void => {
  const orbits = [MILESTONE_ORBIT, SLICE_ORBIT_BASE, SLICE_ORBIT_BASE + SLICE_ORBIT_STEP]
  for (const r of orbits) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, TAU)
    ctx.strokeStyle = NCM_PALETTE.border + '60'
    ctx.lineWidth = 0.5
    ctx.setLineDash([2, 6])
    ctx.stroke()
    ctx.setLineDash([])
  }
}

/** Draw a single orbital body. */
const drawBody = (
  ctx: CanvasRenderingContext2D,
  body: OrbitalBody,
  t: number,
): void => {
  const { x, y, r, color, label, kind, status } = body

  // Glow
  const glowR = r + (kind === 'mission' ? 20 : 10)
  const pulse = kind === 'mission' ? 0.3 + 0.15 * Math.sin(t * 0.002) : 0.15
  const grd = ctx.createRadialGradient(x, y, r * 0.4, x, y, glowR)
  grd.addColorStop(0, color + Math.round(pulse * 255).toString(16).padStart(2, '0'))
  grd.addColorStop(1, color + '00')
  ctx.beginPath()
  ctx.arc(x, y, glowR, 0, TAU)
  ctx.fillStyle = grd
  ctx.fill()

  // Body
  const bodyGrd = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r)
  bodyGrd.addColorStop(0, kind === 'mission' ? NCM_PALETTE.surface2 : color + '90')
  bodyGrd.addColorStop(1, color + (kind === 'mission' ? '40' : '30'))
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fillStyle = bodyGrd
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = kind === 'mission' ? 2 : 1
  ctx.stroke()

  // Status pulse ring for in-progress
  if (status === 'in_progress') {
    const pulseR = r + 4 + 3 * Math.sin(t * 0.003)
    ctx.beginPath()
    ctx.arc(x, y, pulseR, 0, TAU)
    ctx.strokeStyle = color + '60'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Label (only for mission and milestone — slices are too small)
  if (kind !== 'slice') {
    const short = label.length > 10 ? label.slice(0, 9) + '…' : label
    ctx.font = kind === 'mission' ? 'bold 10px "Inter"' : '9px "Inter"'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = NCM_PALETTE.cream
    ctx.fillText(short, x, y + r + 4)
  }
}

export const drawMissionUniverse = (
  ctx: CanvasRenderingContext2D,
  mission: NCMMission | undefined,
  width: number,
  height: number,
  t: number,
): void => {
  const cx = width / 2
  const cy = height / 2

  if (!mission) {
    // Placeholder when no mission data
    ctx.font = '14px "Inter"'
    ctx.fillStyle = NCM_PALETTE.muted
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Waiting for mission data…', cx, cy)
    return
  }

  drawOrbits(ctx, cx, cy)
  const bodies = buildBodies(mission, cx, cy, t)
  for (const body of bodies) {
    drawBody(ctx, body, t)
  }
}
