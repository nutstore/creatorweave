/**
 * Design Tokens - Colors
 *
 * Color palette for the CreatorWeave design system.
 * Uses HSL format for consistency with CSS variables.
 *
 * @typedef {Object} Colors
 * @property {string} background - HSL value for background
 * @property {string} foreground - HSL value for foreground
 * @property {string} primary - Primary brand color (Teal)
 * @property {string} primary600 - Darker primary for hover
 * @property {string} success - Success state color
 * @property {string} warning - Warning state color
 * @property {string} danger - Error/danger state color
 */

export const colors = {
  // ========== Base Colors ==========
  background: '0 0% 100%',       /* #FFFFFF */
  foreground: '10 10% 9%',       /* #171717 */

  card: '0 0% 100%',
  cardForeground: '10 10% 9%',

  popover: '0 0% 100%',
  popoverForeground: '10 10% 9%',

  secondary: '0 0% 96%',         /* #F5F5F5 */
  secondaryForeground: '10 10% 9%',

  muted: '0 0% 96%',             /* #F5F5F5 */
  mutedForeground: '0 0% 45%',   /* #737373 */

  accent: '0 0% 96%',
  accentForeground: '10 10% 9%',

  destructive: '15 74% 57%',     /* #E07B54 - custom orange-red */
  destructiveForeground: '0 0% 100%',

  border: '0 0% 90%',            /* #E5E5E5 */
  input: '0 0% 90%',
  ring: '174 72% 56%',           /* Teal */

  // ========== Extended Backgrounds ==========
  bgTertiary: '0 0% 98%',        /* #FAFAFA */
  bgElevated: '0 0% 100%',       /* #FFFFFF */
  bgHover: '0 0% 94%',           /* #F0F0F0 */

  // ========== Extended Text Colors ==========
  textPrimary: '10 10% 9%',       /* #171717 */
  textSecondary: '0 0% 32%',      /* #525252 */
  textTertiary: '0 0% 45%',       /* #737373 */
  textMuted: '0 0% 64%',          /* #A3A3A3 */
  textOnPrimary: '0 0% 100%',     /* #FFFFFF */

  // ========== Extended Borders ==========
  borderStrong: '0 0% 83%',       /* #D4D4D4 */
  borderSubtle: '0 0% 94%',       /* #F0F0F0 */

  // ========== Gray Colors ==========
  gray100: '0 0% 96%',            /* #F3F4F6 */
  gray200: '0 0% 90%',            /* #E5E7EB */

  // ========== Primary (Teal) ==========
  primary: '174 72% 56%',          /* #14B8A6 */
  primaryForeground: '0 0% 100%',
  primary50: '174 64% 97%',        /* #F0FDFA */
  primary100: '174 64% 94%',       /* #CCFBF1 */
  primary500: '174 72% 56%',       /* #14B8A6 */
  primary600: '174 75% 38%',       /* #0D9488 */
  primary700: '174 62% 38%',       /* #0F766E */

  // ========== Status Colors ==========
  success: '142 76% 36%',          /* #16A34A */
  success50: '142 76% 97%',        /* #F0FDF4 - light green bg */
  success200: '142 76% 87%',       /* #BBF7D0 - green border */
  successBg: '142 76% 96%',        /* #DCFCE7 */
  successText: '142 71% 45%',      /* #15803D */

  warning: '35 84% 43%',           /* #D97706 */
  warning50: '48 96% 96%',         /* #FEFCE8 - light amber bg */
  warning200: '48 96% 83%',        /* #FDE68A - amber border */
  warningBg: '48 96% 89%',         /* #FEF3C7 */

  danger: '15 74% 57%',            /* #E07B54 */
  danger50: '25 95% 96%',          /* #FFF7ED - light orange bg */
  danger200: '24 74% 78%',         /* #FED7AA - orange border */
  dangerBg: '25 95% 97%',          /* #FFF7ED */
  dangerBorder: '24 74% 66%',      /* #FDBA74 */
}

/**
 * Hex color values for JavaScript usage
 *
 * @typedef {Object} HexColors
 * @property {string} primary - Primary brand color hex
 * @property {string} primary600 - Darker primary hex
 */
export const hexColors = {
  primary: '#14B8A6',
  primary50: '#F0FDFA',
  primary100: '#CCFBF1',
  primary500: '#14B8A6',
  primary600: '#0D9488',
  primary700: '#0F766E',

  success: '#16A34A',
  successBg: '#DCFCE7',
  successText: '#15803D',

  warning: '#D97706',
  warningBg: '#FEF3C7',

  danger: '#E07B54',
  dangerBg: '#FFF7ED',
  dangerBorder: '#FDBA74',

  gray: {
    100: '#F3F4F6',
    200: '#E5E7EB',
  },
}
