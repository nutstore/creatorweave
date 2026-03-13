/**
 * Tailwind CSS Configuration
 *
 * Base Tailwind configuration for CreatorWeave design system.
 * Import and extend this in your project's tailwind.config.js
 *
 * @module tailwind
 */

import { colors } from '../tokens/colors.js'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const tailwindcssAnimate = require('tailwindcss-animate')

/**
 * Create base Tailwind configuration with CreatorWeave design tokens
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
      border: 'hsl(var(--border))',
      input: 'hsl(var(--input))',
      ring: 'hsl(var(--ring))',
      background: 'hsl(var(--background))',
      foreground: 'hsl(var(--foreground))',

      // Component colors
      card: {
        DEFAULT: 'hsl(var(--card))',
        foreground: 'hsl(var(--card-foreground))',
      },

      popover: {
        DEFAULT: 'hsl(var(--popover))',
        foreground: 'hsl(var(--popover-foreground))',
      },

      secondary: {
        DEFAULT: 'hsl(var(--secondary))',
        foreground: 'hsl(var(--secondary-foreground))',
      },

      muted: {
        DEFAULT: 'hsl(var(--muted))',
        foreground: 'hsl(var(--muted-foreground))',
      },

      accent: {
        DEFAULT: 'hsl(var(--accent))',
        foreground: 'hsl(var(--accent-foreground))',
      },

      destructive: {
        DEFAULT: 'hsl(var(--destructive))',
        foreground: 'hsl(var(--destructive-foreground))',
      },

      // Primary (Teal)
      primary: {
        DEFAULT: `hsl(${colors.primary})`,
        foreground: 'hsl(var(--primary-foreground))',
        50: `hsl(${colors.primary50})`,
        100: `hsl(${colors.primary100})`,
        500: `hsl(${colors.primary500})`,
        600: `hsl(${colors.primary600})`,
        700: `hsl(${colors.primary700})`,
        800: 'hsl(174 60% 35%)',  // #0B7168
      },

      // Status colors
      success: {
        DEFAULT: `hsl(${colors.success})`,
        bg: `hsl(${colors.successBg})`,
        text: `hsl(${colors.successText})`,
        50: `hsl(${colors.success50})`,
        200: `hsl(${colors.success200})`,
      },

      warning: {
        DEFAULT: `hsl(${colors.warning})`,
        bg: `hsl(${colors.warningBg})`,
        50: `hsl(${colors.warning50})`,
        200: `hsl(${colors.warning200})`,
      },

      danger: {
        DEFAULT: `hsl(${colors.danger})`,
        bg: `hsl(${colors.dangerBg})`,
        border: `hsl(${colors.dangerBorder})`,
        50: `hsl(${colors.danger50})`,
        200: `hsl(${colors.danger200})`,
      },

      // Gray/Neutral colors (comprehensive)
      gray: {
        50: 'hsl(var(--gray-100))',
        100: 'hsl(var(--gray-100))',
        200: 'hsl(var(--gray-200))',
        300: 'hsl(0 0% 67%)',    /* #AAA */
        400: 'hsl(0 0% 60%)',    /* #999 */
        500: 'hsl(0 0% 53%)',    /* #808080 */
        600: 'hsl(0 0% 45%)',    /* #737373 */
        700: 'hsl(0 0% 38%)',    /* #616161 */
        800: 'hsl(0 0% 30%)',    /* #4B5563 */
        900: 'hsl(0 0% 23%)',    /* #374151 */
      },

      // Neutral alias for compatibility
      neutral: {
        50: 'hsl(var(--gray-100))',
        100: 'hsl(var(--gray-100))',
        200: 'hsl(var(--gray-200))',
        300: 'hsl(0 0% 67%)',
        400: 'hsl(0 0% 60%)',
        500: 'hsl(0 0% 53%)',
        600: 'hsl(0 0% 45%)',
        700: 'hsl(0 0% 38%)',
        800: 'hsl(0 0% 30%)',
        900: 'hsl(0 0% 23%)',
      },

      // Extended colors
      'bg-tertiary': 'hsl(var(--bg-tertiary))',
      'bg-elevated': 'hsl(var(--bg-elevated))',
      'bg-hover': 'hsl(var(--bg-hover))',

      'text-primary': 'hsl(var(--text-primary))',
      'text-secondary': 'hsl(var(--text-secondary))',
      'text-tertiary': 'hsl(var(--text-tertiary))',
      'text-muted': 'hsl(var(--text-muted))',
      'text-on-primary': 'hsl(var(--text-on-primary))',

      'border-strong': 'hsl(var(--border-strong))',
      'border-subtle': 'hsl(var(--border-subtle))',

      'gray-100': 'hsl(var(--gray-100))',
      'gray-200': 'hsl(var(--gray-200))',

      // Flat primary shades for ring/border utilities
      'primary-50': `hsl(${colors.primary50})`,
      'primary-100': `hsl(${colors.primary100})`,
      'primary-500': `hsl(${colors.primary500})`,
      'primary-600': `hsl(${colors.primary600})`,
      'primary-700': `hsl(${colors.primary700})`,
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
