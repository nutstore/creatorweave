# Python Agent Tool Integration

## Overview

The Python execution module has been successfully integrated with the Agent system, allowing AI agents to execute Python code directly in the browser using Pyodide.

## Architecture

```
User Request
    ↓
Agent System (LLM)
    ↓
Tool: run_python_code
    ↓
PythonExecutor (api.ts)
    ↓
Pyodide Worker (worker.ts)
    ↓
Result → Agent → User
```

## Integration Points

### 1. Tool Definition (`/src/agent/tools/python.tool.ts`)

**Tool Name**: `run_python_code`

**Parameters**:

- `code` (string, required): Python code to execute
- `packages` (array, optional): Packages to load (pandas, numpy, matplotlib, openpyxl)
- `files` (array, optional): Specific files to inject (defaults to all active files)
- `timeout` (number, optional): Execution timeout in milliseconds (default: 30000, max: 120000)

**Features**:

- Automatic file injection from user's workspace
- Package auto-detection from import statements
- Output file bridging back to workspace
- Comprehensive error handling
- Matplotlib image capture
- Stdout/stderr capture

### 2. Tool Registration (`/src/agent/tool-registry.ts`)

The Python tool is registered as a built-in tool alongside file operations:

```typescript
registerBuiltins(): void {
  // ... other tools
  this.register(pythonCodeDefinition, pythonCodeExecutor)
}
```

### 3. Agent System Prompt Update (`/src/agent/agent-loop.ts`)

The Agent's system prompt now includes Python execution capabilities:

```
Available built-in tools:
- run_python_code: Execute Python code with pandas, numpy, matplotlib, openpyxl support

Python execution:
- Files are automatically available in /mnt/ directory
- Use run_python_code for data processing, visualization, statistical analysis
- Supports pandas, numpy, matplotlib, openpyxl packages
- Output files written to /mnt/ are saved back to the workspace
```

## Usage Examples

### Example 1: Data Analysis with Pandas

```python
import pandas as pd

# Read CSV file (automatically available in /mnt/)
df = pd.read_csv('/mnt/data.csv')

# Perform analysis
summary = df.describe()
print(summary)

# Save output
df.to_csv('/mnt/analysis.csv', index=False)
```

### Example 2: Data Visualization

```python
import matplotlib.pyplot as plt
import pandas as pd

# Read and plot data
df = pd.read_csv('/mnt/data.csv')
plt.figure(figsize=(10, 6))
plt.plot(df['x'], df['y'])
plt.title('Data Visualization')
plt.xlabel('X')
plt.ylabel('Y')
plt.savefig('/mnt/plot.png')
plt.close()
```

### Example 3: Excel Processing

```python
import pandas as pd

# Read Excel file
df = pd.read_excel('/mnt/data.xlsx')

# Process data
df_filtered = df[df['value'] > 100]

# Save as CSV
df_filtered.to_csv('/mnt/filtered.csv', index=False)

print(f"Processed {len(df_filtered)} rows")
```

## File Handling

### Input Files

The tool automatically injects user's active files into the Pyodide `/mnt/` directory:

1. **Automatic Injection**: All active files from the user's workspace (limited to 20 for performance)
2. **Manual Selection**: Agent can specify specific files using the `files` parameter
3. **File Format**: Files are converted to Pyodide-compatible format (text or binary)

### Output Files

Files written to `/mnt/` in Python are automatically saved back to the user's workspace:

```python
# This file will be saved to the workspace
with open('/mnt/output.txt', 'w') as f:
    f.write('Hello from Python!')
```

## Package Management

### Available Packages

- **pandas**: Data manipulation and analysis
- **numpy**: Numerical computing
- **matplotlib**: Plotting and visualization
- **openpyxl**: Excel file handling

### Auto-Detection

The tool automatically detects packages from import statements:

```python
# These imports trigger automatic package loading
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
```

### Manual Specification

Agent can explicitly specify packages:

```json
{
  "code": "import pandas as pd\nprint(pd.__version__)",
  "packages": ["pandas"]
}
```

## Error Handling

### Common Errors

1. **No Directory Selected**

   ```json
   { "error": "No directory selected. Please select a project folder first." }
   ```

2. **Pyodide Loading**

   ```json
   { "error": "Python environment is loading. Please wait a moment and try again." }
   ```

3. **Execution Timeout**

   ```json
   { "error": "Worker response timeout after 30000ms" }
   ```

4. **Package Loading Failure**
   ```json
   { "error": "Failed to load packages: ..." }
   ```

### Error Response Format

```typescript
{
  error: string,
  stderr?: string,
  executionTime: number
}
```

## Result Format

### Successful Execution

```typescript
{
  stdout?: string,
  stderr?: string,
  result?: unknown,
  images?: Array<{
    filename: string,
    data: string // base64
  }>,
  outputFiles?: Array<{
    name: string,
    size: number
  }>,
  executionTime: number
}
```

### Example Response

```json
{
  "stdout": "          x         y\n0  1.0  10.0\n1  2.0  20.0\n2  3.0  30.0",
  "images": [
    {
      "filename": "plot.png",
      "data": "iVBORw0KGgoAAAANSUhEUgAA..."
    }
  ],
  "outputFiles": [
    {
      "name": "output.csv",
      "size": 1024
    }
  ],
  "executionTime": 1234
}
```

## Performance Considerations

### File Injection Limits

- **Default**: First 20 active files
- **Reason**: Pyodide filesystem performance
- **Override**: Use `files` parameter for specific files

### Execution Timeout

- **Default**: 30 seconds
- **Maximum**: 120 seconds
- **Use Case**: Increase for long-running computations

### Memory Management

- Pyodide runs in a Web Worker (isolated from main thread)
- Large datasets may cause memory pressure
- Consider chunking large data operations

## Integration Testing

### Manual Testing

1. Open the Agent interface
2. Select a project directory with data files
3. Ask the Agent to analyze data:
   ```
   Analyze the data.csv file and create a visualization
   ```
4. Agent will:
   - Use `run_python_code` tool
   - Load pandas and matplotlib
   - Read the CSV file
   - Generate plots
   - Save output files

### Expected Behavior

- Agent should detect Python needs and use the tool
- Files should be automatically injected
- Results should be displayed to the user
- Output files should be saved to workspace
- Matplotlib images should be displayed

## Troubleshooting

### Tool Not Available

**Symptom**: Agent doesn't use Python tool

**Solution**:

1. Check ToolRegistry registration
2. Verify Python module is loaded
3. Check browser console for errors

### Files Not Loading

**Symptom**: "No such file or directory" in Python

**Solution**:

1. Verify directory is selected
2. Check file paths are correct
3. Ensure files are in active workspace

### Package Loading Fails

**Symptom**: "Failed to load packages"

**Solution**:

1. Check internet connection (packages load from CDN)
2. Verify package name is correct
3. Try manual package specification

## Future Enhancements

### Potential Improvements

1. **Streaming Output**: Real-time stdout/stderr streaming
2. **Interactive Plots**: Interactive matplotlib plots
3. **More Packages**: Add scipy, scikit-learn, etc.
4. **File Upload**: Direct file upload to Pyodide
5. **Session Persistence**: Save Python state between executions
6. **Better Error Messages**: Python traceback translation

### Extension Points

- Add custom packages in `/src/python/constants.ts`
- Extend file bridging in `/src/python/bridge.ts`
- Customize output formatting in tool executor

## Related Files

- `/src/agent/tools/python.tool.ts` - Tool definition and executor
- `/src/agent/tool-registry.ts` - Tool registration
- `/src/agent/agent-loop.ts` - Agent system prompt
- `/src/python/api.ts` - PythonExecutor class
- `/src/python/worker.ts` - Pyodide worker
- `/src/python/bridge.ts` - File bridging layer
- `/src/python/index.ts` - Module exports and singleton

## References

- [Pyodide Documentation](https://pyodide.org/)
- [Python Data Analysis Handbook](https://jakevdp.github.io/PythonDataScienceHandbook/)
- [Matplotlib Documentation](https://matplotlib.org/)
