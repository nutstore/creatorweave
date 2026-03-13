# Code Intelligence Tools

## Overview

This module provides code intelligence capabilities for the AI-native creator workspace, including symbol extraction, reference finding, and go-to-definition functionality.

## Implemented Tools

### 1. extract_symbols

Extracts code symbols (functions, classes, interfaces, types, imports, exports, variables) from source files.

**Parameters:**

- `path` (required): Relative file path from project root
- `symbol_types` (optional): Array of symbol types to extract. Options: `function`, `class`, `interface`, `type`, `enum`, `const`, `let`, `var`, `import`, `export`

**Returns:**

```json
{
  "file": "src/utils/helpers.ts",
  "language": "typescript",
  "symbolCount": 15,
  "symbols": [
    {
      "name": "processData",
      "type": "function",
      "kind": "function",
      "location": {
        "file": "src/utils/helpers.ts",
        "line": 10,
        "column": 5
      },
      "details": {
        "parameters": "input: string, options?: ProcessOptions"
      }
    },
    {
      "name": "UserService",
      "type": "class",
      "kind": "class",
      "location": {
        "file": "src/utils/helpers.ts",
        "line": 25,
        "column": 1
      },
      "details": {
        "extends": "BaseService"
      }
    }
  ]
}
```

**Usage Example:**

```typescript
const result = await agent.executeTool('extract_symbols', {
  path: 'src/utils/helpers.ts',
  symbol_types: ['function', 'class'],
})
```

### 2. find_references

Locates all references to a symbol across multiple files in the project.

**Parameters:**

- `symbol` (required): Symbol name to search for
- `path` (optional): Subdirectory to search in (default: project root)
- `file_pattern` (optional): Glob pattern to filter files (e.g., "_.ts", "src/\*\*/_.tsx")
- `reference_types` (optional): Filter by reference type. Options: `read`, `write`, `call`, `definition`

**Returns:**

```json
{
  "symbol": "processData",
  "referenceCount": 8,
  "references": [
    {
      "symbol": "processData",
      "file": "src/components/App.tsx",
      "line": 42,
      "column": 15,
      "type": "call",
      "context": "  const result = processData(inputData)"
    },
    {
      "symbol": "processData",
      "file": "src/utils/test.ts",
      "line": 18,
      "column": 8,
      "type": "read",
      "context": "  const fn = processData"
    }
  ]
}
```

**Usage Example:**

```typescript
// Find all references to a function
const result = await agent.executeTool('find_references', {
  symbol: 'processData',
  file_pattern: '*.ts',
})

// Find only call references
const callsOnly = await agent.executeTool('find_references', {
  symbol: 'processData',
  reference_types: ['call'],
})
```

### 3. go_to_definition

Finds where a symbol is defined, handling both local and imported symbols.

**Parameters:**

- `symbol` (required): Symbol name to find definition for
- `file` (required): File path where the symbol is referenced
- `line` (required): Line number in the file where the symbol is referenced

**Returns:**

```json
{
  "symbol": "processData",
  "definition": {
    "file": "src/utils/helpers.ts",
    "line": 10,
    "column": 1,
    "snippet": "export function processData(input: string): number {\n  return input.length\n}"
  }
}
```

**Usage Example:**

```typescript
const result = await agent.executeTool('go_to_definition', {
  symbol: 'processData',
  file: 'src/components/App.tsx',
  line: 42,
})
```

## Supported Languages

- **TypeScript** (.ts, .tsx) - Full support
- **JavaScript** (.js, .jsx, .mjs, .cjs) - Full support
- **Python** (.py) - Basic support (functions, classes, imports)

## Implementation Details

### Technical Approach

The tools use regex-based parsing for simplicity and browser compatibility. This approach:

- ✅ Works in browser environments without native dependencies
- ✅ Fast and lightweight
- ✅ Handles common code patterns
- ⚠️ May not catch all edge cases or complex syntax

### For Production Use

For large-scale production use with complex codebases, consider:

1. **Tree-sitter Integration**: Replace regex with Tree-sitter parsers for accurate parsing
2. **Language Server Protocol (LSP)**: Integrate with LSP for full language support
3. **Caching**: Cache parsed symbols to improve performance
4. **Incremental Updates**: Update symbol cache on file changes

### Limitations

- Regex-based parsing may miss complex or unusual code patterns
- No semantic understanding of scope or type information
- Import resolution is basic (follows relative paths only)
- Limited support for advanced TypeScript features (decorators, namespaces, etc.)

## File Structure

```
web/src/agent/tools/
├── code-intelligence.tool.ts           # Main implementation
└── __tests__/
    └── code-intelligence.tool.test.ts  # Unit tests (37 tests, all passing)
```

## Testing

Run the test suite:

```bash
cd web
npm test -- code-intelligence.tool.test.ts
```

All 37 tests pass, covering:

- Tool definitions and parameters
- Symbol extraction for TypeScript, JavaScript, and Python
- Reference finding with filtering
- Go-to-definition with import resolution
- Error handling and edge cases

## Integration

The tools are automatically registered in the ToolRegistry (`web/src/agent/tool-registry.ts`):

```typescript
import {
  extractSymbolsDefinition,
  extractSymbolsExecutor,
  findReferencesDefinition,
  findReferencesExecutor,
  goToDefinitionDefinition,
  goToDefinitionExecutor,
} from './tools/code-intelligence.tool'

// Registered in registerBuiltins()
this.register(extractSymbolsDefinition, extractSymbolsExecutor)
this.register(findReferencesDefinition, findReferencesExecutor)
this.register(goToDefinitionDefinition, goToDefinitionExecutor)
```

## Future Enhancements

Potential improvements:

1. **Enhanced Language Support**: Add Go, Rust, Java, C#
2. **Semantic Analysis**: Track scope, types, and inheritance
3. **Cross-File Navigation**: Better import chain following
4. **Symbol Renaming**: Safe rename operations with reference updates
5. **Code Completion**: Suggest symbols based on context
6. **Documentation Extraction**: Parse JSDoc, docstrings
7. **Dependency Graphs**: Visualize symbol relationships
8. **Performance**: Incremental parsing and caching

## Example Workflows

### Understanding Code Structure

```typescript
// Extract all symbols from a file
const symbols = await agent.executeTool('extract_symbols', {
  path: 'src/services/UserService.ts',
})

// Find where UserService is used
const references = await agent.executeTool('find_references', {
  symbol: 'UserService',
  file_pattern: '*.ts',
})

// Navigate to definition
const definition = await agent.executeTool('go_to_definition', {
  symbol: 'UserService',
  file: 'src/components/App.tsx',
  line: 15,
})
```

### Refactoring Support

```typescript
// Before renaming a function, find all usages
const usages = await agent.executeTool('find_references', {
  symbol: 'oldFunctionName',
  reference_types: ['call', 'read'],
})

// Update all references safely
for (const ref of usages.references) {
  await agent.executeTool('file_edit', {
    path: ref.file,
    edits: [
      {
        range: {
          start: { line: ref.line - 1, column: ref.column - 1 },
          end: { line: ref.line - 1, column: ref.column - 1 + oldFunctionName.length },
        },
        newText: 'newFunctionName',
      },
    ],
  })
}
```

### Code Navigation

```typescript
// From a usage site, jump to definition
const cursorPosition = { line: 42, column: 15 }
const currentFile = 'src/components/App.tsx'

// Get the symbol at cursor
const symbol = await getSymbolAtPosition(currentFile, cursorPosition)

// Navigate to definition
const definition = await agent.executeTool('go_to_definition', {
  symbol: symbol.name,
  file: currentFile,
  line: cursorPosition.line,
})

// Open file and navigate to location
openFile(definition.file, definition.line)
```

## License

Part of the creatorweave project.
