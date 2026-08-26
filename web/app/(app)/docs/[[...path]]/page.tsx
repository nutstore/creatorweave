'use client'

import dynamic from 'next/dynamic'

// Docs fetches markdown from /public at runtime and uses browser APIs.
const DocumentationPage = dynamic(() => import('@/components/docs/DocsPageView'), {
  ssr: false,
})

/**
 * Docs catch-all: /docs, /docs/:language, /docs/:language/:category,
 * /docs/:language/:category/:page — one page replacing the legacy four
 * <Route> entries. Param extraction/validation happens in the view.
 */
export default function DocsPage() {
  return <DocumentationPage />
}
