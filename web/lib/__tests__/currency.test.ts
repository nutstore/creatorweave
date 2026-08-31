import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * formatCost is pure given an explicit rate; module-level constants
 * (DISPLAY_CURRENCY etc.) are read from process.env at import time, so
 * region behavior is tested by re-importing with stubbed env.
 */
describe('lib/currency formatCost', () => {
  const freshImport = async () =>
    (await import('../currency')) as typeof import('../currency')

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('defaults to USD when NEXT_PUBLIC_DEPLOY_REGION is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEPLOY_REGION', '')
    const mod = await freshImport()
    expect(mod.DISPLAY_CURRENCY).toBe('USD')
    expect(mod.IS_CN_BUILD).toBe(false)
    expect(mod.formatCost(0, 'USD', 7.2)).toBe('$0.00')
    expect(mod.formatCost(0.001234, 'USD', 7.2)).toBe('$0.0012')
    expect(mod.formatCost(0.5, 'USD', 7.2)).toBe('$0.500')
    expect(mod.formatCost(1.234, 'USD', 7.2)).toBe('$1.23')
  })

  it('falls back to USD for invalid region values', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEPLOY_REGION', 'eu')
    const mod = await freshImport()
    expect(mod.DISPLAY_CURRENCY).toBe('USD')
  })

  it('uses CNY at the given rate on the cn build', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEPLOY_REGION', 'cn')
    const mod = await freshImport()
    expect(mod.IS_CN_BUILD).toBe(true)
    expect(mod.DISPLAY_CURRENCY).toBe('CNY')
    expect(mod.formatCost(0, 'CNY', 7.2)).toBe('¥0.00')
    expect(mod.formatCost(1, 'CNY', 7.2)).toBe('¥7.20')
    expect(mod.formatCost(0.001, 'CNY', 7.2)).toBe('¥0.0072')
    expect(mod.formatCost(0.5, 'CNY', 7.2)).toBe('¥3.60')
    expect(mod.formatCost(1.234, 'CNY', 6.73)).toBe('¥8.30')
    expect(mod.formatCost(1.234, 'USD', 6.73)).toBe('$1.23')
  })

  it('falls back to the static default rate when none is given', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEPLOY_REGION', 'cn')
    const mod = await freshImport()
    // No live rate installed → getActiveUsdToCnyRate() === build-time rate.
    expect(mod.formatCost(1, 'CNY')).toBe(`¥${mod.DEFAULT_USD_TO_CNY_RATE.toFixed(2)}`)
  })

  it('build-time NEXT_PUBLIC_USD_TO_CNY_RATE pins the rate and enables FX_RATE_FIXED', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEPLOY_REGION', 'cn')
    vi.stubEnv('NEXT_PUBLIC_USD_TO_CNY_RATE', '7.0')
    const mod = await freshImport()
    expect(mod.USD_TO_CNY_RATE).toBe(7.0)
    expect(mod.FX_RATE_FIXED).toBe(true)
    expect(mod.formatCost(1, 'CNY', mod.USD_TO_CNY_RATE)).toBe('¥7.00')
  })

  it('invalid rate override falls back to the static default, not FX_RATE_FIXED', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEPLOY_REGION', 'cn')
    vi.stubEnv('NEXT_PUBLIC_USD_TO_CNY_RATE', 'abc')
    const mod = await freshImport()
    expect(mod.USD_TO_CNY_RATE).toBe(7.2)
    expect(mod.FX_RATE_FIXED).toBe(false)
  })

  it('setActiveUsdToCnyRate accepts sane rates and rejects garbage', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEPLOY_REGION', 'cn')
    const mod = await freshImport()
    expect(mod.setActiveUsdToCnyRate(6.73)).toBe(true)
    expect(mod.getActiveUsdToCnyRate()).toBe(6.73)
    expect(mod.setActiveUsdToCnyRate(-1)).toBe(false)
    expect(mod.setActiveUsdToCnyRate(NaN)).toBe(false)
    expect(mod.setActiveUsdToCnyRate(1000)).toBe(false)
    expect(mod.getActiveUsdToCnyRate()).toBe(6.73)
  })
})
