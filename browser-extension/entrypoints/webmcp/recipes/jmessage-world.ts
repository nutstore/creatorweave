// ============================================================
// jmail.world/messages recipe — DOM-automation WebMCP tools for
// JMessage, the iMessage-style view of the Epstein archive
// (text-message conversations extracted from the releases).
//
// The same hostname also serves the Gmail-style archive, which
// has its own recipe (jmail-world) — pathPrefixes keep the two
// toolsets from leaking into each other's views.
//
// DOM facts verified against the live site (2026-08-19):
//   - app root:      /messages (conversation list),
//                    /messages/{slug} (conversation detail)
//   - list rows:     a[href^="/messages/"] — anchor rows whose
//                    innerText contains a "MM/DD/YY" date line
//                    (e.g. "Steve Bannon07/06/19You r not coming in?")
//   - detail header: meta[name=description] = "iMessage
//                    conversation with {name}. {N} messages."
//   - bubbles:       rendered text blocks separated by time
//                    labels ("4:37 PM", "Sat, Jul 6, 2019 at …")
//   - dock:          bottom macOS-style dock (div.jmail-dock) is
//                    part of the same React tree; its anchors
//                    navigate client-side
//   - search:        input[placeholder="Search"] in the sidebar
//                    header (React controlled). Full-text search
//                    across ALL message bodies (verified live:
//                    "Chernobyl" returns per-message results, not
//                    conversation titles). While typing, the
//                    sidebar swaps to a "Messages {N}" result list
//                    of button rows (person + MM/DD/YY + snippet
//                    with highlighted terms); each result shows one
//                    matching message. Clicking a result navigates
//                    to /messages/{slug} (client-side) and clears
//                    the search. Empty query restores the
//                    conversation list.
// All tools are read-only (readOnlyHint).
// ============================================================

import type { WebMCPRecipe } from './types'

export const jmessageRecipe: WebMCPRecipe = {
  id: 'jmessage-world',
  hostname: 'jmail.world',
  // Scoped to the JMessage app only (list + conversation details).
  pathPrefixes: ['/messages'],
  displayName: 'JMessage — Epstein iMessage Archive',
  description:
    'Browse and read the iMessage-style text conversations from the Epstein archive (15 conversations, e.g. Steve Bannon with 3,356 messages).',
  category: 'archive',
  version: '1.1.0',
  glyph: '💬',
  tools: [
    {
      name: 'search_messages',
      title: 'Search messages',
      description:
        'Full-text search across ALL iMessage messages (not just conversation titles) using the JMessage search box. Returns matching messages with person, date, snippet and the conversation slug — use open_conversation with the slug to read the context around a hit.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keywords' },
          limit: {
            type: 'number',
            description: 'Max messages to return (default 10, max 25)',
            minimum: 1,
            maximum: 25,
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'list_conversations',
      title: 'List conversations',
      description:
        'List the iMessage conversations shown in the JMessage sidebar (person, slug, last message, date). Use open_conversation with the slug to read one.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Max conversations to return (default 15, max 50)',
            minimum: 1,
            maximum: 50,
          },
        },
      },
    },
    {
      name: 'open_conversation',
      title: 'Open a conversation',
      description:
        "Open a conversation by person slug (from list_conversations, e.g. steve-bannon) and return its visible messages (sender, text, time). JMessage renders the newest messages first; use scroll_to older/next_pages as needed.",
      inputSchema: {
        type: 'object',
        properties: {
          person: {
            type: 'string',
            description: 'Person slug from list_conversations (e.g. steve-bannon)',
          },
        },
        required: ['person'],
      },
    },
    {
      name: 'clear_message_search',
      title: 'Clear message search',
      description:
        'Clear the active JMessage search and restore the normal conversation list. No-op with a note when no search is active. (The site also clears the search automatically when you open a search result.)',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'open_search_result',
      title: 'Open a search result',
      description:
        'Open the Nth row (0-based) from the last search_messages result list by clicking it, then return the conversation (person, slug, message count, visible messages). The site clears the search box automatically. The conversation renders from the NEWEST message — the hit may be older, so use load_older_messages to page back toward it.',
      inputSchema: {
        type: 'object',
        properties: {
          index: {
            type: 'number',
            description: '0-based row index from search_messages results',
            minimum: 0,
          },
        },
        required: ['index'],
      },
    },
    {
      name: 'open_email_archive',
      title: 'Switch to the email archive app',
      description:
        'Switch from JMessage to the jmail.world Gmail-style EMAIL archive app (/) — a different app on the same site with its own toolset (search_emails, open_thread, …). After it runs, the system prompt\'s <current_page_webmcp> list swaps to the archive tools. Use open_conversation_list to stay inside JMessage.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'open_conversation_list',
      title: 'Back to conversation list',
      description:
        'Navigate back to the JMessage conversation list (/messages) from any JMessage view — closes the open conversation WITHOUT leaving the app (also clears any active search). This is the JMessage home, NOT the jmail.world email archive homepage (/). Clicks the dock\'s JMessage icon behind the scenes; never uses the page\'s "Close jMessage" button (that exits the whole app to /).',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_current_conversation',
      title: 'Read the open conversation',
      description:
        'Read the conversation currently open in the JMessage view without navigating. Returns person, slug, message count and the visible message bubbles.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'load_older_messages',
      title: 'Load older messages',
      description:
        'Scroll the open JMessage conversation up to load and read older messages (long conversations lazy-load history as you scroll). Returns the newly visible messages.',
      inputSchema: {
        type: 'object',
        properties: {
          times: {
            type: 'number',
            description: 'How many scroll loads to perform (default 3, max 10)',
            minimum: 1,
            maximum: 10,
          },
        },
      },
    },
  ],
}
