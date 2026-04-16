# API Documentation

Complete API reference for CreatorWeave.

## Stores (Zustand)

### Agent Store

**Location**: `web/src/store/agent.store.ts`

Manages AI agent state and conversations.

```typescript
interface AgentState {
  // State
  messages: Message[];
  isProcessing: boolean;
  currentAgent: AgentConfig | null;
  toolCalls: ToolCall[];

  // Actions
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  setAgentConfig: (config: AgentConfig) => void;
  executeTool: (tool: string, params: unknown) => Promise<ToolResult>;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  reasoning?: string;  // Chain of thought
}

interface ToolCall {
  id: string;
  name: string;
  parameters: unknown;
  result?: unknown;
  status: 'pending' | 'executing' | 'completed' | 'failed';
}
```

### Conversation Store (SQLite)

**Location**: `web/src/store/conversation.store.sqlite.ts`

Manages conversation threads with SQLite persistence.

```typescript
interface ConversationState {
  conversations: Conversation[];
  currentConversationId: string | null;
  isLoading: boolean;

  // Actions
  loadConversations: () => Promise<void>;
  createConversation: (title: string) => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  updateConversation: (id: string, updates: Partial<Conversation>) => Promise<void>;
  setCurrentConversation: (id: string) => void;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}
```

### Analysis Store

**Location**: `web/src/store/analysis.store.ts`

Manages file analysis state.

```typescript
interface AnalysisState {
  // State
  isAnalyzing: boolean;
  progress: number;
  result: AnalysisResult | null;
  error: string | null;

  // Actions
  startAnalysis: (handle: FileSystemDirectoryHandle) => Promise<void>;
  cancelAnalysis: () => void;
  clearResult: () => void;
}

interface AnalysisResult {
  totalSize: number;
  fileCount: number;
  largestFiles: FileStats[];
  extensions: ExtensionStats[];
  directoryStructure: DirectoryNode;
}
```

### Settings Store

**Location**: `web/src/store/settings.store.ts`

Manages application settings.

```typescript
interface SettingsState {
  // API Configuration
  apiKey: string;
  apiProvider: 'glm' | 'openai' | 'anthropic';
  apiEndpoint: string;

  // UI Preferences
  theme: 'light' | 'dark' | 'system';
  language: string;
  fontSize: number;

  // Editor Settings
  tabSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;

  // Actions
  updateSettings: (settings: Partial<SettingsState>) => void;
  resetSettings: () => void;
}
```

### Workspace Store

**Location**: `web/src/store/workspace.store.ts`

Manages workspace state and file handles.

```typescript
interface WorkspaceState {
  // State
  currentHandle: FileSystemDirectoryHandle | null;
  fileTree: FileNode[];
  expandedPaths: Set<string>;
  selectedFiles: Set<string>;

  // Actions
  openDirectory: () => Promise<void>;
  closeDirectory: () => void;
  refreshFileTree: () => Promise<void>;
  toggleExpanded: (path: string) => void;
  selectFile: (path: string) => void;
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileNode[];
}
```

### Skills Store

**Location**: `web/src/store/skills.store.ts`

Manages AI skills configuration.

```typescript
interface SkillsState {
  skills: Skill[];
  activeSkillIds: Set<string>;

  // Actions
  loadSkills: () => Promise<void>;
  addSkill: (skill: Skill) => Promise<void>;
  removeSkill: (id: string) => Promise<void>;
  updateSkill: (id: string, updates: Partial<Skill>) => Promise<void>;
  toggleSkill: (id: string) => void;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  trigger: string;
  content: string;  // Markdown
  enabled: boolean;
}
```

### Theme Store

**Location**: `web/src/store/theme.store.ts`

Manages theme selection.

```typescript
interface ThemeState {
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}
```

---

## Services

### File System Service

**Location**: `web/src/services/fs-access.ts`

File System Access API wrapper.

```typescript
class FileSystemAccess {
  // Select a directory
  async selectDirectory(): Promise<FileSystemDirectoryHandle>

  // Read file content
  async readFile(handle: FileSystemFileHandle): Promise<string>

  // Write file content
  async writeFile(handle: FileSystemFileHandle, content: string): Promise<void>

  // Create new file
  async createFile(directory: FileSystemDirectoryHandle, name: string): Promise<FileSystemFileHandle>

  // Traverse directory recursively
  async* traverseDirectory(handle: FileSystemDirectoryHandle): AsyncGenerator<FileEntry>
}
```

### Python Service

**Location**: `web/src/python/manager.ts`

Pyodide Python execution manager.

```typescript
class PyodideWorkerManager {
  // Execute Python code
  execute(code: string, files?: FileRef[], packages?: string[], timeout?: number): Promise<ExecuteResult>

  // Check if worker is ready
  isReady(): boolean

  // Terminate worker
  terminate(): void
}

interface ExecuteResult {
  success: boolean;
  result?: unknown;
  stdout?: string;
  stderr?: string;
  images?: ImageOutput[];
  outputFiles?: FileOutput[];
  executionTime: number;
  error?: string;
}
```

### Export Service

**Location**: `web/src/export/`

Data export functionality.

```typescript
class ExportService {
  // Export to CSV
  async exportCSV(data: unknown[], filename: string): Promise<void>

  // Export to JSON
  async exportJSON(data: unknown, filename: string): Promise<void>

  // Export to Excel
  async exportExcel(data: WorkbookData, filename: string): Promise<void>

  // Export to PDF
  async exportPDF(content: string, filename: string): Promise<void>

  // Export chart as image
  async exportChart(chart: Chart, filename: string, format: 'png' | 'svg'): Promise<void>
}
```

---

## Repositories (SQLite)

### Conversation Repository

**Location**: `web/src/sqlite/repositories/conversation.repository.ts`

```typescript
class ConversationRepository {
  async findAll(): Promise<Conversation[]>
  async findById(id: string): Promise<Conversation | null>
  async save(conversation: Conversation): Promise<void>
  async delete(id: string): Promise<void>
}
```

### Skill Repository

**Location**: `web/src/sqlite/repositories/skill.repository.ts`

```typescript
class SkillRepository {
  async findAll(): Promise<Skill[]>
  async findById(id: string): Promise<Skill | null>
  async save(skill: Skill): Promise<void>
  async delete(id: string): Promise<void>
}
```

### API Key Repository

**Location**: `web/src/sqlite/repositories/api-key.repository.ts`

```typescript
class ApiKeyRepository {
  async findAll(): Promise<ApiKey[]>
  async findByProvider(provider: string): Promise<ApiKey | null>
  async save(apiKey: ApiKey): Promise<void>
  async delete(id: string): Promise<void>
}
```

### Session Repository

**Location**: `web/src/sqlite/repositories/session.repository.ts`

```typescript
class SessionRepository {
  async findAll(): Promise<Session[]>
  async findById(id: string): Promise<Session | null>
  async save(session: Session): Promise<void>
  async delete(id: string): Promise<void>

  // File metadata
  async saveFileMetadata(sessionId: string, path: string, metadata: unknown): Promise<void>
  async getFileMetadata(sessionId: string, path: string): Promise<unknown | null>

  // Undo records
  async createUndoRecord(record: UndoRecord): Promise<void>
  async getUndoRecords(sessionId: string): Promise<UndoRecord[]>
}
```

---

## Agent Tools

### Tool Interface

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: z.ZodType;
  execute: (params: unknown, context: ToolContext) => Promise<ToolResult>;
}

interface ToolContext {
  workspaceRoot: FileSystemDirectoryHandle | null;
  conversationHistory: Message[];
  tokenLimit: number;
}
```

### Available Tools

| Tool | File | Description |
|------|------|-------------|
| `file-read` | `file-read.tool.ts` | Read file contents |
| `file-write` | `file-write.tool.ts` | Create/overwrite files |
| `file-edit` | `file-edit.tool.ts` | Edit file regions |
| `glob` | `glob.tool.ts` | Pattern-based file search |
| `grep` | `grep.tool.ts` | Regex content search |
| `code-analysis` | `code-analysis.tool.ts` | Analyze code structure |
| `code-intelligence` | `code-intelligence.tool.ts` | Intelligent code queries |
| `code-review` | `code-review.tool.ts` | Review code quality |
| `data-analysis` | `data-analysis.tool.ts` | Statistical analysis |
| `data-visualization` | `data-visualization.tool.ts` | Generate charts |
| `batch-operations` | `batch-operations.tool.ts` | Batch file operations |
| `python-execution` | `python-execution.tool.ts` | Execute Python code |
| `javascript-execution` | `javascript-execution.tool.ts` | Execute JavaScript |

---

## Hooks

### useAgent

```typescript
function useAgent(): {
  messages: Message[];
  isProcessing: boolean;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
}
```

### useFileSystem

```typescript
function useFileSystem(): {
  currentHandle: FileSystemDirectoryHandle | null;
  fileTree: FileNode[];
  openDirectory: () => Promise<void>;
  closeDirectory: () => void;
  refreshFileTree: () => Promise<void>;
}
```

### usePython

```typescript
function usePython(): {
  isReady: boolean;
  execute: (code: string, files?: FileRef[], packages?: string[]) => Promise<ExecuteResult>;
  terminate: () => void;
}
```

### useStorage

```typescript
function useStorage(): {
  getUsed: () => Promise<number>;
  getQuota: () => Promise<number>;
  estimate: () => Promise<StorageEstimate>;
}
```

---

## Components

### ConversationPanel

```typescript
interface ConversationPanelProps {
  conversationId: string;
  onToolCall?: (tool: string, params: unknown) => void;
  readOnly?: boolean;
}
```

### CodeViewer

```typescript
interface CodeViewerProps {
  filePath: string;
  content: string;
  language?: string;
  readOnly?: boolean;
  onEdit?: (newContent: string) => void;
  lineNumbers?: boolean;
  highlightLines?: number[];
}
```

### FileTree

```typescript
interface FileTreeProps {
  root: FileSystemDirectoryHandle;
  onFileSelect?: (path: string) => void;
  expandPaths?: string[];
  showHidden?: boolean;
}
```

---

## TypeScript Types

Common types used across the application.

```typescript
// Location: web/src/types/

type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  reasoning?: string;
}

type ToolStatus = 'pending' | 'executing' | 'completed' | 'failed';

interface ToolCall {
  id: string;
  name: string;
  parameters: unknown;
  result?: unknown;
  status: ToolStatus;
  error?: string;
}

type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'heatmap';

interface ChartData {
  type: ChartType;
  data: unknown;
  options?: ChartOptions;
}

type ExportFormat = 'csv' | 'json' | 'xlsx' | 'pdf' | 'png';
```

---

## See Also

- [Agent System Documentation](./agent-system.md)
- [Architecture Overview](./architecture/overview.md)
- [Python Integration](./web/src/python/README.md)
- [SQLite Storage](./web/src/sqlite/README.md)
