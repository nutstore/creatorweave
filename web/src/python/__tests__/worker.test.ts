/**
 * Pyodide Worker Tests
 *
 * Basic tests to verify worker functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PyodideWorkerManager, createTextFile } from '../manager'

const hasWorkerApi = typeof Worker !== 'undefined'

const describePyodide = hasWorkerApi ? describe : describe.skip

describePyodide('PyodideWorkerManager', () => {
  let manager: PyodideWorkerManager

  beforeEach(() => {
    manager = new PyodideWorkerManager()
  })

  afterEach(() => {
    manager.terminate()
  })

  describe('Basic Execution', () => {
    it('should execute simple Python code', async () => {
      const result = await manager.execute('x = 10 + 20\nx')

      expect(result.success).toBe(true)
      expect(result.result).toBe(30)
    })

    it('should capture stdout', async () => {
      const result = await manager.execute('print("Hello, World!")')

      expect(result.success).toBe(true)
      expect(result.stdout).toContain('Hello, World!')
    })

    it('should capture stderr', async () => {
      const result = await manager.execute(`
import sys
sys.stderr.write("Error message\\n")
`)

      expect(result.success).toBe(true)
      expect(result.stderr).toContain('Error message')
    })

    it('should handle Python errors', async () => {
      const result = await manager.execute('1 / 0')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('ZeroDivisionError')
    })
  })

  describe('Package Loading', () => {
    it('should load numpy package', async () => {
      const result = await manager.execute('import numpy as np\nnp.__version__', [], ['numpy'])

      expect(result.success).toBe(true)
      expect(result.result).toMatch(/^\d+\.\d+\.\d+/)
    })

    it('should load pandas package', async () => {
      const result = await manager.execute('import pandas as pd\npd.__version__', [], ['pandas'])

      expect(result.success).toBe(true)
      expect(result.result).toMatch(/^\d+\.\d+\.\d+/)
    })
  })

  describe('File Operations', () => {
    it('should inject text files', async () => {
      const result = await manager.execute(
        `
import os
# Check if file exists
assert os.path.exists('/mnt/test.txt')
# Read file
with open('/mnt/test.txt', 'r') as f:
    content = f.read()
content
`,
        [createTextFile('test.txt', 'Hello from file!')]
      )

      expect(result.success).toBe(true)
      expect(result.result).toBe('Hello from file!')
    })

    it('should return output files', async () => {
      const result = await manager.execute(
        `
# Create output file
with open('/mnt/output.txt', 'w') as f:
    f.write('Output content')
"File created"
`
      )

      expect(result.success).toBe(true)
      expect(result.outputFiles).toBeDefined()
      expect(result.outputFiles!.length).toBeGreaterThan(0)

      const outputFile = result.outputFiles!.find((f) => f.name === 'output.txt')
      expect(outputFile).toBeDefined()
    })
  })

  describe('Data Analysis', () => {
    it('should perform pandas operations', async () => {
      const csvData = `name,age
Alice,30
Bob,25`

      const result = await manager.execute(
        `
import pandas as pd

# Read CSV
df = pd.read_csv('/mnt/data.csv')

# Calculate average age
avg_age = df['age'].mean()

# Return result
{
    'count': len(df),
    'avg_age': avg_age,
    'data': df.to_dict('records')
}
`,
        [createTextFile('data.csv', csvData)],
        ['pandas']
      )

      expect(result.success).toBe(true)
      expect(result.result).toEqual({
        count: 2,
        avg_age: 27.5,
        data: [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
        ],
      })
    })
  })

  describe('Worker Lifecycle', () => {
    it('should terminate worker', () => {
      expect(manager.isReady()).toBe(false) // Worker not created yet

      manager.terminate()
      expect(manager.isReady()).toBe(false)
    })

    it('should restart worker', async () => {
      // First execution
      const result1 = await manager.execute('x = 1\nx')
      expect(result1.success).toBe(true)

      // Restart
      await manager.restart()

      // Second execution should work
      const result2 = await manager.execute('y = 2\ny')
      expect(result2.success).toBe(true)
    })
  })

  describe('Performance', () => {
    it('should measure execution time', async () => {
      const result = await manager.execute('sum(range(1000))')

      expect(result.success).toBe(true)
      expect(result.executionTime).toBeGreaterThan(0)
      expect(result.executionTime).toBeLessThan(5000) // Should be fast
    })
  })
})
