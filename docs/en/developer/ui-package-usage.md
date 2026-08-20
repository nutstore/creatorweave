---
title: UI Package Usage
order: 105
---

# @creatorweave/ui Usage Guide

This document explains how to use components and styles from the `@creatorweave/ui` shared package in the web app.

## Overview

`@creatorweave/ui` is a component library built on top of shadcn/ui and Radix UI, providing a set of design-consistent React components.

## Installation

```bash
# At the workspace root
pnpm install

# The UI package is automatically linked to the web app
```

## Configuration

### 1. Tailwind configuration

**Key point**: make sure the web app's Tailwind config includes the UI package source path.

```javascript
// web/tailwind.config.js
import { createBaseConfig } from '@creatorweave/config/tailwind'

export default createBaseConfig({
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../packages/ui/src/**/*.{js,ts,jsx,tsx}',  // This path is required
  ],
  theme: {
    extend: {
      // Custom config
    },
  },
})
```

**Why is this needed?**
- Tailwind CSS uses JIT mode and scans content files for class names to generate the corresponding styles
- If the UI package sources are not in the content paths, their Tailwind classes are never processed
- Result: components render without styles

### 2. Import components

```typescript
import {
  BrandDialog,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandInput,
  BrandButton,
} from '@creatorweave/ui'
```

## Component Usage Patterns

### Dialog example

```tsx
import React from 'react'
import {
  BrandDialog,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandDialogBody,
  BrandDialogFooter,
  BrandDialogClose,
} from '@creatorweave/ui'

interface MyDialogProps {
  open: boolean
  onOpenChange?: (open: boolean) => void
}

export const MyDialog: React.FC<MyDialogProps> = ({ open, onOpenChange }) => {
  return (
    <BrandDialog open={open} onOpenChange={onOpenChange}>
      <BrandDialogContent>
        <BrandDialogHeader>
          <BrandDialogTitle>Title</BrandDialogTitle>
          <BrandDialogClose />
        </BrandDialogHeader>

        <BrandDialogBody>
          {/* content */}
        </BrandDialogBody>

        <BrandDialogFooter>
          {/* buttons */}
        </BrandDialogFooter>
      </BrandDialogContent>
    </BrandDialog>
  )
}
```

### Important notes

1. **Must be wrapped in BrandDialog**
   - `BrandDialogContent` uses a Portal internally and must be used within a `BrandDialog` context
   - Otherwise you get: "DialogPortal must be used within Dialog"

2. **Interface naming convention**
   - Use `onOpenChange?: (open: boolean) => void` instead of `onClose`
   - This matches the Radix UI API convention

3. **z-index layers**
   - Overlay: `z-50`
   - Content: `z-[51]` (must be above the overlay)
   - Ensures content always renders above the overlay

## Style Notes

### Tailwind class name syntax

Tailwind supports several equivalent syntaxes:

| Syntax type | Example | Notes |
|---------|------|------|
| Standard class | `left-1/2` | Uses a predefined fractional value |
| Arbitrary value | `left-[50%]` | Arbitrary value in square brackets (preferred here) |
| Combined arbitrary | `shadow-[0_4px_16px_rgba(0,0,0,0.06)]` | Complex style values |

**Note**: both syntaxes are valid. This project's UI package consistently uses the arbitrary-value syntax (e.g. `left-[50%]`).

### Troubleshooting missing styles

If component styles don't show up:

1. **Check the Tailwind content config**
   ```bash
   # Confirm tailwind.config.js includes the UI package path
   ```

2. **Restart the dev server**
   ```bash
   # Tailwind scans files at startup
   pnpm dev
   ```

3. **Check the browser console**
   - Inspect the element's computed styles
   - Confirm Tailwind classes are actually applied

4. **Check the build output**
   ```bash
   # Verify the CSS file contains the expected styles
   ```

## Available Components

### Modal/Dialog
- `BrandDialog` - dialog root component
- `BrandDialogContent` - dialog content container
- `BrandDialogHeader` - dialog header
- `BrandDialogTitle` - dialog title
- `BrandDialogBody` - dialog body
- `BrandDialogFooter` - dialog footer
- `BrandDialogClose` - close button

### Form
- `BrandInput` - input field
- `BrandButton` - button
- `BrandLabel` - form label
- `BrandCheckbox` - checkbox
- `BrandSwitch` - toggle switch

### Others
- See the `packages/ui/src/components/` directory for more components

## Troubleshooting

### Dialog shows only the overlay, no content

**Symptom**: clicking to open a dialog shows only the translucent overlay, not the dialog itself.

**Cause**: Tailwind JIT didn't scan the UI package sources, so the styles were never generated.

**Fix**: add this in `web/tailwind.config.js`:
```javascript
content: [
  // ... other paths
  '../packages/ui/src/**/*.{js,ts,jsx,tsx}',
]
```

### "DialogPortal must be used within Dialog"

**Cause**: `BrandDialogContent` is not wrapped by `BrandDialog`.

**Fix**:
```tsx
// Wrong
return <BrandDialogContent>...</BrandDialogContent>

// Correct
return (
  <BrandDialog open={open} onOpenChange={onOpenChange}>
    <BrandDialogContent>...</BrandDialogContent>
  </BrandDialog>
)
```

### Class names not taking effect

**Checklist**:
1. Confirm the class name is spelled correctly
2. Confirm the Tailwind content config includes the UI package path
3. Restart the dev server
4. Clear the browser cache

## Development Workflow

### Modifying UI components

1. Edit components in `packages/ui/src/components/`
2. Run `pnpm dev` in the UI package directory to watch for changes
3. The web app picks up updates automatically (pnpm workspace linking)

### Adding a new component

1. Create the component in `packages/ui/src/components/`
2. Export it from `packages/ui/src/index.ts`
3. Import and use it in the web app

## Related Resources

- [Radix UI Dialog docs](https://www.radix-ui.com/docs/primitives/components/dialog)
- [Tailwind CSS docs](https://tailwindcss.com/docs)
- [shadcn/ui docs](https://ui.shadcn.com)
