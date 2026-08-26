'use client'

import { useParams, useRouter } from 'next/navigation'
import { DocumentationPage } from '@/components/docs/DocsPage'
import { projectsPath } from '@/lib/route-paths'

/**
 * DocsPageView — param-extraction wrapper for the docs catch-all route.
 *
 * Reads the catch-all segments via next/navigation's useParams (React 18:
 * synchronous, no Promise unwrapping) and validates language ∈ {zh,en} /
 * category ∈ {user,developer}, then delegates to the shared
 * DocumentationPage component (which keeps its internal navigation via
 * next/navigation as well).
 */
export default function DocsPageView() {
  const params = useParams<{ path?: string[] }>()
  const navigate = useRouter()

  const segments = params.path ?? []
  const language = segments[0]
  const category = segments[1]
  const page = segments[2]

  const isDocsLanguage = (v?: string): v is 'zh' | 'en' => v === 'zh' || v === 'en'
  const isDocsCategory = (v?: string): v is 'user' | 'developer' => v === 'user' || v === 'developer'

  return (
    <DocumentationPage
      language={isDocsLanguage(language) ? language : undefined}
      category={isDocsCategory(category) ? category : undefined}
      page={page}
      onBack={() => navigate.push(projectsPath())}
    />
  )
}
