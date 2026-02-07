/**
 * Tests for Statistical Tests Tool
 */

import { describe, it, expect } from 'vitest'
import {
  t_test_executor,
  chi_square_executor,
  correlation_executor,
  anova_executor,
} from '../statistical-tests.tool'
import type { ToolContext } from '../tool-types'

describe('Statistical Tests Tool', () => {
  const mockContext: ToolContext = {
    directoryHandle: null as unknown as FileSystemDirectoryHandle,
  }

  describe('t_test', () => {
    it('should perform one-sample t-test', async () => {
      const args = {
        test_type: 'one-sample' as const,
        sample1: [5, 6, 7, 8, 9],
        hypothesized_mean: 7,
        alpha: 0.05,
      }

      const result = JSON.parse(await t_test_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.test_type).toBe('one-sample')
      expect(result).toHaveProperty('tStatistic')
      expect(result).toHaveProperty('pValue')
      expect(result).toHaveProperty('degreesOfFreedom')
      expect(result).toHaveProperty('confidenceInterval')
    })

    it('should perform two-sample t-test', async () => {
      const args = {
        test_type: 'two-sample' as const,
        sample1: [5, 6, 7, 8, 9],
        sample2: [4, 5, 6, 7, 8],
        equal_variance: true,
        alpha: 0.05,
      }

      const result = JSON.parse(await t_test_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.test_type).toBe('two-sample')
      expect(result).toHaveProperty('meanDifference')
    })

    it('should perform paired t-test', async () => {
      const args = {
        test_type: 'paired' as const,
        sample1: [5, 6, 7, 8, 9],
        sample2: [4, 5, 6, 7, 8],
        alpha: 0.05,
      }

      const result = JSON.parse(await t_test_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.test_type).toBe('paired')
    })

    it('should require sample2 for two-sample test', async () => {
      const args = {
        test_type: 'two-sample' as const,
        sample1: [1, 2, 3],
      }

      const result = JSON.parse(await t_test_executor(args, mockContext))

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should require matching array lengths for paired test', async () => {
      const args = {
        test_type: 'paired' as const,
        sample1: [1, 2, 3],
        sample2: [1, 2],
      }

      const result = JSON.parse(await t_test_executor(args, mockContext))

      expect(result.success).toBe(false)
      expect(result.error).toContain('same length')
    })
  })

  describe('chi_square', () => {
    it('should perform chi-square test of independence', async () => {
      const args = {
        observed: [
          [10, 20, 30],
          [15, 25, 35],
        ],
        alpha: 0.05,
      }

      const result = JSON.parse(await chi_square_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result).toHaveProperty('chiSquareStatistic')
      expect(result).toHaveProperty('degreesOfFreedom')
      expect(result).toHaveProperty('pValue')
      expect(result.degreesOfFreedom).toBe(2) // (2-1) * (3-1) = 2
    })

    it('should handle 2x2 contingency table', async () => {
      const args = {
        observed: [
          [10, 20],
          [30, 40],
        ],
      }

      const result = JSON.parse(await chi_square_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.degreesOfFreedom).toBe(1)
    })

    it('should return expected frequencies', async () => {
      const args = {
        observed: [
          [10, 20],
          [20, 10],
        ],
      }

      const result = JSON.parse(await chi_square_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.expectedFrequencies).toBeDefined()
      expect(result.expectedFrequencies).toHaveLength(2)
    })
  })

  describe('correlation', () => {
    it('should calculate Pearson correlation', async () => {
      const args = {
        x: [1, 2, 3, 4, 5],
        y: [2, 4, 6, 8, 10],
        method: 'pearson' as const,
        alpha: 0.05,
      }

      const result = JSON.parse(await correlation_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.method).toBe('pearson')
      expect(result.coefficient).toBeCloseTo(1, 1) // Perfect positive correlation
      expect(result.strength).toBe('very strong')
      expect(result.direction).toBe('positive')
    })

    it('should calculate Spearman correlation', async () => {
      const args = {
        x: [1, 2, 3, 4, 5],
        y: [1, 3, 2, 5, 4],
        method: 'spearman' as const,
      }

      const result = JSON.parse(await correlation_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.method).toBe('spearman')
      expect(result).toHaveProperty('coefficient')
    })

    it('should detect negative correlation', async () => {
      const args = {
        x: [1, 2, 3, 4, 5],
        y: [5, 4, 3, 2, 1],
        method: 'pearson' as const,
      }

      const result = JSON.parse(await correlation_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.coefficient).toBeLessThan(0)
      expect(result.direction).toBe('negative')
    })

    it('should require matching array lengths', async () => {
      const args = {
        x: [1, 2, 3],
        y: [1, 2],
        method: 'pearson' as const,
      }

      const result = JSON.parse(await correlation_executor(args, mockContext))

      expect(result.success).toBe(false)
    })
  })

  describe('anova', () => {
    it('should perform one-way ANOVA', async () => {
      const args = {
        samples: [
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9],
        ],
        alpha: 0.05,
      }

      const result = JSON.parse(await anova_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result).toHaveProperty('fStatistic')
      expect(result).toHaveProperty('degreesOfFreedomBetween')
      expect(result).toHaveProperty('degreesOfFreedomWithin')
      expect(result).toHaveProperty('pValue')
      expect(result.degreesOfFreedomBetween).toBe(2) // k - 1 = 3 - 1 = 2
    })

    it('should return group means', async () => {
      const args = {
        samples: [
          [1, 2, 3],
          [4, 5, 6],
        ],
      }

      const result = JSON.parse(await anova_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.groupMeans).toBeDefined()
      expect(result.groupMeans).toHaveLength(2)
      expect(result.groupMeans![0]).toBe(2) // mean of [1,2,3]
      expect(result.groupMeans![1]).toBe(5) // mean of [4,5,6]
    })

    it('should require at least 2 groups', async () => {
      const args = {
        samples: [[1, 2, 3]],
      }

      const result = JSON.parse(await anova_executor(args, mockContext))

      expect(result.success).toBe(false)
    })

    it('should handle groups with different sizes', async () => {
      const args = {
        samples: [
          [1, 2, 3, 4],
          [5, 6, 7],
        ],
      }

      const result = JSON.parse(await anova_executor(args, mockContext))

      expect(result.success).toBe(true)
    })
  })
})
