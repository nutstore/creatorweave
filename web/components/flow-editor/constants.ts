/**
 * Flow editor constants — node kind styling, layout, colors.
 *
 * Color strategy (impeccable-design colorize):
 * - Each node kind has ONE accent color used only on the icon and the
 *   3px left-edge bar. Card background stays neutral white/dark.
 * - Hues are chosen for meaning, not decoration:
 *   input=blue (data source), tool=cyan (utility), llm=violet (AI),
 *   review=amber (gate), output=emerald (completion).
 * - Saturation is kept moderate; no neon, no gradient text.
 * - Status uses semantic tokens (success/danger), not kind colors.
 */

import type { FlowNodeKind } from '@/agent/flow/types'

// ---------------------------------------------------------------------------
// Node kind visual config
// ---------------------------------------------------------------------------

export interface NodeKindConfig {
  /** Lucide icon name */
  icon: string
  /** Display label */
  label: string
  /** Accent color hex for the 3px left-edge bar + connection handle */
  accentHex: string
  /** Tailwind text color for the icon */
  iconColor: string
}

export const NODE_KIND_CONFIG: Record<FlowNodeKind, NodeKindConfig> = {
  input: {
    icon: 'FileInput',
    label: '输入',
    accentHex: '#4f7cff',
    iconColor: 'text-blue-500',
  },
  tool: {
    icon: 'Wrench',
    label: '工具',
    accentHex: '#06b6d4',
    iconColor: 'text-cyan-500',
  },
  llm: {
    icon: 'Sparkles',
    label: 'AI',
    accentHex: '#9d6bff',
    iconColor: 'text-violet-500',
  },
  review: {
    icon: 'ShieldCheck',
    label: '评审',
    accentHex: '#ffa940',
    iconColor: 'text-amber-500',
  },
  output: {
    icon: 'CornerDownRight',
    label: '输出',
    accentHex: '#2ed573',
    iconColor: 'text-emerald-500',
  },
  router: {
    icon: 'GitBranch',
    label: '路由',
    accentHex: '#a855f7',
    iconColor: 'text-purple-500',
  },
}

// ---------------------------------------------------------------------------
// Canvas layout constants
// ---------------------------------------------------------------------------

export const NODE_WIDTH = 200
export const NODE_HEIGHT = 90
export const HORIZONTAL_GAP = 300
export const LAYER_VERTICAL_GAP = 140
