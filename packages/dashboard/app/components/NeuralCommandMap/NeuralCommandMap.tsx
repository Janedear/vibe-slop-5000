/**
 * Neural Command Map
 *
 * Root component for the three-mode live visualizer.
 * Manages canvas lifecycle, event bridge connection,
 * mode switching, and hit testing for agent selection.
 *
 * Usage:
 *   <NeuralCommandMap wsUrl="ws://localhost:3001/ncm" mode="neural_flow" />
 *
 * When wsUrl is not supplied, runs in demo mode with synthetic events.
 */

import { useRef, useEffect, useCallback, useState, type PointerEvent } from 'react'
import { NCM_PALETTE, type NCMMode } from './lib/ncm-types'
import { FusionEventBridge, MockEventGenerator, type NCMEvent } from './lib/ncm-event-bridge'
import { useNCMSimulation } from './hooks/use-ncm-simulation'
import { drawAgents, AGENT_RADIUS } from './canvas/draw-agents'
import { drawEdges, tickEdgeParticles, pruneEdgeParticles } from './canvas/draw-edges'
import {
  drawParticles,
  initDriftParticles,
  tickDrift,
} from './canvas/draw-particles'
import { drawMissionUniverse } from './canvas/draw-mission-universe'
import { drawPipeline } from './canvas/draw-pipeline'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NeuralCommandMapProps {
  /** WebSocket endpoint for Fusion engine events. Omit for demo mode. */
  wsUrl?: string
  /** Initial visualisation mode. */
  initialMode?: NCMMode
  /** Optional fixed height. Defaults to 100% of container. */
  height?: number
  className?: string
}

// ─── Mode Labels ─────────────────────────────────────────────────────────────

const MODE_LABELS: Record<NCMMode, string> = {
  neural_flow: 'Neural Flow',
  mission_universe: 'Mission Universe',
  pipeline: 'Execution Pipeline',
}

// ─── Component ───────────────────────────────────────────────────────────────

export const NeuralCommandMap = ({
  wsUrl,
  initialMode = 'neural_flow',
  height,
  className = '',
}: NeuralCommandMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tRef = useRef<number>(0)
  const dprRef = useRef<number>(1)

  const [mode, setMode] = useState<NCMMode>(initialMode)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [agentCount, setAgentCount] = useState(0)
  const [totalCost, setTotalCost] = useState(0)

  // Canvas dimensions in CSS pixels
  const [dims, setDims] = useState({ w: 800, h: height ?? 600 })

  const { stateRef, processEvent, tick } = useNCMSimulation({
    mode,
    width: dims.w,
    height: dims.h,
  })

  // ─── Resize observer ────────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height: h } = e.contentRect
        setDims({ w: width, h: height ?? h })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [height])

  // ─── HiDPI canvas setup ─────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    dprRef.current = dpr
    canvas.width = dims.w * dpr
    canvas.height = dims.h * dpr
    canvas.style.width = `${dims.w}px`
    canvas.style.height = `${dims.h}px`
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    initDriftParticles(dims.w, dims.h)
  }, [dims])

  // ─── Event bridge ────────────────────────────────────────────────────────

  useEffect(() => {
    const bridge = wsUrl
      ? new FusionEventBridge(wsUrl)
      : new MockEventGenerator()

    const off = bridge.on((event: NCMEvent) => {
      processEvent(event)
    })

    if ('onStatus' in bridge) {
      ;(bridge as FusionEventBridge).onStatus(s => {
        setConnected(s.connected)
      })
      ;(bridge as FusionEventBridge).connect()
    } else {
      setConnected(true)
      ;(bridge as MockEventGenerator).start()
    }

    return () => {
      off()
      if ('disconnect' in bridge) (bridge as FusionEventBridge).disconnect()
      else (bridge as MockEventGenerator).stop()
    }
  }, [wsUrl, processEvent])

  // ─── Render loop ────────────────────────────────────────────────────────

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const t = (tRef.current += 16) // ~60fps monotonic
    const { w, h } = dims
    const s = stateRef.current

    // Advance simulation
    tick()
    tickEdgeParticles()
    tickDrift(w, h)

    // Clear
    ctx.clearRect(0, 0, w, h)

    // Background gradient
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, w * 0.8)
    bg.addColorStop(0, NCM_PALETTE.surface1)
    bg.addColorStop(1, NCM_PALETTE.bg)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)

    // Mode-specific rendering
    if (s.mode === 'neural_flow') {
      drawParticles(ctx, s.particles, w, h)
      drawEdges(ctx, s.edges, s.agents)
      drawAgents(ctx, s.agents, t, selectedId, dprRef.current)
    } else if (s.mode === 'mission_universe') {
      drawParticles(ctx, s.particles, w, h)
      drawMissionUniverse(ctx, s.mission, w, h, t)
    } else {
      drawParticles(ctx, s.particles, w, h)
      drawPipeline(ctx, s.pipelineNodes, w, h, t)
    }

    // HUD overlay
    drawHUD(ctx, w, h, s.agents.size, s.totalCostUsd, s.mode, connected, t)

    // Prune edge particles for removed edges
    pruneEdgeParticles(new Set(s.edges.keys()))

    // Sync UI state at reduced rate (every ~20 frames)
    if (t % (16 * 20) < 20) {
      setAgentCount(s.agents.size)
      setTotalCost(s.totalCostUsd)
    }

    rafRef.current = requestAnimationFrame(renderFrame)
  }, [dims, stateRef, tick, selectedId, connected])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(renderFrame)
    return () => cancelAnimationFrame(rafRef.current)
  }, [renderFrame])

  // ─── HUD draw (canvas-side) ─────────────────────────────────────────────

  const drawHUD = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    nAgents: number,
    cost: number,
    activeMode: NCMMode,
    isConnected: boolean,
    t: number,
  ) => {
    // Top-right status pill
    const pillText = isConnected ? `● LIVE  ${nAgents} agents` : `○ DEMO  ${nAgents} agents`
    ctx.font = '10px "Inter", monospace'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'right'
    ctx.fillStyle = isConnected ? NCM_PALETTE.success : NCM_PALETTE.muted
    ctx.fillText(pillText, w - 12, 12)

    // Cost (if any)
    if (cost > 0) {
      ctx.fillStyle = NCM_PALETTE.muted
      ctx.fillText(`$${cost.toFixed(4)}`, w - 12, 26)
    }

    // Scan line (subtle aesthetic effect)
    const scanY = ((t * 0.08) % (h + 60)) - 30
    const scanGrad = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30)
    scanGrad.addColorStop(0, 'transparent')
    scanGrad.addColorStop(0.5, NCM_PALETTE.accent + '08')
    scanGrad.addColorStop(1, 'transparent')
    ctx.fillStyle = scanGrad
    ctx.fillRect(0, scanY - 30, w, 60)
  }

  // ─── Hit testing ─────────────────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      if (mode !== 'neural_flow') return
      const rect = canvasRef.current!.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      let hit: string | null = null
      for (const agent of stateRef.current.agents.values()) {
        const dx = agent.x - mx
        const dy = agent.y - my
        if (Math.sqrt(dx * dx + dy * dy) <= AGENT_RADIUS) {
          hit = agent.id
          break
        }
      }
      setSelectedId(prev => (prev === hit ? null : hit))
    },
    [mode, stateRef],
  )

  // ─── Selected agent detail panel ─────────────────────────────────────────

  const selectedAgent = selectedId ? stateRef.current.agents.get(selectedId) : null

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-xl ${className}`}
      style={{
        background: NCM_PALETTE.bg,
        height: height ?? '100%',
        minHeight: 300,
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
    >
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        style={{ cursor: mode === 'neural_flow' ? 'crosshair' : 'default', display: 'block' }}
      />

      {/* Mode switcher — bottom center */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 6,
        }}
      >
        {(['neural_flow', 'mission_universe', 'pipeline'] as NCMMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: '5px 12px',
              borderRadius: 20,
              border: `1px solid ${mode === m ? NCM_PALETTE.accent : NCM_PALETTE.border}`,
              background: mode === m ? NCM_PALETTE.accent + '30' : NCM_PALETTE.surface1,
              color: mode === m ? NCM_PALETTE.cream : NCM_PALETTE.muted,
              fontSize: 10,
              fontWeight: mode === m ? 700 : 400,
              cursor: 'pointer',
              letterSpacing: '0.04em',
              transition: 'all 150ms ease',
            }}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Selected agent detail panel */}
      {selectedAgent && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            width: 200,
            background: NCM_PALETTE.surface1 + 'EE',
            border: `1px solid ${NCM_PALETTE.border}`,
            borderRadius: 10,
            padding: '12px 14px',
            fontSize: 11,
            color: NCM_PALETTE.cream,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6, color: NCM_PALETTE.hot }}>
            {selectedAgent.name}
          </div>
          <div style={{ color: NCM_PALETTE.muted, marginBottom: 4 }}>
            State:{' '}
            <span style={{ color: NCM_PALETTE.accent }}>{selectedAgent.state}</span>
          </div>
          {selectedAgent.runtime && (
            <div style={{ color: NCM_PALETTE.muted, marginBottom: 4 }}>
              Runtime:{' '}
              <span style={{ color: NCM_PALETTE.cream }}>{selectedAgent.runtime}</span>
            </div>
          )}
          <div style={{ color: NCM_PALETTE.muted, marginBottom: 4 }}>
            Tokens:{' '}
            <span style={{ color: NCM_PALETTE.info }}>
              {selectedAgent.tokensUsed.toLocaleString()} /&nbsp;
              {selectedAgent.tokensMax.toLocaleString()}
            </span>
          </div>
          {selectedAgent.costUsd !== undefined && (
            <div style={{ color: NCM_PALETTE.muted, marginBottom: 4 }}>
              Cost:{' '}
              <span style={{ color: NCM_PALETTE.cream }}>
                ${selectedAgent.costUsd.toFixed(4)}
              </span>
            </div>
          )}
          <div style={{ color: NCM_PALETTE.muted, marginBottom: 4 }}>
            Tool calls:{' '}
            <span style={{ color: NCM_PALETTE.cream }}>{selectedAgent.toolCalls}</span>
          </div>
          <button
            onClick={() => setSelectedId(null)}
            style={{
              marginTop: 8,
              width: '100%',
              padding: '3px 0',
              borderRadius: 6,
              border: `1px solid ${NCM_PALETTE.border}`,
              background: 'transparent',
              color: NCM_PALETTE.muted,
              fontSize: 10,
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}

export default NeuralCommandMap
