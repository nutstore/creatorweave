/**
 * Resizable Panel System
 *
 * A flexible panel layout system with:
 * - Horizontal and vertical split panels
 * - Draggable dividers
 * - Collapsible panels
 * - State persistence
 */

import { useState, useCallback, useRef, useEffect, useMemo, ReactNode } from 'react'
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react'

//=============================================================================
// Types
//=============================================================================

export type PanelDirection = 'horizontal' | 'vertical'

export interface PanelConfig {
  id: string
  minSize?: number
  maxSize?: number
  initialSize?: number
  collapsible?: boolean
  defaultCollapsed?: boolean
}

export interface ResizablePanelsProps {
  direction: PanelDirection
  children: [ReactNode, ReactNode] // Only 2 panels supported initially
  className?: string
  storageKey?: string
  firstPanel?: PanelConfig
  secondPanel?: PanelConfig
  onResize?: (sizes: [number, number]) => void
}

//=============================================================================
// Storage Helpers
//=============================================================================

const STORAGE_PREFIX = 'panel-ratio-'

function loadRatio(key: string | undefined, defaultRatio: number): number {
  if (!key) return defaultRatio
  try {
    const saved = localStorage.getItem(STORAGE_PREFIX + key)
    if (saved) {
      const ratio = Number(saved)
      if (ratio >= 10 && ratio <= 90) {
        return ratio
      }
    }
  } catch {
    // Ignore storage errors
  }
  return defaultRatio
}

function saveRatio(key: string | undefined, ratio: number): void {
  if (!key) return
  try {
    localStorage.setItem(STORAGE_PREFIX + key, String(ratio))
  } catch {
    // Ignore storage errors
  }
}

//=============================================================================
// Resizable Panels Component
//=============================================================================

export function ResizablePanels({
  direction,
  children,
  className = '',
  storageKey,
  firstPanel,
  secondPanel,
  onResize,
}: ResizablePanelsProps) {
  const [firstPanelSize, setFirstPanelSize] = useState(() =>
    loadRatio(storageKey, firstPanel?.initialSize || 50)
  )
  const [firstPanelCollapsed, setFirstPanelCollapsed] = useState(
    firstPanel?.defaultCollapsed || false
  )
  const [secondPanelCollapsed, setSecondPanelCollapsed] = useState(
    secondPanel?.defaultCollapsed || false
  )

  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)

  const firstConfig: PanelConfig = useMemo(() => firstPanel || { id: 'first' }, [firstPanel])
  const secondConfig: PanelConfig = useMemo(() => secondPanel || { id: 'second' }, [secondPanel])

  // Handle divider drag
  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDraggingRef.current = true

      const container = containerRef.current
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      const startPos = direction === 'horizontal' ? e.clientX : e.clientY
      const startSize = firstPanelSize

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDraggingRef.current) return

        const delta =
          direction === 'horizontal' ? moveEvent.clientX - startPos : moveEvent.clientY - startPos

        const containerSize =
          direction === 'horizontal' ? containerRect.width : containerRect.height

        // Calculate new size as percentage
        const deltaPercent = (delta / containerSize) * 100
        let newSize = startSize + deltaPercent

        // Apply constraints
        const minSize = firstConfig?.minSize ?? 10
        const maxSize = firstConfig?.maxSize ?? 90
        newSize = Math.max(minSize, Math.min(maxSize, newSize))

        setFirstPanelSize(newSize)

        // Notify parent
        if (onResize) {
          onResize([newSize, 100 - newSize])
        }
      }

      const handleMouseUp = () => {
        isDraggingRef.current = false
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [direction, firstPanelSize, firstConfig, onResize]
  )

  // Save ratio on change
  useEffect(() => {
    if (storageKey) {
      saveRatio(storageKey, firstPanelSize)
    }
  }, [firstPanelSize, storageKey])

  // Toggle first panel collapse
  const toggleFirstPanel = useCallback(() => {
    setFirstPanelCollapsed((prev) => !prev)
  }, [])

  // Toggle second panel collapse
  const toggleSecondPanel = useCallback(() => {
    setSecondPanelCollapsed((prev) => !prev)
  }, [])

  // Calculate actual sizes considering collapsed state
  const firstActualSize = firstPanelCollapsed ? 0 : firstPanelSize
  const secondActualSize = secondPanelCollapsed ? 0 : 100 - firstPanelSize

  const isHorizontal = direction === 'horizontal'

  return (
    <div
      ref={containerRef}
      className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} ${className}`}
      style={{ height: '100%', width: '100%' }}
    >
      {/* First Panel */}
      {firstActualSize > 0 && (
        <div
          style={{ [isHorizontal ? 'width' : 'height']: `${firstActualSize}%` }}
          className="overflow-hidden"
        >
          {children[0]}
        </div>
      )}

      {/* Collapse Button for First Panel */}
      {firstConfig?.collapsible && (
        <div
          className={`flex items-center justify-center ${isHorizontal ? 'flex-col' : 'flex-row'}`}
        >
          <button
            onClick={toggleFirstPanel}
            className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
            title={firstPanelCollapsed ? 'Expand panel' : 'Collapse panel'}
          >
            {isHorizontal ? (
              firstPanelCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )
            ) : firstPanelCollapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </button>
        </div>
      )}

      {/* Divider */}
      <div
        onMouseDown={handleDividerMouseDown}
        className={`${
          isHorizontal
            ? 'hover:bg-primary-300 w-1 cursor-col-resize'
            : 'hover:bg-primary-300 h-1 cursor-row-resize'
        } flex-shrink-0 select-none bg-neutral-200 transition-colors`}
        style={{ [isHorizontal ? 'height' : 'width']: '100%' }}
      />

      {/* Collapse Button for Second Panel */}
      {secondConfig?.collapsible && (
        <div
          className={`flex items-center justify-center ${isHorizontal ? 'flex-col' : 'flex-row'}`}
        >
          <button
            onClick={toggleSecondPanel}
            className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
            title={secondPanelCollapsed ? 'Expand panel' : 'Collapse panel'}
          >
            {isHorizontal ? (
              secondPanelCollapsed ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : secondPanelCollapsed ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      )}

      {/* Second Panel */}
      {secondActualSize > 0 && (
        <div
          style={{ [isHorizontal ? 'width' : 'height']: `${secondActualSize}%` }}
          className="flex-1 overflow-hidden"
        >
          {children[1]}
        </div>
      )}
    </div>
  )
}

//=============================================================================
// Multi-Panel Layout Component (for 3+ panels)
//=============================================================================

export interface MultiPanelLayoutProps {
  /**
   * Panel configuration in row-major order
   * null represents a span across multiple columns/rows
   */
  layout: Array<{
    id: string
    content: ReactNode
    row?: number
    col?: number
    rowSpan?: number
    colSpan?: number
    minSize?: number
  }>
  direction?: 'row' | 'column'
  gap?: number
  className?: string
}

/**
 * Simple multi-panel layout using CSS Grid
 * For more advanced layouts, consider using react-grid-layout
 */
export function MultiPanelLayout({
  layout,
  direction: _direction = 'column',
  gap = 4,
  className = '',
}: MultiPanelLayoutProps) {
  // Calculate grid dimensions
  const maxRow = Math.max(...layout.map((p) => p.row || 0))
  const maxCol = Math.max(...layout.map((p) => p.col || 0))

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${maxCol + 1}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${maxRow + 1}, minmax(0, 1fr))`,
    gap: `${gap * 4}px`,
    height: '100%',
    width: '100%',
  }

  return (
    <div className={className} style={gridStyle}>
      {layout.map((panel) => (
        <div
          key={panel.id}
          style={{
            gridRow: `${(panel.row || 0) + 1} / span ${panel.rowSpan || 1}`,
            gridColumn: `${(panel.col || 0) + 1} / span ${panel.colSpan || 1}`,
            minHeight: panel.minSize ? `${panel.minSize}px` : undefined,
            overflow: 'hidden',
          }}
        >
          {panel.content}
        </div>
      ))}
    </div>
  )
}
