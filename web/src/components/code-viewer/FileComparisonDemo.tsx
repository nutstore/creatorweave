/**
 * FileComparison Demo Page
 * Showcases various features of the FileComparison component
 */

import { useState } from 'react'
import { FileComparison } from './FileComparison'

type DemoScenario = 'basic' | 'refactor' | 'feature' | 'bugfix'

const scenarios: Record<
  DemoScenario,
  { name: string; before: string; after: string; language: string; filename: string }
> = {
  basic: {
    name: 'Basic Change',
    before: `function greet(name) {
  return "Hello, " + name;
}

console.log(greet("World"));`,
    after: `function greet(name) {
  return "Hello, " + name + "!";
}

console.log(greet("Alice"));`,
    language: 'javascript',
    filename: 'greet.js',
  },
  refactor: {
    name: 'Refactoring',
    before: `// Old implementation
function fetchData(id) {
  var data = null;
  fetch('/api/data/' + id)
    .then(function(response) {
      return response.json();
    })
    .then(function(json) {
      data = json;
      console.log(data);
    });
  return data;
}`,
    after: `// New implementation using async/await
async function fetchData(id: number): Promise<any> {
  try {
    const response = await fetch(\`/api/data/\${id}\`);
    const data = await response.json();
    console.log(data);
    return data;
  } catch (error) {
    console.error('Failed to fetch data:', error);
    throw error;
  }
}`,
    language: 'typescript',
    filename: 'api.ts',
  },
  feature: {
    name: 'Feature Addition',
    before: `interface User {
  id: number;
  name: string;
  email: string;
}

function displayUser(user: User) {
  console.log(user.name);
}`,
    after: `interface User {
  id: number;
  name: string;
  email: string;
  avatar?: string;
  createdAt: Date;
}

function displayUser(user: User) {
  console.log(user.name);
  if (user.avatar) {
    console.log("Avatar:", user.avatar);
  }
}`,
    language: 'typescript',
    filename: 'user.ts',
  },
  bugfix: {
    name: 'Bug Fix',
    before: `function calculateTotal(prices: number[]): number {
  let total = 0;
  for (var i = 0; i < prices.length; i++) {
    total += prices[i];
  }
  return total;
}`,
    after: `function calculateTotal(prices: number[]): number {
  let total = 0;
  for (const price of prices) {
    total += price;
  }
  return total;
}`,
    language: 'typescript',
    filename: 'utils.ts',
  },
}

export function FileComparisonDemo() {
  const [scenario, setScenario] = useState<DemoScenario>('basic')
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('split')

  const current = scenarios[scenario]

  return (
    <div className="flex h-screen flex-col bg-neutral-50">
      {/* Header */}
      <div className="border-b border-neutral-200 bg-white px-6 py-4 dark:border-neutral-700 dark:bg-neutral-900">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">FileComparison Component Demo</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Interactive demonstration of the file comparison features
        </p>

        {/* Controls */}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {/* Scenario selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Scenario:</label>
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value as DemoScenario)}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {Object.entries(scenarios).map(([key, { name }]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">View Mode:</label>
            <div className="flex overflow-hidden rounded-md border border-neutral-300 dark:border-neutral-700">
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  viewMode === 'split'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-neutral-700 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800'
                }`}
              >
                Split
              </button>
              <button
                type="button"
                onClick={() => setViewMode('unified')}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  viewMode === 'unified'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-neutral-700 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800'
                }`}
              >
                Unified
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="h-full rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
          <FileComparison
            before={current.before}
            after={current.after}
            language={current.language}
            filename={current.filename}
            viewMode={viewMode}
            lineNumbers={true}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-neutral-200 bg-white px-6 py-3 dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <span>
            Features: Syntax highlighting • Change navigation • Scroll sync • Copy changes
          </span>
          <span>Diff Algorithm: Simplified Myers</span>
        </div>
      </div>
    </div>
  )
}
