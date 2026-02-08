/**
 * PDF Export Service
 *
 * Handles PDF report generation using jsPDF + html2canvas.
 * Supports Agent results, code reviews, test reports, and project analysis.
 *
 * Features:
 * - Professional report formatting with headers/footers
 * - Table of contents generation
 * - Page numbering
 * - Multiple report templates
 *
 * @module pdf-export
 */

import { saveAs } from 'file-saver'

// ============================================================================
// Types
// ============================================================================

export type PDFReportType = 'code-review' | 'test-generation' | 'project-analysis' | 'custom'

export interface PDFExportOptions {
  /** Report title */
  title: string
  /** Document author */
  author?: string
  /** Include table of contents */
  includeTOC?: boolean
  /** Show page numbers */
  pageNumbers?: boolean
  /** Custom header text */
  header?: string
  /** Custom footer text */
  footer?: string
  /** Report type for template selection */
  reportType?: PDFReportType
  /** Export progress callback */
  onProgress?: (progress: number, status: string) => void
  /** Cancellation signal */
  signal?: AbortSignal
}

export interface PDFExportResult {
  success: boolean
  blob: Blob | null
  filename: string
  error?: string
}

// ============================================================================
// Report Data Types
// ============================================================================

export interface CodeReviewReportData {
  file: string
  issues: Array<{
    line: number
    column: number
    severity: 'error' | 'warning' | 'info'
    category: string
    message: string
    rule: string
    suggestion?: string
  }>
  summary: {
    errors: number
    warnings: number
    suggestions: number
  }
}

export interface TestGenerationReportData {
  file: string
  testFile: string
  framework: string
  templates: Array<{
    name: string
    type: 'function' | 'component' | 'class' | 'hook'
    body: string
  }>
  summary: {
    functionsFound: number
    componentsFound: number
    hooksFound: number
    classesFound: number
    templatesGenerated: number
  }
}

export interface ProjectAnalysisReportData {
  projectName: string
  analysisDate: string
  summary: {
    totalFiles: number
    totalLines: number
    languages: Record<string, number>
    largestFiles: Array<{ path: string; lines: number }>
  }
  structure: {
    directories: number
    filesByType: Record<string, number>
  }
}

// ============================================================================
// jsPDF Types (simplified)
// ============================================================================

interface JSPDF {
  text(text: string, x: number, y: number, options?: Record<string, unknown>): void
  setFontSize(size: number): void
  setFont(font: string, style?: string): void
  setTextColor(r: number, g: number, b: number): void
  setFillColor(r: number, g: number, b: number): void
  setDrawColor(r: number, g: number, b: number): void
  setLineWidth(width: number): void
  line(x1: number, y1: number, x2: number, y2: number): void
  rect(x: number, y: number, w: number, h: number, style?: string): void
  addPage(): void
  setPage(pageNumber: number): void
  addImage(data: string, format: string, x: number, y: number, w: number, h: number): void
  html(html: string, options?: Record<string, unknown>): Promise<void>
  splitTextToSize(text: string, maxWidth: number): string[]
  getTextDimensions(text: string | string[]): { w: number; h: number }
  internal: {
    pageSize: {
      getWidth(): number
      getHeight(): number
    }
    pages: string[]
    getNumberOfPages(): number
  }
  output(type: 'blob'): Blob
}

// ============================================================================
// PDF Export Functions
// ============================================================================

/**
 * Export report to PDF format
 *
 * @param content - HTML content or report data
 * @param options - Export options
 * @returns Export result
 */
export async function exportToPDF(
  content: string | HTMLElement,
  options: PDFExportOptions
): Promise<PDFExportResult> {
  const {
    title = 'Report',
    author = 'Browser FS Analyzer',
    includeTOC = false,
    pageNumbers = true,
    header,
    footer,
    onProgress,
    signal,
  } = options

  try {
    onProgress?.(10, 'Loading PDF libraries...')

    // Dynamic imports for PDF libraries
    const { default: jsPDF } = await import('jspdf')
    await import('html2canvas')

    onProgress?.(30, 'Generating PDF...')

    if (signal?.aborted) {
      return { success: false, blob: null, filename: '', error: 'Export cancelled' }
    }

    // Create PDF document
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    }) as unknown as JSPDF

    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 20
    const contentWidth = pageWidth - margin * 2

    // Track current position
    let currentY = margin

    // =========================================================================
    // Cover Page
    // =========================================================================

    // Background
    pdf.setFillColor(248, 250, 252)
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    // Title
    pdf.setFontSize(32)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(30, 41, 59)
    pdf.text(title, pageWidth / 2, pageHeight / 3, { align: 'center' } as Record<string, unknown>)

    // Author and date
    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(100, 116, 139)
    pdf.text(author, pageWidth / 2, pageHeight / 3 + 20, { align: 'center' } as Record<
      string,
      unknown
    >)
    pdf.text(
      new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      pageWidth / 2,
      pageHeight / 3 + 35,
      { align: 'center' } as Record<string, unknown>
    )

    // Decorative line
    pdf.setDrawColor(99, 102, 241)
    pdf.setLineWidth(1)
    pdf.line(pageWidth / 2 - 50, pageHeight / 3 + 50, pageWidth / 2 + 50, pageHeight / 3 + 50)

    // Footer on cover
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(148, 163, 184)
    pdf.text('Generated by Browser FS Analyzer', pageWidth / 2, pageHeight - 20, {
      align: 'center',
    } as Record<string, unknown>)

    // =========================================================================
    // Table of Contents
    // =========================================================================

    if (includeTOC) {
      pdf.addPage()
      currentY = margin

      pdf.setFontSize(20)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(30, 41, 59)
      pdf.text('Table of Contents', margin, currentY)

      currentY += 15

      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(71, 85, 105)

      const tocItems = ['Summary', 'Details', 'Recommendations']

      tocItems.forEach((item, index) => {
        pdf.text(`${index + 1}. ${item}`, margin, currentY)
        currentY += 10
      })
    }

    // =========================================================================
    // Main Content
    // =========================================================================

    pdf.addPage()

    if (typeof content === 'string') {
      // Render HTML content
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = content
      tempDiv.style.width = `${contentWidth}mm`
      tempDiv.style.fontFamily = 'system-ui, -apple-system, sans-serif'
      tempDiv.style.fontSize = '11px'
      tempDiv.style.lineHeight = '1.6'
      tempDiv.style.color = '#1e293b'
      tempDiv.style.position = 'absolute'
      tempDiv.style.left = '-9999px'
      tempDiv.style.top = '-9999px'
      document.body.appendChild(tempDiv)

      try {
        await pdf.html(tempDiv.innerHTML, {
          callback: () => {},
          x: margin,
          y: margin,
          width: contentWidth,
          windowWidth: contentWidth * 3.78,
          autoPaging: 'text',
        })
      } finally {
        document.body.removeChild(tempDiv)
      }
    }

    // =========================================================================
    // Page Numbers and Headers/Footers
    // =========================================================================

    const pageCount = pdf.internal.pages.length

    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i - 1)

      // Header
      if (header) {
        pdf.setFontSize(10)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(100, 116, 139)
        pdf.text(header, margin, 12)
      }

      // Footer
      const footerY = pageHeight - 10
      pdf.setDrawColor(226, 232, 240)
      pdf.setLineWidth(0.5)
      pdf.line(margin, footerY - 5, pageWidth - margin, footerY - 5)

      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(148, 163, 184)

      if (footer) {
        pdf.text(footer, margin, footerY)
      }

      if (pageNumbers) {
        pdf.text(`Page ${i} of ${pageCount}`, pageWidth - margin, footerY, {
          align: 'right',
        } as Record<string, unknown>)
      }
    }

    onProgress?.(80, 'Saving file...')

    if (signal?.aborted) {
      return { success: false, blob: null, filename: '', error: 'Export cancelled' }
    }

    // Generate filename
    const timestamp = Date.now()
    const sanitizedTitle = title.replace(/[^a-z0-9]/gi, '-').toLowerCase()
    const filename = `${sanitizedTitle}-${timestamp}.pdf`

    // Save PDF
    const pdfBlob = pdf.output('blob')
    saveAs(pdfBlob, filename)

    onProgress?.(100, 'Export complete')

    return {
      success: true,
      blob: pdfBlob,
      filename,
    }
  } catch (error) {
    return {
      success: false,
      blob: null,
      filename: '',
      error: error instanceof Error ? error.message : 'Unknown error during PDF export',
    }
  }
}

/**
 * Export code review report to PDF
 *
 * @param data - Code review data
 * @param options - Export options
 * @returns Export result
 */
export async function exportCodeReviewReport(
  data: CodeReviewReportData,
  options: Partial<PDFExportOptions> = {}
): Promise<PDFExportResult> {
  const content = generateCodeReviewHTML(data)
  return exportToPDF(content, {
    title: `Code Review: ${data.file}`,
    reportType: 'code-review',
    ...options,
  })
}

/**
 * Export test generation report to PDF
 *
 * @param data - Test generation data
 * @param options - Export options
 * @returns Export result
 */
export async function exportTestReport(
  data: TestGenerationReportData,
  options: Partial<PDFExportOptions> = {}
): Promise<PDFExportResult> {
  const content = generateTestReportHTML(data)
  return exportToPDF(content, {
    title: `Test Report: ${data.file}`,
    reportType: 'test-generation',
    ...options,
  })
}

/**
 * Export project analysis report to PDF
 *
 * @param data - Project analysis data
 * @param options - Export options
 * @returns Export result
 */
export async function exportProjectAnalysisReport(
  data: ProjectAnalysisReportData,
  options: Partial<PDFExportOptions> = {}
): Promise<PDFExportResult> {
  const content = generateProjectAnalysisHTML(data)
  return exportToPDF(content, {
    title: `Project Analysis: ${data.projectName}`,
    reportType: 'project-analysis',
    ...options,
  })
}

// ============================================================================
// HTML Template Generators
// ============================================================================

/**
 * Generate HTML for code review report
 */
function generateCodeReviewHTML(data: CodeReviewReportData): string {
  const issuesBySeverity = {
    error: data.issues.filter((i) => i.severity === 'error'),
    warning: data.issues.filter((i) => i.severity === 'warning'),
    info: data.issues.filter((i) => i.severity === 'info'),
  }

  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; padding: 20px;">
      <h1 style="color: #1e293b; font-size: 24px; margin-bottom: 10px;">Code Review Report</h1>
      <p style="color: #64748b; font-size: 14px; margin-bottom: 20px;">File: ${escapeHtml(data.file)}</p>

      <div style="display: flex; gap: 20px; margin-bottom: 30px;">
        <div style="background: #fef2f2; padding: 15px; border-radius: 8px; flex: 1;">
          <div style="color: #991b1b; font-size: 28px; font-weight: bold;">${data.summary.errors}</div>
          <div style="color: #b91c1c; font-size: 12px;">Errors</div>
        </div>
        <div style="background: #fefce8; padding: 15px; border-radius: 8px; flex: 1;">
          <div style="color: #854d0e; font-size: 28px; font-weight: bold;">${data.summary.warnings}</div>
          <div style="color: #a16207; font-size: 12px;">Warnings</div>
        </div>
        <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; flex: 1;">
          <div style="color: #166534; font-size: 28px; font-weight: bold;">${data.summary.suggestions}</div>
          <div style="color: #15803d; font-size: 12px;">Suggestions</div>
        </div>
      </div>

      ${
        issuesBySeverity.error.length > 0
          ? `
        <h2 style="color: #991b1b; font-size: 18px; margin-top: 25px; margin-bottom: 10px;">Errors (${issuesBySeverity.error.length})</h2>
        ${issuesBySeverity.error.map((issue) => renderIssue(issue)).join('')}
      `
          : ''
      }

      ${
        issuesBySeverity.warning.length > 0
          ? `
        <h2 style="color: #854d0e; font-size: 18px; margin-top: 25px; margin-bottom: 10px;">Warnings (${issuesBySeverity.warning.length})</h2>
        ${issuesBySeverity.warning.map((issue) => renderIssue(issue)).join('')}
      `
          : ''
      }

      ${
        issuesBySeverity.info.length > 0
          ? `
        <h2 style="color: #166534; font-size: 18px; margin-top: 25px; margin-bottom: 10px;">Suggestions (${issuesBySeverity.info.length})</h2>
        ${issuesBySeverity.info.map((issue) => renderIssue(issue)).join('')}
      `
          : ''
      }
    </div>
  `
}

/**
 * Generate HTML for test report
 */
function generateTestReportHTML(data: TestGenerationReportData): string {
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; padding: 20px;">
      <h1 style="color: #1e293b; font-size: 24px; margin-bottom: 10px;">Test Generation Report</h1>
      <p style="color: #64748b; font-size: 14px; margin-bottom: 20px;">Source: ${escapeHtml(data.file)}</p>
      <p style="color: #64748b; font-size: 14px; margin-bottom: 20px;">Test File: ${escapeHtml(data.testFile)}</p>
      <p style="color: #64748b; font-size: 14px; margin-bottom: 20px;">Framework: ${data.framework}</p>

      <div style="display: flex; gap: 20px; margin-bottom: 30px;">
        <div style="background: #eff6ff; padding: 15px; border-radius: 8px; flex: 1;">
          <div style="color: #1e40af; font-size: 28px; font-weight: bold;">${data.summary.functionsFound}</div>
          <div style="color: #1d4ed8; font-size: 12px;">Functions</div>
        </div>
        <div style="background: #fdf4ff; padding: 15px; border-radius: 8px; flex: 1;">
          <div style="color: #a21caf; font-size: 28px; font-weight: bold;">${data.summary.componentsFound}</div>
          <div style="color: #be185d; font-size: 12px;">Components</div>
        </div>
        <div style="background: #fef3c7; padding: 15px; border-radius: 8px; flex: 1;">
          <div style="color: #b45309; font-size: 28px; font-weight: bold;">${data.summary.hooksFound}</div>
          <div style="color: #d97706; font-size: 12px;">Hooks</div>
        </div>
        <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; flex: 1;">
          <div style="color: #166534; font-size: 28px; font-weight: bold;">${data.summary.templatesGenerated}</div>
          <div style="color: #15803d; font-size: 12px;">Templates</div>
        </div>
      </div>

      <h2 style="color: #1e293b; font-size: 18px; margin-top: 25px; margin-bottom: 15px;">Generated Templates</h2>
      ${data.templates
        .map(
          (template) => `
        <div style="background: #f8fafc; padding: 12px; border-radius: 6px; margin-bottom: 10px; border-left: 3px solid #6366f1;">
          <strong style="color: #1e293b;">${escapeHtml(template.name)}</strong>
          <span style="color: #64748b; font-size: 12px; margin-left: 10px;">(${template.type})</span>
        </div>
      `
        )
        .join('')}
    </div>
  `
}

/**
 * Generate HTML for project analysis report
 */
function generateProjectAnalysisHTML(data: ProjectAnalysisReportData): string {
  const languageList = Object.entries(data.summary.languages)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, count]) => `${lang}: ${count}`)
    .join(', ')

  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; padding: 20px;">
      <h1 style="color: #1e293b; font-size: 24px; margin-bottom: 10px;">Project Analysis Report</h1>
      <p style="color: #64748b; font-size: 14px; margin-bottom: 20px;">Project: ${escapeHtml(data.projectName)}</p>
      <p style="color: #64748b; font-size: 14px; margin-bottom: 20px;">Analysis Date: ${data.analysisDate}</p>

      <div style="display: flex; gap: 20px; margin-bottom: 30px;">
        <div style="background: #eff6ff; padding: 15px; border-radius: 8px; flex: 1;">
          <div style="color: #1e40af; font-size: 28px; font-weight: bold;">${data.summary.totalFiles}</div>
          <div style="color: #1d4ed8; font-size: 12px;">Total Files</div>
        </div>
        <div style="background: #fdf4ff; padding: 15px; border-radius: 8px; flex: 1;">
          <div style="color: #a21caf; font-size: 28px; font-weight: bold;">${data.summary.totalLines.toLocaleString()}</div>
          <div style="color: #be185d; font-size: 12px;">Total Lines</div>
        </div>
        <div style="background: #fefce8; padding: 15px; border-radius: 8px; flex: 1;">
          <div style="color: #854d0e; font-size: 28px; font-weight: bold;">${data.structure.directories}</div>
          <div style="color: #a16207; font-size: 12px;">Directories</div>
        </div>
      </div>

      <h2 style="color: #1e293b; font-size: 18px; margin-top: 25px; margin-bottom: 10px;">Languages</h2>
      <p style="color: #475569; font-size: 14px; margin-bottom: 20px;">${languageList || 'No files detected'}</p>

      <h2 style="color: #1e293b; font-size: 18px; margin-top: 25px; margin-bottom: 10px;">File Types Distribution</h2>
      <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px;">
        ${Object.entries(data.structure.filesByType)
          .map(
            ([ext, count]) => `
          <span style="background: #e2e8f0; padding: 6px 12px; border-radius: 20px; font-size: 12px;">
            ${escapeHtml(ext)}: ${count}
          </span>
        `
          )
          .join('')}
      </div>

      <h2 style="color: #1e293b; font-size: 18px; margin-top: 25px; margin-bottom: 10px;">Largest Files</h2>
      ${data.summary.largestFiles
        .slice(0, 10)
        .map(
          (file) => `
        <div style="display: flex; justify-content: space-between; padding: 8px 12px; background: #f8fafc; border-radius: 4px; margin-bottom: 5px;">
          <span style="color: #475569; font-size: 13px;">${escapeHtml(file.path)}</span>
          <span style="color: #64748b; font-size: 13px;">${file.lines.toLocaleString()} lines</span>
        </div>
      `
        )
        .join('')}
    </div>
  `
}

/**
 * Render a single issue in HTML format
 */
function renderIssue(issue: CodeReviewReportData['issues'][0]): string {
  const severityColors = {
    error: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
    warning: { bg: '#fefce8', border: '#eab308', text: '#854d0e' },
    info: { bg: '#f0fdf4', border: '#22c55e', text: '#166534' },
  }

  const colors = severityColors[issue.severity]

  return `
    <div style="background: ${colors.bg}; border-left: 3px solid ${colors.border}; padding: 12px; border-radius: 4px; margin-bottom: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
        <span style="color: ${colors.text}; font-weight: bold; font-size: 14px;">${escapeHtml(issue.message)}</span>
        <span style="color: #64748b; font-size: 12px;">Line ${issue.line}:${issue.column}</span>
      </div>
      <div style="color: #64748b; font-size: 12px; margin-bottom: 5px;">Rule: ${issue.rule} | Category: ${issue.category}</div>
      ${
        issue.suggestion
          ? `
        <div style="color: #475569; font-size: 13px; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #cbd5e1;">
          Suggestion: ${escapeHtml(issue.suggestion)}
        </div>
      `
          : ''
      }
    </div>
  `
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Export element to PDF
 *
 * @param element - DOM element to export
 * @param options - Export options
 * @returns Export result
 */
export async function exportElementToPDF(
  element: HTMLElement,
  options: Partial<PDFExportOptions> = {}
): Promise<PDFExportResult> {
  return exportToPDF(element, {
    title: 'Report',
    ...options,
  })
}
