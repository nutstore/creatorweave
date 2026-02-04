/**
 * useEncryptionConfig - Encryption state configuration hook
 *
 * Provides visual configuration for encryption state (icon, color, animation)
 * Includes defensive validation to prevent errors from unknown states
 */

import type { EncryptionState } from '@browser-fs-analyzer/encryption'
import { Lock, LockOpen, Key, RefreshCw, AlertTriangle } from 'lucide-react'
import { useRemoteStore } from '@/store/remote.store'

/**
 * Valid encryption state values
 */
const VALID_ENCRYPTION_STATES = ['none', 'generating', 'exchanging', 'ready', 'error'] as const

/**
 * Encryption state configuration type
 */
export interface EncryptionConfig {
  icon: React.ReactNode
  color: string
  animation?: string
}

/**
 * Encryption state configuration mapping
 */
const ENCRYPTION_CONFIG: Record<string, EncryptionConfig> = {
  none: {
    icon: <LockOpen className="h-3 w-3" />,
    color: 'text-gray-400',
  },
  generating: {
    icon: <Key className="h-3 w-3" />,
    color: 'text-yellow-400',
    animation: 'animate-pulse',
  },
  exchanging: {
    icon: <RefreshCw className="h-3 w-3" />,
    color: 'text-yellow-400',
    animation: 'animate-spin',
  },
  ready: {
    icon: <Lock className="h-3 w-3" />,
    color: 'text-green-500',
  },
  error: {
    icon: <AlertTriangle className="h-3 w-3" />,
    color: 'text-red-500',
  },
}

/**
 * Validate and get safe encryption state
 *
 * Returns 'none' as fallback if the input state is invalid
 *
 * @param state - Encryption state to validate
 * @returns Valid encryption state
 */
export function getValidEncryptionState(state: EncryptionState): EncryptionState {
  if (VALID_ENCRYPTION_STATES.includes(state as any)) {
    return state
  }
  // Unknown state fallback to 'none'
  console.warn('[useEncryptionConfig] Unknown encryption state:', state, ', falling back to "none"')
  return 'none'
}

/**
 * Get encryption state configuration (pure function, independently testable)
 *
 * @param state - Encryption state
 * @returns Corresponding visual configuration
 */
export function getEncryptionConfig(state: EncryptionState): EncryptionConfig {
  const validState = getValidEncryptionState(state)
  return ENCRYPTION_CONFIG[validState] ?? ENCRYPTION_CONFIG.none
}

/**
 * Hook version: Get encryption state from remote store and return configuration
 *
 * Usage example:
 * ```tsx
 * const { icon, color, animation } = useEncryptionConfig()
 * ```
 */
export function useEncryptionConfig(): EncryptionConfig {
  const encryptionState = useRemoteStore((s) => s.encryptionState)

  return getEncryptionConfig(encryptionState)
}
