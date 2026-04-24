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
    const ext = (node.attrs.extension as string) || ''
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-file-mention': '',
        'data-path': node.attrs.path ?? '',
        class:
          'inline-flex items-center rounded px-1.5 py-0.5 bg-sky-100 text-sky-800 text-sm font-medium dark:bg-sky-900/60 dark:text-sky-200',
      }),
      ['span', { class: 'mr-1 opacity-60' }, [
        'svg',
        {
          xmlns: 'http://www.w3.org/2000/svg',
          width: '14',
          height: '14',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '2',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        },
        ['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }],
        ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
      ]],
      ['span', {}, node.attrs.name || node.attrs.path],
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
