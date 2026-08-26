/**
 * Tests for DataVisualization component
 */

import { describe, it, expect } from 'vitest'
import { extractVisualizationFromPythonResult } from '../index'

describe('DataVisualization', () => {
  describe('extractVisualizationFromPythonResult', () => {
    it('should extract image from Python result', () => {
      const result = {
        images: [{ filename: 'test.png', data: 'data:image/png;base64,iVBORw0KG...' }],
        stdout: '',
      }

      const viz = extractVisualizationFromPythonResult(result)

      expect(viz).toEqual({
        type: 'image',
        imageData: 'data:image/png;base64,iVBORw0KG...',
        imageFilename: 'test.png',
        title: 'Generated Chart',
      })
    })

    it('should extract table from JSON array of objects', () => {
      const result = {
        stdout: JSON.stringify([
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
        ]),
      }

      const viz = extractVisualizationFromPythonResult(result)

      expect(viz).toEqual({
        type: 'table',
        tableData: [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
        ],
        title: 'Data Table',
      })
    })

    it('should extract table from JSON array of arrays', () => {
      const result = {
        stdout: JSON.stringify([
          ['Name', 'Age'],
          ['Alice', '30'],
          ['Bob', '25'],
        ]),
      }

      const viz = extractVisualizationFromPythonResult(result)

      expect(viz).toEqual({
        type: 'table',
        tableData: [
          ['Name', 'Age'],
          ['Alice', '30'],
          ['Bob', '25'],
        ],
        title: 'Data Table',
      })
    })

    it('should return null for non-table output', () => {
      const result = {
        stdout: 'Some random text output',
      }

      const viz = extractVisualizationFromPythonResult(result)

      expect(viz).toBeNull()
    })

    it('should return null for empty result', () => {
      const result = {
        stdout: '',
      }

      const viz = extractVisualizationFromPythonResult(result)

      expect(viz).toBeNull()
    })

    it('should handle multiple images by taking the first one', () => {
      const result = {
        images: [
          { filename: 'first.png', data: 'data:image/png;base64,abc' },
          { filename: 'second.png', data: 'data:image/png;base64,def' },
        ],
        stdout: '',
      }

      const viz = extractVisualizationFromPythonResult(result)

      expect(viz?.imageFilename).toBe('first.png')
    })

    it('should extract table from tabular text output', () => {
      const result = {
        stdout: 'Name    Age\nAlice   30\nBob     25',
      }

      const viz = extractVisualizationFromPythonResult(result)

      expect(viz).not.toBeNull()
      expect(viz?.type).toBe('table')
    })
  })
})
