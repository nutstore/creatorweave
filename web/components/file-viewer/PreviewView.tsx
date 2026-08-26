'use client'

import { useSearchParams } from 'next/navigation'
import { StandalonePreview } from '@/components/file-viewer/StandalonePreview'

/**
 * PreviewView — reads ?path= for the standalone preview page.
 *
 * Must be rendered inside a <Suspense> boundary (App Router requirement
 * when reading search params during prerendering); the page shell provides
 * it.
 */
export default function PreviewView() {
  const searchParams = useSearchParams()
  const path = searchParams.get('path')
  if (!path) return null
  return <StandalonePreview filePath={decodeURIComponent(path)} />
}
