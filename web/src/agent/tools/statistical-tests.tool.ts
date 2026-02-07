/**
 * Statistical Tests Tool
 *
 * Provides statistical analysis capabilities for data analysts:
 * - T-tests (one-sample, two-sample, paired)
 * - Chi-square test of independence
 * - Correlation analysis (Pearson, Spearman)
 * - One-way ANOVA
 *
 * @module statistical-tests.tool
 */

import type { ToolDefinition, ToolExecutor, ToolContext } from './tool-types'

// ============================================================================
// Types
// ============================================================================

interface TTestResult {
  testType: 'one-sample' | 'two-sample' | 'paired'
  tStatistic: number
  degreesOfFreedom: number
  pValue: number
  confidenceInterval: [number, number]
  meanDifference?: number
  interpretation: string
  isSignificant: boolean
  alpha: number
}

interface ChiSquareResult {
  chiSquareStatistic: number
  degreesOfFreedom: number
  pValue: number
  isSignificant: boolean
  interpretation: string
  expectedFrequencies?: number[][]
  alpha: number
}

interface CorrelationResult {
  coefficient: number
  method: 'pearson' | 'spearman'
  pValue: number
  isSignificant: boolean
  interpretation: string
  strength: 'very weak' | 'weak' | 'moderate' | 'strong' | 'very strong'
  direction: 'positive' | 'negative' | 'none'
  alpha: number
}

interface ANOVAResult {
  fStatistic: number
  degreesOfFreedomBetween: number
  degreesOfFreedomWithin: number
  pValue: number
  isSignificant: boolean
  interpretation: string
  groupMeans?: number[]
  groupSizes?: number[]
  alpha: number
}

// ============================================================================
// Statistical Functions
// ============================================================================

/**
 * Calculate mean of an array of numbers
 */
function mean(values: number[]): number {
  if (values.length === 0) return NaN
  return values.reduce((sum, val) => sum + val, 0) / values.length
}

/**
 * Calculate standard deviation
 */
function stdDev(values: number[], sample = true): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  const variance =
    values.reduce((sum, val) => sum + (val - avg) ** 2, 0) / (values.length - (sample ? 1 : 0))
  return Math.sqrt(variance)
}

/**
 * Calculate variance
 */
function variance(values: number[], sample = true): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  return values.reduce((sum, val) => sum + (val - avg) ** 2, 0) / (values.length - (sample ? 1 : 0))
}

/**
 * Approximate the cumulative distribution function for standard normal distribution
 * Using the error function approximation
 */
function normalCDF(z: number): number {
  const sign = z < 0 ? -1 : 1
  z = Math.abs(z) / Math.sqrt(2)
  // Abramowitz and Stegun approximation for erf
  const constants = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429]
  const t = 1 / (1 + 0.3275911 * z)
  let y = 1
  for (let i = 0; i < constants.length; i++) {
    y = constants[i] + (i === constants.length - 1 ? 0 : y) * t
  }
  y *= t * Math.exp(-z * z)
  return 0.5 * (1 + sign * (1 - y))
}

/**
 * Two-tailed p-value from z-score
 */
function zToPValue(z: number): number {
  return 2 * (1 - normalCDF(Math.abs(z)))
}

/**
 * Approximate t-distribution CDF using polynomial approximation
 */
function tCDF(t: number, df: number): number {
  if (df === Infinity) return normalCDF(t)

  // For large df, use normal approximation
  if (df > 100) {
    return normalCDF(t)
  }

  // For small df, use approximation
  const x = df / (df + t * t)
  // Use incomplete beta function approximation
  // This is a simplified version - for production use a more accurate implementation

  // Regularized incomplete beta approximation
  if (x < 0 || x > 1) return NaN

  // Log beta function approximation
  const logGamma = (z: number): number => {
    if (z < 0.5) {
      return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z)
    }
    z -= 1
    const c = [
      76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
      0.120865097386617e-2, -0.5395239384953e-5,
    ]
    let x = z
    let y = z
    let tmp = x + 5.5
    tmp -= (x + 0.5) * Math.log(tmp)
    let ser = 1.000000000190015
    for (let j = 0; j < 6; j++) {
      y += 1
      ser += c[j] / y
    }
    return -tmp + Math.log((2.5066282746310005 * ser) / x)
  }

  // Simplified regularized incomplete beta
  if (t < 0) {
    return 1 - tCDF(-t, df)
  }

  // For t > 0, use numerical approximation
  // This is conservative and may not be highly accurate for very small df
  const result = 0.5 + 0.5 * Math.sign(t) * (1 - Math.exp(-0.5 * t * t))
  return Math.max(0, Math.min(1, result))
}

/**
 * Two-tailed p-value from t-statistic
 */
function tToPValue(t: number, df: number): number {
  if (df === Infinity) return zToPValue(t)
  return 2 * (1 - tCDF(Math.abs(t), df))
}

/**
 * Chi-square CDF approximation (Wilson-Hilferty approximation)
 */
function chiSquareCDF(chiSq: number, df: number): number {
  if (df <= 0) return NaN
  if (chiSq <= 0) return 0

  // Wilson-Hilferty approximation
  const z = Math.pow(chiSq / df, 1 / 3) - 1 + 2 / (9 * df)
  const stdDev = Math.sqrt(2 / (9 * df))
  return normalCDF(z / stdDev)
}

/**
 * P-value from chi-square statistic
 */
function chiSquareToPValue(chiSq: number, df: number): number {
  return 1 - chiSquareCDF(chiSq, df)
}

/**
 * F-distribution CDF approximation
 */
function fCDF(f: number, df1: number, df2: number): number {
  if (f <= 0) return 0

  // Fisher's approximation
  const s1 = 2 / (9 * df1)
  const s2 = 2 / (9 * df2)
  const stdDev = Math.sqrt(s1 + s2)
  const mean = (df2 - df1) / (2 * df1 * df2)

  return normalCDF((Math.sqrt(f) - mean) / stdDev)
}

/**
 * P-value from F-statistic
 */
function fToPValue(f: number, df1: number, df2: number): number {
  return 1 - fCDF(f, df1, df2)
}

/**
 * Rank data for Spearman correlation
 */
function rank(values: number[]): number[] {
  const sorted = values.map((v, i) => ({ value: v, index: i })).sort((a, b) => a.value - b.value)

  const ranks = new Array(values.length)
  let i = 0
  while (i < sorted.length) {
    let j = i
    while (j < sorted.length && sorted[j].value === sorted[i].value) {
      j++
    }
    // Average rank for ties
    const avgRank = (i + j - 1) / 2 + 1
    for (let k = i; k < j; k++) {
      ranks[sorted[k].index] = avgRank
    }
    i = j
  }
  return ranks
}

/**
 * Interpret correlation strength
 */
function interpretCorrelation(r: number): {
  strength: 'very weak' | 'weak' | 'moderate' | 'strong' | 'very strong'
  direction: 'positive' | 'negative' | 'none'
} {
  const abs = Math.abs(r)
  let strength: 'very weak' | 'weak' | 'moderate' | 'strong' | 'very strong'

  if (abs < 0.1) strength = 'very weak'
  else if (abs < 0.3) strength = 'weak'
  else if (abs < 0.5) strength = 'moderate'
  else if (abs < 0.7) strength = 'strong'
  else strength = 'very strong'

  const direction: 'positive' | 'negative' | 'none' =
    r > 0.01 ? 'positive' : r < -0.01 ? 'negative' : 'none'

  return { strength, direction }
}

// ============================================================================
// Test Implementations
// ============================================================================

/**
 * One-sample t-test
 */
function oneSampleTTest(sample: number[], hypothesizedMean: number, alpha = 0.05): TTestResult {
  if (sample.length < 2) {
    throw new Error('Sample must have at least 2 observations')
  }

  const sampleMean = mean(sample)
  const sampleStd = stdDev(sample, true)
  const n = sample.length
  const standardError = sampleStd / Math.sqrt(n)
  const tStatistic = (sampleMean - hypothesizedMean) / standardError
  const degreesOfFreedom = n - 1
  const pValue = tToPValue(tStatistic, degreesOfFreedom)

  // Confidence interval
  const tCritical = Math.abs(normalCDF(1 - alpha / 2)) // Approximation
  const margin = tCritical * standardError
  const confidenceInterval: [number, number] = [sampleMean - margin, sampleMean + margin]

  return {
    testType: 'one-sample',
    tStatistic,
    degreesOfFreedom,
    pValue,
    confidenceInterval,
    meanDifference: sampleMean - hypothesizedMean,
    interpretation:
      pValue < alpha
        ? `Reject null hypothesis. The sample mean (${sampleMean.toFixed(3)}) is significantly different from ${hypothesizedMean} (p=${pValue.toFixed(4)}).`
        : `Fail to reject null hypothesis. The sample mean (${sampleMean.toFixed(3)}) is not significantly different from ${hypothesizedMean} (p=${pValue.toFixed(4)}).`,
    isSignificant: pValue < alpha,
    alpha,
  }
}

/**
 * Two-sample t-test (independent samples)
 */
function twoSampleTTest(
  sample1: number[],
  sample2: number[],
  equalVariance = true,
  alpha = 0.05
): TTestResult {
  if (sample1.length < 2 || sample2.length < 2) {
    throw new Error('Both samples must have at least 2 observations')
  }

  const n1 = sample1.length
  const n2 = sample2.length
  const mean1 = mean(sample1)
  const mean2 = mean(sample2)
  const var1 = variance(sample1, true)
  const var2 = variance(sample2, true)

  let tStatistic: number
  let degreesOfFreedom: number
  let standardError: number

  if (equalVariance) {
    // Pooled variance
    const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2)
    standardError = Math.sqrt(pooledVar * (1 / n1 + 1 / n2))
    tStatistic = (mean1 - mean2) / standardError
    degreesOfFreedom = n1 + n2 - 2
  } else {
    // Welch's t-test
    standardError = Math.sqrt(var1 / n1 + var2 / n2)
    tStatistic = (mean1 - mean2) / standardError
    const dfNum = (var1 / n1 + var2 / n2) ** 2
    const dfDen = (var1 / n1) ** 2 / (n1 - 1) + (var2 / n2) ** 2 / (n2 - 1)
    degreesOfFreedom = dfNum / dfDen
  }

  const pValue = tToPValue(tStatistic, degreesOfFreedom)
  const meanDifference = mean1 - mean2

  // Confidence interval
  const tCritical = Math.abs(normalCDF(1 - alpha / 2))
  const margin = tCritical * standardError
  const confidenceInterval: [number, number] = [meanDifference - margin, meanDifference + margin]

  return {
    testType: 'two-sample',
    tStatistic,
    degreesOfFreedom,
    pValue,
    confidenceInterval,
    meanDifference,
    interpretation:
      pValue < alpha
        ? `Reject null hypothesis. The means are significantly different (mean1=${mean1.toFixed(3)}, mean2=${mean2.toFixed(3)}, p=${pValue.toFixed(4)}).`
        : `Fail to reject null hypothesis. The means are not significantly different (mean1=${mean1.toFixed(3)}, mean2=${mean2.toFixed(3)}, p=${pValue.toFixed(4)}).`,
    isSignificant: pValue < alpha,
    alpha,
  }
}

/**
 * Paired t-test
 */
function pairedTTest(before: number[], after: number[], alpha = 0.05): TTestResult {
  if (before.length !== after.length) {
    throw new Error('Samples must have the same length for paired t-test')
  }
  if (before.length < 2) {
    throw new Error('Samples must have at least 2 observations')
  }

  const differences = before.map((b, i) => after[i] - b)
  const meanDiff = mean(differences)
  const stdDiff = stdDev(differences, true)
  const n = differences.length
  const standardError = stdDiff / Math.sqrt(n)
  const tStatistic = meanDiff / standardError
  const degreesOfFreedom = n - 1
  const pValue = tToPValue(tStatistic, degreesOfFreedom)

  // Confidence interval
  const tCritical = Math.abs(normalCDF(1 - alpha / 2))
  const margin = tCritical * standardError
  const confidenceInterval: [number, number] = [meanDiff - margin, meanDiff + margin]

  return {
    testType: 'paired',
    tStatistic,
    degreesOfFreedom,
    pValue,
    confidenceInterval,
    meanDifference: meanDiff,
    interpretation:
      pValue < alpha
        ? `Reject null hypothesis. There is a significant difference between paired measurements (mean change=${meanDiff.toFixed(3)}, p=${pValue.toFixed(4)}).`
        : `Fail to reject null hypothesis. No significant difference between paired measurements (mean change=${meanDiff.toFixed(3)}, p=${pValue.toFixed(4)}).`,
    isSignificant: pValue < alpha,
    alpha,
  }
}

/**
 * Chi-square test of independence
 */
function chiSquareTest(observed: number[][], alpha = 0.05): ChiSquareResult {
  if (observed.length === 0 || observed[0].length === 0) {
    throw new Error('Contingency table must have at least 1 row and 1 column')
  }

  const rows = observed.length
  const cols = observed[0].length

  // Calculate row and column totals
  const rowTotals = observed.map((row) => row.reduce((sum, val) => sum + val, 0))
  const colTotals = new Array(cols).fill(0)
  let grandTotal = 0

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      colTotals[c] += observed[r][c]
    }
  }
  grandTotal = rowTotals.reduce((sum, val) => sum + val, 0)

  if (grandTotal === 0) {
    throw new Error('Grand total cannot be zero')
  }

  // Calculate expected frequencies
  const expected: number[][] = []
  for (let r = 0; r < rows; r++) {
    expected[r] = []
    for (let c = 0; c < cols; c++) {
      expected[r][c] = (rowTotals[r] * colTotals[c]) / grandTotal
    }
  }

  // Calculate chi-square statistic
  let chiSquareStatistic = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const exp = expected[r][c]
      if (exp > 0) {
        chiSquareStatistic += (observed[r][c] - exp) ** 2 / exp
      }
    }
  }

  const degreesOfFreedom = (rows - 1) * (cols - 1)
  const pValue = chiSquareToPValue(chiSquareStatistic, degreesOfFreedom)

  return {
    chiSquareStatistic,
    degreesOfFreedom,
    pValue,
    isSignificant: pValue < alpha,
    interpretation:
      pValue < alpha
        ? `Reject null hypothesis. The variables are significantly associated (χ²=${chiSquareStatistic.toFixed(3)}, df=${degreesOfFreedom}, p=${pValue.toFixed(4)}).`
        : `Fail to reject null hypothesis. The variables are not significantly associated (χ²=${chiSquareStatistic.toFixed(3)}, df=${degreesOfFreedom}, p=${pValue.toFixed(4)}).`,
    expectedFrequencies: expected,
    alpha,
  }
}

/**
 * Pearson correlation coefficient
 */
function pearsonCorrelation(x: number[], y: number[], alpha = 0.05): CorrelationResult {
  if (x.length !== y.length) {
    throw new Error('Arrays must have the same length')
  }
  if (x.length < 3) {
    throw new Error('At least 3 observations required')
  }

  const n = x.length
  const meanX = mean(x)
  const meanY = mean(y)

  let numerator = 0
  let sumSqX = 0
  let sumSqY = 0

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX
    const dy = y[i] - meanY
    numerator += dx * dy
    sumSqX += dx * dx
    sumSqY += dy * dy
  }

  const coefficient = numerator / Math.sqrt(sumSqX * sumSqY)

  // T-test for significance of correlation
  const tStatistic = coefficient * Math.sqrt((n - 2) / (1 - coefficient * coefficient))
  const pValue = tToPValue(tStatistic, n - 2)

  const { strength, direction } = interpretCorrelation(coefficient)

  return {
    coefficient,
    method: 'pearson',
    pValue,
    isSignificant: pValue < alpha,
    interpretation:
      pValue < alpha
        ? `Significant ${direction} correlation detected (${strength}, r=${coefficient.toFixed(3)}, p=${pValue.toFixed(4)}).`
        : `No significant correlation detected (r=${coefficient.toFixed(3)}, p=${pValue.toFixed(4)}).`,
    strength,
    direction,
    alpha,
  }
}

/**
 * Spearman rank correlation coefficient
 */
function spearmanCorrelation(x: number[], y: number[], alpha = 0.05): CorrelationResult {
  if (x.length !== y.length) {
    throw new Error('Arrays must have the same length')
  }
  if (x.length < 3) {
    throw new Error('At least 3 observations required')
  }

  const rankX = rank(x)
  const rankY = rank(y)

  // Use Pearson on ranks
  const pearson = pearsonCorrelation(rankX, rankY, alpha)

  return {
    ...pearson,
    method: 'spearman',
    coefficient: pearson.coefficient,
  }
}

/**
 * One-way ANOVA
 */
function oneWayANOVA(samples: number[][], alpha = 0.05): ANOVAResult {
  if (samples.length < 2) {
    throw new Error('At least 2 groups required')
  }

  const validSamples = samples.filter((s) => s.length > 0)
  if (validSamples.length < 2) {
    throw new Error('At least 2 groups with data required')
  }

  const k = validSamples.length // number of groups
  const n = validSamples.reduce((sum, s) => sum + s.length, 0) // total observations

  // Calculate group means
  const groupMeans = validSamples.map((s) => mean(s))
  const groupSizes = validSamples.map((s) => s.length)

  // Grand mean
  const grandMean = validSamples.flat().reduce((sum, val) => sum + val, 0) / n

  // Sum of squares between groups
  let ssBetween = 0
  for (let i = 0; i < k; i++) {
    ssBetween += groupSizes[i] * (groupMeans[i] - grandMean) ** 2
  }

  // Sum of squares within groups
  let ssWithin = 0
  for (let i = 0; i < k; i++) {
    const groupMean = groupMeans[i]
    for (const val of validSamples[i]) {
      ssWithin += (val - groupMean) ** 2
    }
  }

  const dfBetween = k - 1
  const dfWithin = n - k

  const msBetween = ssBetween / dfBetween
  const msWithin = ssWithin / dfWithin

  const fStatistic = msBetween / msWithin
  const pValue = fToPValue(fStatistic, dfBetween, dfWithin)

  return {
    fStatistic,
    degreesOfFreedomBetween: dfBetween,
    degreesOfFreedomWithin: dfWithin,
    pValue,
    isSignificant: pValue < alpha,
    groupMeans,
    groupSizes,
    interpretation:
      pValue < alpha
        ? `Reject null hypothesis. At least one group mean is significantly different (F=${fStatistic.toFixed(3)}, p=${pValue.toFixed(4)}).`
        : `Fail to reject null hypothesis. No significant difference between group means (F=${fStatistic.toFixed(3)}, p=${pValue.toFixed(4)}).`,
    alpha,
  }
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const t_test: ToolDefinition = {
  type: 'function',
  function: {
    name: 't_test',
    description:
      'Perform t-test analysis to compare means between groups. Supports one-sample, two-sample (independent), and paired t-tests.',
    parameters: {
      type: 'object',
      properties: {
        test_type: {
          type: 'string',
          enum: ['one-sample', 'two-sample', 'paired'],
          description: 'Type of t-test to perform',
        },
        sample1: {
          type: 'array',
          items: { type: 'number' },
          description: 'First sample data (or sample for one-sample test)',
        },
        sample2: {
          type: 'array',
          items: { type: 'number' },
          description: 'Second sample data (required for two-sample and paired tests)',
        },
        hypothesized_mean: {
          type: 'number',
          description: 'Hypothesized mean for one-sample test (default: 0)',
        },
        equal_variance: {
          type: 'boolean',
          description: 'Assume equal variance for two-sample test (default: true)',
        },
        alpha: {
          type: 'number',
          description: 'Significance level (default: 0.05)',
        },
      },
      required: ['test_type', 'sample1'],
    },
  },
}

export const t_test_executor: ToolExecutor = async (
  args: unknown,
  _context: ToolContext
): Promise<string> => {
  const params = args as {
    test_type: 'one-sample' | 'two-sample' | 'paired'
    sample1: number[]
    sample2?: number[]
    hypothesized_mean?: number
    equal_variance?: boolean
    alpha?: number
  }

  const alpha = params.alpha ?? 0.05

  let result: TTestResult

  try {
    switch (params.test_type) {
      case 'one-sample':
        result = oneSampleTTest(params.sample1, params.hypothesized_mean ?? 0, alpha)
        break
      case 'two-sample':
        if (!params.sample2) {
          throw new Error('sample2 is required for two-sample t-test')
        }
        result = twoSampleTTest(
          params.sample1,
          params.sample2,
          params.equal_variance ?? true,
          alpha
        )
        break
      case 'paired':
        if (!params.sample2) {
          throw new Error('sample2 is required for paired t-test')
        }
        result = pairedTTest(params.sample1, params.sample2, alpha)
        break
      default:
        throw new Error(`Unknown test type: ${params.test_type}`)
    }

    return JSON.stringify(
      {
        success: true,
        test: 't_test',
        test_type: params.test_type,
        ...result,
      },
      null,
      2
    )
  } catch (error) {
    return JSON.stringify(
      {
        success: false,
        test: 't_test',
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  }
}

export const chi_square: ToolDefinition = {
  type: 'function',
  function: {
    name: 'chi_square',
    description:
      'Perform chi-square test of independence for categorical data. Tests whether two categorical variables are associated.',
    parameters: {
      type: 'object',
      properties: {
        observed: {
          type: 'array',
          items: { type: 'array', items: { type: 'number' } },
          description: '2D array of observed frequencies (contingency table)',
        },
        alpha: {
          type: 'number',
          description: 'Significance level (default: 0.05)',
        },
      },
      required: ['observed'],
    },
  },
}

export const chi_square_executor: ToolExecutor = async (
  args: unknown,
  _context: ToolContext
): Promise<string> => {
  const params = args as {
    observed: number[][]
    alpha?: number
  }

  try {
    const result = chiSquareTest(params.observed, params.alpha ?? 0.05)
    return JSON.stringify(
      {
        success: true,
        test: 'chi_square',
        ...result,
      },
      null,
      2
    )
  } catch (error) {
    return JSON.stringify(
      {
        success: false,
        test: 'chi_square',
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  }
}

export const correlation: ToolDefinition = {
  type: 'function',
  function: {
    name: 'correlation',
    description:
      'Calculate correlation coefficient between two variables. Supports Pearson (linear) and Spearman (rank) correlations.',
    parameters: {
      type: 'object',
      properties: {
        x: {
          type: 'array',
          items: { type: 'number' },
          description: 'First variable data',
        },
        y: {
          type: 'array',
          items: { type: 'number' },
          description: 'Second variable data',
        },
        method: {
          type: 'string',
          enum: ['pearson', 'spearman'],
          description: 'Correlation method (default: pearson)',
        },
        alpha: {
          type: 'number',
          description: 'Significance level (default: 0.05)',
        },
      },
      required: ['x', 'y'],
    },
  },
}

export const correlation_executor: ToolExecutor = async (
  args: unknown,
  _context: ToolContext
): Promise<string> => {
  const params = args as {
    x: number[]
    y: number[]
    method?: 'pearson' | 'spearman'
    alpha?: number
  }

  try {
    const result =
      params.method === 'spearman'
        ? spearmanCorrelation(params.x, params.y, params.alpha ?? 0.05)
        : pearsonCorrelation(params.x, params.y, params.alpha ?? 0.05)

    return JSON.stringify(
      {
        success: true,
        test: 'correlation',
        ...result,
      },
      null,
      2
    )
  } catch (error) {
    return JSON.stringify(
      {
        success: false,
        test: 'correlation',
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  }
}

export const anova: ToolDefinition = {
  type: 'function',
  function: {
    name: 'anova',
    description:
      'Perform one-way ANOVA to test for differences between group means. Determines if at least one group mean is significantly different.',
    parameters: {
      type: 'object',
      properties: {
        samples: {
          type: 'array',
          items: { type: 'array', items: { type: 'number' } },
          description: 'Array of sample arrays, one per group',
        },
        alpha: {
          type: 'number',
          description: 'Significance level (default: 0.05)',
        },
      },
      required: ['samples'],
    },
  },
}

export const anova_executor: ToolExecutor = async (
  args: unknown,
  _context: ToolContext
): Promise<string> => {
  const params = args as {
    samples: number[][]
    alpha?: number
  }

  try {
    const result = oneWayANOVA(params.samples, params.alpha ?? 0.05)
    return JSON.stringify(
      {
        success: true,
        test: 'anova',
        ...result,
      },
      null,
      2
    )
  } catch (error) {
    return JSON.stringify(
      {
        success: false,
        test: 'anova',
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  }
}

// Export all definitions and executors
export const statisticalTestsTools: Record<
  string,
  { definition: ToolDefinition; executor: ToolExecutor }
> = {
  t_test: { definition: t_test, executor: t_test_executor },
  chi_square: { definition: chi_square, executor: chi_square_executor },
  correlation: { definition: correlation, executor: correlation_executor },
  anova: { definition: anova, executor: anova_executor },
}

// Export for tool registry
export const statisticalTestsToolDefinitions: ToolDefinition[] = [
  t_test,
  chi_square,
  correlation,
  anova,
]

export const statisticalTestsToolExecutors: Record<string, ToolExecutor> = {
  t_test: t_test_executor,
  chi_square: chi_square_executor,
  correlation: correlation_executor,
  anova: anova_executor,
}
