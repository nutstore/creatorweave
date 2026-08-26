# FileComparison Component - Quick Start Guide

## 🚀 Installation

No installation needed! The component uses existing dependencies.

## 📦 Import

```typescript
import { FileComparison } from '@/components/code-viewer'
```

## 🎯 Basic Usage

```tsx
function App() {
  return (
    <div className="h-[600px]">
      <FileComparison
        before={`function hello() {
  console.log("Hello");
}`}
        after={`function hello() {
  console.log("Hello, World!");
}`}
        language="javascript"
        filename="hello.js"
      />
    </div>
  )
}
```

## ✨ Features Demo

### Feature 1: Split View (Default)

```tsx
<FileComparison
  before={codeBefore}
  after={codeAfter}
  viewMode="split" // Side-by-side comparison
/>
```

### Feature 2: Unified View

```tsx
<FileComparison
  before={codeBefore}
  after={codeAfter}
  viewMode="unified" // Single panel with inline changes
/>
```

### Feature 3: Change Navigation

Use the arrow buttons in the header to jump between changes:

- **← Previous**: Go to earlier change
- **→ Next**: Go to later change
- **Badge**: Shows total change count

### Feature 4: Copy Changes

Click the copy button to copy all added lines:

- Copies only green (added) lines
- Shows checkmark on success
- Auto-clears after 2 seconds

### Feature 5: Scroll Synchronization

In split view, scrolling one panel automatically scrolls the other:

- Vertical scrolling synced
- Horizontal scrolling synced
- Perfect for comparing aligned code

## 🎨 Real-World Example

```tsx
import { useState } from 'react'
import { FileComparison } from '@/components/code-viewer'

export function CodeReviewPanel() {
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split')

  const originalCode = `// Old implementation
function fetchUser(id) {
  var users = fetch('/users/' + id)
    .then(function(res) {
      return res.json()
    })
    .then(function(data) {
      return data
    })
  return users
}`

  const refactoredCode = `// New implementation with async/await
async function fetchUser(id: number): Promise<User> {
  try {
    const response = await fetch(\`/users/\${id}\`)
    const data = await response.json()
    return data
  } catch (error) {
    console.error('Failed to fetch user:', error)
    throw error
  }
}`

  return (
    <div className="h-[700px]">
      <div className="mb-4 flex items-center gap-4">
        <h2 className="text-lg font-bold">Code Review: Refactoring</h2>
        <button
          onClick={() => setViewMode(viewMode === 'split' ? 'unified' : 'split')}
          className="rounded bg-blue-500 px-3 py-1 text-sm text-white"
        >
          Toggle View
        </button>
      </div>

      <FileComparison
        before={originalCode}
        after={refactoredCode}
        language="typescript"
        filename="user-service.ts"
        viewMode={viewMode}
      />
    </div>
  )
}
```

## 📋 Props Reference

| Prop          | Type                   | Required | Default   | Description                  |
| ------------- | ---------------------- | -------- | --------- | ---------------------------- |
| `before`      | `string`               | ✅       | -         | Original file content        |
| `after`       | `string`               | ✅       | -         | Modified file content        |
| `language`    | `string`               | ❌       | `'text'`  | Syntax highlighting language |
| `filename`    | `string`               | ❌       | `'file'`  | Display name in header       |
| `viewMode`    | `'split' \| 'unified'` | ❌       | `'split'` | Initial view mode            |
| `lineNumbers` | `boolean`              | ❌       | `true`    | Show line numbers            |
| `className`   | `string`               | ❌       | -         | Additional CSS classes       |

## 🎭 Language Support

Common languages:

- `'typescript'`, `'javascript'`, `'tsx'`, `'jsx'`
- `'python'`, `'rust'`, `'go'`, `'java'`
- `'html'`, `'css'`, `'scss'`
- `'json'`, `'yaml'`, `'toml'`
- `'markdown'`, `'bash'`, `'sql'`
- And 80+ more!

## 🎨 Styling

The component uses TailwindCSS. You can add custom styles:

```tsx
<FileComparison before={before} after={after} className="rounded-lg border-2 shadow-lg" />
```

## 🧪 Testing

```tsx
import { render, screen } from '@testing-library/react'
import { FileComparison } from '@/components/code-viewer'

test('renders file comparison', () => {
  render(<FileComparison before="old" after="new" filename="test.js" />)

  expect(screen.getByText('test.js')).toBeInTheDocument()
})
```

## 💡 Tips

1. **Always wrap in a container with height**: The component needs a defined height to scroll properly
2. **Use correct language codes**: E.g., `'typescript'` not `'ts'`
3. **Consider file size**: For very large files (>2000 lines), consider disabling line numbers
4. **Responsive**: Component works on mobile (panels stack vertically)
5. **Accessibility**: All buttons are keyboard accessible

## 🐛 Troubleshooting

**Problem**: Component looks squished
**Solution**: Ensure parent container has explicit height: `h-[600px]` or `h-screen`

**Problem**: No syntax highlighting
**Solution**: Check language code is valid (e.g., `'javascript'`, `'python'`)

**Problem**: Scroll not synced
**Solution**: Both panels need overflow content to enable scrolling

## 📚 More Examples

See `FileComparison.example.tsx` for:

- Basic usage
- Split vs unified view
- Without line numbers
- Large file comparison
- Custom styling
- Dynamic content

## 🎓 Learn More

- [Full Documentation](./README.md)
- [Visual Guide](./VISUAL_GUIDE.md)
- [Implementation Details](./IMPLEMENTATION.md)

---

**Status**: ✅ Production Ready
**Version**: 1.0.0
**Author**: Frontend Developer
**Date**: 2026-02-08
