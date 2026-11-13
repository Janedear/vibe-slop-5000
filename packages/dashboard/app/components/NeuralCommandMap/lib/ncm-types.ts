/**
 * Neural Command Map — Type Definitions
 *
 * Adapted from agent-flow's agent-types.ts (Apache 2.0).
 * Extended with Fusion-native mission hierarchy for Mission Universe mode.
 */

// ─── Shared Agent Visualization Types (from agent-flow) ──────────────────────

export type AgentState =
  | 'idle'
  | 'thinking'
  | 'tool_calling'
  | 'complete'
  | 'error'
  | 'paused'
  | 'waiting_permission'

export interface ContextBreakdown {
  systemPrompt: number
  userMessages: number
  toolResults: number
  reasoning: number
  subagentResults: number
}

export interface NCMAgent {
  id: string
  name: string
  state: AgentState
  parentId: string | null
  tokensUsed: number
  tokensMax: number
  contextBreakdown: ContextBreakdown
  toolCalls: number
  timeAlive: number
  x: number
  y: number
  vx: number
  vy: number
  pinned: boolean
  isMain: boolean
  runtime?: 'claude' | 'cursor' | 'codex' | 'grok' | 'kimi' | 'base44'
  model?: string
  currentTool?: string
  task?: string
  spawnTime: number
  completeTime?: number
  opacity: number
  scale: number
  messageBubbles: MessageBubble[]
  /** Cost in USD accumulated this session. */
  costUsd?: number
}

export interface MessageBubble {
  text: string
  time: number
  role: 'assistant' | 'thinking' | 'user'
  _cachedW?: number
  _cachedH?: number
  _cachedLines?: number
  _cachedWrappedLines?: string[]
  _cachedWrappedFont?: string
}

export interface NCMEdge {
  id: string
  sourceId: string
  targetId: string
  active: boolean
  messageCount: number
  lastActivity: number
}

export interface NCMParticle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

export interface NCMToolCall {
  id: string
  agentId: string
  name: string
  state: 'pending' | 'running' | 'complete' | 'error'
  startTime: number
  endTime?: number
  x: number
  y: number
}

// ─── Fusion-Native Mission Hierarchy (for Mission Universe mode) ──────────────

export type MissionStatus =
  | 'not_started'
  | 'in_progress'
  | 'blocked'
  | 'complete'
  | 'failed'
  | 'cancelled'
  | 'paused'

export interface NCMFeature {
  id: string
  title: string
  status: MissionStatus
  assignedAgentId?: string
}

export interface NCMSlice {
  id: string
  title: string
  status: MissionStatus
  features: NCMFeature[]
  /** Orbital position (0–1 normalized angle). */
  orbitAngle?: number
}

export interface NCMMilestone {
  id: string
  title: string
  status: MissionStatus
  slices: NCMSlice[]
  orbitRadius?: number
}

export interface NCMMission {
  id: string
  title: string
  status: MissionStatus
  milestones: NCMMilestone[]
}

// ─── Execution Pipeline types (for Pipeline mode) ────────────────────────────

export type PipelineStage =
  | 'planning'
  | 'coding'
  | 'testing'
  | 'review'
  | 'deployment'

export interface PipelineNode {
  id: string
  stage: PipelineStage
  label: string
  status: 'pending' | 'active' | 'complete' | 'error'
  agentIds: string[]
  progress?: number  // 0–100
  startTime?: number
  endTime?: number
}

/** Pipeline node shape used by draw-pipeline and the event bridge. */
export interface NCMPipelineNode {
  id: string
  label: string
  status: MissionStatus
  agentIds: string[]
  progress: number   // 0–1
}

// ─── NCM Simulation State ─────────────────────────────────────────────────────

export type NCMMode = 'neural_flow' | 'mission_universe' | 'pipeline'

export interface NCMSimulationState {
  agents: Map<string, NCMAgent>
  edges: Map<string, NCMEdge>
  particles: NCMParticle[]
  toolCalls: Map<string, NCMToolCall>
  mode: NCMMode
  mission?: NCMMission
  pipelineNodes?: NCMPipelineNode[]
  totalCostUsd: number
  sessionStartTime: number
}

// ─── Color helpers ────────────────────────────────────────────────────────────

/** v3 luxury pink palette from Mission Control OS design spec. */
export const NCM_PALETTE = {
  bg: '#0A0008',
  surface1: '#130010',
  surface2: '#1D0019',
  border: '#2D0028',
  accent: '#E8156D',
  hot: '#F72585',
  berry: '#9B0040',
  blush: '#FFB3C6',
  cream: '#FFE4EE',
  muted: '#8B4060',
  success: '#22D68A',
  info: '#4D94FF',
  idle: '#8B4060',
  thinking: '#F72585',
  tool_calling: '#4D94FF',
  complete: '#22D68A',
  error: '#FF4B6E',
  paused: '#8B4060',
  waiting_permission: '#FFB347',
} as const

export const getAgentStateColor = (state: AgentState): string => {
  switch (state) {
    case 'idle': return NCM_PALETTE.idle
    case 'thinking': return NCM_PALETTE.hot
    case 'tool_calling': return NCM_PALETTE.info
    case 'complete': return NCM_PALETTE.success
    case 'error': return NCM_PALETTE.error
    case 'paused': return NCM_PALETTE.muted
    case 'waiting_permission': return NCM_PALETTE.waiting_permission
    default: return NCM_PALETTE.muted
  }
}

export const getMissionStatusColor = (status: MissionStatus): string => {
  switch (status) {
    case 'not_started': return NCM_PALETTE.muted
    case 'in_progress': return NCM_PALETTE.info
    case 'blocked': return NCM_PALETTE.error
    case 'complete': return NCM_PALETTE.success
    case 'failed': return NCM_PALETTE.error
    case 'cancelled': return NCM_PALETTE.border
    case 'paused': return NCM_PALETTE.info
    default: return NCM_PALETTE.muted
  }
}

/** Shorthand alias used by canvas draw functions. */
export const stateColor = getAgentStateColor
