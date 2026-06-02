# Changelog

All notable changes to CreatorWeave will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2025-06-02

### Added

#### Agent System
- **Agent Loop & Context Management**
  - Context compression with persisted summaries and auto-healing
  - Plan/Act mode system with workspace isolation
  - Iteration limit with in-flight LLM stream abort
  - Soft-delete tool with pending workflow
  - `ask_user_question` tool with interactive choice UI and free-text input
  - `search_conversations` tool for cross-workspace chat search
  - Message queue system for sending while agent is processing
  - Streaming tool call rendering with partial JSON parsing
  - Subagent delegation with OPFS persistence and batch spawn
  - `/compact` slash command for manual context compression
  - Token usage display with prompt/completion/cache breakdown

- **Multi-Agent Collaboration**
  - Multi-agent infrastructure with OPFS storage
  - Agent mentions routing and management UI
  - Subagent health detection and auto-refresh
  - Per-workspace model switching and preferences
  - Fork conversation from any turn

- **Tool System**
  - Pluggable format registry with handlers for PDF, DOCX, XLSX, CSV, NBMX, NGM, NOL, ZIP
  - Directory deletion with recursive support across workspace/agent/assets backends
  - Read policy and source-aware workspace reads
  - Inline line comments in sync preview
  - OCR text recognition tool for images
  - Python `/mnt_skills` mount for builtin skill scripts
  - Anti-dead-loop protection for file tools with large file guards

- **Skills System**
  - Builtin skills system with OPFS materialization
  - `word-editor` skill with full DocumentModel and 89 EditOps
  - `nol-editor` skill for NOL format editing
  - Binary file support and OPFS resource access
  - Skill OPFS sync for Pyodide access

#### File & Workspace
- **Multi-Root Projects**
  - Multi-root workspace support (P0-P4)
  - Root-aware path resolution across all tools
  - Collapsible root headers in file tree sidebar
  - Per-project active workspace persistence

- **File Preview**
  - PDF preview with canvas rendering, page nav, zoom, rotation, keyboard shortcuts
  - DOCX preview with docx-preview library (unified via format registry)
  - XLSX preview with Univer sheets integration
  - CSV preview with table rendering
  - HTML preview with source/preview toggle
  - Office file preview (pptx, ppt, doc) via eo2suite
  - Image zoom/lightbox with natural size detection
  - Monaco diff editor in sync preview
  - Download button for all file types

- **Sync & Conflict Resolution**
  - Snapshot/review workflow with diff viewer
  - Conflict detection before approval with AI delegation
  - Lazy hunk-based diff viewer with full editor toggle
  - Batch reject selected changes
  - Pending file list with inline diff

- **Workspace Management**
  - Workspace pin/unpin with persistence
  - Workspace archive and restore
  - Workspace rename
  - Workspace delete confirmation dialog
  - Project quick switcher with Cmd+P
  - Go-to-file dialog

#### Browser Extension
- **WebMCP Integration**
  - Browser WebMCP tool discovery and invocation
  - Global toggle and Chrome WebMCP onboarding
  - Plugin download streaming and asset path rewriting
  - Parallelized tab tool discovery scan
  - Asset inventory popover with recursive scanning

- **Other Extension Features**
  - Codex OAuth integration
  - Edge TTS via offscreen document
  - Injection status indicator in popup
  - Web fetch/render bridge tools
  - Proxy fetch streaming support

#### Storage & Database
- SQLite migration system with progress display and error UI
- OPFS-sahpool VFS for better reliability
- Compression baseline persistence in conversations
- Graceful fallback for columns before migration
- Batch `discardPendingPaths` for OPFS performance
- Cross-tab sync via BroadcastChannel
- Persist streaming drafts on page unload

#### i18n & Accessibility
- Full i18n support: en-US, zh-CN, ja-JP, ko-KR
- Namespace-split locale files
- Auto-detect locale from `navigator.language`
- Localized command palette, settings, sync, file viewer, agent modes

#### UI/UX
- File delete confirmation popup in sidebar
- Copy file path button in diff viewer
- #file mention in rich input editor
- Agent mention with tiptap Mention extension
- Undo/redo support in rich input editor
- Input draft persistence across workspace switches
- Message navigation dots with scroll-to-bottom
- Conversation export (JSON/Markdown/HTML)
- Activity heatmap on project home
- Text selection auto-copy in conversation
- Fullscreen mode for file write preview
- Per-workspace model selection in toolbar
- Command palette shortcut hints
- Pinned models system for provider selection

#### Providers & Models
- Custom OpenAI-compatible provider support
- Dynamic model list fetching from provider APIs
- Responses API mode for custom providers
- Pinned models system
- GLM-5.1, DeepSeek V4, Volcengine Coding providers
- Model context window resolution system

#### PWA & Deployment
- Service worker with injectManifest strategy
- Vercel and EdgeOne deployment configuration
- Hash-based routing for SPA compatibility

### Changed
- Renamed product to CreatorWeave
- Migrated from IndexedDB to SQLite + OPFS as primary storage
- Replaced session terminology with workspace throughout
- Refactored agent loop into focused modules
- Replaced hardcoded tool renderers with pluggable registry
- Switched to react-router with centralized route config
- Replaced LCS diff with Myers diff via `diff` library
- Virtual DOM optimizations for conversation rendering
- Context compression now uses upstream timestamps and smarter triggers
- Removed batch write, workflow, and deprecated search tools
- System prompt optimized for prompt caching stability

### Fixed
- SQLite data loss prevention on page refresh and schema mismatch
- OPFS ghost delete records and empty directory cleanup
- Race conditions in workspace switching and conversation state
- Multi-tab consistency with BroadcastChannel sync
- Streaming draft state management and duplicate message prevention
- File tree refresh preserving expanded state
- OPFS-only file access without native filesystem
- Service worker cache invalidation on deploy
- WebMCP backwards compatibility with older browser extensions
- Python Pyodide FS lock deadlock and worker queue recovery
- Monaco DiffEditor model disposal errors
- PWA update toast duplication

---

## [0.2.0] - 2025-02-08

### Added - Phase 4: Workspace Management & Polish
- **Theme Support**
  - Light, dark, and system theme options
  - Automatic system preference detection
  - Smooth theme transitions
  - Theme toggle in top bar with context menu

- **Keyboard Shortcuts**
  - Command palette (Ctrl/Cmd + K) for quick access to all features
  - Global keyboard shortcuts system with priority handling
  - Keyboard shortcuts help dialog with search
  - Conflict prevention and disabled state support

- **Workspace Settings**
  - Comprehensive settings dialog with tabbed interface
  - Layout settings (panel sizes, ratios)
  - Display settings (theme, font size, line numbers, word wrap, mini map)
  - Shortcuts tab with view all option
  - Data management (recent files, reset options)

- **Recent Files**
  - Track up to 10 recently accessed files
  - Quick access from sidebar or command palette
  - Relative timestamps (e.g., "5 minutes ago")
  - Individual file remove and clear all options

- **Onboarding Tour**
  - Multi-step walkthrough for first-time users
  - Feature highlights with target element highlighting
  - Skip and "Don't show again" options
  - Progress indicator and keyboard navigation

- **Layout Persistence**
  - Panel sizes automatically saved to localStorage
  - Values restored on page reload
  - Min/max constraints applied to all panel sizes

### Added - Phase 3: Enhanced Conversation & Data Analysis
- **Conversation Threading**
  - Thread support in message types with optional threadId/parentMessageId
  - Thread management utilities (create, merge, delete, fork)
  - Store actions for thread operations
  - ConversationPanel component with collapsible thread views
  - Thread navigation bar with previous/next buttons
  - Thread hierarchy visualization with left border
  - Auto-generated thread titles from first message

- **Message Bubbles**
  - Rich message display with markdown support
  - Syntax highlighting with Shiki
  - Inline code rendering with copy button
  - Collapsible reasoning sections
  - Tool call display with parameters and results
  - Streaming support for real-time AI responses

- **Code Intelligence**
  - File tree panel with browse and search
  - File preview with syntax highlighting
  - Side-by-side diff view for file comparison
  - Line numbers toggle
  - Word wrap toggle
  - Mini map for code overview

- **Data Visualization**
  - Chart.js integration for visualizing file statistics
  - Bar charts, pie charts, line charts
  - Interactive tooltips and drill-down
  - Export charts as images
  - Filter by file type

- **Data Preview**
  - JSON pretty-printed with collapsible nodes
  - CSV table view with sorting
  - XML syntax-highlighted tree view
  - YAML formatted display
  - Search within data
  - Export to CSV/JSON

- **Batch Operations**
  - `batch_edit` tool for applying edits to multiple files
  - `advanced_search` tool with regex and context
  - `file_batch_read` tool for reading multiple files
  - Preview before applying changes
  - Progress indicator
  - Dry-run mode
  - Undo/redo support

### Added - Phase 2: Plugin System
- **Dynamic Plugin System**
  - Load external WASM plugins
  - Plugin management UI
  - Parallel execution for multiple plugins

- **Example Plugins**
  - Line counter plugin
  - MD5 calculator plugin

### Added - Phase 1: Foundation
- **Basic Features**
  - Select local folders
  - Recursive directory traversal
  - File size collection
  - WASM accumulation calculation
  - Real-time result display

- **AI Conversation**
  - Chat interface with natural language
  - Message history
  - Tool integration

- **Storage**
  - SQLite WASM + OPFS VFS
  - IndexedDB fallback
  - Automatic migration from IndexedDB to SQLite

- **UI Framework**
  - React + TypeScript
  - Tailwind CSS
  - shadcn/ui components
  - Zustand state management

## [0.1.0] - 2024-01-XX

### Added
- Initial release
- Basic file system analysis
- Simple chat interface
- IndexedDB storage

---

## Version Summary

| Version | Release Date | Key Features |
|---------|--------------|--------------|
| 0.3.0 | 2025-06-02 | Multi-agent, format handlers, WebMCP, multi-root, skills system |
| 0.2.0 | 2025-02-08 | Threading, workspace management, batch operations |
| 0.1.0 | 2024-01-XX | Initial release with basic features |

---

## Upcoming Releases

### [0.3.0] - Planned
- [ ] Workspace templates
- [ ] Custom shortcuts
- [ ] Workspace sharing (export/import)
- [ ] Multi-monitor support
- [ ] Advanced theming (custom color schemes)

### [0.4.0] - Planned
- [ ] AI-powered thread summaries
- [ ] Thread search
- [ ] Thread export
- [ ] Visual thread graph
- [ ] Thread merging UI with drag-and-drop

---

**Note**: This project is in active development. Features may change between releases.
