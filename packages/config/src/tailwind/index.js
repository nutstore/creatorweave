/**
 * Tailwind CSS Configuration
 *
 * Base Tailwind configuration for application design system.
 * Import and extend this in your project's tailwind.config.js
 *
 * @module tailwind
 *
 * @architecture
 * Color system uses a SINGLE source of truth: CSS variables defined in
 * `web/src/styles/globals.css` (and `packages/ui/src/styles/globals.css`).
 * All Tailwind color classes reference those variables via
 * `hsl(var(--xxx) / <alpha-value>)`, which means:
 *
 *   1. Runtime theme switching (theme.store.ts setting --primary etc.)
 *      actually affects `.bg-primary` etc. — previously the build-time
 *      tokens.js was the source and theme switching silently failed.
 *   2. Changing a brand color requires editing ONE file (globals.css).
 *   3. Tailwind alpha utilities (bg-primary/20) still work because
 *      <alpha-value> is the placeholder Tailwind swaps at build time.
 *
 * @deprecated `packages/config/src/tokens/colors.js` (the JS HSL triplets)
 * is kept only for `hexColors` (chart libraries, meta theme-color, etc).
 * Do not use its `colors` object for any Tailwind CSS values.
 */

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const tailwindcssAnimate = require('tailwindcss-animate')

/**
 * Create a `hsl(var(--xxx) / <alpha-value>)` reference for a CSS variable.
 * The CSS variable must contain an HSL triplet (e.g. `174 30% 42%`),
 * NOT a fully wrapped `hsl(...)` value — Tailwind needs to splice in the
 * alpha channel at build time.
 *
 * @param {string} name  CSS variable name WITH the leading `--`.
 *                        Pass the bare suffix (e.g. `primary`) or full
 *                        (e.g. `--primary`); both work.
 * @returns {string}
 */
function cssVar(name) {
  const v = name.startsWith('--') ? name : `--${name}`
  return `hsl(var(${v}) / <alpha-value>)`
}

/**
 * Create base Tailwind configuration with application design tokens
 *
 * @param {import('tailwindcss').Config & {content?: import('tailwindcss').Config['content'], prefix?: string}} [options={}]
 * @returns {import('tailwindcss').Config}
 */
export function createBaseConfig(options = {}) {
  const { content = [], prefix = '', theme: userTheme, ...rest } = options

  // Base theme extend configuration
  const baseExtend = {
    colors: {
      // Base colors from CSS variables
      border: cssVar('border'),
      input: cssVar('input'),
      ring: cssVar('ring'),
      background: cssVar('background'),
      foreground: cssVar('foreground'),

      // Component colors
      card: {
        DEFAULT: cssVar('card'),
        foreground: cssVar('card-foreground'),
      },

      popover: {
        DEFAULT: cssVar('popover'),
        foreground: cssVar('popover-foreground'),
      },

      secondary: {
        DEFAULT: cssVar('secondary'),
        foreground: cssVar('secondary-foreground'),
      },

      muted: {
        DEFAULT: cssVar('muted'),
        foreground: cssVar('muted-foreground'),
      },

      accent: {
        DEFAULT: cssVar('accent'),
        foreground: cssVar('accent-foreground'),
      },

      destructive: {
        DEFAULT: cssVar('destructive'),
        foreground: cssVar('destructive-foreground'),
      },

      // Primary brand palette — all read from CSS vars so runtime theme
      // switching (theme.store.ts) actually affects these classes.
      primary: {
        DEFAULT: cssVar('primary'),
        foreground: cssVar('primary-foreground'),
        50: cssVar('primary-50'),
        100: cssVar('primary-100'),
        200: cssVar('primary-200'),
        300: cssVar('primary-300'),
        400: cssVar('primary-400'),
        500: cssVar('primary-500'),
        600: cssVar('primary-600'),
        700: cssVar('primary-700'),
        800: cssVar('primary-800'),
        900: cssVar('primary-900'),
        950: cssVar('primary-950'),
      },

      // Status colors — same pattern: CSS vars only.
      success: {
        DEFAULT: cssVar('success'),
        bg: cssVar('success-bg'),
        text: cssVar('success-text'),
        50: cssVar('success-50'),
        200: cssVar('success-200'),
        950: cssVar('success-950'),
      },

      warning: {
        DEFAULT: cssVar('warning'),
        bg: cssVar('warning-bg'),
        50: cssVar('warning-50'),
        100: cssVar('warning-100'),
        200: cssVar('warning-200'),
        500: cssVar('warning-500'),
        900: cssVar('warning-900'),
        950: cssVar('warning-950'),
      },

      danger: {
        DEFAULT: cssVar('danger'),
        bg: cssVar('danger-bg'),
        border: cssVar('danger-border'),
        50: cssVar('danger-50'),
        200: cssVar('danger-200'),
        500: cssVar('danger-500'),
        600: cssVar('danger-600'),
        700: cssVar('danger-700'),
      },

      // Info — brighter blue for banners/notices. Intentionally more
      // saturated than the desaturated status hues: banners are 5-second
      // signals that must be noticed, not 8-hour reading surfaces.
      info: {
        DEFAULT: cssVar('info'),
        bg: cssVar('info-bg'),
        text: cssVar('info-text'),
        50: cssVar('info-50'),
        100: cssVar('info-100'),
      },

      // Warm accent — extended brand token (only used in a few places)
      'accent-warm': cssVar('accent-warm'),

      // Brand-tinted muted surface. Use for interaction elements that
      // should harmonize with brand color (nav rails, inactive dots,
      // secondary markers) without competing for attention.
      'brand-muted': cssVar('brand-muted'),

      // Gray colors — kept as static HSL values for backward compat.
      // The design-system.css @apply classes (buttons, badges, inputs) rely
      // on these literal values. Only `gray-100` / `gray-200` are
      // CSS-var backed (they participate in card/elevated surfaces).
      gray: {
        50: cssVar('gray-100'),
        100: cssVar('gray-100'),
        200: cssVar('gray-200'),
        300: 'hsl(0 0% 67%)',    /* #AAA */
        400: 'hsl(0 0% 60%)',    /* #999 */
        500: 'hsl(0 0% 53%)',    /* #808080 */
        600: 'hsl(0 0% 45%)',    /* #737373 */
        700: 'hsl(0 0% 38%)',    /* #616161 */
        800: 'hsl(0 0% 30%)',    /* #4B5563 */
        900: 'hsl(0 0% 23%)',    /* #374151 */
      },

      // Neutral — theme-aware ramp. Every step reads from a CSS variable
      // that has an explicit dark-mode override in globals.css, so that
      // `dark:text-neutral-100/200/300` produce LIGHT text while
      // `dark:bg-neutral-800/900` produce DARK surfaces.
      //
      // Previously neutral-100 aliased gray-100 (a non-inverting var), so
      // in dark mode `dark:text-neutral-100` resolved to the dark
      // --gray-100 value (#1F2528) → near-black text on dark backgrounds.
      neutral: {
        50: cssVar('neutral-50'),
        100: cssVar('neutral-100'),
        200: cssVar('neutral-200'),
        300: cssVar('neutral-300'),
        400: cssVar('neutral-400'),
        500: cssVar('neutral-500'),
        600: cssVar('neutral-600'),
        700: cssVar('neutral-700'),
        800: cssVar('neutral-800'),
        900: cssVar('neutral-900'),
        950: cssVar('neutral-950'),
      },

      // Extended colors
      'bg-tertiary': cssVar('bg-tertiary'),
      'bg-elevated': cssVar('bg-elevated'),
      'bg-hover': cssVar('bg-hover'),

      'text-primary': cssVar('text-primary'),
      'text-secondary': cssVar('text-secondary'),
      'text-tertiary': cssVar('text-tertiary'),
      'text-muted': cssVar('text-muted'),
      'text-on-primary': cssVar('text-on-primary'),

      'border-strong': cssVar('border-strong'),
      'border-subtle': cssVar('border-subtle'),

      'gray-100': cssVar('gray-100'),
      'gray-200': cssVar('gray-200'),

      // Flat primary shades for ring/border utilities
      'primary-50': cssVar('primary-50'),
      'primary-100': cssVar('primary-100'),
      'primary-500': cssVar('primary-500'),
      'primary-600': cssVar('primary-600'),
      'primary-700': cssVar('primary-700'),
    },
    borderRadius: {
      lg: 'var(--radius)',
      md: 'calc(var(--radius) - 2px)',
      sm: 'calc(var(--radius) - 4px)',
    },
    fontFamily: {
      sans: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      display: ['Newsreader', 'ui-serif', 'Georgia', 'serif'],
      mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
    },
    keyframes: {
      'accordion-down': {
        from: { height: '0' },
        to: { height: 'var(--radix-accordion-content-height)' },
      },
      'accordion-up': {
        from: { height: 'var(--radix-accordion-content-height)' },
        to: { height: '0' },
      },
    },
    animation: {
      'accordion-down': 'accordion-down 0.2s ease-out',
      'accordion-up': 'accordion-up 0.2s ease-out',
    },
    zIndex: {
      base: 'var(--z-base, 0)',
      dropdown: 'var(--z-dropdown, 100)',
      overlay: 'var(--z-overlay, 1000)',
      modal: 'var(--z-modal, 1001)',
      tooltip: 'var(--z-tooltip, 9998)',
    },
  }

  // Merge user's theme.extend with base extend
  const userExtend = userTheme?.extend || {}

  return {
    darkMode: ['class'],
    prefix,
    content,
    theme: {
      container: {
        center: true,
        padding: '2rem',
        screens: {
          '2xl': '1400px',
        },
      },
      extend: {
        ...baseExtend,
        ...userExtend,
      },
    },
    plugins: [tailwindcssAnimate],
    ...rest,
  }
}

/**
 * Default base configuration
 */
export const baseConfig = createBaseConfig()

export default baseConfig
