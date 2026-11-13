/**
 * Neural Command Map — Simulation Hook
 *
 * Manages the live simulation state for all three NCM modes.
 * Processes incoming NCM events and updates agent positions, edges,
 * particles, mission hierarchy, and pipeline nodes.
 */

import { useRef, useEffect, useCallback } from 'react'
import type {
  NCMSimulationState,
  NCMAgent,
  NCMEdge,
  NCMMode,
  AgentState,
} from '../lib/ncm-types'
import type { NCMEvent } from '../lib/ncm-event-bridge'
import { NCM_PALETTE } from '../lib/ncm-types'

const DEFAULT_TOKENS_MAX = 200_000
const FORCE_STRENGTH = 0.015
const REPULSION_RADIUS = 150
const DAMPING = 0.88
const EDGE_PULL = 0.008
const BOUNDARY_PADDING = 60

const makeInitialState = (mode: NCMMode): NCMSimulationState => ({
  agents: new Map(),
  edges: new Map(),
  particles: [],
  toolCalls: new Map(),
  mode,
  totalCostUsd: 0,
  sessionStartTime: Date.now(),
})

/** Apply force-directed layout physics to agent positions each frame. */
const applyPhysics = (
  state: NCMSimulationState,
  width: number,
  height: number,
): void => {
  const agents = Array.from(state.agents.values())

  for (const a of agents) {
    if (a.pinned) continue

    // Repulsion between all agents
    for (const b of agents) {
      if (a.id === b.id) continue
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      if (dist < REPULSION_RADIUS) {
        const force = FORCE_STRENGTH * (REPULSION_RADIUS - dist) / dist
        a.vx += dx * force
        a.vy += dy * force
      }
    }

    // Pull toward parent (tree layout)
    if (a.parentId) {
      const parent = state.agents.get(a.parentId)
      if (parent) {
        a.vx += (parent.x - a.x) * EDGE_PULL
        a.vy += (parent.y - a.y) * EDGE_PULL
      }
    }

    // Damping
    a.vx *= DAMPING
    a.vy *= DAMPING

    // Integrate
    a.x += a.vx
    a.y += a.vy

    // Boundary
    a.x = Math.max(BOUNDARY_PADDING, Math.min(width - BOUNDARY_PADDING, a.x))
    a.y = Math.max(BOUNDARY_PADDING, Math.min(height - BOUNDARY_PADDING, a.y))
  }
}

const edgeKey = (sourceId: string, targetId: string): string =>
  `${sourceId}→${targetId}`

const spawnParticles = (
  state: NCMSimulationState,
  x: number,
  y: number,
  color: string,
  count: number,
): void => {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = Math.random() * 2 + 0.5
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      maxLife: 1,
      size: Math.random() * 3 + 1,
      color,
    })
  }
}

export interface UseNCMSimulationOptions {
  mode: NCMMode
  width: number
  height: number
}

export const useNCMSimulation = ({ mode, width, height }: UseNCMSimulationOptions) => {
  const stateRef = useRef<NCMSimulationState>(makeInitialState(mode))
  // Store dims in a ref so processEvent never needs to close over them as deps.
  // This prevents bridge teardown/respawn on every window resize.
  const dimsRef = useRef({ width, height })
  useEffect(() => {
    dimsRef.current = { width, height }
  }, [width, height])

  // Keep mode in sync
  useEffect(() => {
    stateRef.current.mode = mode
  }, [mode])

  /** Process a single incoming event into the simulation state. */
  const processEvent = useCallback((event: NCMEvent): void => {
    const s = stateRef.current
    const { width, height } = dimsRef.current

    switch (event.kind) {
      case 'agent_spawn': {
        const existing = s.agents.get(event.agentId)
        if (existing) break
        const isMain = s.agents.size === 0

        // Position: scatter around center with some offset
        const angle = (s.agents.size / 6) * Math.PI * 2
        const radius = isMain ? 0 : 120 + Math.random() * 80
        const x = width / 2 + Math.cos(angle) * radius
        const y = height / 2 + Math.sin(angle) * radius

        const agent: NCMAgent = {
          id: event.agentId,
          name: event.name,
          state: 'idle',
          parentId: event.parentId ?? null,
          tokensUsed: 0,
          tokensMax: DEFAULT_TOKENS_MAX,
          contextBreakdown: {
            systemPrompt: 0,
            userMessages: 0,
            toolResults: 0,
            reasoning: 0,
            subagentResults: 0,
          },
          toolCalls: 0,
          timeAlive: 0,
          x,
          y,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          pinned: false,
          isMain,
          runtime: event.runtime,
          model: event.model,
          task: event.task,
          spawnTime: event.timestamp,
          opacity: 0,
          scale: 0.5,
          messageBubbles: [],
        }
        s.agents.set(agent.id, agent)
        spawnParticles(s, x, y, NCM_PALETTE.hot, 8)

        // Auto-create edge to parent
        if (event.parentId && s.agents.has(event.parentId)) {
          const eid = edgeKey(event.parentId, event.agentId)
          if (!s.edges.has(eid)) {
            s.edges.set(eid, {
              id: eid,
              sourceId: event.parentId,
              targetId: event.agentId,
              active: true,
              messageCount: 0,
              lastActivity: event.timestamp,
            })
          }
        }
        break
      }

      case 'agent_state_change': {
        const agent = s.agents.get(event.agentId)
        if (!agent) break
        agent.state = event.state as AgentState
        agent.currentTool = event.currentTool
        if (event.state === 'tool_calling') {
          agent.toolCalls++
          spawnParticles(s, agent.x, agent.y, NCM_PALETTE.info, 4)
        }
        break
      }

      case 'agent_complete': {
        const agent = s.agents.get(event.agentId)
        if (!agent) break
        agent.state = 'complete'
        agent.completeTime = event.timestamp
        spawnParticles(s, agent.x, agent.y, NCM_PALETTE.success, 12)
        break
      }

      case 'agent_message': {
        const agent = s.agents.get(event.agentId)
        if (!agent) break
        agent.messageBubbles.push({
          text: event.text,
          time: event.timestamp,
          role: event.role,
        })
        // Keep at most 5 bubbles per agent
        if (agent.messageBubbles.length > 5) {
          agent.messageBubbles.shift()
        }
        break
      }

      case 'tool_call_start': {
        s.toolCalls.set(event.toolCallId, {
          id: event.toolCallId,
          agentId: event.agentId,
          name: event.name,
          state: 'running',
          startTime: event.timestamp,
          x: 0,
          y: 0,
        })
        break
      }

      case 'tool_call_end': {
        const tc = s.toolCalls.get(event.toolCallId)
        if (tc) {
          tc.state = event.success ? 'complete' : 'error'
          tc.endTime = event.timestamp
        }
        break
      }

      case 'edge_activity': {
        const eid = edgeKey(event.sourceId, event.targetId)
        const existing = s.edges.get(eid)
        if (existing) {
          existing.active = true
          existing.messageCount++
          existing.lastActivity = event.timestamp
        } else {
          s.edges.set(eid, {
            id: eid,
            sourceId: event.sourceId,
            targetId: event.targetId,
            active: true,
            messageCount: 1,
            lastActivity: event.timestamp,
          })
        }
        break
      }

      case 'mission_update': {
        s.mission = event.mission
        break
      }

      case 'pipeline_update': {
        s.pipelineNodes = event.nodes
        break
      }

      case 'token_usage': {
        const agent = s.agents.get(event.agentId)
        if (!agent) break
        agent.tokensUsed = event.tokensUsed
        agent.tokensMax = event.tokensMax
        if (event.breakdown) {
          agent.contextBreakdown = event.breakdown
        }
        break
      }

      case 'cost_update': {
        const agent = s.agents.get(event.agentId)
        if (agent) agent.costUsd = event.costUsd
        s.totalCostUsd = event.totalSessionCostUsd
        break
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // dims accessed via dimsRef — no deps needed, bridge won't respawn on resize

  /** Called each animation frame to advance physics and particle lifetimes. */
  const tick = useCallback((): void => {
    const s = stateRef.current
    const now = Date.now()

    // Animate agent opacity/scale in
    for (const a of s.agents.values()) {
      a.opacity = Math.min(1, a.opacity + 0.05)
      a.scale = Math.min(1, a.scale + 0.03)
      a.timeAlive = now - a.spawnTime
    }

    // Apply force-directed physics (Neural Flow mode only)
    if (s.mode === 'neural_flow') {
      applyPhysics(s, width, height)
    }

    // Age particles
    s.particles = s.particles
      .map(p => ({ ...p, life: p.life - 0.025, x: p.x + p.vx, y: p.y + p.vy }))
      .filter(p => p.life > 0)

    // Decay edge active flags after 2s of no activity
    for (const edge of s.edges.values()) {
      if (now - edge.lastActivity > 2000) {
        edge.active = false
      }
    }
  }, [width, height])

  return { stateRef, processEvent, tick }
}
