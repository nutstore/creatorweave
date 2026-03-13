/**
 * Tailwind CSS Configuration
 *
 * Extends the base configuration from @creatorweave/config
 * with mobile-specific customizations.
 */

import { createBaseConfig } from '@creatorweave/config/tailwind'

/** @type {import('tailwindcss').Config} */
export default createBaseConfig({
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      screens: {
        xs: '375px',  // Small mobile
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
    },
  },
})
