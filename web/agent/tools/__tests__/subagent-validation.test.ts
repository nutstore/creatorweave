import { describe, expect, it } from 'vitest'
import {
  validateAgentId,
  validateDescription,
  validateMessage,
  validateName,
  validatePrompt,
  validateSubagentType,
  validateTimeoutMs,
} from '../subagent-validation'
import { SubagentErrorCode } from '../tool-types'

describe('subagent validation', () => {
  // ---------------------------------------------------------------------------
  // validateDescription
  // ---------------------------------------------------------------------------
  describe('validateDescription', () => {
    it('accepts valid description', () => {
      expect(validateDescription('Analyze code')).toBe('Analyze code')
    })

    it('trims whitespace', () => {
      expect(validateDescription('  hello  ')).toBe('hello')
    })

    it('rejects non-string', () => {
      expect(() => validateDescription(123)).toThrow()
      try { validateDescription(123) } catch (e) {
        expect((e as { code: string }).code).toBe(SubagentErrorCode.INVALID_INPUT)
      }
    })

    it('rejects empty string', () => {
      expect(() => validateDescription('')).toThrow()
      expect(() => validateDescription('   ')).toThrow()
    })

    it('rejects description > 200 chars', () => {
      expect(() => validateDescription('x'.repeat(201))).toThrow()
    })

    it('accepts description at 200 chars', () => {
      expect(validateDescription('x'.repeat(200))).toBe('x'.repeat(200))
    })
  })

  // ---------------------------------------------------------------------------
  // validatePrompt
  // ---------------------------------------------------------------------------
  describe('validatePrompt', () => {
    it('accepts valid prompt', () => {
      expect(validatePrompt('Do something useful')).toBe('Do something useful')
    })

    it('rejects non-string', () => {
      expect(() => validatePrompt(null)).toThrow()
    })

    it('rejects empty string', () => {
      expect(() => validatePrompt('')).toThrow()
    })

    it('rejects prompt > 100000 chars', () => {
      expect(() => validatePrompt('x'.repeat(100_001))).toThrow()
    })

    it('accepts prompt at 100000 chars', () => {
      const long = 'x'.repeat(100_000)
      expect(validatePrompt(long)).toBe(long)
    })
  })

  // ---------------------------------------------------------------------------
  // validateName
  // ---------------------------------------------------------------------------
  describe('validateName', () => {
    it('returns undefined for undefined/null', () => {
      expect(validateName(undefined)).toBeUndefined()
      expect(validateName(null)).toBeUndefined()
    })

    it('accepts valid name', () => {
      expect(validateName('my-agent_1')).toBe('my-agent_1')
    })

    it('trims whitespace', () => {
      expect(validateName('  agent  ')).toBe('agent')
    })

    it('rejects name > 64 chars', () => {
      expect(() => validateName('x'.repeat(65))).toThrow()
    })

    it('rejects name with spaces', () => {
      expect(() => validateName('my agent')).toThrow()
    })

    it('rejects name with special chars', () => {
      expect(() => validateName('agent@123')).toThrow()
      expect(() => validateName('agent.123')).toThrow()
    })

    it('accepts name at 64 chars', () => {
      const name64 = 'a'.repeat(64)
      expect(validateName(name64)).toBe(name64)
    })

    it('rejects empty trimmed name', () => {
      expect(() => validateName('   ')).toThrow()
    })
  })

  // ---------------------------------------------------------------------------
  // validateSubagentType
  // ---------------------------------------------------------------------------
  describe('validateSubagentType', () => {
    it('returns default for undefined', () => {
      expect(validateSubagentType(undefined)).toBe('general-purpose')
    })

    it('returns default for null', () => {
      expect(validateSubagentType(null)).toBe('general-purpose')
    })

    it('accepts general-purpose', () => {
      expect(validateSubagentType('general-purpose')).toBe('general-purpose')
    })

    it('rejects invalid type', () => {
      try { validateSubagentType('super-agent') } catch (e) {
        expect((e as { code: string }).code).toBe(SubagentErrorCode.INVALID_AGENT_TYPE)
      }
    })

    it('rejects non-string', () => {
      expect(() => validateSubagentType(42)).toThrow()
    })
  })

  // ---------------------------------------------------------------------------
  // validateTimeoutMs
  // ---------------------------------------------------------------------------
  describe('validateTimeoutMs', () => {
    it('returns undefined for undefined/null', () => {
      expect(validateTimeoutMs(undefined)).toBeUndefined()
      expect(validateTimeoutMs(null)).toBeUndefined()
    })

    it('accepts valid timeout', () => {
      expect(validateTimeoutMs(5000)).toBe(5000)
    })

    it('rejects non-number', () => {
      expect(() => validateTimeoutMs('5000')).toThrow()
    })

    it('rejects zero', () => {
      expect(() => validateTimeoutMs(0)).toThrow()
    })

    it('rejects negative', () => {
      expect(() => validateTimeoutMs(-1)).toThrow()
    })

    it('rejects Infinity', () => {
      expect(() => validateTimeoutMs(Infinity)).toThrow()
    })

    it('rejects exceeding max', () => {
      expect(() => validateTimeoutMs(3_600_001)).toThrow()
      try { validateTimeoutMs(3_600_001) } catch (e) {
        expect((e as { code: string }).code).toBe(SubagentErrorCode.TIMEOUT_EXCEEDS_MAX)
      }
    })

    it('accepts at max boundary', () => {
      expect(validateTimeoutMs(3_600_000)).toBe(3_600_000)
    })

    it('respects custom max', () => {
      expect(validateTimeoutMs(500, 1000)).toBe(500)
      expect(() => validateTimeoutMs(1001, 1000)).toThrow()
    })
  })

  // ---------------------------------------------------------------------------
  // validateAgentId
  // ---------------------------------------------------------------------------
  describe('validateAgentId', () => {
    it('accepts valid id', () => {
      expect(validateAgentId('subagent_abc123')).toBe('subagent_abc123')
    })

    it('rejects empty string', () => {
      expect(() => validateAgentId('')).toThrow()
    })

    it('rejects whitespace-only', () => {
      expect(() => validateAgentId('   ')).toThrow()
    })

    it('rejects non-string', () => {
      expect(() => validateAgentId(undefined)).toThrow()
    })
  })

  // ---------------------------------------------------------------------------
  // validateMessage
  // ---------------------------------------------------------------------------
  describe('validateMessage', () => {
    it('accepts valid message', () => {
      expect(validateMessage('hello world')).toBe('hello world')
    })

    it('rejects non-string', () => {
      expect(() => validateMessage(42)).toThrow()
    })

    it('rejects empty string', () => {
      expect(() => validateMessage('')).toThrow()
    })

    it('rejects whitespace-only', () => {
      expect(() => validateMessage('   ')).toThrow()
    })

    it('sets correct error code', () => {
      try { validateMessage('') } catch (e) {
        expect((e as { code: string }).code).toBe(SubagentErrorCode.INVALID_MESSAGE)
      }
    })
  })
})
