/**
 * Shared pdfjs-dist initialization.
 *
 * Centralizes worker configuration to avoid duplication
 * between handler.ts and Preview.tsx.
 */

export type PDFJSModule = typeof import('pdfjs-dist')

let _cached: PDFJSModule | null = null

/**
 * Lazily import and configure pdfjs-dist.
 * Uses CDN worker for reliable Vite bundling compatibility.
 */
export async function getPdfjs(): Promise<PDFJSModule> {
  if (_cached) return _cached

  const pdfjsLib = await import('pdfjs-dist')

  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
  }

  _cached = pdfjsLib
  return pdfjsLib
}
