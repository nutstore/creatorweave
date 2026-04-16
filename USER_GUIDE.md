# CreatorWeave - User Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Conversation Features](#conversation-features)
3. [Code Intelligence](#code-intelligence)
4. [Data Analysis](#data-analysis)
5. [Batch Operations](#batch-operations)
6. [Workspace Management](#workspace-management)
7. [Keyboard Shortcuts](#keyboard-shortcuts)
8. [Tips and Tricks](#tips-and-tricks)

---

## Getting Started

### First Time Setup

1. **Open the Application**
   - Navigate to the deployed URL or run locally with `pnpm run dev`
   - Open in a supported browser (Chrome, Edge, or Firefox recommended)

2. **Grant File Access**
   - Click "Select Folder" to grant access to your project directory
   - The browser will prompt for permission - click "View Files" or "Allow"

3. **Complete the Onboarding Tour**
   - First-time users will see a guided tour
   - Follow the prompts to learn about key features
   - Skip anytime and access later from Settings

---

## Conversation Features

### Starting a Conversation

1. Click in the chat input box at the bottom of the screen
2. Type your question or request in natural language
3. Press Enter to send

Example prompts:
- "What does this project do?"
- "Find all React components in the src folder"
- "Explain the authentication flow"

### Message Features

#### Message Bubbles
- **User Messages**: Displayed on the right in blue
- **AI Messages**: Displayed on the left with markdown rendering
- **Code Blocks**: Syntax-highlighted with copy button
- **Links**: Clickable URLs with proper formatting

#### Reasoning Visualization
- Collapsible "Thinking" sections show AI reasoning
- Click the chevron to expand/collapse
- Helps understand the AI's thought process

#### Tool Call Display
- View all tools invoked by the AI
- See parameters passed to each tool
- Review results returned by tools
- Click to expand detailed output

### Conversation Threading

#### Creating Threads
1. Hover over any message in the conversation
2. Click the "Create Thread" button
3. Enter a title for the thread
4. The thread will be created with that message as the root

#### Thread Navigation
- Use the thread navigation bar (above messages) to jump between threads
- Previous/Next buttons for easy navigation
- Active thread is highlighted

#### Thread Actions
- **Fork**: Create a branch from any message
- **Merge**: Combine two related threads
- **Collapse/Expand**: Toggle thread visibility
- **Delete**: Remove a thread while preserving messages

---

## Code Intelligence

### File Tree Panel

#### Navigation
- **Browse**: Click folders to expand, files to preview
- **Search**: Use the search box to filter files
- **Icons**: File type icons for quick identification
- **Selection**: Click to select, double-click to open in preview

#### File Context Menu
Right-click on files for options:
- Open in preview
- Copy path
- Analyze with AI
- View file info

### File Preview

#### Code Display
- **Syntax Highlighting**: Automatic language detection
- **Line Numbers**: Toggle on/off in settings
- **Word Wrap**: Toggle for long lines
- **Mini Map**: Overview of code structure

#### File Comparison
- **Side-by-Side Diff**: Compare two file versions
- **Inline Diff**: Unified diff view
- **Highlighting**: Changes highlighted in red/green
- **Navigation**: Jump between changes

---

## Data Analysis

### Data Visualization

#### Chart Types
- **Bar Charts**: File size distribution by type
- **Pie Charts**: Directory size breakdown
- **Line Charts**: File growth over time
- **Histograms**: File size frequency

#### Interactive Features
- Hover for detailed tooltips
- Click to drill down
- Export charts as images
- Filter by file type

### Data Preview

#### Supported Formats
- **JSON**: Pretty-printed with collapsible nodes
- **CSV**: Table view with sorting
- **XML**: Syntax-highlighted tree view
- **YAML**: Formatted display

#### Features
- Search within data
- Sort columns
- Export to CSV/JSON
- Validate data structure

---

## Batch Operations

### Batch Edit

#### Applying Edits to Multiple Files
1. Open the Batch Operations panel
2. Select the "Batch Edit" tab
3. Configure:
   - **File Pattern**: Glob pattern (e.g., `*.ts`, `src/**/*.tsx`)
   - **Find**: Text to find (or regex pattern)
   - **Replace**: Replacement text
   - **Use Regex**: Enable for regex patterns
   - **Dry Run**: Preview changes without applying
4. Click "Preview" to see affected files
5. Click "Apply" to make changes

#### Example Use Cases
- Rename a function across all files
- Update copyright headers
- Change import paths
- Replace deprecated API calls

### Advanced Search

#### Searching with Regex
1. Open the Batch Operations panel
2. Select "Advanced Search" tab
3. Configure:
   - **Pattern**: Regex pattern to match
   - **File Pattern**: Filter files by pattern
   - **Path**: Limit to subdirectory
   - **Context Lines**: Lines before/after match
   - **Case Insensitive**: Ignore case
4. Click "Search" to see results

#### Example Searches
- `TODO:.*fix` - Find all TODOs with "fix"
- `import.*from ['"]react['"]` - Find React imports
- `function\s+\w+` - Find function declarations

---

## Workspace Management

### Theme Support

#### Switching Themes
- **Toggle Button**: Click the sun/moon/monitor icon in the top-right
- **Right-Click Menu**: Direct theme selection
- **Settings**: Workspace Settings > Display tab

#### Theme Options
- **Light**: Always light mode
- **Dark**: Always dark mode (reduces eye strain)
- **System**: Match your OS preference

### Panel Layouts

#### Resizing Panels
- Drag panel borders to resize
- Constraints prevent panels from becoming too small/large
- Layout is automatically saved

#### Layout Presets
- **Default**: Balanced layout for general use
- **Code Review**: Larger preview panel
- **Chat Focus**: Larger conversation area
- **File Explorer**: Wider file tree

### Recent Files

#### Viewing Recent Files
- Automatically tracks files you open
- Up to 10 files are stored
- Shows relative timestamps (e.g., "5 minutes ago")

#### Managing Recent Files
- Click any file to open it
- Click the X to remove a file
- Clear all from Settings > Data tab

### Workspace Settings

#### Layout Tab
- Sidebar width (200-400px)
- Conversation area ratio (20-80%)
- Preview panel ratio (30-80%)
- Reset layout button

#### Display Tab
- Theme selection
- Font size (small/medium/large)
- Line numbers toggle
- Word wrap toggle
- Mini map toggle

#### Shortcuts Tab
- View all keyboard shortcuts
- Category organization
- Tips for efficient workflow

#### Data Tab
- Recent files count
- Clear recent files
- Reset all settings

---

## Keyboard Shortcuts

### Essential Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + K` | Open Command Palette |
| `Ctrl/Cmd + B` | Toggle sidebar |
| `Ctrl/Cmd + ,` | Open workspace settings |
| `Ctrl/Cmd + 1` | Switch to Files tab |
| `Ctrl/Cmd + 2` | Switch to Plugins tab |
| `Ctrl/Cmd + 3` | Switch to Changes tab |
| `Shift + ?` | Show keyboard shortcuts |
| `Esc` | Close panels/dialogs |

### Command Palette (Ctrl/Cmd + K)

The command palette is the fastest way to access any feature:

1. Press `Ctrl/Cmd + K`
2. Type what you're looking for
3. Use arrow keys to navigate
4. Press Enter to execute

**Available Commands:**
- New Conversation
- Toggle Sidebar
- Recent Files
- Skills Manager
- Tools Panel
- Keyboard Shortcuts
- Workspace Settings

---

## Tips and Tricks

### Productivity Tips

1. **Use the Command Palette**
   - Faster than clicking menus
   - `Ctrl/Cmd + K` → type action → Enter

2. **Customize Your Layout**
   - Larger preview for code review
   - Wider sidebar for better file visibility

3. **Leverage Recent Files**
   - Automatically tracks opened files
   - No need to navigate file tree repeatedly

4. **Learn Keyboard Shortcuts**
   - `Ctrl/Cmd + K` for command palette
   - `Ctrl/Cmd + B` to toggle sidebar
   - `Esc` to close anything

5. **Use Threading Effectively**
   - Create threads for different topics
   - Fork threads to explore alternatives
   - Keep main conversation focused

### Workflow Suggestions

#### For Code Review
1. Increase preview panel to 70%
2. Enable line numbers
3. Use Recent Files to navigate changes
4. Create threads for each file reviewed

#### For Chat-Heavy Work
1. Increase conversation area to 60%
2. Keep sidebar visible for file access
3. Use command palette for quick actions
4. Create threads for different topics

#### For Exploration
1. Use default layout (balanced)
2. Toggle sidebar as needed
3. Keep Recent Files handy
4. Use advanced search for discovery

---

## Troubleshooting

### Common Issues

**Theme not applying:**
- Try hard refresh (`Ctrl/Cmd + Shift + R`)
- Clear browser cache

**Panel sizes not saving:**
- Check localStorage is enabled
- Reset to defaults and reconfigure

**Keyboard shortcuts not working:**
- Make sure you're not in a text input
- Check for browser extension conflicts

**Recent files not showing:**
- Open some files in the file tree
- Check Settings > Data tab

**File access denied:**
- Re-grant folder permissions
- Check browser settings for file access

---

## Additional Resources

- [Developer Guide](./DEVELOPER_GUIDE.md) - For contributors and developers
- [Changelog](./CHANGELOG.md) - Version history and new features
- [GitHub Issues](https://github.com/nutstore/creatorweave/issues) - Report bugs

---

**Last Updated**: 2025-02-08
**Version**: 0.2.0
