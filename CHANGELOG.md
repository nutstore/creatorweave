# Changelog

All notable changes to CreatorWeave will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
