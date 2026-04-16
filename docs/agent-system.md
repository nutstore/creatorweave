# AI Agent System Documentation

## Overview

The AI Agent System is the core intelligence engine of CreatorWeave, enabling natural language interaction with local files through advanced AI agents.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Interface                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Conversation Panel │ Input │ Tool Call Display      │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      Agent Store                            │
│  - agent.store.ts                                            │
│  - Manages agent state, messages, tools                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Agent Loop Core                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  agent-loop.ts                                         │  │
│  │  - Main orchestration loop                            │  │
│  │  - Streaming response handling                        │  │
│  │  - Error classification & retry                       │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  context-manager.ts                                   │  │
│  │  - Context window management                          │  │
│  │  - Token counting & optimization                      │  │
│  │  - Project fingerprinting                             │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  multi-agent-collaboration.ts                         │  │
│  │  - Multi-agent task distribution                     │  │
│  │  - Result aggregation                                │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Tool Registry                            │
│  - tool-registry.ts                                          │
│  - 30+ available tools                                      │
│  - Tool recommendation engine                               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     LLM Provider                             │
│  - glm-provider.ts (GLM API)                                │
│  - Streaming support                                        │
│  - Token counting                                           │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Agent Loop (`agent-loop.ts`)

The main orchestration engine that manages conversation flow.

```typescript
interface AgentLoopConfig {
  llmProvider: LLMProvider;
  toolRegistry: ToolRegistry;
  contextManager: ContextManager;
  onError?: (error: AgentError) => void;
}

class AgentLoop {
  // Execute a single agent iteration
  async execute(message: string): Promise<AgentResponse>

  // Handle streaming responses
  async executeStream(message: string): AsyncIterator<StreamChunk>

  // Process tool calls
  async executeToolCall(toolCall: ToolCall): Promise<ToolResult>
}
```

### 2. Context Manager (`context-manager.ts`)

Manages context window and optimizes token usage.

```typescript
interface ContextManagerConfig {
  maxTokens: number;        // Maximum context window size
  reserveTokens: number;    // Reserved for response
  compressionThreshold: number;  // When to compress
}

class ContextManager {
  // Build context for LLM
  async buildContext(messages: Message[]): Promise<LLMContext>

  // Estimate token count
  estimateTokens(text: string): number

  // Optimize context by removing less relevant content
  optimizeContext(context: LLMContext): LLMContext
}
```

### 3. Tool Registry (`tool-registry.ts`)

Manages available tools and handles tool execution.

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodType;
  execute: (params: unknown) => Promise<ToolResult>;
}

class ToolRegistry {
  register(tool: ToolDefinition): void
  unregister(name: string): void
  execute(name: string, params: unknown): Promise<ToolResult>
  listTools(): ToolDefinition[]
  recommendTools(query: string): ToolDefinition[]
}
```

## Available Tools

### File Operations

| Tool | Description | Parameters |
|------|-------------|------------|
| `file-read` | Read file contents | `path: string` |
| `file-write` | Create/overwrite file | `path: string, content: string` |
| `file-edit` | Edit specific region | `path: string, edits: Edit[]` |
| `glob` | Pattern-based search | `pattern: string, path?: string` |
| `grep` | Regex content search | `pattern: string, path?: string, context?: number` |

### Code Analysis

| Tool | Description | Parameters |
|------|-------------|------------|
| `code-analysis` | Analyze code structure | `path: string` |
| `code-intelligence` | Intelligent code analysis | `query: string, path?: string` |
| `code-review` | Review code quality | `path: string, rules?: string[]` |

### Data Processing

| Tool | Description | Parameters |
|------|-------------|------------|
| `data-analysis` | Statistical analysis | `data: unknown, operations?: string[]` |
| `data-visualization` | Generate charts | `type: ChartType, data: unknown` |
| `excel-integration` | Process Excel files | `operation: string, filePath?: string, data?: unknown` |

### Execution

| Tool | Description | Parameters |
|------|-------------|------------|
| `javascript-execution` | Execute JavaScript | `code: string` |
| `python-execution` | Execute Python | `code: string, files?: FileRef[]` |

### Documentation

| Tool | Description | Parameters |
|------|-------------|------------|
| `doc-generation` | Generate documentation | `path: string, format?: string` |

## Multi-Agent Collaboration

The system supports multiple agents working together on complex tasks.

```typescript
interface MultiAgentConfig {
  agents: Agent[];
  collaborationMode: 'parallel' | 'sequential' | 'hierarchical';
  aggregationStrategy: 'merge' | 'vote' | 'best';
}

class MultiAgentCollaboration {
  async execute(task: Task): Promise<AggregatedResult> {
    // 1. Decompose task into sub-tasks
    const subTasks = await this.decompose(task);

    // 2. Assign to agents based on capabilities
    const assignments = this.assign(subTasks, this.agents);

    // 3. Execute in parallel/sequential mode
    const results = await this.executeAll(assignments);

    // 4. Aggregate results
    return this.aggregate(results);
  }
}
```

## Error Handling

The agent system includes sophisticated error handling and recovery.

```typescript
interface AgentError {
  type: 'llm_error' | 'tool_error' | 'context_error' | 'timeout';
  message: string;
  recoverable: boolean;
  retryCount: number;
}

class ErrorHandler {
  classify(error: Error): AgentError
  shouldRetry(error: AgentError): boolean
  async recover(error: AgentError): Promise<RecoveryResult>
}
```

## Quality Verification

After agent execution, results are verified for quality.

```typescript
class QualityVerification {
  verify(result: AgentResult): QualityReport {
    return {
      accuracy: this.checkAccuracy(result),
      completeness: this.checkCompleteness(result),
      safety: this.checkSafety(result),
      score: this.calculateScore(result),
    };
  }
}
```

## Prefetch System

The agent can predict and prefetch files for faster response.

```typescript
class FilePredictor {
  predictNext(context: ConversationContext): string[] {
    // Analyze conversation patterns
    // Predict likely needed files
    // Return file paths for prefetching
  }
}

class PrefetchCache {
  async prefetch(paths: string[]): Promise<void>
  async get(path: string): Promise<File | null>
}
```

## LLM Provider

The system uses a pluggable LLM provider interface.

```typescript
interface LLMProvider {
  complete(params: CompletionParams): Promise<CompletionResponse>
  stream(params: CompletionParams): AsyncIterator<StreamChunk>
  countTokens(text: string): number
}

// GLM Provider implementation
class GLMProvider implements LLMProvider {
  private apiKey: string;
  private baseURL: string;

  async complete(params: CompletionParams): Promise<CompletionResponse> {
    // Call GLM API
  }

  async stream(params: CompletionParams): AsyncIterator<StreamChunk> {
    // Streaming response
  }
}
```

## Usage Example

```typescript
import { useAgentStore } from '@/store/agent.store';

// In a React component
function ConversationPanel() {
  const { sendMessage, messages, isProcessing } = useAgentStore();

  const handleSend = async (userMessage: string) => {
    await sendMessage(userMessage);
  };

  return (
    <div>
      {messages.map(msg => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <Input onSend={handleSend} disabled={isProcessing} />
    </div>
  );
}
```

## Best Practices

1. **Context Management**: Always provide relevant context to reduce token usage
2. **Tool Selection**: Use tool recommendation to select appropriate tools
3. **Error Recovery**: Implement proper error handling and retry logic
4. **Streaming**: Use streaming for better user experience on long responses
5. **Verification**: Always verify agent outputs before applying changes

## References

- [Agent Loop Implementation](../web/src/agent/agent-loop.ts)
- [Tool Registry](../web/src/agent/tool-registry.ts)
- [Context Manager](../web/src/agent/context-manager.ts)
- [Available Tools](../web/src/agent/tools/)
