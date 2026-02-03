/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './.storybook/**/*.{js,ts,jsx,tsx}',
  ],
  safelist: [
    {
      pattern: /(text|bg|border)-((primary|secondary|danger|success|warning|gray)-|text-|text-on-)(.+)?/,
      variants: ['hover', 'focus'],
    },
  ],
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				'50': 'hsl(var(--primary-50))',
  				'100': 'hsl(var(--primary-100))',
  				'500': 'hsl(var(--primary-500))',
  				'600': 'hsl(var(--primary-600))',
  				'700': 'hsl(var(--primary-700))',
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			success: {
  				DEFAULT: 'hsl(var(--success))',
  				'50': 'hsl(var(--success-50))',
  				'200': 'hsl(var(--success-200))',
  				bg: 'hsl(var(--success-bg))',
  				text: 'hsl(var(--success-text))'
  			},
  			warning: {
  				DEFAULT: 'hsl(var(--warning))',
  				'50': 'hsl(var(--warning-50))',
  				'200': 'hsl(var(--warning-200))',
  				bg: 'hsl(var(--warning-bg))'
  			},
  			danger: {
  				DEFAULT: 'hsl(var(--danger))',
  				'50': 'hsl(var(--danger-50))',
  				'200': 'hsl(var(--danger-200))',
  				bg: 'hsl(var(--danger-bg))',
  				border: 'hsl(var(--danger-border))'
  			},
  			/* Extended backgrounds */
  			'bg-tertiary': 'hsl(var(--bg-tertiary))',
  			'bg-elevated': 'hsl(var(--bg-elevated))',
  			'bg-hover': 'hsl(var(--bg-hover))',
  			/* Extended text colors */
  			'text-primary': 'hsl(var(--text-primary))',
  			'text-secondary': 'hsl(var(--text-secondary))',
  			'text-tertiary': 'hsl(var(--text-tertiary))',
  			'text-muted': 'hsl(var(--text-muted))',
  			'text-on-primary': 'hsl(var(--text-on-primary))',
  			/* Extended borders */
  			'border-strong': 'hsl(var(--border-strong))',
  			'border-subtle': 'hsl(var(--border-subtle))',
  			/* Gray colors */
  			gray: {
  				'100': 'hsl(var(--gray-100))',
  				'200': 'hsl(var(--gray-200))',
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		fontFamily: {
  			sans: [
  				'var(--font-inter)',
  				'Inter',
  				'sans-serif'
  			],
  			display: [
  				'var(--font-newsreader)',
  				'Newsreader',
  				'serif'
  			],
  			mono: [
  				'var(--font-mono)',
  				'JetBrains Mono',
  				'monospace'
  			]
  		},
  		spacing: {
  			'18': '4.5rem',
  			'88': '22rem'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require('tailwindcss-animate')],
}
