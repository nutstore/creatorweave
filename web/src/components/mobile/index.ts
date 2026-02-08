/**
 * Mobile Components - Barrel export
 *
 * Mobile-first responsive components including:
 * - BottomTabBar: Touch-friendly bottom navigation
 * - MobileLayout: Responsive layout container
 * - MobileNavBar: Mobile-optimized header
 * - useMobile: Viewport breakpoint detection hook
 */

export { useMobile } from './useMobile'
export type { Tab } from './BottomTabBar'
export { BottomTabBar } from './BottomTabBar'
export { MobileLayout, DEFAULT_MOBILE_TABS } from './MobileLayout'
export type { MobileNavBarProps, NavAction, NavActions } from './MobileNavBar'
export { MobileNavBar } from './MobileNavBar'
