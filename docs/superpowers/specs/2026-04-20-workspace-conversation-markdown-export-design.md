# Workspace Single Conversation Markdown Export Design

## 1. Background
Current workspace has no direct way to export one conversation transcript for external LLM analysis (Codex, etc.). Existing `ExportPanel` is generic data export and currently has no active invocation for conversation transcript export.

## 2. Goals
1. Export exactly one conversation (workspace session) as Markdown.
2. Output is optimized for LLM ingestion (stable structure, low noise, explicit roles/timestamps).
3. Default excludes reasoning (`assistant.reasoning`), with explicit opt-in.
4. Export action is easy to discover and fast to execute.

## 3. Non-Goals
1. No zip packaging.
2. No cross-conversation batch export in this iteration.
3. No PDF/CSV/Excel conversation transcript formats in this iteration.
4. No server-side export; browser local download only.

## 4. User Stories
1. As an analyst, I can export the active conversation to `.md` and feed it directly to Codex.
2. As an advanced user, I can include reasoning blocks when needed.
3. As a user, I can export from both UI and command palette.

## 5. UX Design

### 5.1 Entry Points
1. Sidebar conversation item context action: `Export Markdown`.
2. Command Palette command: `Export Active Conversation as Markdown`.
3. Command Palette command: `Export Active Conversation as Markdown (Include Reasoning)`.

### 5.2 Export Options
A lightweight confirm popover/dialog before download:
1. `Include reasoning` toggle (default: off).
2. Confirm button: `Export`.

If user triggers command-palette variants:
1. Default variant skips dialog and exports with reasoning off.
2. Include-reasoning variant skips dialog and exports with reasoning on.

### 5.3 Disabled/Guard States
1. No active conversation: show toast `No active conversation to export`.
2. Active run in progress: show toast `Stop the current run before export`.
3. Empty message list: still export metadata + empty transcript section.

## 6. Markdown Output Contract

### 6.1 File Naming
`conversation-<sanitized-title>-<yyyyMMdd-HHmmss>.md`

### 6.2 Document Skeleton
```markdown
# Conversation Export

- Conversation ID: <id>
- Title: <title>
- Created At: <ISO>
- Updated At: <ISO>
- Message Count: <n>
- Exported At: <ISO>
- Include Reasoning: <true|false>
- Export Version: 1

## Transcript

### 1. USER
- Timestamp: <ISO>

<content>

### 2. ASSISTANT
- Timestamp: <ISO>

<content>

#### Tool Calls
- <tool-name>
```json
{...arguments...}
```

### 3. TOOL
- Timestamp: <ISO>
- Tool Name: <name>
- Tool Call ID: <id>

```text
<tool-result>
```
```

### 6.3 Field Rules
1. Keep original message ordering.
2. `content` is rendered verbatim in fenced blocks when multiline; inline otherwise.
3. Tool call arguments are pretty-printed JSON when parseable; raw text fallback otherwise.
4. Assistant reasoning is included only when option is enabled.
5. Null/empty contents are rendered as `(empty)`.

## 7. Technical Design

### 7.1 New Module
Create `web/src/services/export/conversation-markdown-exporter.ts`:
1. `buildConversationMarkdown(conversation, options): string`
2. `exportConversationMarkdown(conversation, options): Promise<ExportResultLike>`
3. `buildConversationExportFilename(title, now): string`

`options`:
```ts
type ConversationMarkdownExportOptions = {
  includeReasoning?: boolean // default false
  addTimestampToFilename?: boolean // default true
}
```

### 7.2 Data Source
Use in-memory conversation from `useConversationStore`:
1. Export target by ID (preferred) or active conversation ID fallback.
2. Avoid repository-level read because store is already source of truth in active session.

### 7.3 UI Integration
1. `Sidebar.tsx`
   - Add per-conversation action trigger (context menu or compact overflow action).
   - Wire to exporter with selected conversation ID.
2. `command-palette-commands.tsx`
   - Add two commands for active conversation export.
3. `WorkspaceLayout.tsx`
   - Provide handlers to TopBar/Sidebar/command registry context if needed.

### 7.4 i18n
Add keys for:
1. Export action labels.
2. Guard/error toasts.
3. Include reasoning toggle label.
4. Export success message.

## 8. Error Handling
1. File save failure => toast with error message.
2. Unexpected serialization failure => fallback section with raw JSON snapshot for problematic message.
3. Oversized tool output: do not truncate in v1 (analysis fidelity first).

## 9. Testing Strategy

### 9.1 Unit Tests
`conversation-markdown-exporter.test.ts`
1. Basic conversation serialization.
2. Tool call argument parse success/fallback.
3. Reasoning include/exclude switch.
4. Empty content and null handling.
5. Filename sanitization and timestamp format.

### 9.2 Component/Integration Tests
1. Sidebar action exports selected conversation (not active mismatch).
2. Command palette exports active conversation.
3. Guard state when conversation is running.

## 10. Rollout Plan
1. Implement exporter + unit tests.
2. Integrate sidebar action.
3. Integrate command palette commands.
4. Add i18n keys.
5. Verify with a real long conversation and Codex ingestion.

## 11. Acceptance Criteria
1. User can export a single conversation as `.md` from UI in <= 2 clicks.
2. Exported markdown can be directly pasted into Codex with clear role/tool chronology.
3. Default output excludes reasoning; optional inclusion works.
4. No regression to existing generic export panel.
