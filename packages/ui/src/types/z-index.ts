/**
 * Z-Index Layering System Types
 *
 * Defines the semantic z-index layers for the @creatorweave/ui component library.
 *
 * @see /docs/z-index-layering-spec.md for complete specification
 */

/**
 * Semantic z-index layer names
 *
 * Layer hierarchy (lowest to highest):
 * - base: Default document flow (0)
 * - raised: Sticky headers, hover cards (10)
 * - dropdown: Selects, dropdown menus (100)
 * - overlay: Modal/dialog backdrops (1000)
 * - modal: Modal/dialog content (1001)
 * - tooltip: Tooltips, help text (9998)
 * - notification: Toasts, alerts (9999)
 */
export type ZIndexLayer =
  | 'base'
  | 'raised'
  | 'dropdown'
  | 'overlay'
  | 'modal'
  | 'tooltip'
  | 'notification';

/**
 * Z-index CSS variable values for each layer
 *
 * Usage:
 * ```tsx
 * import { Z_INDEX_VALUES } from '@/types/z-index';
 *
 * <div style={{ zIndex: Z_INDEX_VALUES.modal }} />
 * ```
 */
export const Z_INDEX_VALUES: Record<ZIndexLayer, string> = {
  base: 'var(--z-base)',
  raised: 'var(--z-raised)',
  dropdown: 'var(--z-dropdown)',
  overlay: 'var(--z-overlay)',
  modal: 'var(--z-modal)',
  tooltip: 'var(--z-tooltip)',
  notification: 'var(--z-notification)',
} as const;

/**
 * Numeric fallback values for each layer
 * Used for older browsers that don't support CSS variables
 */
export const Z_INDEX_FALLBACKS: Record<ZIndexLayer, number> = {
  base: 0,
  raised: 10,
  dropdown: 100,
  overlay: 1000,
  modal: 1001,
  tooltip: 9998,
  notification: 9999,
} as const;

/**
 * Helper function to get z-index value with fallback
 *
 * @param layer - The z-index layer
 * @returns CSS string with variable and fallback
 *
 * Example:
 * ```tsx
 * <div style={{ zIndex: getZIndex('modal') }} />
 * // Renders: zIndex: "var(--z-modal, 1001)"
 * ```
 */
export function getZIndex(layer: ZIndexLayer): string {
  return `var(--z-${layer}, ${Z_INDEX_FALLBACKS[layer]})`;
}

/**
 * Get numeric z-index value for a layer
 * Useful for comparisons in tests
 *
 * @param layer - The z-index layer
 * @returns Numeric z-index value
 */
export function getZIndexNumber(layer: ZIndexLayer): number {
  return Z_INDEX_FALLBACKS[layer];
}

/**
 * Check if a layer is above another layer
 *
 * @param layer - Layer to check
 * @param reference - Reference layer
 * @returns true if layer is above reference
 */
export function isZIndexAbove(layer: ZIndexLayer, reference: ZIndexLayer): boolean {
  return getZIndexNumber(layer) > getZIndexNumber(reference);
}
