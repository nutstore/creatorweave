/**
 * Plugin Monitor Service
 *
 * Monitors plugin resource usage and enforces limits
 * for timeout and memory constraints.
 */

import type { PluginInstance } from '../types/plugin'

//=============================================================================
// Types
//=============================================================================

/**
 * Resource usage metrics for a plugin
 */
export interface ResourceMetrics {
  pluginId: string
  startTime: number
  elapsedTime: number
  peakMemory?: number
  currentMemory?: number
  filesProcessed: number
  lastActivityTime: number
  isActive: boolean
  violations?: Violation[]
}

/**
 * Monitor report with enforcement actions
 */
export interface MonitorReport {
  pluginId: string
  duration: number
  timeoutEnforced: boolean
  memoryLimitEnforced: boolean
  maxMemoryUsed: number
  filesProcessed: number
  status: 'healthy' | 'warning' | 'terminated' | 'completed'
  violations: Violation[]
}

/**
 * Resource violation record
 */
export interface Violation {
  type: 'timeout' | 'memory' | 'inactivity'
  timestamp: number
  details: string
  severity: 'warning' | 'critical'
}

/**
 * Monitor configuration
 */
export interface MonitorConfig {
  checkInterval: number // ms between checks
  inactivityTimeout: number // ms of inactivity before warning
  warningThreshold: number // percentage of limit before warning
}

interface PerformanceMemory {
  usedJSHeapSize?: number
  jsHeapSizeLimit?: number
}

interface PerformanceWithMemory extends Performance {
  memory?: PerformanceMemory
}

//=============================================================================
// Plugin Monitor
//=============================================================================

export class PluginMonitor {
  private metrics = new Map<string, ResourceMetrics>()
  private reports = new Map<string, MonitorReport>()
  private checkTimers = new Map<string, ReturnType<typeof setInterval>>()
  private config: MonitorConfig = {
    checkInterval: 1000, // Check every second
    inactivityTimeout: 30000, // 30 seconds inactivity
    warningThreshold: 0.8, // Warn at 80% of limit
  }

  /**
   * Start monitoring a plugin
   *
   * @param plugin - Plugin instance to monitor
   * @returns Metrics tracker
   */
  startMonitoring(plugin: PluginInstance): ResourceMetrics {
    const metrics: ResourceMetrics = {
      pluginId: plugin.metadata.id,
      startTime: Date.now(),
      elapsedTime: 0,
      peakMemory: 0,
      currentMemory: 0,
      filesProcessed: 0,
      lastActivityTime: Date.now(),
      isActive: true,
    }

    this.metrics.set(plugin.metadata.id, metrics)

    // Start periodic monitoring
    const timer = setInterval(() => {
      this.checkPlugin(plugin.metadata.id)
    }, this.config.checkInterval)

    this.checkTimers.set(plugin.metadata.id, timer)

    return metrics
  }

  /**
   * Stop monitoring a plugin and generate report
   *
   * @param pluginId - Plugin ID
   * @returns Monitor report
   */
  stopMonitoring(pluginId: string): MonitorReport {
    // Clear check timer
    const timer = this.checkTimers.get(pluginId)
    if (timer) {
      clearInterval(timer)
      this.checkTimers.delete(pluginId)
    }

    const metrics = this.metrics.get(pluginId)
    if (!metrics) {
      return {
        pluginId,
        duration: 0,
        timeoutEnforced: false,
        memoryLimitEnforced: false,
        maxMemoryUsed: 0,
        filesProcessed: 0,
        status: 'completed',
        violations: [],
      }
    }

    // Final check
    this.checkPlugin(pluginId)

    // Generate report
    const report = this.generateReport(pluginId)
    this.reports.set(pluginId, report)

    // Clean up metrics
    this.metrics.delete(pluginId)

    return report
  }

  /**
   * Get current metrics for a plugin
   *
   * @param pluginId - Plugin ID
   * @returns Current metrics or undefined
   */
  getMetrics(pluginId: string): ResourceMetrics | undefined {
    return this.metrics.get(pluginId)
  }

  /**
   * Get all active plugin IDs
   *
   * @returns Array of active plugin IDs
   */
  getActivePlugins(): string[] {
    return Array.from(this.metrics.keys()).filter((id) => this.metrics.get(id)?.isActive ?? false)
  }

  /**
   * Update activity timestamp for a plugin
   *
   * @param pluginId - Plugin ID
   */
  updateActivity(pluginId: string): void {
    const metrics = this.metrics.get(pluginId)
    if (metrics) {
      metrics.lastActivityTime = Date.now()
    }
  }

  /**
   * Increment files processed counter
   *
   * @param pluginId - Plugin ID
   */
  incrementFilesProcessed(pluginId: string): void {
    const metrics = this.metrics.get(pluginId)
    if (metrics) {
      metrics.filesProcessed++
      metrics.lastActivityTime = Date.now()
    }
  }

  /**
   * Get monitor report for a plugin
   *
   * @param pluginId - Plugin ID
   * @returns Monitor report or undefined
   */
  getReport(pluginId: string): MonitorReport | undefined {
    return this.reports.get(pluginId)
  }

  /**
   * Get all monitor reports
   *
   * @returns Map of plugin ID to report
   */
  getAllReports(): Map<string, MonitorReport> {
    return new Map(this.reports)
  }

  /**
   * Check if a plugin has exceeded its limits
   *
   * @param pluginId - Plugin ID
   * @param plugin - Plugin instance for limit checking
   * @returns True if limits exceeded
   */
  checkLimits(pluginId: string, plugin: PluginInstance): boolean {
    const metrics = this.metrics.get(pluginId)
    if (!metrics) {
      return false
    }

    // Check metadata exists
    if (!plugin.metadata?.resource_limits) {
      return false
    }

    const limits = plugin.metadata.resource_limits
    const now = Date.now()
    const elapsed = now - metrics.startTime

    // Check timeout
    if (elapsed > limits.max_execution_time) {
      this.recordViolation(pluginId, {
        type: 'timeout',
        timestamp: now,
        details: `Execution time ${elapsed}ms exceeded limit ${limits.max_execution_time}ms`,
        severity: 'critical',
      })
      return true
    }

    // Check memory limit (if available)
    if (metrics.currentMemory && metrics.currentMemory > limits.max_memory) {
      this.recordViolation(pluginId, {
        type: 'memory',
        timestamp: now,
        details: `Memory usage ${metrics.currentMemory} bytes exceeded limit ${limits.max_memory} bytes`,
        severity: 'critical',
      })
      return true
    }

    return false
  }

  /**
   * Configure monitor settings
   *
   * @param config - New configuration
   */
  configure(config: Partial<MonitorConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Stop all monitoring and clean up
   */
  shutdown(): void {
    for (const timer of this.checkTimers.values()) {
      clearInterval(timer)
    }
    this.checkTimers.clear()
    this.metrics.clear()
  }

  /**
   * Periodic check for plugin health
   *
   * @param pluginId - Plugin ID to check
   */
  private checkPlugin(pluginId: string): void {
    const metrics = this.metrics.get(pluginId)
    if (!metrics) {
      return
    }

    const now = Date.now()
    metrics.elapsedTime = now - metrics.startTime

    // Check for inactivity
    const inactiveTime = now - metrics.lastActivityTime
    if (inactiveTime > this.config.inactivityTimeout && metrics.isActive) {
      this.recordViolation(pluginId, {
        type: 'inactivity',
        timestamp: now,
        details: `No activity for ${inactiveTime}ms`,
        severity: 'warning',
      })
    }
  }

  /**
   * Generate monitor report from metrics
   *
   * @param pluginId - Plugin ID
   * @returns Monitor report
   */
  private generateReport(pluginId: string): MonitorReport {
    const metrics = this.metrics.get(pluginId)
    if (!metrics) {
      return {
        pluginId,
        duration: 0,
        timeoutEnforced: false,
        memoryLimitEnforced: false,
        maxMemoryUsed: 0,
        filesProcessed: 0,
        status: 'completed',
        violations: [],
      }
    }

    const violations = this.getViolations(pluginId)
    const timeoutEnforced = violations.some(
      (v) => v.type === 'timeout' && v.severity === 'critical'
    )
    const memoryLimitEnforced = violations.some(
      (v) => v.type === 'memory' && v.severity === 'critical'
    )

    let status: MonitorReport['status'] = 'healthy'
    if (timeoutEnforced || memoryLimitEnforced) {
      status = 'terminated'
    } else if (violations.length > 0) {
      status = 'warning'
    }

    return {
      pluginId,
      duration: metrics.elapsedTime,
      timeoutEnforced,
      memoryLimitEnforced,
      maxMemoryUsed: metrics.peakMemory || 0,
      filesProcessed: metrics.filesProcessed,
      status,
      violations,
    }
  }

  /**
   * Record a violation for a plugin
   *
   * @param pluginId - Plugin ID
   * @param violation - Violation details
   */
  private recordViolation(pluginId: string, violation: Violation): void {
    const metrics = this.metrics.get(pluginId)
    if (!metrics) {
      return
    }

    // Store violations in a Set-like structure
    if (!metrics.violations) {
      metrics.violations = []
    }
    metrics.violations.push(violation)
  }

  /**
   * Get violations for a plugin
   *
   * @param pluginId - Plugin ID
   * @returns Array of violations
   */
  private getViolations(pluginId: string): Violation[] {
    const metrics = this.metrics.get(pluginId)
    return metrics?.violations || []
  }
}

//=============================================================================
// Helper Functions
//=============================================================================

/**
 * Format metrics for display
 *
 * @param metrics - Resource metrics
 * @returns Formatted string
 */
export function formatMetrics(metrics: ResourceMetrics): string {
  const elapsed = (metrics.elapsedTime / 1000).toFixed(2)
  const memory = metrics.currentMemory
    ? `${(metrics.currentMemory / 1024 / 1024).toFixed(2)} MB`
    : 'N/A'

  return [
    `Plugin: ${metrics.pluginId}`,
    `Elapsed: ${elapsed}s`,
    `Memory: ${memory}`,
    `Files: ${metrics.filesProcessed}`,
    `Active: ${metrics.isActive}`,
  ].join(' | ')
}

/**
 * Format report for display
 *
 * @param report - Monitor report
 * @returns Formatted string
 */
export function formatReport(report: MonitorReport): string {
  const duration = (report.duration / 1000).toFixed(2)
  const memory = report.maxMemoryUsed
    ? `${(report.maxMemoryUsed / 1024 / 1024).toFixed(2)} MB`
    : 'N/A'

  const parts = [
    `Plugin: ${report.pluginId}`,
    `Duration: ${duration}s`,
    `Memory: ${memory}`,
    `Files: ${report.filesProcessed}`,
    `Status: ${report.status}`,
  ]

  if (report.violations.length > 0) {
    parts.push(`Violations: ${report.violations.length}`)
  }

  return parts.join(' | ')
}

/**
 * Check if plugin is healthy based on report
 *
 * @param report - Monitor report
 * @returns true if healthy
 */
export function isHealthy(report: MonitorReport): boolean {
  return report.status === 'healthy' || report.status === 'completed'
}

/**
 * Estimate memory usage from performance API
 *
 * @returns Memory usage in bytes or undefined
 */
export function getMemoryUsage(): number | undefined {
  const perf = performance as PerformanceWithMemory
  if (perf.memory) {
    const memory = perf.memory
    return memory.usedJSHeapSize || memory.jsHeapSizeLimit
  }
  return undefined
}

//=============================================================================
// Singleton Instance
//=============================================================================

let monitorInstance: PluginMonitor | null = null

export function getPluginMonitor(): PluginMonitor {
  if (!monitorInstance) {
    monitorInstance = new PluginMonitor()
  }
  return monitorInstance
}
