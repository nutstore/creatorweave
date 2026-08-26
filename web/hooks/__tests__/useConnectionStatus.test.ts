/**
 * useConnectionStatus 单元测试
 *
 * 测试连接状态颜色逻辑和连接状态判断
 */

import { describe, it, expect } from 'vitest'
import { getConnectionDotColor, isConnected, type ConnectionDotColor } from '../useConnectionStatus'
import type { ConnectionState } from '@/remote/ws-client'
import type { SessionRole } from '@/remote/remote-session'

describe('getConnectionDotColor', () => {
  // 辅助函数：简化测试参数
  const makeParams = (overrides?: Partial<Parameters<typeof getConnectionDotColor>[0]>) => ({
    isActive: false,
    connectionState: 'disconnected' as ConnectionState,
    role: 'none' as SessionRole,
    peerCount: 0,
    ...overrides,
  })

  describe('非激活状态', () => {
    it('应返回灰色圆点', () => {
      expect(getConnectionDotColor(makeParams({ isActive: false }))).toBe('bg-gray-400')
    })
  })

  describe('已断开状态', () => {
    it('应返回灰色圆点', () => {
      expect(
        getConnectionDotColor(
          makeParams({
            isActive: true,
            connectionState: 'disconnected',
          })
        )
      ).toBe('bg-gray-400')
    })
  })

  describe('连接中状态', () => {
    it('connecting 应返回黄色圆点', () => {
      expect(
        getConnectionDotColor(
          makeParams({
            isActive: true,
            connectionState: 'connecting',
          })
        )
      ).toBe('bg-yellow-400')
    })

    it('reconnecting 应返回黄色圆点', () => {
      expect(
        getConnectionDotColor(
          makeParams({
            isActive: true,
            connectionState: 'reconnecting',
          })
        )
      ).toBe('bg-yellow-400')
    })
  })

  describe('Host 角色状态', () => {
    it('无 peer 连接时应返回黄色圆点', () => {
      expect(
        getConnectionDotColor(
          makeParams({
            isActive: true,
            connectionState: 'connected',
            role: 'host',
            peerCount: 0,
          })
        )
      ).toBe('bg-yellow-400')
    })

    it('只有 1 个 peer（仅 host）时应返回黄色圆点', () => {
      expect(
        getConnectionDotColor(
          makeParams({
            isActive: true,
            connectionState: 'connected',
            role: 'host',
            peerCount: 1,
          })
        )
      ).toBe('bg-yellow-400')
    })

    it('有 2+ 个 peer（host + remote）时应返回绿色圆点', () => {
      expect(
        getConnectionDotColor(
          makeParams({
            isActive: true,
            connectionState: 'connected',
            role: 'host',
            peerCount: 2,
          })
        )
      ).toBe('bg-green-400')
    })

    it('有多个 peer 时应返回绿色圆点', () => {
      expect(
        getConnectionDotColor(
          makeParams({
            isActive: true,
            connectionState: 'connected',
            role: 'host',
            peerCount: 5,
          })
        )
      ).toBe('bg-green-400')
    })
  })

  describe('Remote 角色状态', () => {
    it('连接到 relay 后应返回绿色圆点', () => {
      expect(
        getConnectionDotColor(
          makeParams({
            isActive: true,
            connectionState: 'connected',
            role: 'remote',
            peerCount: 0,
          })
        )
      ).toBe('bg-green-400')
    })

    it('无论 peerCount 是多少都应返回绿色圆点', () => {
      expect(
        getConnectionDotColor(
          makeParams({
            isActive: true,
            connectionState: 'connected',
            role: 'remote',
            peerCount: 3,
          })
        )
      ).toBe('bg-green-400')
    })
  })

  describe('防御性编程：负数 peerCount', () => {
    it('host 角色下，负数 peerCount 应由调用方处理（此处仅记录行为）', () => {
      // 注意：实际的防御性验证在 hook 层面处理
      const result = getConnectionDotColor(
        makeParams({
          isActive: true,
          connectionState: 'connected',
          role: 'host',
          peerCount: -1,
        })
      )
      // 根据当前逻辑，-1 <= 1，所以会返回黄色
      expect(result).toBe('bg-yellow-400')
    })
  })
})

describe('isConnected', () => {
  it('connected 状态应返回 true', () => {
    expect(isConnected('connected')).toBe(true)
  })

  it('disconnected 状态应返回 false', () => {
    expect(isConnected('disconnected')).toBe(false)
  })

  it('connecting 状态应返回 false', () => {
    expect(isConnected('connecting')).toBe(false)
  })

  it('reconnecting 状态应返回 false', () => {
    expect(isConnected('reconnecting')).toBe(false)
  })
})

describe('ConnectionDotColor 类型', () => {
  it('所有可能的颜色值都应包含在类型中', () => {
    const colors: ConnectionDotColor[] = ['bg-gray-400', 'bg-yellow-400', 'bg-green-400']
    expect(colors).toHaveLength(3)
  })
})
