/**
 * FileComparison Usage Examples
 *
 * This file demonstrates various ways to use the FileComparison component.
 */

import { FileComparison } from './FileComparison'

/**
 * Example 1: Basic usage with simple text comparison
 */
export function BasicExample() {
  const before = `function hello() {
  console.log("Hello, World!");
  return "hello";
}`
  const after = `function hello() {
  console.log("Hello, TypeScript!");
  return "hello";
}`

  return (
    <div className="h-[600px]">
      <FileComparison before={before} after={after} language="javascript" filename="example.ts" />
    </div>
  )
}

/**
 * Example 2: Split view mode (default)
 */
export function SplitViewExample() {
  const before = `interface User {
  name: string;
  age: number;
}`
  const after = `interface User {
  name: string;
  age: number;
  email?: string;
}`

  return (
    <div className="h-[500px]">
      <FileComparison
        before={before}
        after={after}
        language="typescript"
        filename="user.ts"
        viewMode="split"
      />
    </div>
  )
}

/**
 * Example 3: Unified view mode
 */
export function UnifiedViewExample() {
  const before = `const config = {
  debug: false,
  port: 3000
}`
  const after = `const config = {
  debug: true,
  port: 3000,
  host: "localhost"
}`

  return (
    <div className="h-[400px]">
      <FileComparison
        before={before}
        after={after}
        language="javascript"
        filename="config.js"
        viewMode="unified"
      />
    </div>
  )
}

/**
 * Example 4: Without line numbers
 */
export function NoLineNumbersExample() {
  const before = `import React from 'react'

export function Component() {
  return <div>Old content</div>
}`
  const after = `import React from 'react'

export function Component() {
  return <div>New content</div>
}`

  return (
    <div className="h-[400px]">
      <FileComparison
        before={before}
        after={after}
        language="typescript"
        filename="Component.tsx"
        lineNumbers={false}
      />
    </div>
  )
}

/**
 * Example 5: Large file comparison
 */
export function LargeFileExample() {
  const before = Array.from({ length: 50 }, (_, i) => `// Line ${i + 1} of original file`).join(
    '\n'
  )
  const after = Array.from({ length: 50 }, (_, i) => `// Line ${i + 1} of modified file`)
    .map((line, i) => (i === 25 ? '// MODIFIED LINE' : line))
    .join('\n')

  return (
    <div className="h-[600px]">
      <FileComparison
        before={before}
        after={after}
        language="javascript"
        filename="large-file.js"
      />
    </div>
  )
}

/**
 * Example 6: Custom styling with className
 */
export function CustomStyledExample() {
  const before = `export default function App() {
  return <div>App</div>
}`
  const after = `export default function App() {
  return <div className="app">App</div>
}`

  return (
    <div className="h-[500px] rounded-lg border border-neutral-200 shadow-sm">
      <FileComparison
        before={before}
        after={after}
        language="typescript"
        filename="App.tsx"
        className="rounded-lg"
      />
    </div>
  )
}

/**
 * Example 7: Dynamic content with state
 */
import { useState } from 'react'

export function DynamicExample() {
  const [version, setVersion] = useState(1)

  const versions: Record<number, string> = {
    1: `function greet(name) {
  return "Hello, " + name;
}`,
    2: `function greet(name) {
  return \`Hello, \${name}!\`;
}`,
    3: `function greet(name) {
  const greeting = \`Hello, \${name}!\`;
  return greeting;
}`,
  }

  const goToNext = () => setVersion((v) => (v % 3) + 1)
  const goToPrev = () => setVersion((v) => ((v - 2 + 3) % 3) + 1)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={goToPrev}
          className="rounded bg-neutral-100 px-3 py-1 text-sm hover:bg-neutral-200"
        >
          Previous
        </button>
        <span className="text-sm text-neutral-600">Version {version} of 3</span>
        <button
          onClick={goToNext}
          className="rounded bg-neutral-100 px-3 py-1 text-sm hover:bg-neutral-200"
        >
          Next
        </button>
      </div>
      <div className="h-[400px]">
        <FileComparison
          before={versions[version === 1 ? 3 : version - 1]}
          after={versions[version]}
          language="javascript"
          filename={`greet-v${version}.js`}
        />
      </div>
    </div>
  )
}
