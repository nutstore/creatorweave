/**
 * Export Services
 *
 * Data export in various formats: CSV, JSON, Excel, Images, PDF.
 */

export {
  exportToCSV,
  exportToJSON,
  exportToExcel,
  exportToImage,
  detectExportFormat,
  getRecommendedFormat,
  type ExportFormat,
  type ExportOptions,
  type ExcelExportOptions,
  type ExportResult,
} from './data-exporter'

export {
  exportToPDF,
  exportCodeReviewReport,
  exportTestReport,
  exportProjectAnalysisReport,
  exportElementToPDF,
  type PDFExportOptions,
  type PDFExportResult,
  type PDFReportType,
  type CodeReviewReportData,
  type TestGenerationReportData,
  type ProjectAnalysisReportData,
} from '../../export/pdf-export'

export {
  templates,
  getTemplate,
  getAllTemplates,
  applyTemplate,
  type TemplateType,
} from '../../export/templates/report-templates'
