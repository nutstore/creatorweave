/**
 * Tests for Learning Mode Tool
 */

import { describe, it, expect } from 'vitest'
import {
  explain_executor,
  create_learning_plan_executor,
  solve_step_by_step_executor,
} from '../learning-mode.tool'
import type { ToolContext } from '../tool-types'

describe('Learning Mode Tool', () => {
  const mockContext: ToolContext = {
    directoryHandle: null as unknown as FileSystemDirectoryHandle,
  }

  describe('explain', () => {
    it('should explain a programming concept', async () => {
      const args = {
        topic: 'variable',
        difficulty: 'beginner' as const,
        include_examples: true,
        include_quiz: true,
      }

      const result = JSON.parse(await explain_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.topic).toBe('Variable')
      expect(result).toHaveProperty('explanation')
      expect(result).toHaveProperty('steps')
      expect(result).toHaveProperty('analogies')
      expect(result).toHaveProperty('commonMistakes')
    })

    it('should include practice questions when requested', async () => {
      const args = {
        topic: 'function',
        include_quiz: true,
      }

      const result = JSON.parse(await explain_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.practiceQuestions).toBeDefined()
      expect(result.practiceQuestions.length).toBeGreaterThan(0)
    })

    it('should not include examples when disabled', async () => {
      const args = {
        topic: 'loop',
        include_examples: false,
      }

      const result = JSON.parse(await explain_executor(args, mockContext))

      expect(result.success).toBe(true)
      result.steps.forEach((step: { examples: unknown[] }) => {
        expect(step.examples).toEqual([])
      })
    })

    it('should provide related topics', async () => {
      const args = {
        topic: 'function',
      }

      const result = JSON.parse(await explain_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.relatedTopics).toBeDefined()
      expect(Array.isArray(result.relatedTopics)).toBe(true)
    })

    it('should handle unknown topics gracefully', async () => {
      const args = {
        topic: 'quantum_physics_xyz',
      }

      const result = JSON.parse(await explain_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.topic).toBe('quantum_physics_xyz')
      expect(result.explanation).toContain("couldn't find")
    })

    it('should provide step-by-step explanation', async () => {
      const args = {
        topic: 'array',
        difficulty: 'beginner' as const,
      }

      const result = JSON.parse(await explain_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.steps.length).toBeGreaterThan(0)

      result.steps.forEach((step: { stepNumber: number; title: string; content: string }) => {
        expect(step).toHaveProperty('stepNumber')
        expect(step).toHaveProperty('title')
        expect(step).toHaveProperty('content')
        expect(step).toHaveProperty('keyPoints')
        expect(step).toHaveProperty('difficulty')
      })
    })
  })

  describe('create_learning_plan', () => {
    it('should create a learning plan for a topic', async () => {
      const args = {
        topic: 'recursion',
        current_level: 'beginner' as const,
        target_level: 'intermediate' as const,
      }

      const result = JSON.parse(await create_learning_plan_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result).toHaveProperty('topic')
      expect(result).toHaveProperty('modules')
      expect(result).toHaveProperty('learningObjectives')
      expect(result).toHaveProperty('estimatedDuration')
    })

    it('should include prerequisites in learning plan', async () => {
      const args = {
        topic: 'async',
        current_level: 'intermediate' as const,
        target_level: 'advanced' as const,
      }

      const result = JSON.parse(await create_learning_plan_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.prerequisites).toBeDefined()
      expect(Array.isArray(result.prerequisites)).toBe(true)
    })

    it('should respect max_duration limit', async () => {
      const args = {
        topic: 'class',
        current_level: 'beginner' as const,
        target_level: 'advanced' as const,
        max_duration: 1, // 1 hour
      }

      const result = JSON.parse(await create_learning_plan_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.estimatedDuration).toBeLessThanOrEqual(1)
    })

    it('should create modules with activities', async () => {
      const args = {
        topic: 'variable',
      }

      const result = JSON.parse(await create_learning_plan_executor(args, mockContext))

      expect(result.success).toBe(true)
      if (result.modules.length > 0) {
        expect(result.modules[0]).toHaveProperty('activities')
        expect(Array.isArray(result.modules[0].activities)).toBe(true)
      }
    })

    it('should handle unknown topics', async () => {
      const args = {
        topic: 'unknown_topic_xyz',
      }

      const result = JSON.parse(await create_learning_plan_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.topic).toBe('unknown_topic_xyz')
    })
  })

  describe('solve_step_by_step', () => {
    it('should break down a problem into steps', async () => {
      const args = {
        problem: 'How to reverse a string in JavaScript?',
        language: 'javascript',
      }

      const result = JSON.parse(await solve_step_by_step_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result).toHaveProperty('steps')
      expect(result.steps.length).toBeGreaterThan(0)

      result.steps.forEach(
        (step: { stepNumber: number; title: string; content: string; keyPoints: string[] }) => {
          expect(step).toHaveProperty('stepNumber')
          expect(step).toHaveProperty('title')
          expect(step).toHaveProperty('content')
          expect(step).toHaveProperty('keyPoints')
        }
      )
    })

    it('should include estimated time', async () => {
      const args = {
        problem: 'Sort an array of numbers',
      }

      const result = JSON.parse(await solve_step_by_step_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result).toHaveProperty('totalEstimatedTime')
      expect(result.totalEstimatedTime).toBeGreaterThan(0)
    })

    it('should work without language specified', async () => {
      const args = {
        problem: 'Calculate the factorial of a number',
      }

      const result = JSON.parse(await solve_step_by_step_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.steps.length).toBeGreaterThan(0)
    })

    it('should include different difficulty levels', async () => {
      const args = {
        problem: 'Implement binary search tree',
      }

      const result = JSON.parse(await solve_step_by_step_executor(args, mockContext))

      expect(result.success).toBe(true)

      const difficulties = result.steps.map((s: { difficulty: string }) => s.difficulty)
      expect(difficulties).toContain('beginner')
      expect(difficulties).toContain('intermediate')
    })
  })
})
