# FileComparison Component - Visual Guide

## Component Structure

```
┌─────────────────────────────────────────────────────────┐
│  FileComparison Component                               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Header                                            │  │
│  │  [filename] [language] [changes badge]           │  │
│  │  [View Toggle] [Prev] [Next] [Copy]             │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────┬──────────────────────┐       │
│  │  Original Panel      │  Modified Panel       │       │
│  │  ┌────┬────────────┐ │  ┌────┬────────────┐ │       │
│  │  │ 1  │ line       │ │  │ 1  │ line       │ │       │
│  │  ├────┼────────────┤ │  ├────┼────────────┤ │       │
│  │  │ 2  │ old        │ │  │ 2  │ new        │ │       │
│  │  │    │ (red bg)   │ │  │    │ (green bg) │ │       │
│  │  ├────┼────────────┤ │  ├────┼────────────┤ │       │
│  │  │ 3  │ unchanged  │ │  │ 3  │ unchanged  │ │       │
│  │  └────┴────────────┘ │  └────┴────────────┘ │       │
│  │                      │                      │       │
│  │  ← synchronized →    │  ← synchronized →    │       │
│  │     scrolling         │      scrolling        │       │
│  └──────────────────────┴──────────────────────┘       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Color Coding

| Type        | Background          | Line Number        | Example           |
| ----------- | ------------------- | ------------------ | ----------------- |
| **Added**   | 🟢 `bg-green-50/30` | `text-green-700`   | New line inserted |
| **Removed** | 🔴 `bg-red-50/30`   | `text-red-700`     | Old line deleted  |
| **Context** | ⚪ Default          | `text-neutral-400` | Unchanged line    |

## Header Controls

```
┌────────────────────────────────────────────────────────┐
│  hello.js  javascript  [3 changes]                     │
│                                                         │
│  [Split/Unified] [← Prev] [Next →] [📋 Copy]          │
└────────────────────────────────────────────────────────┘
```

### Buttons

1. **View Toggle** (Split ↔ Unified)
   - Switches between side-by-side and single panel view
   - Icon changes: `Columns` ↔ `AlignLeft`

2. **Previous Change** (←)
   - Navigate to earlier change
   - Auto-scrolls to change
   - Disabled if no changes

3. **Next Change** (→)
   - Navigate to later change
   - Auto-scrolls to change
   - Disabled if no changes

4. **Copy Button** (📋)
   - Copies all added lines
   - Shows checkmark when copied
   - 2-second success feedback

## Line Number Panel

```
┌─────────┬──────────────────┐
│  Line   │  Content         │
│ Number  │                  │
│         │                  │
│   15    │  function old()  │  ← Context (default)
│         │                  │
│   16    │  return x        │  ← Removed (red)
│         │                  │
│   -     │  function new()  │  ← Added (green)
│         │                  │
│   17    │  return y        │  ← Context
└─────────┴──────────────────┘
```

## View Modes

### Split View (Default)

```
Original                    │ Modified
────────────────────────────┼────────────────────────────
1 function old() {          │ 1 function new() {
2   return x;               │ 2   return y;
3 }                         │ 3 }
```

**Best for**: Side-by-side comparison, refactoring reviews

### Unified View

```
     Original    │    Modified
─────────────────┼─────────────────
1   function old() {    │    function new() {
2   ✓ return x;         │    ✓ return y;
3   }                   │    }
```

**Best for**: Small changes, mobile viewing, focused review

## Change Navigation

```
Current Position: 2/5 changes

    [Previous]  ●●○○○  [Next]
                ↑
           (change 2)
```

- Dots represent all changes
- Filled dot = current position
- Click prev/next to move between changes
- Auto-scrolls to center the change

## Responsive Behavior

### Desktop (≥768px)

```
┌────────────────┬────────────────┐
│  Original      │  Modified       │
│  (50% width)   │  (50% width)    │
└────────────────┴────────────────┘
```

### Mobile (<768px)

```
┌───────────────────────────────┐
│  Original (stacked)           │
├───────────────────────────────┤
│  Modified (stacked)           │
└───────────────────────────────┘
```

## File Size Support

| Size            | Syntax Highlighting   | Performance  |
| --------------- | --------------------- | ------------ |
| < 500 lines     | ✅ Full               | ⚡ Excellent |
| 500-2000 lines  | ✅ Full               | ⚡ Good      |
| 2000-5000 lines | ✅ Full               | 🟡 Fair      |
| \> 5000 lines   | ⚠️ Consider disabling | 🐌 May lag   |

## Accessibility Features

- ✅ Semantic HTML structure
- ✅ ARIA labels on all buttons
- ✅ Keyboard navigation support
- ✅ High contrast colors (WCAG AA)
- ✅ Screen reader friendly
- ✅ Focus indicators on controls

## Performance Optimizations

1. **Lazy Loading**: Shiki imported dynamically
2. **Memoization**: Diff computed only when inputs change
3. **Efficient Rendering**: React reconciliation
4. **Scroll Sync**: Direct DOM manipulation (no re-renders)
5. **Virtual Scrolling Ready**: Can be extended for huge files

## Integration Example

```tsx
import { FileComparison } from '@/components/code-viewer'

export default function CodeReview() {
  return (
    <div className="h-screen">
      <FileComparison
        before={originalContent}
        after={modifiedContent}
        language="typescript"
        filename="review.ts"
        viewMode="split"
      />
    </div>
  )
}
```

## Common Use Cases

### 1. Code Review

```tsx
<FileComparison before={original} after={pullRequest} language="typescript" />
```

### 2. Refactoring Display

```tsx
<FileComparison before={beforeRefactor} after={afterRefactor} viewMode="unified" />
```

### 3. Educational Content

```tsx
<FileComparison before={badCode} after={goodCode} language="javascript" filename="lesson-1.js" />
```

### 4. Configuration Changes

```tsx
<FileComparison before={oldConfig} after={newConfig} language="json" lineNumbers={false} />
```

## Tips & Tricks

1. **Use Split View** for comparing large files
2. **Use Unified View** for reviewing small changes
3. **Hide line numbers** for cleaner UI on small changes
4. **Custom styling** via `className` prop for integration
5. **Dynamic updates**: Change props to re-compute diff
6. **Copy feature** extracts only additions (useful for patches)

## Troubleshooting

### Issue: No highlighting

**Solution**: Ensure language is correct (e.g., 'typescript', not 'ts')

### Issue: Poor performance

**Solution**: Disable line numbers or syntax highlighting for large files

### Issue: Wrong diff

**Solution**: Check line endings (LF vs CRLF) - normalize inputs first

### Issue: Scrolling not synced

**Solution**: Ensure both panels have overflow content
