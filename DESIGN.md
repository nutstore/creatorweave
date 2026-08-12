---
name: CreatorWeave
description: AI-native creator workspace — muted teal over warm neutrals.
colors:
  # ── Primary: Muted Teal ──────────────────────────────
  primary-50: "#F4F8F7"
  primary-100: "#E0EBE9"
  primary-200: "#D5E8E5"
  primary-300: "#A5D2CD"
  primary-400: "#5DB3AC"
  primary-500: "#4D9F98" # brand baseline
  primary-600: "#3A7D77" # hover
  primary-700: "#34605D"
  primary-800: "#2D4745"
  primary-900: "#1F3532"
  primary-950: "#121F1D"
  # ── Neutral surface ──────────────────────────────────
  background: "#FAFAF8" # warm off-white
  background-elevated: "#FFFFFF"
  surface-tertiary: "#F8F7F5" # warm gray
  surface-hover: "#EEF1F1" # teal-tinted hover
  brand-muted: "#CEDDDB" # teal-tinted neutral for nav/dots
  # ── Text ─────────────────────────────────────────────
  text-primary: "#171717"
  text-secondary: "#585858"
  text-tertiary: "#737373"
  text-muted: "#999999"
  # ── Status (deliberately desaturated) ────────────────
  success: "#2D8A4E"
  success-bg: "#EDF5F0"
  warning: "#B86E0D"
  warning-bg: "#FEF6E8"
  danger: "#C46B4A"
  danger-bg: "#FDF5F0"
  # ── Warm accent ──────────────────────────────────────
  accent-warm: "#C9922E" # warm amber, sparingly used
  # ── Borders ──────────────────────────────────────────
  border: "#E5E5E5"
  border-strong: "#D4D4D4"
  border-subtle: "#F0F0F0"
typography:
  display:
    fontFamily: "Newsreader, ui-serif, Georgia, serif"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.05em"
    textTransform: "uppercase"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.875em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  2xl: "20px" # cards
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "40px"
  3xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary-600}"
    textColor: "#FFFFFF"
    rounded: "{rounded.lg}"
    padding: "10px 20px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.primary-700}"
  button-secondary:
    backgroundColor: "{colors.primary-50}"
    textColor: "{colors.primary-600}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
    padding: "10px 20px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-tertiary}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  button-icon:
    height: "32px"
    width: "32px"
    rounded: "{rounded.md}"
    padding: "0"
  card:
    backgroundColor: "#FFFFFF"
    rounded: "{rounded.2xl}"
    padding: "24px"
  card-elevated-shadow: "0 4px 16px rgba(0,0,0,0.04), 0 1px 4px rgba(0,0,0,0.024)"
  input:
    backgroundColor: "transparent"
    borderColor: "{colors.border}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "10px 14px"
  input-focus-ring: "0 0 6px rgba(13,148,136,0.13)"
  badge:
    rounded: "{rounded.md}"
    padding: "4px 10px"
  tag:
    rounded: "{rounded.full}"
    padding: "6px 14px"
---

# Design System: CreatorWeave

## Overview

**Creative North Star: "A well-lit reading room."**

CreatorWeave is a long-session IDE — creators spend hours reading code, agent
output, and docs. The interface must stay legible and calm at that density and
duration, so the system trades saturation for endurance. Colors are muted, the
serif display voice keeps large type from feeling industrial, and depth is
suggested by tonal layering rather than heavy shadow.

The signature is **Muted Teal over Warm Neutrals**: a desaturated teal
(`#4D9F98`) as the only saturated note, laid on warm off-white surfaces
(`#FAFAF8`) that carry a faint cream–gray temperature. Every status color is
pulled away from primary spectrum toward a softer, ink-like version — green
becomes `#2D8A4E`, red becomes `#C46B4A`. Shadows, where present, are barely
there (4–5% opacity); elevation is mostly implied by border and surface tone.

Confirmed visual rejections (read from the token rationale in `globals.css`):
no pure/saturated spectrum primaries, no heavy offset shadows, no dark-mode
contrast that fails WCAG AA — the neutral ramp is explicitly **inverted** in
dark mode so `dark:text-neutral-100` produces light, not near-black, text.

**Key Characteristics:**

- **Muted, not pale.** Saturation is dialed down, but lightness steps are
  preserved — colors read as deliberate, not washed out.
- **Warm over cool.** Neutrals lean cream/teal; even the dark background is a
  warm dark with a subtle teal tint (`#0A0D0E`), never neutral `zinc`.
- **Serif display, sans body.** Newsreader gives headings a human voice;
  Plus Jakarta Sans keeps dense UI text compact and even.
- **Tonal depth, minimal shadow.** Cards separate by border + a whisper-soft
  shadow; the brand color appears only on the one primary button and focus.
- **Dark mode is a first-class rewrite.** Every semantic token is re-pointed
  in `.dark`, including the inverted neutral ramp and a brightened primary
  (`#5FBCB4`) to hold contrast on warm dark surfaces.

## Colors

The palette uses a **color-role model**: each of four roles has one job and
a defined surface area. This prevents the failure mode where a single brand
color is applied to everything that needs emphasis, canceling out all
hierarchy.

### Color Roles (the 4-role model)

| Role | Job | Token | Surface area |
|------|-----|-------|-------------|
| **Brand** (teal) | Primary action, current focus, identity | `primary-*` | Restrained: one solid button per region, focus rings, icons. Never fill a container. |
| **Attention** (warm amber) | "Look up here" — passive notices, banners, reminders | `accent-warm` / `warning` | Rare: only on elements that must interrupt scanning. |
| **Status** (desaturated) | Result feedback: done / failed / caution | `success` / `danger` / `warning` | Signal: a badge, an icon, a thin border. |
| **Neutral** (warm gray) | Everything else: containers, text, dividers | `neutral-*`, `text-*` | The default. Most of the screen. |

**Why four roles, not one color.** A muted system still needs contrast.
Teal-on-teal produces no hierarchy. The warm amber `accent-warm` earns its
visibility by being the only warm note in a cool-neutral field — it jumps
out precisely because nothing else is warm. Reserve it for elements that
must catch the eye (banner notices, overdue indicators). Do not use teal
for this job: teal is the calm brand voice, not the alarm.

### Primary

- **Muted Teal — 500** (#4D9F98): brand baseline. Used for the primary
  action, focus rings, links, and active nav.
- **Muted Teal — 600** (#3A7D77): hover and the default resting fill of the
  primary button (buttons use the darker step at rest for contrast on white).
- **Muted Teal — 50/100** (#F4F8F7 / #E0EBE9): secondary button fill, tints,
  and the active nav background. The faintest teal presence.

**The Brand-Muted Rule.** When a neutral surface sits directly next to teal
(nav rails, inactive dots, secondary markers), use `brand-muted`
(`#CEDDDB`) — a teal-tinted gray — so the transition doesn't read as a step.

**The Teal-Budget Rule.** Count solid teal fills in a given viewport: there
should be at most one primary button and a handful of small accents (icons,
focus rings). If a card, banner, and button are all teal, remove teal from
the container — let neutral carry it, reserve teal for the action.

### Status (all desaturated)

- **Success** (#2D8A4E, bg #EDF5F0): softened green, never `green-500`.
- **Warning** (#B86E0D, bg #FEF6E8): muted amber.
- **Danger** (#C46B4A, bg #FDF5F0): clay red, not alert red. Used for
  destructive buttons (bg + text + border, never solid fill) and error inputs.
- **Info** (#2B8AEF, bg #EFF6FF): a brighter blue than the desaturated status
hues, intentionally. Banners are 5-second signals, not 8-hour reading surfaces,
so they earn enough saturation to be noticed. Use for passive banners and
notices that must be visible (e.g. "extension not installed", "new feature
available"). This is the system's answer to `blue-600` — it keeps blue's clean,
informational character while respecting the muted field.

### Neutral

- **Background** (#FAFAF8): warm off-white. The canvas.
- **Surface Tertiary** (#F8F7F5): inset panels.
- **Text** (#171717 / #585858 / #737373 / #999999): four-step text ramp.
- **Border** (#E5E5E5 / #D4D4D4 strong / #F0F0F0 subtle): hairline borders
  carry most of the structural work that shadows would in a heavier system.

### Attention (warm)

- **Warm Amber — `accent-warm`** (#C9922E): the system's **official attention
color**. The only warm note in a cool-neutral field, so it reads as
interruptive by nature. Use for passive notices that must catch the eye
while scanning: install/upgrade banners, stale-session reminders, unread
indicators. Pair with a neutral container and reserve the amber for the
signal elements (icon, left edge, label) — do not flood the entire surface.

## Typography

**Display Font:** Newsreader (with ui-serif, Georgia fallback) — a warm serif
for headings, card titles, and metric numbers.
**Body Font:** Plus Jakarta Sans (with ui-sans-serif, system-ui fallback) —
compact geometric sans for all UI and body text.
**Mono Font:** JetBrains Mono (with ui-monospace fallback) — code, data,
measurements only. Never decorative.

**Character:** The serif/sans pairing is the typographic signature — Newsreader
humanizes large type that would otherwise feel industrial in a code tool, while
Plus Jakarta Sans keeps dense panels scannable. System display fonts (Impact,
Arial Black) are forbidden as the brand voice.

### Hierarchy

- **Display** (Newsreader, 500, ~2x scale, line-height 1.2, tracking −0.025em):
  page metrics and hero titles. The serif earns its place here.
- **Headline** (Plus Jakarta Sans, 600, 1.25rem, tracking −0.015em): section and
  card titles (e.g. `BrandCardTitle`).
- **Body** (Plus Jakarta Sans, 400, 0.875rem, line-height 1.75): the default
  reading size; aim for 65–75ch line length in prose contexts.
- **Label** (Plus Jakarta Sans, 600, 0.75rem, uppercase, tracking 0.05em):
  form labels, table headers, metric labels — the small structural voice.
- **Mono** (JetBrains Mono, 0.875em): inline code, code blocks, tabular data.

## Layout

Container is centered with `2rem` padding, capping at `1400px` (`2xl`). Density
is high but rhythm is even: the spacing scale runs 4 → 8 → 16 → 24 → 32 → 40 →
48px, and components prefer `8px`/`16px`/`24px` steps. The neutral ramp is a
true 50–950 scale (10 steps) so surfaces can step up or down by one notch
without bespoke values. Mobile web adds an `xs: 375px` breakpoint and safe-area
inset spacing; the same token system applies.

## Elevation & Depth

**The Whisper-Shadow Rule.** Depth is mostly tonal. When a shadow is used it is
barely perceptible: the card token is
`0 4px 16px rgba(0,0,0,0.04), 0 1px 4px rgba(0,0,0,0.024)` — a combined ~4%
opacity, never a hard offset. The primary button gets a single tinted glow
(`0 1px 3px rgba(13,148,136,0.3)`) that borrows the brand hue rather than a
neutral shadow. Inputs in focus show a 6px teal halo at ~13% opacity. There is
no elevation system built on stacking shadows; separate surfaces with border +
tone instead.

## Shapes

Corner language is moderate and consistent:

- **8px (`md`)** is the default — buttons, inputs, badges, nav items.
- **16px / 20px (`lg`/`2xl`)** for cards and dialogs — visibly softer.
- **4px (`sm`)** for inline code and tight controls.
- **Pill (`full`)** for tags and status dots only.

Buttons and inputs share the same 8px radius so they sit on the same grid; cards
round further to read as containers. Hard offset shadows and `border-left/right`
accents beyond 1px are forbidden unless the surface is genuinely destructive
(the danger input uses a 1.5px solid border, the one sanctioned exception).

## Components

### Buttons

5 variants + icon button, all 40px tall (`h-10`), 8px radius, `10px 20px`
padding (ghost uses `10px 16px`):

- **Primary** — teal-600 fill, white text, tinted teal glow; hover to 700.
- **Secondary** — teal-50 fill, teal-600 text, border.
- **Outline** — transparent, secondary text, border; hover picks up teal.
- **Ghost** — transparent, tertiary text; hover to gray-100.
- **Danger** — danger-bg fill, danger text, danger border (never solid red).
- **Icon** — 32×32, 6px radius, default/primary/danger/ghost/disabled variants.

Focus is always `ring-2 ring-primary-600 ring-offset-2`. Disabled is
`opacity-50` + `pointer-events-none`.

### Cards

`rounded-2xl`, white on `bg-card`, with the whisper shadow. Three variants:
`metric` (p-6, big number), `content` (overflow-hidden, media), `info`
(p-6 gap-4). Footer is a top-bordered `py-3 px-5` row. Titles use the serif
display weight; descriptions use `text-secondary`.

### Inputs

Transparent fill, gray-200 border, 8px radius, `10px 14px` padding, 40px tall.
Four states: `default` (focus → teal border + 6px teal halo), `error`
(1.5px solid danger border, danger-bg fill), `filled`, `disabled`. Labels are
13px medium primary; errors are 12px danger.

### Badges & Tags

Two distinct shapes: **badges** (8px radius, `4px 10px`, semibold) for status
(success/warning/error/neutral) with a matching tinted bg + 20%-opacity border;
**tags** (pill, `6px 14px`, medium) for categorical color (primary/blue/purple/
green/orange/pink). Status badges never use pure-spectrum fills.

### Navigation

Nav items are `rounded-lg px-3 py-1.5`, 14px medium; active state is
`bg-primary-50 text-primary-700`, inactive is `text-gray-600 hover:bg-gray-100`.
The active rail uses `brand-muted` for inactive dots so they harmonize with teal.

## Do's and Don'ts

### Do:

- **Pull status colors toward ink, not spectrum.** Use the muted success/warning/
  danger tokens; if a context feels too loud, desaturate further, don't brighten.
- **Let the serif carry large type.** Use Newsreader for any number or title
  above ~1.25rem — it's what stops the tool from feeling clinical.
- **Separate with border + tone first, shadow last.** Reach for the whisper
  shadow only when a surface genuinely floats (cards, dialogs).
- **Re-point tokens for dark mode.** Every semantic token has a `.dark`
  override — use it; don't hardcode dark values in components.
- **Keep the primary button the only solid teal in a region** unless it's a
  focus ring or link. Enforce the Teal-Budget Rule.
- **Use `accent-warm` for attention, not teal.** Banners, notices, and
  reminders that must interrupt scanning belong to the warm amber attention
  role — that's what makes them visible against a teal-neutral field.

### Don't:

- **Don't use saturated spectrum primaries.** No `#3B82F6`, no `green-500`, no
  `red-600`. The system's whole character rests on desaturation.
- **Don't use hard offset shadows** (`box-shadow: 4px 4px 0`) or stacked
  elevation. Depth is tonal here.
- **Don't use mono type for "technical" decoration.** JetBrains Mono is for
  code/data/measurements only.
- **Don't apply `border-left/right` accents >1px** to callouts, cards, or alerts
  (the 1.5px danger input is the only sanctioned exception).
- **Don't add gradient text or glass/blur as decoration.** Emphasis comes from
  weight, size, or the serif voice — never from a gradient or backdrop-filter.
- **Don't use teal for attention.** Teal is the calm brand voice. If an element
  must interrupt scanning (a banner, an overdue reminder), use `accent-warm` —
  the warm note jumps out precisely because the rest of the field is cool.
  Flooding a notice with teal makes it disappear into the brand-colored sea.
- **Don't flood a container with one color.** Cards and banners should be
  neutral containers with color reserved for the signal (icon, label, button).
  A monochrome card has no internal hierarchy.
- **Don't introduce a neutral `zinc`/`slate` dark background.** The dark theme
  is warm with a teal tint; a cool neutral dark would break the temperature.
