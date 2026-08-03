# Anti-patterns: Design Principles for LLM-Driven Review

> **Source**: [pbakaus/impeccable](https://github.com/pbakaus/impeccable) detector rule engine, reformulated as design principles for LLM-driven review.
> **Original count**: 59 deterministic rules across 2 categories (slop / quality).
> **This file**: ~45 core rules organized for LLM scanning. The full 59-rule set lives upstream in `cli/engine/rules/checks.mjs` and `cli/engine/registry/antipatterns.mjs`.

The original Impeccable detector runs these as regex + DOM checks in jsdom. Since CreatorWeave has no CLI/node runtime, the LLM performs these checks semantically during `audit`, `critique`, and any refine/enhance command. Apply the same eye the detector would.

**How to use**: When running `/impeccable audit` or `/impeccable critique`, walk through each category. For each rule, ask "do I see this in the current artifact?" If yes, mark it as a finding with severity (P0-P3) per the `audit` scoring rubric.

---

## A. AI slop tells (the ones every model reaches for)

These are the defaults that make a design read "AI-generated" without anyone naming why. None of these is a default; some are outright bans.

### A1. Card-grid reflex (`ban-identical-card-grids`, `layout-cards-lazy`)

- **Tell**: Three or more same-size cards, each with icon + heading + 2 lines of text, in a uniform grid. The page scaffold that says "I didn't decide."
- **Ban**: Nested cards (cards inside cards). Always wrong.
- **Fix**: Use one hero card or feature; let the rest be prose, lists, asymmetric content blocks. Vary card sizes and densities.

### A2. Hero-metric reflex (`ban-hero-metric`)

- **Tell**: Big number + small label + supporting stats + accent color, the analytics-dashboard cliché.
- **Fix**: Pick a different composition. If metrics matter, treat the dashboard itself as the page; the hero is for orientation, not a sales template.

### A3. Kicker / eyebrow on every heading (`ban-eyebrow-on-every-section`)

- **Tell**: A small uppercase label (e.g. "FEATURES") sitting above a larger heading.
- **Ban**: This one is absolute. No brief earns it back. The heading carries its own weight.
- **Fix**: Delete the kicker. Let the heading speak. If hierarchy is unclear, increase the heading's contrast, not its prologue.

### A4. Section number markers (`ban-numbered-section-markers`)

- **Tell**: Big "01", "02", "03" sitting beside each section heading as if the reader needs the count.
- **Fix**: Remove unless the sequence itself carries information the reader needs (e.g. "step 3 of 5"). Even then, use small typeset, not display-sized.

### A5. Modal for a non-modal task (`reflex-modal-by-reflex`)

- **Tell**: A modal dialog opens for a task that doesn't need protected focus or full attention. Form, filter, sign-in as a modal.
- **Fix**: Use a side panel, inline disclosure, or a dedicated route. Modals are for confirmations and critical interrupts only.

### A6. Gradient text (`ban-gradient-text`)

- **Tell**: `background: linear-gradient(...); -webkit-background-clip: text; color: transparent` on a heading.
- **Fix**: Emphasis comes from weight, size, or color, not from a gradient pretending to be a material. If the gradient is the design, make it an image.

### A7. Glassmorphism as decoration (`ban-glassmorphism-default`)

- **Tell**: `backdrop-filter: blur(...)` on a card that doesn't need to be a frosted panel.
- **Fix**: Use glass only where the background literally has content the user needs to see through it. Frosted cards on flat backgrounds read as costume.

### A8. Side-stripe borders (`ban-side-stripe-borders`)

- **Tell**: A 2-6px colored `border-left` or `border-right` on a card, list item, callout, or alert, especially with `border-radius: 0`.
- **Fix**: Use background tint, full thin border, or no accent at all. Vertical colored stripes are the "tab bar" or "status pill" tell.

### A9. Hard offset shadows (`ban-hard-offset-shadow`)

- **Tell**: `box-shadow: 4px 4px 0 black` or similar zero-blur offset shadows, especially repeated.
- **Fix**: Use soft blurred shadows (offset + blur ≥ 4px) for depth. The block shadow is a costume, not a depth system. If the world is genuinely neobrutalist, own it everywhere; otherwise drop the stripe.

### A10. Decorative chrome (sparklines, rings, etc.) (`reflex-decorative-chrome`)

- **Tell**: Sparklines, progress rings, soft-shadowed rounded rectangles standing in for content the page doesn't have.
- **Fix**: Show real content or empty states honestly. A page full of placeholder chrome is worse than a page with one real thing.

### A11. Monospace as technical costume (`reflex-mono-as-technical`)

- **Tell**: Monospace font for non-code, non-data, non-measurement text, "to look technical."
- **Fix**: Monospace is for code, data, and measurement. For product copy, use the body's serif or sans with appropriate weight.

### A12. System display face (`ban-system-display-face`)

- **Tell**: Impact, Arial Black, Helvetica Neue Bold, or platform-default sans for a hero heading that wants to feel "owned."
- **Fix**: Source and self-host a face whose character matches the approved lettering. The closest installed font is a failure, not a fallback.

### A13. Unicode glyphs as icons (`ban-glyph-icons`)

- **Tell**: Emoji (📁 ⚙️ ✓) or Unicode block characters (→ ▲ ●) standing in for an icon system.
- **Fix**: Icons are drawn — from a real library (Lucide, Phosphor, Heroicons) or authored SVG — in one consistent stroke and weight. Emoji render unpredictably across platforms and break the design's color story.

### A14. Theme by habit (`reflex-theme-by-habit`)

- **Tell**: Light or dark mode picked because "this is a developer tool" or "this is a marketing site."
- **Fix**: Pick from the use scene: who, where, under what ambient light. SREs on call in the dark need a different choice than a portfolio viewed in a sunlit cafe.

---

## B. Page scaffold tells

### B1. Flat type hierarchy (`flat-type-hierarchy`)

- **Tell**: Body and heading are the same size or weight, with only color or weight-100 differentiating them. Five levels of "h1" through "h5" all rendering as 16px regular.
- **Fix**: Establish a clear type scale. Body 1rem, h3 ~1.25rem, h2 ~1.5rem, h1 ~2rem, display ~3rem+. Weight steps: 400 / 500 / 600. Tracking floor -0.04em on display sizes.

### B2. Icon-tile stack (`icon-tile-stack`)

- **Tell**: A small colored rounded square with a white icon, sitting above every heading in every section.
- **Fix**: The icon should appear once or twice on the page, not on every section. Sections without icon tiles are allowed.

### B3. Three-up feature grid with the same structure (`three-up-feature-grid`)

- **Tell**: Three columns, each with: icon tile + heading + paragraph + "Learn more" link. Repeated across the page.
- **Fix**: Vary the rhythm. One feature is a hero, another is a small note, another is a screenshot. Asymmetric content blocks beat a grid.

---

## C. Color & contrast

### C1. Low contrast text (`low-contrast`)

- **Tell**: Body or placeholder text below 4.5:1 contrast. Large text (18px+ or 14px bold+) below 3:1.
- **Fix**: Tint secondary text from the surface hue (not gray) to keep it readable on colored backgrounds. Run a contrast check.

### C2. Glow halos (`color-no-glow-halo`)

- **Tell**: `box-shadow: 0 0 N px color` with zero offset — the floating halo, especially on buttons or images.
- **Fix**: Shadows carry an offset and a soft blur. A zero-offset colored halo is decoration, not depth.

### C3. Gray text on colored backgrounds

- **Tell**: A neutral gray paragraph on a colored card or hero. Looks like unstyled body copy.
- **Fix**: Tint from the surface hue. A green surface wants a green-tinted neutral, not a 50% gray.

### C4. Tinted neutrals ignored

- **Tell**: Using pure black (#000) and pure white (#fff) for text and surfaces when the palette has a tint.
- **Fix**: Tinted neutrals. The palette's neutral scale is a defined token; reach for it, not for "white."

---

## D. Typography

### D1. Body measure out of range (`typo-floor`)

- **Tell**: Body text wider than 75 characters per line, or narrower than 45.
- **Fix**: Use `max-width: 65ch` (or `min(75ch, 100%)`) on prose containers. Test zoom and font loading.

### D2. Display type over 6rem (`typo-floor`)

- **Tell**: Hero headings above 6rem that overflow on common laptop screens.
- **Fix**: Display max 6rem; use `clamp(2.5rem, 7vw, 6rem)` for fluid sizing. Test every breakpoint.

### D3. Tracking tighter than -0.04em (`typo-codex-tracking-repeat`)

- **Tell**: Heading tracking at -0.05em or tighter. The "all-caps squished" tell.
- **Fix**: Tracking floor -0.04em. -0.02 to -0.03em usually reads better. Stop at -0.04em.

### D4. Text overflow (`ban-text-overflow`)

- **Tell**: Long untranslated strings clipped with `text-overflow: ellipsis` instead of designing for the longest real case. Or content that doesn't reflow at zoom 200%.
- **Fix**: Run the real copy at every breakpoint. If overflow is unavoidable, design the overflow state, don't ship a clipped state.

### D5. Skipped heading levels

- **Tell**: h1 → h3 with no h2. Or h2 used before h1.
- **Fix**: Heading hierarchy is semantic, not visual. Use h1 once, h2 for sections, h3 for subsections. Style them differently, but the order matters for a11y and SEO.

---

## E. Motion

### E1. Same entrance on every section (`motion-no-section-fade`)

- **Tell**: Every section fades in from `opacity: 0; translateY(20px)` on scroll, all the same.
- **Fix**: One authored moment — not scattered effects, not one identical entrance on every section. Pick one place to be cinematic; let the rest arrive without ceremony.

### E2. Linear or bouncy easing

- **Tell**: `transition-timing-function: linear` or `cubic-bezier(.68,-.55,.27,1.55)` (the bounce / elastic curve).
- **Fix**: Exponential ease-out from an already-visible default. Bounce and elastic feel dated. Aim for `cubic-bezier(0.16, 1, 0.3, 1)` (the modern ease-out-expo).

### E3. Motion material is only transform + opacity (`motion-materials-palette`)

- **Tell**: All motion uses `transform` and `opacity` exclusively, no `filter`, `clip-path`, `mask`, or `backdrop-filter`.
- **Fix**: Reach past transform and opacity. Blur, clip-path, mask, and shadow belong to the palette when they stay smooth. They're tools, not crutches.

### E4. Image-on-hover (`interaction-gemini-no-image-hover`)

- **Tell**: A product image that scales, rotates, or moves on `hover` of itself or its parent.
- **Fix**: The image is not an action target. Give the container the feedback. The image stays still.

### E5. No `prefers-reduced-motion` alternative

- **Tell**: Heavy animation with no `prefers-reduced-motion: reduce` media query alternative that preserves the state change.
- **Fix**: Honor the user's motion preference. Reduce or remove non-essential motion. Preserve state and hierarchy. Don't kill it with `0.01ms` global — that's lazy.

---

## F. Layout & spacing

### F1. Inconsistent spacing scale (`layout-spacing-rhythm`)

- **Tell**: Random values (3px, 11px, 19px) instead of a spacing scale.
- **Fix**: Use a spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96. All spacing reads from the scale. No values in between.

### F2. Same space above and below headings

- **Tell**: `margin: 16px 0` on every heading. No visual hierarchy.
- **Fix**: More space above a heading than below it. The heading belongs to the section that follows, not the one that ends.

### F3. Cards lazy as containers (`layout-cards-lazy`)

- **Tell**: Every group of related content is a card, even when a list or grid would do.
- **Fix**: Use cards sparingly. A list with proper spacing, a typographic heading + paragraph, an asymmetric block — all beat another card.

### F4. Ghost card (`ban-codex-ghost-card`)

- **Tell**: A 1px border under a wide soft shadow, or a 1px border combined with a subtle tint — the card that's afraid to commit.
- **Fix**: Declare elevation once. Border or shadow, not both for a single card. If you need a soft shadow, drop the border; if you need a border, skip the shadow.

### F5. Over-rounded cards (`ban-codex-over-round`)

- **Tell**: Card radius above 16px, or pills used for content cards instead of small controls.
- **Fix**: Card radii 12-16px. Pills (full radius) are for buttons, tags, status indicators — not for content cards.

### F6. Section dividers everywhere

- **Tell**: A horizontal rule, a thin line, or a faded "—" between every section.
- **Fix**: White space is the divider. Add a rule only when sections have the same background and need help.

---

## G. Components

### G1. Buttons with arbitrary padding

- **Tell**: `padding: 7px 13px` or other off-scale values. Sizes that don't follow a height system.
- **Fix**: Standard button heights: 32px (sm), 40px (md), 48px (lg). Standard padding: 16/24 horizontal for md, 24/32 for lg.

### G2. Form inputs without labels

- **Tell**: `<input>` with a `placeholder` but no `<label>`. Placeholders disappear on focus.
- **Fix**: Always pair an input with a label. The label can be visually hidden, but it's there for screen readers and persistent guidance.

### G3. Icon-only buttons without `aria-label`

- **Tell**: A trash icon button with no accessible name.
- **Fix**: `aria-label="Delete"` or wrap the icon in a `<button>` with descriptive text. Every interactive control needs a name.

### G4. Touch targets < 44×44px

- **Tell**: Small icon buttons, dense list rows, inline action links.
- **Fix**: Min 44×44px tap target on mobile. Pad the visual element with transparent space if the icon is small.

### G5. Disabled state indistinguishable

- **Tell**: A disabled button that looks identical to the active one except for slightly grayer text.
- **Fix**: Reduce opacity to 0.5, change cursor to `not-allowed`, prevent pointer events. Make the state visible.

### G6. Loading state with no skeleton

- **Tell**: Layout shifts when content loads, or a spinner replaces the entire region.
- **Fix**: Skeleton screens match the loaded content's shape. Reserve space; let the content swap in. No layout shift.

---

## H. Accessibility (a11y)

### H1. Color-only meaning

- **Tell**: A red border for errors, a green check for success — with no icon, no text, no other signal.
- **Fix**: Add an icon (✓, ⚠) and a label. Color-blind users can't distinguish the state from color alone.

### H2. Missing focus indicators

- **Tell**: `:focus { outline: none }` with no replacement.
- **Fix**: Always provide a visible focus indicator. `:focus-visible` with a 2px ring matching the brand.

### H3. Keyboard traps

- **Tell**: A modal that doesn't restore focus on close, or a widget that loops focus without escape.
- **Fix**: Modal management: focus the first focusable on open, trap focus inside, restore focus to the trigger on close.

### H4. Missing landmarks

- **Tell**: A page built entirely of `<div>`s with no `<main>`, `<nav>`, `<header>`, `<footer>`.
- **Fix**: Use semantic landmarks. Screen reader users navigate by them. `<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`.

### H5. Missing `lang` on `<html>`

- **Tell**: `<html>` without `lang` attribute.
- **Fix**: Always set `lang="en"` (or the appropriate language) on `<html>`.

### H6. Images without `alt`

- **Tell**: `<img src="...">` with no `alt`. Decorative images with `alt="image"` or `alt="photo"`.
- **Fix**: Informative images get descriptive `alt`. Decorative images get `alt=""` (empty string, not missing).

### H7. Form errors not announced

- **Tell**: A form submits with a red border on invalid fields but no `aria-invalid`, no `aria-describedby`, no error message.
- **Fix**: Pair each error with text. Connect via `aria-describedby`. Set `aria-invalid="true"` on the field.

### H8. Auto-playing media

- **Tell**: Video or audio that plays on page load with sound.
- **Fix**: Never autoplay with sound. Muted autoplay is allowed but should be pausable. Respect `prefers-reduced-motion` and `prefers-reduced-data`.

---

## I. Interaction

### I1. Hover-only state

- **Tell**: A navigation menu that only opens on hover, with no click handler.
- **Fix**: Click (or tap) also opens. Touch users don't have hover. Use both `mouseenter` and `click` (or just click + `:focus-within`).

### I2. Tap target too small

- **Tell**: Inline link in a paragraph at 12px with no padding.
- **Fix**: Pad touch targets. Min 44×44px.

### I3. No keyboard fallback for custom widgets

- **Tell**: A drag-and-drop list that can't be reordered by keyboard.
- **Fix**: Every custom widget needs a keyboard alternative. ARIA roles + arrow key handling.

### I4. State changes without feedback

- **Tell**: A "Save" button that does nothing visible after click.
- **Fix**: Always provide feedback. Toast, inline message, disabled state, redirect — anything that says "I heard you."

### I5. Destructive action without confirmation

- **Tell**: A "Delete" button that fires immediately on click.
- **Fix**: Confirmation step for destructive actions. Or undo. Never silent destruction.

---

## J. Content & copy

### J1. "Boost your productivity"

- **Tell**: Generic SaaS copy. "Boost," "empower," "seamless," "robust," "elevate."
- **Fix**: Write in the product's own language. Show what the product does, not what category it belongs to.

### J2. Lorem ipsum in shipped work

- **Tell**: "Lorem ipsum dolor sit amet" appearing on a real page.
- **Fix**: Use real content, even if abbreviated. Lorem ipsum is a placeholder, not a design.

### J3. Error messages that don't say what to do

- **Tell**: "An error occurred. Please try again."
- **Fix**: Name the problem and the recovery. "We couldn't save your changes. Check your connection and try again, or copy your work to a safe place."

### J4. Buttons that don't name their action

- **Tell**: A "Submit" or "Click here" or "OK" button.
- **Fix**: The button says what it does. "Send invite." "Save changes." "Create project."

### J5. Inconsistent terminology

- **Tell**: "User" in one place, "Member" in another, "Account" in a third, for the same concept.
- **Fix**: Pick one term per concept. Use it everywhere. Document the glossary if it gets long.

---

## K. Brief & context

### K1. "Brief says X, I'll do Y" (`floor-not-ceiling`)

- **Tell**: Reaching for a default when the brief is clear.
- **Fix**: The brief wins. Pinned aesthetics, eras, materials, fonts, palettes are honored even when they conflict with a habit warning. Redirecting a clear brief toward your taste is failure.

### K2. Incomplete brief coverage (`floor-brief-coverage`)

- **Tell**: A page that doesn't deliver on every requirement the brief mentioned.
- **Fix**: Walk the brief. Every requirement should be present and findable within seconds.

### K3. Code-driven pseudo-design

- **Tell**: "I'll just throw in a card with an icon and call it a feature section."
- **Fix**: Code is the result, not the source. Design the section's purpose, then build it. A card with an icon is rarely the answer.

---

## How to score findings

When you spot a rule being violated, log it as a finding:

```yaml
- rule: <id from this file, e.g. ban-gradient-text>
  category: <slop | quality>
  severity: <P0 | P1 | P2 | P3>
  location: <file:line or component name>
  snippet: <the violating code or pattern>
  fix: <one-line suggested correction>
```

The `audit` command uses these findings to build the 5-dimension score (a11y / performance / theming / responsive / implementation integrity). The `critique` command uses them for heuristic scoring with emotion + clarity + craft dimensions.

For most refine/enhance commands (polish, quieter, bolder, distill, etc.), findings drive the fix list — but each command also has its own focus and may skip categories that don't apply to the brief.
