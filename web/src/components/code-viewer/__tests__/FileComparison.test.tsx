/**
 * FileComparison component tests
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FileComparison } from '../FileComparison'

describe('FileComparison', () => {
  it('renders without crashing', () => {
    const before = 'line 1\nline 2'
    const after = 'line 1\nline 2'

    render(<FileComparison before={before} after={after} />)

    // Check that component renders
    expect(screen.getAllByText(/line 1/).length).toBeGreaterThan(0)
  })

  it('displays filename when provided', () => {
    const before = 'content'
    const after = 'content'

    render(<FileComparison before={before} after={after} filename="test.ts" />)

    expect(screen.getByText('test.ts')).toBeDefined()
  })

  it('displays language when provided', () => {
    const before = 'const x = 1'
    const after = 'const x = 1'

    render(<FileComparison before={before} after={after} language="typescript" />)

    expect(screen.getByText('typescript')).toBeDefined()
  })

  it('shows change count when there are differences', () => {
    const before = 'line 1\nline 2'
    const after = 'line 1\nmodified'

    render(<FileComparison before={before} after={after} />)

    // Should show "1 change" badge
    expect(screen.getByText(/1 change/)).toBeDefined()
  })

  it('hides navigation when no changes', () => {
    const before = 'line 1\nline 2'
    const after = 'line 1\nline 2'

    render(<FileComparison before={before} after={after} />)

    // Navigation buttons should be hidden when there are no changes
    expect(screen.queryByTitle('Previous change')).toBeNull()
    expect(screen.queryByTitle('Next change')).toBeNull()
  })
})
