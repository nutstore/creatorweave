/**
 * useEncryptionConfig 单元测试
 *
 * 测试加密状态配置获取和验证逻辑
 */

import { describe, it, expect, vi } from 'vitest'
import {
  getValidEncryptionState,
  getEncryptionConfig,
  type EncryptionConfig,
} from '../useEncryptionConfig'
import type { EncryptionState } from '@creatorweave/encryption'

describe('getValidEncryptionState', () => {
  describe('有效状态', () => {
    const validStates: EncryptionState[] = ['none', 'generating', 'exchanging', 'ready', 'error']

    validStates.forEach((state) => {
      it(`"${state}" 应返回原值`, () => {
        expect(getValidEncryptionState(state)).toBe(state)
      })
    })
  })

  describe('无效状态', () => {
    it('未知状态应降级到 "none"', () => {
      // 模拟 console.warn 以避免测试输出污染
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = getValidEncryptionState('unknown' as EncryptionState)
      expect(result).toBe('none')
      expect(consoleSpy).toHaveBeenCalledWith(
        '[useEncryptionConfig] Unknown encryption state:',
        'unknown',
        ', falling back to "none"'
      )

      consoleSpy.mockRestore()
    })

    it('null 状态应降级到 "none"', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = getValidEncryptionState(null as unknown as EncryptionState)
      expect(result).toBe('none')

      consoleSpy.mockRestore()
    })

    it('undefined 状态应降级到 "none"', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = getValidEncryptionState(undefined as unknown as EncryptionState)
      expect(result).toBe('none')

      consoleSpy.mockRestore()
    })
  })
})

describe('getEncryptionConfig', () => {
  describe('none 状态', () => {
    it('应返回 LockOpen 图标和灰色', () => {
      const config = getEncryptionConfig('none')
      expect(config.color).toBe('text-gray-400')
      expect(config.animation).toBeUndefined()
    })
  })

  describe('generating 状态', () => {
    it('应返回 Key 图标、黄色和 pulse 动画', () => {
      const config = getEncryptionConfig('generating')
      expect(config.color).toBe('text-yellow-400')
      expect(config.animation).toBe('animate-pulse')
    })
  })

  describe('exchanging 状态', () => {
    it('应返回 RefreshCw 图标、黄色和 spin 动画', () => {
      const config = getEncryptionConfig('exchanging')
      expect(config.color).toBe('text-yellow-400')
      expect(config.animation).toBe('animate-spin')
    })
  })

  describe('ready 状态', () => {
    it('应返回 Lock 图标和绿色', () => {
      const config = getEncryptionConfig('ready')
      expect(config.color).toBe('text-green-500')
      expect(config.animation).toBeUndefined()
    })
  })

  describe('error 状态', () => {
    it('应返回 AlertTriangle 图标和红色', () => {
      const config = getEncryptionConfig('error')
      expect(config.color).toBe('text-red-500')
      expect(config.animation).toBeUndefined()
    })
  })

  describe('无效状态', () => {
    it('应返回 none 状态的配置作为降级', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const config = getEncryptionConfig('invalid' as EncryptionState)
      expect(config.color).toBe('text-gray-400') // none 的颜色
      expect(config.animation).toBeUndefined()

      consoleSpy.mockRestore()
    })
  })
})

describe('EncryptionConfig 类型', () => {
  it('有效配置应包含 icon 和 color', () => {
    const config: EncryptionConfig = {
      icon: null,
      color: 'text-red-500',
    }
    expect(config).toHaveProperty('icon')
    expect(config).toHaveProperty('color')
  })

  it('有效配置可选择包含 animation', () => {
    const configWithAnimation: EncryptionConfig = {
      icon: null,
      color: 'text-yellow-400',
      animation: 'animate-pulse',
    }
    expect(configWithAnimation.animation).toBe('animate-pulse')

    const configWithoutAnimation: EncryptionConfig = {
      icon: null,
      color: 'text-gray-400',
    }
    expect(configWithoutAnimation.animation).toBeUndefined()
  })
})
