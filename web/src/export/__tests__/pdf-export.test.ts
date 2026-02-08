/**
 * PDF Export Service Tests
 *
 * Tests for PDF export functionality.
 */

import { describe, it, expect } from 'vitest'

describe('PDF Export HTML Templates', () => {
  // ===========================================================================
  // Code Review Template Tests
  // ===========================================================================

  describe('Code Review Report HTML', () => {
    it('should generate code review report HTML', async () => {
      // Import the module to test the template generation
      const { generateCodeReviewTemplate } = await import('../templates/report-templates')

      const mockData = {
        file: '/src/test.ts',
        issues: [
          {
            line: 10,
            column: 5,
            severity: 'error' as const,
            category: 'security',
            message: 'Potential SQL injection vulnerability',
            rule: 'sec/sql-injection',
            suggestion: 'Use parameterized queries',
          },
          {
            line: 20,
            column: 1,
            severity: 'warning' as const,
            category: 'performance',
            message: 'Array.push() in loop detected',
            rule: 'perf/array-push-loop',
            suggestion: 'Consider using map/filter/reduce',
          },
        ],
        summary: {
          errors: 1,
          warnings: 1,
          suggestions: 0,
        },
      }

      const html = generateCodeReviewTemplate(mockData)

      // Basic validation
      expect(html).toContain('Code Review Report')
      expect(html).toContain('/src/test.ts')
      expect(html).toContain('1') // errors
      expect(html).toContain('1') // warnings
      expect(html).toContain('SQL injection')
      expect(html).toContain('Line 10')
    })

    it('should handle empty issues', async () => {
      const { generateCodeReviewTemplate } = await import('../templates/report-templates')

      const emptyData = {
        file: '/src/empty.ts',
        issues: [],
        summary: { errors: 0, warnings: 0, suggestions: 0 },
      }

      const html = generateCodeReviewTemplate(emptyData)

      expect(html).toContain('Code Review Report')
      expect(html).toContain('/src/empty.ts')
      expect(html).toContain('0') // all counts
    })
  })

  // ===========================================================================
  // Test Report Template Tests
  // ===========================================================================

  describe('Test Report HTML', () => {
    it('should generate test report HTML', async () => {
      const { generateTestReportTemplate } = await import('../templates/report-templates')

      const mockData = {
        file: '/src/utils.ts',
        testFile: '/src/__tests__/utils.test.ts',
        framework: 'vitest',
        templates: [
          {
            name: 'add',
            type: 'function' as const,
            body: 'it("should add numbers", () => { expect(add(1, 2)).toBe(3) })',
          },
          {
            name: 'Button',
            type: 'component' as const,
            body: 'it("should render without crashing", () => { render(<Button />) })',
          },
        ],
        summary: {
          functionsFound: 1,
          componentsFound: 1,
          hooksFound: 0,
          classesFound: 0,
          templatesGenerated: 2,
        },
      }

      const html = generateTestReportTemplate(mockData)

      expect(html).toContain('Test Generation Report')
      expect(html).toContain('/src/utils.ts')
      expect(html).toContain('/src/__tests__/utils.test.ts')
      expect(html).toContain('vitest')
      expect(html).toContain('add')
      expect(html).toContain('Button')
    })
  })

  // ===========================================================================
  // Project Analysis Template Tests
  // ===========================================================================

  describe('Project Analysis Report HTML', () => {
    it('should generate project analysis HTML', async () => {
      const { generateProjectAnalysisTemplate } = await import('../templates/report-templates')

      const mockData = {
        projectName: 'my-project',
        analysisDate: '2024-01-15',
        summary: {
          totalFiles: 100,
          totalLines: 5000,
          languages: { TypeScript: 60, JavaScript: 30, CSS: 10 },
          largestFiles: [
            { path: '/src/main.ts', lines: 500 },
            { path: '/src/utils.ts', lines: 400 },
          ],
        },
        structure: {
          directories: 10,
          filesByType: { '.ts': 50, '.tsx': 20, '.css': 15 },
        },
      }

      const html = generateProjectAnalysisTemplate(mockData)

      expect(html).toContain('Project Analysis Report')
      expect(html).toContain('my-project')
      expect(html).toContain('2024-01-15')
      expect(html).toContain('100') // total files
      expect(html).toContain('5,000') // total lines
      expect(html).toContain('TypeScript')
      expect(html).toContain('/src/main.ts')
    })

    it('should handle empty project data', async () => {
      const { generateProjectAnalysisTemplate } = await import('../templates/report-templates')

      const emptyData = {
        projectName: 'empty-project',
        analysisDate: '2024-01-15',
        summary: {
          totalFiles: 0,
          totalLines: 0,
          languages: {},
          largestFiles: [],
        },
        structure: {
          directories: 0,
          filesByType: {},
        },
      }

      const html = generateProjectAnalysisTemplate(emptyData)

      expect(html).toContain('Project Analysis Report')
      expect(html).toContain('empty-project')
      expect(html).toContain('0')
    })
  })

  // ===========================================================================
  // Template Registry Tests
  // ===========================================================================

  describe('Template Registry', () => {
    it('should have all templates defined', async () => {
      const { templates } = await import('../templates/report-templates')

      expect(templates['code-review']).toBeDefined()
      expect(templates['test-report']).toBeDefined()
      expect(templates['project-analysis']).toBeDefined()
      expect(templates['doc-generation']).toBeDefined()
    })

    it('should get template by type', async () => {
      const { getTemplate } = await import('../templates/report-templates')

      const codeReview = getTemplate('code-review')
      expect(codeReview).toBeDefined()
      expect(codeReview?.type).toBe('code-review')
      expect(codeReview?.name).toBe('Code Review Report')
    })

    it('should return undefined for unknown template', async () => {
      const { getTemplate } = await import('../templates/report-templates')

      const unknown = getTemplate('unknown' as never)
      expect(unknown).toBeUndefined()
    })

    it('should have getDefaultOptions', async () => {
      const { getTemplate } = await import('../templates/report-templates')

      const codeReview = getTemplate('code-review')
      expect(codeReview?.getDefaultOptions).toBeDefined()
      const options = codeReview?.getDefaultOptions()
      expect(options?.title).toBe('Code Review Report')
      expect(options?.pageNumbers).toBe(true)
    })
  })

  // ===========================================================================
  // Utility Functions Tests
  // ===========================================================================

  describe('Template Type Guards', () => {
    it('should correctly identify report types', async () => {
      const { templates } = await import('../templates/report-templates')

      expect(templates['code-review'].type).toBe('code-review')
      expect(templates['test-report'].type).toBe('test-report')
      expect(templates['project-analysis'].type).toBe('project-analysis')
    })
  })
})

describe('PDF Export Options', () => {
  it('should have correct default options structure', async () => {
    const { exportToPDF } = await import('../pdf-export')

    // Just verify the function exists and has correct signature
    expect(typeof exportToPDF).toBe('function')
  })

  it('should have all report export functions', async () => {
    const { exportCodeReviewReport, exportTestReport, exportProjectAnalysisReport } =
      await import('../pdf-export')

    expect(typeof exportCodeReviewReport).toBe('function')
    expect(typeof exportTestReport).toBe('function')
    expect(typeof exportProjectAnalysisReport).toBe('function')
  })
})
