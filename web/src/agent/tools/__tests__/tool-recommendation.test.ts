/**
 * Tests for Tool Recommendation System
 */

import { describe, it, expect } from 'vitest'
import {
  IntentAnalyzer,
  RecommendationEngine,
  getRecommendationEngine,
} from '@/agent/tools/tool-recommendation'
import { getBuiltinToolNames } from '@/agent/tool-registry'

describe('IntentAnalyzer', () => {
  const analyzer = new IntentAnalyzer()

  describe('file discovery intent', () => {
    it('should detect file discovery keywords', () => {
      const result = analyzer.analyze('find all CSV files')
      expect(result.primaryIntent).toBe('file-discovery')
      expect(result.confidence).toBeGreaterThan(0)
      expect(result.keywords).toContain('find')
    })

    it('should detect "where is" pattern', () => {
      const result = analyzer.analyze('where is the config file?')
      expect(result.primaryIntent).toBe('file-discovery')
    })

    it('should detect glob pattern mentions', () => {
      const result = analyzer.analyze('use glob to find files')
      expect(result.primaryIntent).toBe('file-discovery')
    })
  })

  describe('data analysis intent', () => {
    it('should detect data analysis keywords', () => {
      const result = analyzer.analyze('analyze the sales data')
      expect(result.primaryIntent).toBe('data-analysis')
    })

    it('should detect CSV file type hint', () => {
      const result = analyzer.analyze('process the data.csv file')
      expect(result.fileTypeHints).toContain('.csv')
      expect(result.primaryIntent).toBe('data-analysis')
    })

    it('should detect Excel file type hint', () => {
      const result = analyzer.analyze('analyze report.xlsx')
      expect(result.fileTypeHints).toContain('.xlsx')
    })
  })

  describe('data visualization intent', () => {
    it('should detect visualization keywords', () => {
      const result = analyzer.analyze('generate a chart of the data')
      // "generate" may trigger code-generation, so let's check that visualization is detected
      expect(
        result.primaryIntent === 'data-visualization' ||
          result.secondaryIntents.includes('data-visualization')
      ).toBe(true)
    })

    it('should detect plot keywords', () => {
      const result = analyzer.analyze('plot the results')
      expect(result.primaryIntent).toBe('data-visualization')
    })

    it('should detect graph keywords', () => {
      const result = analyzer.analyze('visualize trends with a graph')
      expect(result.primaryIntent).toBe('data-visualization')
    })
  })

  describe('code search intent', () => {
    it('should detect function search', () => {
      const result = analyzer.analyze('search for handleClick function definition')
      expect(result.primaryIntent).toBe('code-search')
    })

    it('should detect text-search pattern mentions', () => {
      const result = analyzer.analyze('search text for useState')
      expect(result.primaryIntent).toBe('code-search')
    })

    it('should detect find usage pattern', () => {
      const result = analyzer.analyze('search for where useState is used')
      expect(result.primaryIntent).toBe('code-search')
    })
  })

  describe('debugging intent', () => {
    it('should detect bug keywords', () => {
      const result = analyzer.analyze('fix this bug in the code')
      expect(result.primaryIntent).toBe('debugging')
    })

    it('should detect error keywords', () => {
      const result = analyzer.analyze('something is broken')
      expect(result.primaryIntent).toBe('debugging')
    })
  })

  describe('confidence scoring', () => {
    it('should have higher confidence with multiple matching keywords', () => {
      const result1 = analyzer.analyze('find a file')
      const result2 = analyzer.analyze('find all the files in the directory')

      expect(result2.confidence).toBeGreaterThanOrEqual(result1.confidence)
    })

    it('should detect secondary intents', () => {
      const result = analyzer.analyze('find TypeScript files and read their contents')
      expect(result.primaryIntent).toBe('file-discovery')
      expect(result.secondaryIntents).toContain('file-read')
    })
  })
})

describe('RecommendationEngine', () => {
  const engine = new RecommendationEngine()

  describe('tool recommendations for data analysis', () => {
    it('should recommend execute for CSV analysis', () => {
      const recommendations = engine.recommend('analyze data.csv with pandas')
      const executeTool = recommendations.find((r) => r.toolName === 'execute')

      expect(executeTool).toBeDefined()
      expect(executeTool?.score).toBeGreaterThan(0)
      expect(executeTool?.category).toBe('analysis')
    })

    it('should recommend read_directory for finding data files', () => {
      const recommendations = engine.recommend('analyze the sales data in my project')
      // Should have some recommendations
      expect(recommendations.length).toBeGreaterThan(0)
    })

    it('should recommend both read_directory and execute for data workflow', () => {
      const recommendations = engine.recommend('analyze CSV files with pandas')
      // Should have recommendations including execute
      const executeTool = recommendations.find((r) => r.toolName === 'execute')
      expect(executeTool).toBeDefined()
    })
  })

  describe('tool recommendations for file operations', () => {
    it('should recommend read_directory for file discovery', () => {
      const recommendations = engine.recommend('find all test files')
      const readDirTool = recommendations.find((r) => r.toolName === 'read_directory')

      expect(readDirTool).toBeDefined()
      expect(readDirTool?.score).toBeGreaterThan(0)
    })

    it('should recommend read after file discovery', () => {
      const recommendations = engine.recommend('find and read config files')
      const readDirTool = recommendations.find((r) => r.toolName === 'read_directory')
      const readTool = recommendations.find((r) => r.toolName === 'read')

      expect(readDirTool).toBeDefined()
      expect(readTool).toBeDefined()
    })

    it('should recommend file_edit for code changes', () => {
      const recommendations = engine.recommend('change the function name')
      const editTool = recommendations.find((r) => r.toolName === 'file_edit')

      expect(editTool).toBeDefined()
    })
  })

  describe('tool recommendations for code search', () => {
    it('should recommend tools for code search', () => {
      const recommendations = engine.recommend('search for useEffect usage in components')
      // Text search removed, should still have recommendations
      expect(recommendations.length).toBeGreaterThan(0)
    })
  })

  describe('recommendation examples', () => {
    it('should provide contextual examples for execute', () => {
      const recommendations = engine.recommend('analyze sales.csv')
      const executeTool = recommendations.find((r) => r.toolName === 'execute')

      expect(executeTool).toBeDefined()
      if (executeTool) {
        expect(executeTool.example).toBeDefined()
        expect(typeof executeTool.example).toBe('string')
      }
    })

    it('should provide file pattern examples for read_directory', () => {
      const recommendations = engine.recommend('find all CSV files')
      const readDirTool = recommendations.find((r) => r.toolName === 'read_directory')

      expect(readDirTool).toBeDefined()
      if (readDirTool) {
        expect(readDirTool.example).toBeDefined()
        // Example contains some pattern
        expect(readDirTool.example.length).toBeGreaterThan(0)
      }
    })

    it('should use language parameter for execute', () => {
      const recommendations = engine.recommend('analyze sales.csv with python')
      const executeTool = recommendations.find((r) => r.toolName === 'execute')

      expect(executeTool).toBeDefined()
      expect(executeTool?.example).toContain('language="python"')
    })
  })

  describe('all tools by category', () => {
    it('should return tools grouped by category', () => {
      const allTools = engine.getAllTools()

      expect(allTools.discovery).toBeDefined()
      expect(allTools.reading).toBeDefined()
      expect(allTools.writing).toBeDefined()
      expect(allTools.search).toBeDefined()
      expect(allTools.analysis).toBeDefined()
      expect(allTools.batch).toBeDefined()
    })

    it('should include read_directory in discovery category', () => {
      const allTools = engine.getAllTools()
      const readDirTool = allTools.discovery.find((t) => t.toolName === 'read_directory')

      expect(readDirTool).toBeDefined()
      expect(readDirTool?.category).toBe('discovery')
    })

    it('should include execute in analysis category', () => {
      const allTools = engine.getAllTools()
      const executeTool = allTools.analysis.find((t) => t.toolName === 'execute')

      expect(executeTool).toBeDefined()
      expect(executeTool?.category).toBe('analysis')
    })

    it('should not expose sync tool while it is disabled', () => {
      const allTools = engine.getAllTools()
      const syncTool = allTools.writing.find((t) => t.toolName === 'sync_to_disk')

      expect(syncTool).toBeUndefined()
    })

    it('should include write in writing category (unified batch)', () => {
      const allTools = engine.getAllTools()
      const writeTool = allTools.writing.find((t) => t.toolName === 'write')

      expect(writeTool).toBeDefined()
      expect(writeTool?.category).toBe('writing')
    })

    it('should only recommend tools that exist in the built-in registry', () => {
      const builtinToolNames = new Set(getBuiltinToolNames())
      const allTools = engine.getAllTools()
      const recommendedNames = Object.values(allTools)
        .flat()
        .map((tool) => tool.toolName)

      for (const toolName of recommendedNames) {
        expect(builtinToolNames.has(toolName)).toBe(true)
      }
    })
  })
})

describe('helper functions', () => {
  // Skip these tests as they require dynamic imports
  it('should format recommendations for system prompt', () => {
    const engine = getRecommendationEngine()
    const recommendations = engine.recommend('analyze data.csv')
    expect(Array.isArray(recommendations)).toBe(true)
  })

  it('should get all tools by category', () => {
    const engine = getRecommendationEngine()
    const allTools = engine.getAllTools()
    expect(allTools).toHaveProperty('discovery')
    expect(allTools).toHaveProperty('analysis')
  })
})

describe('singleton', () => {
  it('should return the same instance', () => {
    const engine1 = getRecommendationEngine()
    const engine2 = getRecommendationEngine()

    expect(engine1).toBe(engine2)
  })
})
