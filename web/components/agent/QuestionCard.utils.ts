/**
 * Pure utilities + types for QuestionCard, extracted so the component file
 * only exports components (required for React fast refresh).
 */

// ---------------------------------------------------------------------------
// Option types — object form ONLY (string form was removed)
// ---------------------------------------------------------------------------

export interface RawOption {
  label: string
  description?: string
  recommended?: boolean
}

export interface NormalizedOption {
  label: string
  description?: string
  recommended: boolean
}

/**
 * Normalize a RawOption to a consistent object form.
 *
 * Primary path: pass-through object form. New tool calls MUST use this form;
 * strings are rejected at the executor layer.
 *
 * Legacy string fallback: historical chat data may contain string entries
 * (from before the string form was removed). Those are silently coerced to
 * a plain label — description and recommended status are lost, but the
 * option still renders so old conversations don't break.
 */
export function normalizeOption(raw: RawOption | string): NormalizedOption {
  // Legacy string fallback — ONLY for historical chat data.
  if (typeof raw === 'string') {
    return { label: raw, description: undefined, recommended: false }
  }
  return {
    label: raw.label,
    description: raw.description,
    recommended: !!raw.recommended,
  }
}
