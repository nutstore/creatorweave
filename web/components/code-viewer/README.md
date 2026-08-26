# FileComparison Component

A powerful React component for displaying file differences with syntax highlighting, supporting both unified and split view modes.

## Features

- **Dual View Modes**: Toggle between unified and split view
- **Syntax Highlighting**: Powered by Shiki for 100+ languages
- **Change Navigation**: Jump between changes with prev/next buttons
- **Scroll Synchronization**: Panels scroll together in split view
- **Line Numbers**: Optional line number display
- **Change Indicators**: Color-coded additions (green), deletions (red), and modifications (yellow)
- **Copy Changes**: Quick copy of added lines to clipboard
- **Responsive Design**: Works on mobile and desktop

## Installation

The component is part of the creatorweave project. Ensure you have the required dependencies:

```bash
pnpm install shiki
```

## Usage

### Basic Example

```tsx
import { FileComparison } from '@/components/code-viewer'

function App() {
  const before = `function hello() {
  console.log("Hello");
}`

  const after = `function hello() {
  console.log("Hello, World!");
}`

  return (
    <div className="h-[600px]">
      <FileComparison before={before} after={after} language="javascript" filename="hello.js" />
    </div>
  )
}
```

## Props

### FileComparisonProps

| Prop          | Type                   | Default      | Description                                                                   |
| ------------- | ---------------------- | ------------ | ----------------------------------------------------------------------------- |
| `before`      | `string`               | **required** | Original file content                                                         |
| `after`       | `string`               | **required** | Modified file content                                                         |
| `language`    | `string`               | `'text'`     | Language for syntax highlighting (e.g., 'typescript', 'javascript', 'python') |
| `filename`    | `string`               | `'file'`     | Display name shown in header                                                  |
| `viewMode`    | `'unified' \| 'split'` | `'split'`    | Initial view mode                                                             |
| `lineNumbers` | `boolean`              | `true`       | Show/hide line numbers                                                        |
| `className`   | `string`               | `undefined`  | Additional CSS classes                                                        |

## View Modes

### Split View (default)

Displays files side-by-side with synchronized scrolling:

```tsx
<FileComparison before={original} after={modified} viewMode="split" />
```

### Unified View

Shows changes in a single panel with inline indicators:

```tsx
<FileComparison before={original} after={modified} viewMode="unified" />
```

## Supported Languages

The component supports all languages available in Shiki, including:

- JavaScript/TypeScript/JSX/TSX
- Python
- Rust
- Go
- Java
- C/C++
- HTML/CSS/SCSS
- JSON/YAML
- Markdown
- Bash
- SQL
- And 80+ more

See [Shiki documentation](https://shiki.style/languages) for the full list.

## Diff Algorithm

The component implements a simplified **Myers diff algorithm**, which:

- Computes the shortest edit script between two text files
- Handles insertions, deletions, and modifications
- O(ND) complexity where N is the sum of line counts
- Suitable for files up to several thousand lines

### Algorithm Details

1. **Edit Graph**: Builds a graph representing all possible edit paths
2. **Dynamic Programming**: Uses the greedy algorithm to find optimal path
3. **Backtracking**: Extracts diff lines by walking back from the end
4. **Line Classification**: Marks each line as added, removed, or context

## Color Coding

| Type       | Color             | Meaning                 |
| ---------- | ----------------- | ----------------------- |
| 🟢 Green   | `bg-green-50/30`  | Added lines             |
| 🔴 Red     | `bg-red-50/30`    | Removed lines           |
| 🟡 Yellow  | `bg-yellow-50/30` | Modified lines          |
| ⚪ Neutral | Default           | Unchanged context lines |

## Features

### Change Navigation

Navigate between changes using the arrow buttons:

- **Previous**: Jump to the previous change
- **Next**: Jump to the next change
- Changes are highlighted and scrolled into view
- Change counter shows total number of changes

### Copy to Clipboard

Click the copy button to copy all added lines:

```typescript
// Copies only added lines to clipboard
const changedContent = diffLines
  .filter((line) => line.type === 'added')
  .map((line) => line.content)
  .join('\n')
```

### Scroll Synchronization

In split view, scrolling one panel automatically scrolls the other:

```typescript
const handleScroll = (source: 'before' | 'after') => (e) => {
  const targetElement = source === 'before' ? afterRef : beforeRef
  targetElement.scrollTop = e.currentTarget.scrollTop
  targetElement.scrollLeft = e.currentTarget.scrollLeft
}
```

## Performance Considerations

- **Small files** (<500 lines): Syntax highlighting enabled by default
- **Large files**: Consider disabling syntax highlighting or line numbers
- **Memory usage**: O(N) where N is the total number of lines
- **Rendering**: Uses virtual scrolling concepts for efficient updates

## Accessibility

- Semantic HTML structure
- Keyboard navigation support
- ARIA labels for interactive elements
- High contrast color scheme
- Screen reader friendly

## Styling

The component uses TailwindCSS for styling. Key classes:

- Layout: `flex`, `flex-col`, `h-full`
- Colors: `neutral-*` for UI, `red-*`, `green-*`, `yellow-*` for diffs
- Typography: `text-xs`, `text-sm`, `font-medium`
- Borders: `border`, `border-neutral-*`
- Spacing: `px-3`, `py-1.5`, `gap-2`

## Examples

See `FileComparison.example.tsx` for comprehensive usage examples:

1. Basic text comparison
2. Split view mode
3. Unified view mode
4. Without line numbers
5. Large file comparison
6. Custom styling
7. Dynamic content with version control

## Testing

Run tests with:

```bash
pnpm test FileComparison
```

## Browser Support

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- Mobile browsers: ✅ Responsive design

## License

MIT License - part of the creatorweave project

## Contributing

Contributions welcome! Please ensure:

1. All tests pass
2. TypeScript strict mode compliance
3. Accessible markup
4. Responsive design maintained
5. Performance benchmarks met
