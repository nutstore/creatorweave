import { Node, mergeAttributes } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileMentionItem {
  path: string
  name: string
  extension?: string
  isDirectory?: boolean
}

export interface FileMentionOptions {
  /** Callback to search files. Should return matching FileMentionItem[]. */
  onSearch: (query: string) => Promise<FileMentionItem[]>
  /** Render callback for the suggestion dropdown (React). */
  render: () => {
    onStart: (props: SuggestionProps<FileMentionItem>) => void
    onUpdate: (props: SuggestionProps<FileMentionItem>) => void
    onExit: () => void
    onKeyDown: (props: SuggestionKeyDownProps) => boolean
  }
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export const FileMentionPluginKey = new PluginKey('fileMention')

/**
 * A tiptap node extension that represents a file reference inserted via `#`.
 *
 * Rendered as an inline chip with the file icon and path.  In the serialized
 * plain-text output it becomes `#path/to/file.ts`.
 */
export const FileMention = Node.create<FileMentionOptions>({
  name: 'fileMention',

  group: 'inline',

  inline: true,

  selectable: true,

  atom: true, // treated as a single unit – can't edit text inside

  addOptions() {
    return {
      onSearch: async () => [],
      render: () => ({
        onStart() {},
        onUpdate() {},
        onExit() {},
        onKeyDown() {
          return false
        },
      }),
    }
  },

  addAttributes() {
    return {
      path: { default: '' },
      name: { default: '' },
      extension: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-file-mention]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-file-mention': '',
        'data-path': node.attrs.path ?? '',
        class: 'text-sky-600 dark:text-sky-400',
      }),
      `#${node.attrs.path || node.attrs.name}`,
    ]
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: FileMentionPluginKey,
        char: '#',
        items: async ({ query }) => {
          // Skip obvious non-file patterns: hex color codes (#fff, #123, #aabbcc)
          if (/^[0-9a-fA-F]{1,6}$/.test(query)) return []
          return this.options.onSearch(query)
        },
        render: this.options.render,
        command: ({ editor, range, props }) => {
          // Insert the fileMention node at the #trigger range
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: 'fileMention',
                attrs: {
                  path: props.path,
                  name: props.name,
                  extension: props.extension ?? '',
                },
              },
              { type: 'text', text: ' ' },
            ])
            .run()
        },
        allowSpaces: true, // allow "src/components/App" queries
      }),
    ]
  },
})
