/**
 * Workspace Components - Phase 4 features
 *
 * Export all workspace-related components for easy importing
 */

export { CommandPalette } from './CommandPalette'
export { OnboardingTour, DEFAULT_ONBOARDING_STEPS } from './OnboardingTour'
export { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp'
export { RecentFilesPanel } from './RecentFilesPanel'
export { ThemeToggle } from './ThemeToggle'
export { WorkspaceSettingsDialog } from './WorkspaceSettingsDialog'
export { GoToFileDialog } from './GoToFileDialog'

// Enhanced commands
export { buildEnhancedCommands } from './command-palette-commands'

export type { Command } from './CommandPalette'
export type { TourStep } from './OnboardingTour'
