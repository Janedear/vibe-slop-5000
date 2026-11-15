/**
 * Neural Command Map — "How to read this" panel
 *
 * The map is a canvas animation with no visible vocabulary: dots, rings and
 * pipeline chips. This panel names what each mode shows, states plainly
 * whether the data is live or a canned demo, and tells the viewer what to
 * click. It is dismissible and re-openable from the view itself.
 *
 * Copy is deliberately plain: the panel exists for someone seeing this screen
 * for the first time, so it avoids engine/API jargon.
 */

import { NCM_PALETTE } from './lib/ncm-types'

export interface NeuralCommandMapGuideProps {
  /** True when the built-in demo generator drives the map instead of a live socket. */
  demo: boolean
  onClose: () => void
}

const MODES: Array<{ name: string; body: string }> = [
  {
    name: 'Neural Flow',
    body: 'Each glowing dot is one AI agent. The lines between dots are messages passed between them. Click a dot to see what that agent is doing, how many tokens it has used and what it has cost.',
  },
  {
    name: 'Mission Universe',
    body: 'The same work drawn as a mission map: the centre is the mission, each ring is a milestone, and the small dots are pieces of work. Colours show whether each piece is waiting, in progress, done or blocked.',
  },
  {
    name: 'Execution Pipeline',
    body: 'Work flowing left to right through the five stages it passes on the way to release: planning, coding, testing, review and deployment. The bar shows how far along each stage is.',
  },
]

export const NeuralCommandMapGuide = ({ demo, onClose }: NeuralCommandMapGuideProps) => (
  <div
    style={{
      width: 300,
      background: NCM_PALETTE.surface1 + 'F2',
      border: `1px solid ${NCM_PALETTE.border}`,
      borderRadius: 12,
      padding: '14px 16px 12px',
      color: NCM_PALETTE.cream,
      backdropFilter: 'blur(10px)',
      boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
      fontFamily: '"Inter", system-ui, sans-serif',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.01em' }}>
          What am I looking at?
        </div>
        <div style={{ fontSize: 11.5, color: NCM_PALETTE.blush, lineHeight: 1.5, marginTop: 4 }}>
          One picture of AI agents doing work, shown three different ways.
        </div>
      </div>
      <button
        onClick={onClose}
        aria-label="Hide this explanation"
        style={{
          border: 'none',
          background: 'transparent',
          color: NCM_PALETTE.blush,
          fontSize: 16,
          lineHeight: 1,
          cursor: 'pointer',
          padding: 2,
        }}
      >
        ×
      </button>
    </div>

    {/* Honest status: the viewer needs to know this is not their real agents. */}
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        margin: '0 0 12px',
        padding: '6px 8px',
        borderRadius: 7,
        border: `1px solid ${demo ? NCM_PALETTE.waiting_permission + '66' : NCM_PALETTE.success + '66'}`,
        background: demo ? NCM_PALETTE.waiting_permission + '14' : NCM_PALETTE.success + '14',
        fontSize: 11,
        lineHeight: 1.45,
        color: NCM_PALETTE.blush,
      }}
    >
      <span
        style={{
          flexShrink: 0,
          fontWeight: 700,
          fontSize: 9.5,
          letterSpacing: '0.06em',
          color: demo ? NCM_PALETTE.waiting_permission : NCM_PALETTE.success,
        }}
      >
        {demo ? 'SAMPLE DATA' : 'LIVE'}
      </span>
      <span>
        {demo
          ? 'Not connected yet — everything here is a canned demo loop, not real agents.'
          : 'Connected to a running session, updating as agents work.'}
      </span>
    </div>

    {MODES.map((mode) => (
      <div key={mode.name} style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: NCM_PALETTE.hot }}>
          {mode.name}
        </div>
        <div style={{ fontSize: 11, lineHeight: 1.5, color: NCM_PALETTE.blush }}>
          {mode.body}
        </div>
      </div>
    ))}

    <div
      style={{
        borderTop: `1px solid ${NCM_PALETTE.border}`,
        paddingTop: 8,
        fontSize: 10.5,
        lineHeight: 1.45,
        color: NCM_PALETTE.muted,
      }}
    >
      Switch views with the buttons at the bottom. Poke around — nothing here can break.
    </div>
  </div>
)

export default NeuralCommandMapGuide
