'use client'

import { Suspense } from 'react'
import dynamic from 'next/dynamic'

// useSearchParams must sit behind a Suspense boundary in the App Router.
const PreviewView = dynamic(() => import('@/components/file-viewer/PreviewView'), {
  ssr: false,
})

/** Standalone file preview: /preview?path=... */
export default function PreviewPage() {
  return (
    <Suspense fallback={null}>
      <PreviewView />
    </Suspense>
  )
}
