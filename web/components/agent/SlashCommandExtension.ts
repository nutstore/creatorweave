import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import {
  searchSlashCommands,
  type SlashCommandItem,
} from '@/skills/slash-command-registry'

// ---------------------------------------------------------------------------
// Types (re-export for convenience)
// ---------------------------------------------------------------------------

export type { SlashCommandItem } from '@/skills/slash-command-registry'

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
 * This extension is a pure UI layer. It does NOT define commands.
 * All commands come from the slash-command-registry module.
 *
 * Command registration happens in:
 * - `slash-command-registry.ts` → `registerBuiltinSlashCommands()` (compact etc.)
 * - `skills-system-init.ts` → registers builtin skills
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
        items: ({ query }) => searchSlashCommands(query),
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
