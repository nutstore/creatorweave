/**
 * Mobile Components - Barrel export
 *
 * Mobile-first responsive components including:
 * - BottomTabBar: Touch-friendly bottom navigation
 * - MobileLayout: Responsive layout container
 * - MobileNavBar: Mobile-optimized header
 * - MobileFileUpload: Mobile file upload with progress
 * - useMobile: Viewport breakpoint detection hook
 * - useMobileUpload: Mobile file upload hook with progress tracking
 */

// Hooks
export { useMobile } from './useMobile'
export { useMobileUpload } from '../../hooks/useMobileUpload'

// Components
export type { Tab } from './BottomTabBar'
export { BottomTabBar } from './BottomTabBar'
export { MobileLayout, DEFAULT_MOBILE_TABS } from './MobileLayout'
export type { MobileNavBarProps, NavAction, NavActions } from './MobileNavBar'
export { MobileNavBar } from './MobileNavBar'
export { MobileFileUpload, MobileFileUploadCompact } from './MobileFileUpload'
