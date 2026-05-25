import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlashCommandItem {
  /** Command ID, e.g. 'compact' */
  id: string
  /** Display label, e.g. 'Compact' */
  label: string
  /** Short description shown in the dropdown */
  description: string
}

/** v1 hardcoded command list */
export const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: 'compact',
    label: 'Compact',
    description: '压缩上下文，释放 token 空间',
  },
]

// ---------------------------------------------------------------------------
// Plugin key
// ---------------------------------------------------------------------------

export const SlashCommandPluginKey = new PluginKey('slashCommand')

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export interface SlashCommandOptions {
  /** Called when user selects a command from the dropdown */
  onSelect: (command: SlashCommandItem) => void
  /** Suggestion render callback (provided by AgentRichInput) */
  render: () => {
    onStart: (props: any) => void
    onUpdate: (props: any) => void
    onExit: () => void
    onKeyDown: (props: any) => boolean
  }
}

/**
 * Slash command extension — shows a command menu when the user types `/`.
 *
 * Unlike FileMention, this does NOT insert a custom node into the editor.
 * On selection it deletes the trigger character and notifies the parent
 * component via `onSelect`.
 */
export const SlashCommandExtension = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      onSelect: (_command: SlashCommandItem) => {},
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

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: SlashCommandPluginKey,
        char: '/',
        items: ({ query }) => {
          const q = query.toLowerCase().trim()
          return SLASH_COMMANDS.filter(
            (cmd) => cmd.id.includes(q) || cmd.label.toLowerCase().includes(q),
          )
        },
        render: this.options.render,
        command: ({ editor, range, props }) => {
          // Remove the '/' trigger character
          editor.chain().focus().deleteRange(range).run()
          // Notify parent
          this.options.onSelect(props)
        },
      }),
    ]
  },
})
