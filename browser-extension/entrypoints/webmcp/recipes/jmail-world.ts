// ============================================================
// jmail.world recipe — DOM-automation WebMCP tools for the
// Epstein email archive (public House Oversight release).
//
// jmail has NO public JSON API (verified: /api/* 404s), so every
// tool drives the real Gmail-style UI: fills the search box,
// clicks thread rows, reads the rendered thread view. Selectors
// were verified against the live site (2026-08-18):
//   - search input: input[name="q"]  (form in header)
//   - thread URL:   /thread/{doc_id}
//   - list rows:    plain divs (no href) — see jmail-tools.ts
// All tools are read-only (readOnlyHint).
//
// Path scope: jmail.world hosts several distinct apps (JMessage
// /messages, JPhotos /photos, JDrive /drive, JFlights, Jamazon,
// …). This recipe covers ONLY the Gmail-style email archive
// views listed in pathPrefixes.
// ============================================================

import type { WebMCPRecipe } from './types'

export const jmailRecipe: WebMCPRecipe = {
  id: 'jmail-world',
  hostname: 'jmail.world',
  // Scoped to the Gmail-style archive app only — the same hostname
  // also serves JMessage (/messages) with its own recipe, and other
  // apps (photos/drive/flights/…) that have no recipe at all.
  pathPrefixes: [
    '/',
    '/search',
    '/thread',
    '/person',
    '/topic',
    '/starred',
    '/unredactions',
    '/sent',
    '/attachments',
    '/activity',
  ],
  displayName: 'Jmail — Epstein Email Archive',
  description:
    'Search and read the 7,499 released Jeffrey Epstein emails directly in the Gmail-style archive UI.',
  category: 'archive',
  version: '1.0.0',
  glyph: '📧',
  tools: [
    {
      name: 'search_emails',
      title: 'Search emails',
      description:
        'Search the Epstein email archive by keyword using the site search box. Returns the top matching email threads (subject, sender, date, preview, doc id).',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keywords' },
          limit: {
            type: 'number',
            description: 'Max threads to return (default 10)',
            minimum: 1,
            maximum: 25,
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'open_result',
      title: 'Open a search result',
      description:
        'Open the Nth row (0-based) from the last search_emails result list by clicking it, then return the thread content. Prefer this over open_thread — indexes come straight from the last search.',
      inputSchema: {
        type: 'object',
        properties: {
          index: { type: 'number', description: '0-based row index from search_emails results', minimum: 0 },
        },
        required: ['index'],
      },
    },
    {
      name: 'open_thread',
      title: 'Open an email thread',
      description:
        'Open an email thread by doc id in the archive UI and return its rendered content (sender, date, subject, body text).',
      inputSchema: {
        type: 'object',
        properties: {
          doc_id: {
            type: 'string',
            description: 'Thread doc id from search_emails results (e.g. HOUSE_OVERSIGHT_016203)',
          },
        },
        required: ['doc_id'],
      },
    },
    {
      name: 'get_current_view',
      title: 'Read the open email',
      description:
        'Read the email thread currently open in the archive view, without navigating. Returns sender, date, subject and body text.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'list_topics',
      title: 'List curated topics',
      description:
        'List the curated topic categories shown in the archive sidebar (Asking for advice, Introductions, Damage control, Epstein & Brunel).',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'list_people',
      title: 'List people in the archive',
      description:
        'List the notable people with dedicated archive pages (Ghislaine Maxwell, Bill Gates, Prince Andrew, Elon Musk, …) with their slugs for browse_person.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'next_thread',
      title: 'Next thread',
      description:
        'Click the "Next thread" pager on a thread view to walk through the result list one email at a time (e.g. a 50-message FBI thread). Pass steps to jump several at once in long threads (e.g. the 968-message Brunel thread).',
      inputSchema: {
        type: 'object',
        properties: {
          steps: {
            type: 'number',
            description: 'How many emails to advance (default 1, max 49)',
            minimum: 1,
            maximum: 49,
          },
        },
      },
    },
    {
      name: 'prev_thread',
      title: 'Previous thread',
      description:
        'Click the "Previous thread" pager to step back in the current list. Pass steps to jump several at once.',
      inputSchema: {
        type: 'object',
        properties: {
          steps: {
            type: 'number',
            description: 'How many emails to go back (default 1, max 49)',
            minimum: 1,
            maximum: 49,
          },
        },
      },
    },
    {
      name: 'browse_person',
      title: 'Browse a person',
      description:
        "Open a person's archive page (all their emails) by slug from list_people, e.g. ghislaine-maxwell, bill-gates.",
      inputSchema: {
        type: 'object',
        properties: {
          person: { type: 'string', description: 'Person slug from list_people (e.g. ghislaine-maxwell)' },
        },
        required: ['person'],
      },
    },
    {
      name: 'filter_by_date',
      title: 'Filter by date range',
      description:
        'Filter the current inbox/search view by date using the site\u2019s Date control. Provide after and/or before as YYYY-MM-DD. Works on the inbox home view (open go_home first if you are on a thread page).',
      inputSchema: {
        type: 'object',
        properties: {
          after: { type: 'string', description: 'Only emails on/after this date (YYYY-MM-DD)' },
          before: { type: 'string', description: 'Only emails on/before this date (YYYY-MM-DD)' },
          limit: { type: 'number', description: 'Max rows to return (default 10, max 25)', minimum: 1, maximum: 25 },
        },
      },
    },
    {
      name: 'open_message_app',
      title: 'Switch to the JMessage app',
      description:
        'Switch from the email archive to the jmail.world JMessage app (/messages) — the iMessage-style text conversations, a different app with its own toolset (search_messages, open_conversation, …). After it runs, the system prompt\'s <current_page_webmcp> list swaps to the JMessage tools.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'clear_date_filter',
      title: 'Clear date filter',
      description:
        'Clear the active date filter and restore the full list (clicks the site\u2019s Clear button). No-op with a note when no filter is active. On a thread page, call go_home first.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'browse_folder',
      title: 'Switch folder',
      description:
        'Switch to a sidebar folder: inbox, starred, unredactions, sent, attachments, or activity. Returns the folder\u2019s first rows (e.g. starred = community-starred emails, sent = mail Epstein wrote).',
      inputSchema: {
        type: 'object',
        properties: {
          folder: {
            type: 'string',
            enum: ['inbox', 'starred', 'unredactions', 'sent', 'attachments', 'activity'],
            description: 'Folder to open',
          },
        },
        required: ['folder'],
      },
    },
    {
      name: 'browse_topic',
      title: 'Browse a topic',
      description:
        'Open a curated topic page by slug from list_topics, e.g. damage-control, epstein-brunel-collaboration.',
      inputSchema: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Topic slug from list_topics (e.g. damage-control)' },
        },
        required: ['topic'],
      },
    },
    {
      name: 'go_home',
      title: 'Back to inbox',
      description: 'Navigate back to the main inbox view of the archive.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}
