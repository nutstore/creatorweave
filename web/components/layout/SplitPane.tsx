/**
 * SplitPane - A wrapper around react-split-pane with percentage-based sizing
 *
 * Features:
 * - Keyboard navigation (arrow keys, Home/End)
 * - Touch support
 * - Snap points
 * - RTL support
 * - State persistence
 */

import { useCallback, useRef, ReactNode } from 'react'
import { SplitPane as ResizableSplitPane, Pane } from 'react-split-pane'
import 'react-split-pane/styles.css'

//=============================================================================
// Types
//=============================================================================

export type PanelDirection = 'horizontal' | 'vertical'

export interface SplitPaneProps {
  direction: PanelDirection
  children: [ReactNode, ReactNode]
  className?: string
  storageKey?: string
  initialSize?: number
  minSize?: number
  maxSize?: number
  onResize?: (sizes: [number, number]) => void
  snapPoints?: number[]
  snapTolerance?: number
}

//=============================================================================
// Storage Helpers
//=============================================================================

const STORAGE_PREFIX = 'splitpane-ratio-'

function loadRatio(key: string | undefined, defaultRatio: number): number {
  if (!key) return defaultRatio
  try {
    const saved = localStorage.getItem(STORAGE_PREFIX + key)
    if (saved) {
      const ratio = Number(saved)
      if (ratio >= 5 && ratio <= 95) {
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
// SplitPane Component
//=============================================================================

export function SplitPane({
  direction,
  children,
  className = '',
  storageKey,
  initialSize = 50,
  minSize = 10,
  maxSize = 90,
  onResize,
  snapPoints,
  snapTolerance = 10,
}: SplitPaneProps) {
  // Convert percentage to pixel size for react-split-pane
  const containerRef = useRef<HTMLDivElement>(null)

  const getPixelSize = useCallback(
    (percent: number): number => {
      if (!containerRef.current) return percent
      const containerSize =
        direction === 'horizontal'
          ? containerRef.current.offsetWidth
          : containerRef.current.offsetHeight
      return (percent / 100) * containerSize
    },
    [direction]
  )

  const initialPixelSize = getPixelSize(loadRatio(storageKey, initialSize))

  // Handle resize from react-split-pane
  const handleResize = useCallback(
    (sizes: number[]) => {
      if (!containerRef.current || !sizes.length) return

      const containerSize =
        direction === 'horizontal'
          ? containerRef.current.offsetWidth
          : containerRef.current.offsetHeight

      if (containerSize === 0) return

      const percentFirst = (sizes[0] / containerSize) * 100
      const percentSecond = 100 - percentFirst

      if (storageKey) {
        saveRatio(storageKey, percentFirst)
      }

      if (onResize) {
        onResize([percentFirst, percentSecond])
      }
    },
    [direction, storageKey, onResize]
  )

  const isHorizontal = direction === 'horizontal'

  return (
    <div
      ref={containerRef}
      className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} ${className}`}
      style={{ height: '100%', width: '100%' }}
    >
      <ResizableSplitPane
        direction={direction}
        onResize={handleResize}
        resizable={true}
        snapPoints={snapPoints?.map((p) => getPixelSize(p))}
        snapTolerance={snapTolerance}
        style={{ display: 'flex', flexDirection: isHorizontal ? 'row' : 'column', width: '100%', height: '100%' }}
      >
        <Pane
          defaultSize={initialPixelSize}
          minSize={getPixelSize(minSize)}
          maxSize={getPixelSize(maxSize)}
          style={{ overflow: 'hidden', display: 'flex' }}
        >
          {children[0]}
        </Pane>
        <Pane style={{ overflow: 'hidden', display: 'flex' }}>
          {children[1]}
        </Pane>
      </ResizableSplitPane>
    </div>
  )
}
