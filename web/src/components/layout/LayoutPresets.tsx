/* eslint-disable react-refresh/only-export-components */
/**
 * Layout Presets
 *
 * Predefined layouts for different use cases:
 * - Developer: Code preview + Terminal + Conversation
 * - Analyst: Data table + Chart + Conversation
 * - Reader: Document preview + Notes + Conversation
 * - Default: Current sidebar + conversation layout
 */

import { ResizablePanels } from './ResizablePanels'

//=============================================================================
// Types
//=============================================================================

export type LayoutPreset = 'default' | 'developer' | 'analyst' | 'reader' | 'focus'

export interface LayoutConfig {
  name: string
  description: string
  icon: string
}

export const LAYOUT_PRESETS: Record<LayoutPreset, LayoutConfig> = {
  default: {
    name: 'Default',
    description: 'Standard layout with sidebar and conversation',
    icon: 'layout',
  },
  developer: {
    name: 'Developer',
    description: 'Code-focused layout with terminal and file tree',
    icon: 'code',
  },
  analyst: {
    name: 'Data Analyst',
    description: 'Data-focused layout with charts and tables',
    icon: 'bar-chart',
  },
  reader: {
    name: 'Reader',
    description: 'Document-focused layout for reading and note-taking',
    icon: 'book-open',
  },
  focus: {
    name: 'Focus Mode',
    description: 'Minimal layout for concentrated work',
    icon: 'maximize',
  },
}

//=============================================================================
// Storage Key
//=============================================================================

const LAYOUT_STORAGE_KEY = 'workspace-layout-preset'

export function saveLayoutPreset(preset: LayoutPreset): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, preset)
  } catch {
    // Ignore storage errors
  }
}

export function loadLayoutPreset(): LayoutPreset {
  try {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (saved && saved in LAYOUT_PRESETS) {
      return saved as LayoutPreset
    }
  } catch {
    // Ignore storage errors
  }
  return 'default'
}

//=============================================================================
// Layout Components
//=============================================================================

interface DeveloperLayoutProps {
  sidebar: React.ReactNode
  conversation: React.ReactNode
  filePreview: React.ReactNode
  terminal?: React.ReactNode
}

/**
 * Developer Layout: Sidebar | Code Preview | Terminal
 *                          |
 *                      Conversation
 */
export function DeveloperLayout({
  sidebar,
  conversation,
  filePreview,
  terminal,
}: DeveloperLayoutProps) {
  return (
    <div className="flex h-full">
      {/* Left Sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-neutral-200 dark:border-neutral-700">{sidebar}</div>

      {/* Main Content Area - Split vertically */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top: Code Preview + Terminal */}
        <ResizablePanels
          direction="horizontal"
          storageKey="dev-top"
          firstPanel={{ id: 'dev-code', minSize: 30, initialSize: 70 }}
          secondPanel={{ id: 'dev-terminal', minSize: 20, initialSize: 30, collapsible: true }}
          className="flex-1"
        >
          {/* Code Preview */}
          <div className="h-full bg-white dark:bg-neutral-950">{filePreview}</div>

          {/* Terminal (optional) */}
          {terminal ? (
            <div className="h-full bg-neutral-900 text-neutral-100">{terminal}</div>
          ) : (
            <div className="flex h-full items-center justify-center bg-neutral-50 text-neutral-400">
              <span>Terminal (coming soon)</span>
            </div>
          )}
        </ResizablePanels>

        {/* Bottom: Conversation */}
        <div className="h-80 border-t border-neutral-200 dark:border-neutral-700">{conversation}</div>
      </div>
    </div>
  )
}

interface AnalystLayoutProps {
  sidebar: React.ReactNode
  conversation: React.ReactNode
  dataView: React.ReactNode
  chartView?: React.ReactNode
}

/**
 * Analyst Layout: Sidebar | Data Table | Chart
 *                         |
 *                     Conversation
 */
export function AnalystLayout({ sidebar, conversation, dataView, chartView }: AnalystLayoutProps) {
  return (
    <div className="flex h-full">
      {/* Left Sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-neutral-200 dark:border-neutral-700">{sidebar}</div>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top: Data Table + Chart */}
        <ResizablePanels
          direction="horizontal"
          storageKey="analyst-top"
          firstPanel={{ id: 'analyst-data', minSize: 40, initialSize: 60 }}
          secondPanel={{ id: 'analyst-chart', minSize: 30, collapsible: true }}
          className="flex-1"
        >
          {/* Data Table */}
          <div className="h-full overflow-auto bg-white dark:bg-neutral-950">{dataView}</div>

          {/* Chart */}
          {chartView ? (
            <div className="h-full bg-neutral-50 p-4 dark:bg-neutral-900">{chartView}</div>
          ) : (
            <div className="flex h-full items-center justify-center bg-neutral-50 text-neutral-400 dark:bg-neutral-900 dark:text-neutral-500">
              <span>Chart (coming soon)</span>
            </div>
          )}
        </ResizablePanels>

        {/* Bottom: Conversation */}
        <div className="h-64 border-t border-neutral-200 dark:border-neutral-700">{conversation}</div>
      </div>
    </div>
  )
}

interface ReaderLayoutProps {
  sidebar: React.ReactNode
  conversation: React.ReactNode
  document: React.ReactNode
  notes?: React.ReactNode
}

/**
 * Reader Layout: Sidebar | Document | Notes
 *                        |
 *                    Conversation
 */
export function ReaderLayout({ sidebar, conversation, document, notes }: ReaderLayoutProps) {
  return (
    <div className="flex h-full">
      {/* Left Sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-neutral-200 dark:border-neutral-700">{sidebar}</div>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top: Document + Notes */}
        <ResizablePanels
          direction="horizontal"
          storageKey="reader-top"
          firstPanel={{ id: 'reader-doc', minSize: 40, initialSize: 70 }}
          secondPanel={{
            id: 'reader-notes',
            minSize: 20,
            collapsible: true,
            defaultCollapsed: true,
          }}
          className="flex-1"
        >
          {/* Document */}
          <div className="h-full overflow-auto bg-white dark:bg-neutral-950">{document}</div>

          {/* Notes */}
          {notes ? (
            <div className="h-full overflow-auto bg-yellow-50 p-4 dark:bg-amber-950/20">{notes}</div>
          ) : (
            <div className="flex h-full items-center justify-center bg-yellow-50 text-neutral-400 dark:bg-amber-950/20 dark:text-neutral-500">
              <span>Notes (coming soon)</span>
            </div>
          )}
        </ResizablePanels>

        {/* Bottom: Conversation */}
        <div className="h-48 border-t border-neutral-200 dark:border-neutral-700">{conversation}</div>
      </div>
    </div>
  )
}

interface FocusLayoutProps {
  conversation: React.ReactNode
}

/**
 * Focus Layout: Just the conversation panel for concentrated work
 */
export function FocusLayout({ conversation }: FocusLayoutProps) {
  return (
    <div className="flex h-full">
      {/* Full-width conversation */}
      <div className="flex-1">{conversation}</div>
    </div>
  )
}
