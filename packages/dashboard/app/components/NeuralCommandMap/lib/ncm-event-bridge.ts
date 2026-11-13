/**
 * Neural Command Map — Fusion Event Bridge
 *
 * Replaces agent-flow's use-vscode-bridge.ts with a Fusion-native event source.
 * Connects to Fusion's engine IPC and dashboard WebSocket to receive agent
 * lifecycle events, tool calls, and mission state updates in real time.
 *
 * In standalone/demo mode, falls back to synthetic mock events.
 */

import type {
  NCMAgent,
  NCMMission,
  NCMPipelineNode,
  AgentState,
} from './ncm-types'

// ─── Event Types ──────────────────────────────────────────────────────────────

export type NCMEventKind =
  | 'agent_spawn'
  | 'agent_state_change'
  | 'agent_complete'
  | 'agent_message'
  | 'tool_call_start'
  | 'tool_call_end'
  | 'edge_activity'
  | 'mission_update'
  | 'pipeline_update'
  | 'token_usage'
  | 'cost_update'

export interface AgentSpawnEvent {
  kind: 'agent_spawn'
  agentId: string
  name: string
  parentId?: string
  runtime?: NCMAgent['runtime']
  model?: string
  task?: string
  timestamp: number
}

export interface AgentStateChangeEvent {
  kind: 'agent_state_change'
  agentId: string
  state: AgentState
  currentTool?: string
  timestamp: number
}

export interface AgentCompleteEvent {
  kind: 'agent_complete'
  agentId: string
  timestamp: number
}

export interface AgentMessageEvent {
  kind: 'agent_message'
  agentId: string
  role: 'assistant' | 'thinking' | 'user'
  text: string
  timestamp: number
}

export interface ToolCallStartEvent {
  kind: 'tool_call_start'
  toolCallId: string
  agentId: string
  name: string
  timestamp: number
}

export interface ToolCallEndEvent {
  kind: 'tool_call_end'
  toolCallId: string
  agentId: string
  success: boolean
  timestamp: number
}

export interface EdgeActivityEvent {
  kind: 'edge_activity'
  sourceId: string
  targetId: string
  timestamp: number
}

export interface MissionUpdateEvent {
  kind: 'mission_update'
  mission: NCMMission
  timestamp: number
}

export interface PipelineUpdateEvent {
  kind: 'pipeline_update'
  nodes: NCMPipelineNode[]
  timestamp: number
}

export interface TokenUsageEvent {
  kind: 'token_usage'
  agentId: string
  tokensUsed: number
  tokensMax: number
  breakdown?: {
    systemPrompt: number
    userMessages: number
    toolResults: number
    reasoning: number
    subagentResults: number
  }
  timestamp: number
}

export interface CostUpdateEvent {
  kind: 'cost_update'
  agentId: string
  costUsd: number
  totalSessionCostUsd: number
  timestamp: number
}

export type NCMEvent =
  | AgentSpawnEvent
  | AgentStateChangeEvent
  | AgentCompleteEvent
  | AgentMessageEvent
  | ToolCallStartEvent
  | ToolCallEndEvent
  | EdgeActivityEvent
  | MissionUpdateEvent
  | PipelineUpdateEvent
  | TokenUsageEvent
  | CostUpdateEvent

// ─── Bridge ───────────────────────────────────────────────────────────────────

export type NCMEventListener = (event: NCMEvent) => void

export interface NCMBridgeStatus {
  connected: boolean
  source: 'fusion_ws' | 'mock' | 'disconnected'
}

/**
 * FusionEventBridge connects to the Fusion dashboard WebSocket API and
 * translates engine events into NCM events.
 *
 * Usage:
 *   const bridge = new FusionEventBridge('/api/ncm/stream')
 *   bridge.on(event => handleEvent(event))
 *   bridge.connect()
 */
export class FusionEventBridge {
  private ws: WebSocket | null = null
  private listeners: Set<NCMEventListener> = new Set()
  private statusListeners: Set<(s: NCMBridgeStatus) => void> = new Set()
  private url: string
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private maxReconnectDelay = 30_000
  private destroyed = false

  constructor(url: string) {
    this.url = url
  }

  on(listener: NCMEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onStatus(listener: (s: NCMBridgeStatus) => void): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  connect(): void {
    if (this.destroyed) return
    this.clearReconnectTimer()

    try {
      const wsUrl = this.url.replace(/^http/, 'ws')
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        this.reconnectDelay = 1000
        this.emitStatus({ connected: true, source: 'fusion_ws' })
      }

      this.ws.onmessage = (ev) => {
        try {
          const event = JSON.parse(ev.data) as NCMEvent
          this.emit(event)
        } catch {
          // ignore malformed frames
        }
      }

      this.ws.onclose = () => {
        this.emitStatus({ connected: false, source: 'disconnected' })
        if (!this.destroyed) this.scheduleReconnect()
      }

      this.ws.onerror = () => {
        this.ws?.close()
      }
    } catch {
      this.emitStatus({ connected: false, source: 'disconnected' })
      this.scheduleReconnect()
    }
  }

  disconnect(): void {
    this.destroyed = true
    this.clearReconnectTimer()
    this.ws?.close()
    this.ws = null
  }

  private emit(event: NCMEvent): void {
    this.listeners.forEach(l => {
      try { l(event) } catch { /* noop */ }
    })
  }

  private emitStatus(status: NCMBridgeStatus): void {
    this.statusListeners.forEach(l => {
      try { l(status) } catch { /* noop */ }
    })
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
      this.connect()
    }, this.reconnectDelay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}

// ─── Mock Event Generator (for standalone/demo mode) ─────────────────────────

const MOCK_RUNTIMES: NCMAgent['runtime'][] = ['claude', 'cursor', 'codex']
const MOCK_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'WebSearch', 'WebFetch']
const MOCK_STATES: AgentState[] = ['idle', 'thinking', 'tool_calling']

export class MockEventGenerator {
  private timer: ReturnType<typeof setInterval> | null = null
  private listeners: Set<NCMEventListener> = new Set()
  private agentIds: string[] = []
  private tick = 0

  on(listener: NCMEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(): void {
    // Spawn initial agents
    for (let i = 0; i < 3; i++) {
      this.spawnAgent()
    }

    this.timer = setInterval(() => {
      this.tick++
      this.runTick()
    }, 800)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private spawnAgent(): void {
    const id = `mock-agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    this.agentIds.push(id)
    this.emit({
      kind: 'agent_spawn',
      agentId: id,
      name: `Agent ${this.agentIds.length}`,
      parentId: this.agentIds.length > 1 ? this.agentIds[0] : undefined,
      runtime: MOCK_RUNTIMES[this.agentIds.length % MOCK_RUNTIMES.length],
      model: 'claude-sonnet-4-6',
      task: `Task ${this.agentIds.length}`,
      timestamp: Date.now(),
    })
  }

  private runTick(): void {
    if (this.agentIds.length === 0) return
    const agentId = this.agentIds[this.tick % this.agentIds.length]

    if (this.tick % 3 === 0) {
      this.emit({
        kind: 'agent_state_change',
        agentId,
        state: MOCK_STATES[this.tick % MOCK_STATES.length],
        currentTool: MOCK_TOOLS[this.tick % MOCK_TOOLS.length],
        timestamp: Date.now(),
      })
    }

    if (this.tick % 5 === 0 && this.agentIds.length > 1) {
      const sourceId = this.agentIds[this.tick % this.agentIds.length]
      const targetId = this.agentIds[(this.tick + 1) % this.agentIds.length]
      if (sourceId !== targetId) {
        this.emit({ kind: 'edge_activity', sourceId, targetId, timestamp: Date.now() })
      }
    }

    if (this.tick % 7 === 0) {
      this.emit({
        kind: 'token_usage',
        agentId,
        tokensUsed: Math.floor(Math.random() * 50_000) + 1000,
        tokensMax: 200_000,
        timestamp: Date.now(),
      })
    }

    // Occasionally spawn a new agent (up to 8)
    if (this.tick % 15 === 0 && this.agentIds.length < 8) {
      this.spawnAgent()
    }
  }

  private emit(event: NCMEvent): void {
    this.listeners.forEach(l => {
      try { l(event) } catch { /* noop */ }
    })
  }
}
