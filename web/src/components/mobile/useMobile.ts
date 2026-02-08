/**
 * useMobile - Responsive breakpoint detection hook.
 * Returns true when viewport width is below 1024px (mobile/tablet breakpoint).
 */

import { useState, useEffect } from 'react'

/**
 * Breakpoint for mobile/tablet detection.
 * Viewports below 1024px are considered mobile.
 */
const MOBILE_BREAKPOINT = 1024

/**
 * Check if the current viewport is mobile-sized.
 * @returns true if viewport width < 1024px, false otherwise
 */
export function useMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    // Check initial value during SSR/hydration
    if (typeof window === 'undefined') {
      return false
    }
    return window.innerWidth < MOBILE_BREAKPOINT
  })

  useEffect(() => {
    // Handler for window resize events
    const handleResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }

    // Add event listener for resize
    window.addEventListener('resize', handleResize)

    // Cleanup event listener on unmount
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return isMobile
}
