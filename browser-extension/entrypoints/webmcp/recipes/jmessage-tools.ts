// ============================================================
// jmail.world/messages recipe implementation — DOM automation.
//
// Registered via @mcp-b/webmcp-polyfill in the page's MAIN world
// (see recipe-injector.content.ts). Every tool drives the real
// JMessage iMessage-style UI; nothing depends on private JSON
// APIs (the site's /api/* endpoints are not a public contract).
//
// DOM facts verified against the live site (2026-08-19):
//   - list rows:    a[href^="/messages/"] anchors whose innerText
//                   contains an "MM/DD/YY" date line and a preview
//   - detail URL:   /messages/{slug}; header meta description =
//                   "iMessage conversation with {name}. {N} messages."
//   - bubbles:      text blocks + time labels ("4:37 PM",
//                   "Sat, Jul 6, 2019 at 3:36 AM"); sender sides are
//                   styled (green/blue bubbles) — no semantic marks,
//                   so bubbles are returned in reading order with
//                   timestamps, sender inferred when possible
//                   (alternating runs between time separators are
//                   NOT reliable — the visual alignment classes are
//                   minified; we return raw text and let the caller
//                   interpret)
//   - navigation:   App Router reacts to real anchor clicks only;
//                   the sidebar list stays mounted across detail
//                   navigation (client-side), so list rows are
//                   clickable from a detail view too. "Back to list"
//                   = dock JMessage icon (client-side). The header
//                   "Close jMessage" button EXITS to the archive app
//                   at '/' — never use it for in-app navigation
//                   (verified live 2026-08-19).
//   - search:       input[placeholder="Search"] in the sidebar
//                   header (React controlled — use the native
//                   setter). Full-text search over ALL message
//                   bodies (verified live 2026-08-19: "Chernobyl"
//                   yields per-message results, not conversation
//                   titles). While a query is set, the sidebar
//                   swaps to a "Messages {N}" header + button rows
//                   (person + MM/DD/YY + snippet with <span>-
//                   highlighted terms; one row per matching
//                   message). Clearing the query restores the
//                   conversation list.
// ============================================================

// ── small DOM helpers (mirrors jmail-tools.ts conventions) ──

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitFor<T>(
  fn: () => T | null,
  { timeoutMs = 8000, pollMs = 120 }: { timeoutMs?: number; pollMs?: number } = {}
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const v = fn()
    if (v != null) return v
    if (Date.now() > deadline) throw new Error('Timed out waiting for a page element to appear')
    await sleep(pollMs)
  }
}

const ROW_DATE_RE = /\b\d{2}\/\d{2}\/\d{2}\b/

interface ConversationRow {
  slug: string
  name: string
  last_message: string
  date: string
}

/** Sidebar conversation rows: anchors into /messages/{slug} carrying a
 *  MM/DD/YY date line in their text (the dock and header links don't
 *  qualify — they have no date lines). */
function findConversationRows(): HTMLAnchorElement[] {
  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/messages/"]'))
  return anchors.filter((a) => {
    if (!a.offsetParent) return false // not visible
    return ROW_DATE_RE.test(a.innerText || '')
  })
}

function parseConversationRow(a: HTMLAnchorElement): ConversationRow | null {
  const slug = (a.getAttribute('href') || '').replace(/^\/messages\//, '').split(/[?#]/)[0]
  if (!slug) return null
  const lines = (a.innerText || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return null
  const dateLine = lines.find((l) => ROW_DATE_RE.test(l))
  if (!dateLine) return null
  // First line is the display name (possibly prefixed by initials).
  let name = lines[0]
  // The preview is the last non-date line; strip it off the name soup.
  const nonDate = lines.filter((l) => l !== dateLine)
  const preview = nonDate.length > 1 ? nonDate[nonDate.length - 1] : ''
  return {
    slug,
    name,
    last_message: preview.slice(0, 200),
    date: (dateLine.match(ROW_DATE_RE) || [''])[0],
  }
}

function readConversationRows(limit: number): ConversationRow[] {
  const seen = new Set<string>()
  const out: ConversationRow[] = []
  for (const a of findConversationRows()) {
    const info = parseConversationRow(a)
    if (!info || seen.has(info.slug)) continue
    seen.add(info.slug)
    out.push(info)
    if (out.length >= limit) break
  }
  return out
}

/** Conversation metadata from the detail view's meta description:
 *  "iMessage conversation with Steve Bannon. 3356 messages." */
function readConversationMeta(): { name: string; messageCount: number | null } | null {
  const desc = document.querySelector('meta[name="description"]')?.getAttribute('content') || ''
  const m = desc.match(/^iMessage conversation with (.+?)\. (\d+) messages\.?$/)
  if (!m) return null
  return { name: m[1], messageCount: Number(m[2]) }
}

const TIME_LABEL_RE =
  /^(\d{1,2}:\d{2}\s?(?:AM|PM)|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*, [A-Z][a-z]{2} \d{1,2}, \d{4}(?: at [\d:]+\s?(?:AM|PM))?)$/

/** Message bubbles currently rendered in the open detail view.
 *  Returns them in DOM order; time labels are attached to the
 *  bubbles that follow them. */
function readVisibleBubbles(): Array<{ text: string; time: string | null }> {
  // The conversation pane is the scrollable region right of the sidebar.
  // Bubbles are leaf-ish divs whose text is not a time label and not
  // header/dock chrome. We walk all text-bearing blocks and keep those
  // between the first time label and the end (the transcript region).
  const root = document.querySelector('main') || document.body
  const blocks = Array.from((root as HTMLElement).querySelectorAll<HTMLElement>('div'))
    .filter((el) => el.childElementCount === 0 && (el.innerText || '').trim().length > 0)
    .map((el) => (el.innerText || '').trim())

  const out: Array<{ text: string; time: string | null }> = []
  let currentTime: string | null = null
  let started = false
  for (const text of blocks) {
    if (TIME_LABEL_RE.test(text)) {
      currentTime = text
      started = true
      continue
    }
    if (!started) continue // skip header/sidebar before the transcript
    out.push({ text: text.slice(0, 4000), time: currentTime })
  }
  return out
}

function currentSlug(): string | null {
  const m = location.pathname.match(/^\/messages\/([^/?#]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

// ── search (sidebar input, swaps the list to per-message results) ──

interface MessageSearchRow {
  index: number
  person: string
  date: string
  snippet: string
  slug: string
}

/** The sidebar search input (React controlled). */
function findSearchInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('input[placeholder="Search"]')
}

/** Set the search query through the native value setter so React's
 *  onChange fires (same trick as jmail-tools.ts setSearchValue). */
function setSearchQuery(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  if (setter) setter.call(input, value)
  else input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/** "MESSAGES {N}" header line shown while a search query is active.
 *  Only meaningful when the search input has a value — otherwise the
 *  sidebar header shows a plain label that would falsely pick up
 *  unrelated digits.
 *  Verified live (2026-08-19): the site renders an UPPERCASE
 *  "MESSAGES" label and the count as SEPARATE lines — innerText is
 *  "MESSAGES\n4" (newline separator, uppercase, no <main> element;
 *  body-level match). Hence case-insensitive + \s* separator. */
function readSearchResultCount(): number | null {
  const input = findSearchInput()
  if (!input || !input.value.trim()) return null
  const root = document.querySelector('main') || document.body
  const m = ((root as HTMLElement).innerText || '').match(/MESSAGES\s*(\d+)/i)
  return m ? Number(m[1]) : null
}

/** Result rows while a query is active: button rows with a person +
 *  MM/DD/YY date + snippet. No href — the slug is recovered from the
 *  avatar image's src (/people-thumbnails/{slug}.png), verified live. */
function readSearchResultRows(limit: number): MessageSearchRow[] {
  const main = document.querySelector('main')
  if (!main) return []
  const rows: MessageSearchRow[] = []
  const seen = new Set<string>()
  // Result rows are <button>s containing a date line — conversation
  // rows are anchors, and the search input itself has no date.
  for (const btn of Array.from(main.querySelectorAll<HTMLButtonElement>('button'))) {
    if (!btn.offsetParent) continue
    const text = (btn.innerText || '').trim()
    if (!text || !ROW_DATE_RE.test(text)) continue
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    const dateLine = lines.find((l) => ROW_DATE_RE.test(l))
    if (!dateLine) continue
    const idxDate = lines.indexOf(dateLine)
    const person = lines.slice(0, idxDate).join(' ').trim()
    const snippet = lines.slice(idxDate + 1).join(' ').trim()
    if (!person || !snippet) continue
    // Dedup identical rows (person+date+snippet can repeat on multi-hit
    // long messages rendered identically).
    const key = `${person}|${dateLine}|${snippet.slice(0, 80)}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      index: rows.length,
      person,
      date: (dateLine.match(ROW_DATE_RE) || [''])[0],
      snippet: snippet.slice(0, 300),
      slug: slugFromRowImage(btn) || '',
    })
    if (rows.length >= limit) break
  }
  return rows
}

/** Recover the conversation slug from a row's avatar image. The
 *  search-result buttons have no href, but the avatar path encodes
 *  the slug. Two shapes verified live (2026-08-19):
 *    1. Next.js optimizer: /_next/image?url=%2Fpeople-thumbnails%2F{slug}.png&w=256&…
 *       (path percent-encoded inside the url= query param)
 *    2. Direct path (unoptimized builds): /people-thumbnails/{slug}.png */
function slugFromRowImage(row: HTMLElement): string | null {
  const img = row.querySelector<HTMLImageElement>('img[src*="people-thumbnails"]')
  if (!img) return null
  const src = img.getAttribute('src') || ''
  // Match either the encoded (%2F) or literal (/) form; slug runs up
  // to the extension or the next '&'/'?' boundary.
  const qm = src.match(/people-thumbnails(?:%2F|\/)([^&]+?)(?:\.\w{2,5})?(?:$|&)/i)
  if (qm) {
    try {
      return decodeURIComponent(qm[1])
    } catch {
      return qm[1]
    }
  }
  return null
}

/** Re-locate the on-screen button for a parsed search-result row.
 *  readSearchResultRows dedups, so raw button order ≠ row indices —
 *  match by person prefix + date + snippet head instead. */
function findSearchResultButton(row: MessageSearchRow): HTMLButtonElement | null {
  const main = document.querySelector('main')
  if (!main) return null
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
  const person = norm(row.person)
  const snippetHead = norm(row.snippet).slice(0, 40)
  for (const btn of Array.from(main.querySelectorAll<HTMLButtonElement>('button'))) {
    if (!btn.offsetParent) continue
    const text = norm(btn.innerText || '')
    if (!text.includes(row.date)) continue
    if (!text.startsWith(person)) continue
    if (snippetHead && !text.includes(snippetHead)) continue
    return btn
  }
  return null
}

// ── tool implementations ──

export const jmessageToolImplementations: Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> = {
  async search_messages(args) {
    const query = String(args.query || '').trim()
    if (!query) throw new Error('query is required')
    const limit = Math.max(1, Math.min(25, Number(args.limit) || 10))

    const input = await waitFor(() => findSearchInput())
    setSearchQuery(input, query)

    // The sidebar swaps from conversation list to "Messages {N}" result
    // rows as React re-renders. Wait for either state, then read rows.
    // Filtering is client-side and fast, but large conversations can
    // take a moment — soft-fail like jmail's search_emails.
    const rows = await waitFor(
      () => {
        const r = readSearchResultRows(limit)
        return r.length > 0 ? r : null
      },
      { timeoutMs: 8000 },
    ).catch(() => null)

    if (!rows) {
      return {
        query,
        total_matches: readSearchResultCount(),
        count: 0,
        results: [],
        note: 'No matching messages rendered. The query may genuinely have no hits — the UI header would show "Messages 0".',
      }
    }

    return {
      query,
      total_matches: readSearchResultCount(),
      count: rows.length,
      results: rows,
      hint: 'Use open_conversation with the slug to read the conversation around a hit; load_older_messages pages back through history.',
    }
  },

  async list_conversations(args) {
    const limit = Math.max(1, Math.min(50, Number(args.limit) || 15))
    // Sidebar rows exist on both the list view and detail views.
    let rows = readConversationRows(limit)
    if (rows.length === 0) {
      // Not on a /messages view (or list still hydrating). Navigate to
      // the app root via the real dock anchor — App Router needs a
      // genuine click.
      const dockLink = document.querySelector<HTMLAnchorElement>('.jmail-dock a[href="/messages"], a[href="/messages"]')
      if (dockLink) {
        dockLink.click()
        await waitFor(() => (location.pathname.startsWith('/messages') ? ({} as const) : null))
        rows = readConversationRows(limit)
      }
    }
    return {
      count: rows.length,
      conversations: rows,
      hint: 'Use open_conversation with a slug to read the messages.',
    }
  },

  async open_conversation(args) {
    const slug = String(args.person || '').trim()
    if (!slug || !/^[A-Za-z0-9_\-.%]+$/.test(slug)) {
      throw new Error('person is required (slug from list_conversations, e.g. steve-bannon)')
    }
    // Click the real sidebar/dock anchor — client-side navigation
    // keeps the page alive, so the tool context survives.
    const anchor = document.querySelector<HTMLAnchorElement>(
      `a[href="/messages/${CSS.escape(slug)}"]`,
    )
    if (!anchor) {
      return {
        navigated: false,
        error: `No conversation row for "${slug}". Call list_conversations for the available slugs.`,
      }
    }
    anchor.click()
    await waitFor(
      () => (location.pathname === `/messages/${slug}` ? ({} as const) : null),
      { timeoutMs: 8000 },
    )
    // Wait for the transcript to render (first bubbles / meta).
    await waitFor(
      () => (readVisibleBubbles().length > 0 ? ({} as const) : null),
      { timeoutMs: 8000 },
    ).catch(() => {})
    const meta = readConversationMeta()
    return {
      url: location.pathname,
      person: meta?.name || slug,
      slug,
      message_count: meta?.messageCount ?? null,
      visible_messages: readVisibleBubbles(),
      note: 'Newest messages render first. Long conversations lazy-load history — call load_older_messages to page back through time.',
    }
  },

  async clear_message_search() {
    const input = await waitFor(() => findSearchInput())
    if (!input.value) {
      return { cleared: false, note: 'No search is currently active.' }
    }
    setSearchQuery(input, '')
    // The sidebar swaps back to the conversation list (anchors with date
    // lines). Wait so a follow-up list_conversations reads fresh rows.
    await waitFor(
      () => (findConversationRows().length > 0 ? ({} as const) : null),
      { timeoutMs: 5000 },
    ).catch(() => {})
    return {
      cleared: true,
      note: 'Search cleared; the conversation list is restored.',
    }
  },

  async open_search_result(args) {
    const index = Number(args.index)
    if (!Number.isInteger(index) || index < 0) {
      throw new Error('index must be a non-negative integer (0-based row from search_messages results)')
    }
    // Rows must still be on screen — a stale search (cleared by a prior
    // open_search_result or user action) leaves nothing to click.
    const rows = readSearchResultRows(index + 1)
    const row = rows[index]
    if (!row) {
      return {
        navigated: false,
        error: `No search-result row at index ${index}. Run search_messages again first — opening a result clears the list (or the search was cleared).`,
      }
    }
    const btn = findSearchResultButton(row)
    if (!btn) {
      return {
        navigated: false,
        error: `Could not relocate the on-screen row for index ${index} (${row.person}, ${row.date}). Run search_messages again.`,
      }
    }
    btn.click()
    // The site clears the search and navigates client-side to the
    // conversation detail. Wait for the URL flip + transcript.
    await waitFor(
      () => (/^\/messages\/[^/]+$/.test(location.pathname) ? ({} as const) : null),
      { timeoutMs: 8000 },
    )
    await waitFor(
      () => (readVisibleBubbles().length > 0 ? ({} as const) : null),
      { timeoutMs: 8000 },
    ).catch(() => {})
    const meta = readConversationMeta()
    const slug = currentSlug()
    return {
      url: location.pathname,
      person: meta?.name || row.person,
      slug,
      message_count: meta?.messageCount ?? null,
      matched_message_date: row.date,
      matched_snippet: row.snippet,
      visible_messages: readVisibleBubbles(),
      note: 'The conversation renders from the NEWEST message; the hit may be older — use load_older_messages to page back toward its date.',
    }
  },

  async open_email_archive() {
    // Cross-APP navigation (/messages → /): the dock's Jmail icon is a
    // real anchor; clicking it client-side-navigates to the archive.
    // The recipe toolset swaps after the bridge's route-change poll
    // fires (~1s) — jmessage tools unregister, jmail tools register.
    // This tool's context SURVIVES the navigation (no page reload), so
    // we return a soft pointer instead of reading archive DOM that
    // hasn't rendered yet.
    const dockLink = document.querySelector<HTMLAnchorElement>('.jmail-dock a[href="/"]')
    if (!dockLink) {
      return {
        navigated: false,
        error: 'Jmail dock entry not found — are you on a jmail.world page?',
      }
    }
    dockLink.click()
    await waitFor(
      () => (location.pathname === '/' ? ({} as const) : null),
      { timeoutMs: 8000 },
    )
    return {
      navigated: true,
      url: location.pathname,
      note: 'Switched to the email archive app. Its tools (search_emails, open_thread, …) register within ~1-2s; the system-prompt tool list swaps on the next turn. Call search_emails or get_current_view to start reading mail.',
    }
  },

  async open_conversation_list() {
    // Preferred: the dock's JMessage icon is a real next/link anchor —
    // works from list AND detail views, client-side, keeps this app.
    // The header "Close jMessage" button is deliberately NOT used:
    // it exits the whole JMessage app to the archive at '/' (verified
    // live 2026-08-19).
    const dockLink = document.querySelector<HTMLAnchorElement>('.jmail-dock a[href="/messages"]')
    if (!dockLink) {
      return {
        navigated: false,
        error: 'JMessage dock entry not found — are you on a jmail.world page?',
      }
    }
    if (location.pathname === '/messages') {
      return { navigated: true, url: location.pathname, note: 'Already on the conversation list.' }
    }
    dockLink.click()
    await waitFor(
      () => (location.pathname === '/messages' ? ({} as const) : null),
      { timeoutMs: 8000 },
    )
    // Wait for the sidebar list (conversation rows) to be back.
    await waitFor(
      () => (findConversationRows().length > 0 ? ({} as const) : null),
      { timeoutMs: 8000 },
    ).catch(() => {})
    const rows = readConversationRows(5)
    return {
      navigated: true,
      url: location.pathname,
      page_title: document.title,
      latest: rows,
      hint: 'Conversation list restored. Use open_conversation or search_messages to continue.',
    }
  },

  async get_current_conversation() {
    const slug = currentSlug()
    if (!slug) {
      return {
        on_messages_view: false,
        note: 'Not on a JMessage conversation view. Call list_conversations first.',
      }
    }
    const meta = readConversationMeta()
    return {
      url: location.pathname,
      person: meta?.name || slug,
      slug,
      message_count: meta?.messageCount ?? null,
      visible_messages: readVisibleBubbles(),
    }
  },

  async load_older_messages(args) {
    const times = Math.max(1, Math.min(10, Number(args.times) || 3))
    if (!currentSlug()) {
      return {
        loaded: false,
        note: 'Not on a JMessage conversation view. Call open_conversation first.',
      }
    }
    // The transcript scrolls: scrolling toward the top loads older
    // batches. Find the scrollable pane (the tallest scrollable div).
    const scrollables = Array.from(document.querySelectorAll<HTMLElement>('main div'))
      .filter((el) => el.scrollHeight > el.clientHeight + 50)
      .sort((a, b) => b.scrollHeight - a.scrollHeight)
    const pane = scrollables[0]
    if (!pane) {
      return { loaded: false, note: 'No scrollable transcript pane found on this view.' }
    }
    const before = readVisibleBubbles().length
    for (let i = 0; i < times; i++) {
      pane.scrollTo({ top: 0, behavior: 'auto' })
      pane.dispatchEvent(new Event('scroll', { bubbles: true }))
      await sleep(600) // let the lazy loader fetch + render
    }
    const bubbles = readVisibleBubbles()
    return {
      loads_performed: times,
      messages_before: before,
      messages_after: bubbles.length,
      newly_visible: bubbles.slice(0, Math.max(0, bubbles.length - before)),
      visible_messages: bubbles,
    }
  },
}
