// ============================================================
// jmail.world recipe implementation — DOM automation tools.
//
// Registered via @mcp-b/webmcp-polyfill in the page's MAIN world
// (see recipe-injector.content.ts). Every tool drives the real
// Gmail-style UI elements; nothing depends on private JSON APIs.
//
// DOM facts verified against the live site (2026-08-18):
//   - search input:  input[name="q"] (form submits to /search, client-side)
//   - search rows:   plain divs (NO href) — checkbox + star/mystery buttons
//                    + sender div + subject/preview wrapper + date div
//                    ("Jul 10, 2019"). Date div is the stable anchor for
//                    row parsing; rows are opened by real clicks (React
//                    router handles navigation, tool context survives).
//   - thread URL:    /thread/{doc_id}
//   - topics:        real anchors a[href^="/topic/"]
// Icon <i> elements render ligature text ("star_border", "chevron_right")
// which pollutes innerText — filtered via ICON_NOISE.
// ============================================================

// ── small DOM helpers ──

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

function setSearchValue(input: HTMLInputElement, value: string): void {
  // React controlled input: go through the native setter so the
  // framework's onChange actually fires.
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  if (setter) setter.call(input, value)
  else input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/** SPA navigation the React router understands, without reloading the page. */
function navigateInApp(path: string): void {
  history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

// Material icon ligatures that pollute innerText — drop exact-match lines.
const ICON_NOISE = new Set([
  'arrow_back', 'chevron_left', 'chevron_right', 'first_page', 'last_page',
  'arrow_drop_down', 'arrow_upward', 'star_border', 'star', 'mystery', 'link',
  'reply', 'forward', 'inbox', 'send', 'attach_file', 'calendar_today', 'edit',
  'question_answer', 'handshake', 'shield', 'bakery_dining', 'north_east',
  'folder_open', 'date_range', 'menu', 'search', 'person', 'people', 'close',
  'feedback', 'help_outline', 'settings', 'visibility_off', 'gavel', 'mail',
  'markunread', 'drafts', 'schedule', 'label', 'delete', 'share', 'add',
  'open_in_full', 'restart_alt', 'view_sidebar', 'science', 'tune',
  'subdirectory_arrow_right', 'verified', 'local_offer', 'unfold_more',
])

function filterIconNoise(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !ICON_NOISE.has(l))
    .join('\n')
}

// ── search result rows (plain divs — parse via the date anchor) ──

const DATE_RE = /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/

interface RowInfo {
  index: number
  sender: string
  subject: string
  date: string
  preview: string
}

/** The outermost per-row container: the ancestor of a checkbox that still
 *  contains exactly one checkbox (the list container holds dozens). */
function findRowElements(): HTMLElement[] {
  const main = document.querySelector('main')
  if (!main) return []
  const rows: HTMLElement[] = []
  for (const cb of Array.from(main.querySelectorAll('input[type="checkbox"]'))) {
    let row: HTMLElement = cb
    while (row.parentElement) {
      const parent = row.parentElement
      if (!parent.contains(main) && parent.querySelectorAll('input[type="checkbox"]').length !== 1) break
      if (parent === main || !main.contains(parent)) break
      if (parent.querySelectorAll('input[type="checkbox"]').length !== 1) break
      row = parent
    }
    if (row !== cb && !rows.includes(row)) rows.push(row)
  }
  return rows
}

function parseRow(row: HTMLElement, index: number): RowInfo | null {
  // The date div ("Jul 10, 2010") is the stable anchor; its parent holds all fields.
  let dateDiv: HTMLElement | null = null
  for (const el of Array.from(row.querySelectorAll<HTMLElement>('div'))) {
    if (DATE_RE.test((el.innerText || '').trim())) {
      // prefer the innermost match (the div itself, not wrappers)
      if (!dateDiv || el.contains(dateDiv)) dateDiv = el
      else if (!dateDiv.contains(el)) dateDiv = dateDiv // keep first innermost
      else dateDiv = el
    }
  }
  if (!dateDiv) return null
  const fields = dateDiv.parentElement
  if (!fields) return null

  let sender = ''
  let subject = ''
  let preview = ''
  const date = (dateDiv.innerText || '').trim()

  for (const child of Array.from(fields.children)) {
    const el = child as HTMLElement
    if (el.querySelector('input[type="checkbox"]')) continue
    if (el.querySelector('button')) continue // star / mystery / counts
    if (el === dateDiv) continue
    const kids = Array.from(el.children) as HTMLElement[]
    const text = (el.innerText || '').trim()
    if (!text) continue
    // subject wrapper: has a child whose text starts with "-" (preview)
    const previewKid = kids.find((k) => ((k.innerText || '').trim().startsWith('-')))
    if (previewKid && !subject) {
      // subject = the longest non-preview kid whose text is NOT a dataset
      // badge ("DOJ 9") or a placeholder ("(no subject)") — badge texts can
      // be the longest leaf when the real subject line is short/missing.
      const candidates = kids
        .filter((k) => k !== previewKid)
        .map((k) => (k.innerText || '').trim().split('\n')[0])
        .filter((t) => t.length > 0 && !/^DOJ \d+$/.test(t) && t !== '(no subject)')
        .sort((a, b) => b.length - a.length)
      // No candidate → the row genuinely has no subject line. Use the
      // placeholder rather than the whole wrapper text (badge + preview mix).
      subject = candidates[0] || '(no subject)'
      preview = (previewKid.innerText || '').trim().replace(/^-\s*/, '').slice(0, 300)
    } else if (!sender) {
      sender = text.replace(/\s*\d+$/, '').trim() // strip trailing msg-count digits
    }
  }
  if (!subject && !sender) return null
  return { index, sender, subject, date, preview }
}

function readRows(limit: number): RowInfo[] {
  const out: RowInfo[] = []
  const rows = findRowElements()
  for (let i = 0; i < rows.length && out.length < limit; i++) {
    const info = parseRow(rows[i], i)
    if (info) out.push(info)
  }
  return out
}

function readTotalCount(): string | null {
  const main = document.querySelector('main')
  if (!main) return null
  // Search pages use "1-50 of 1000" (hyphen); person/topic pages use
  // "1–100 of 3233" (en-dash) — accept both separators.
  const m = ((main as HTMLElement).innerText || '').match(/\d+\s*[-–—]\s*\d+\s+of\s+(\d+)/)
  return m ? m[1] : null
}

function readThreadView(): Record<string, unknown> {
  const main = document.querySelector('main') || document.body
  const idMatch = location.pathname.match(/^\/thread\/([^?/]+)/)
  return {
    url: location.pathname + location.search,
    doc_id: idMatch ? decodeURIComponent(idMatch[1]) : null,
    page_title: document.title,
    text: filterIconNoise((main as HTMLElement).innerText || '').slice(0, 12000),
    structured: readJsonLd(),
  }
}

/** Thread pages embed schema.org Article JSON-LD (headline/author/date).
 *  Parse it for clean structured metadata when present. */
function readJsonLd(): Record<string, unknown> | null {
  try {
    const script = document.querySelector('script[type="application/ld+json"]')
    if (!script?.textContent) return null
    const data = JSON.parse(script.textContent)
    const graph: unknown[] = Array.isArray(data?.['@graph']) ? data['@graph'] : [data]
    const article = graph.find(
      (g) => g && typeof g === 'object' && ((g as any)['@type'] === 'Article' || (g as any).headline),
    ) as Record<string, any> | undefined
    if (!article) return null
    const author = article.author
    return {
      headline: typeof article.headline === 'string' ? article.headline : undefined,
      author: typeof author === 'string' ? author : author?.name || undefined,
      datePublished: article.datePublished || undefined,
      description: article.description || undefined,
    }
  } catch {
    return null
  }
}

// ── tool implementations ──

/** Click a real in-page anchor (next/prev/person/topic) and wait for the
 *  target view to render rows. App Router only reacts to genuine clicks. */
async function navigateByAnchor(selector: string, label: string): Promise<unknown> {
  const result = await navigateByAnchorFast(selector, label)
  if (result === null) {
    // list views: also wait for rows before reading them (thread-detail
    // pages have none — a short capped wait, not the full 10s)
    await waitFor(
      () => (findRowElements().length > 0 ? ({} as const) : null),
      { timeoutMs: 2500 },
    ).catch(() => {})
    const rows = readRows(10)
    if (rows.length > 0) {
      return {
        url: location.pathname + location.search,
        page_title: document.title,
        total: readTotalCount(),
        results: rows,
        hint: 'Rows listed. open_result to open one; next_thread/prev_thread to page through.',
      }
    }
  }
  return readThreadView()
}

/** Navigation without the row wait — for pager stepping on thread-detail
 *  pages, where waiting for rows would burn 10s per step. Returns null when
 *  navigation succeeded (caller decides what to read). */
async function navigateByAnchorFast(
  selector: string,
  label: string,
): Promise<Record<string, unknown> | null> {
  const anchor = document.querySelector<HTMLAnchorElement>(selector)
  if (!anchor) {
    return {
      navigated: false,
      error: `No "${label}" control on the current view (thread pager only exists on /thread/*, person/topic links on list views).`,
    }
  }
  const targetHref = anchor.getAttribute('href') || ''
  anchor.click()
  await waitFor(
    () => (location.pathname + location.search).startsWith(targetHref.split('?')[0])
      ? ({} as const)
      : null,
    { timeoutMs: 8000 },
  )
  return null
}

/** Step through a thread's message pager N times (long threads like the
 *  968-message Brunel one would be painful one click at a time). Uses the
 *  fast navigation (URL-flip wait only) per step — thread-detail pages have
 *  no rows, and the final read happens once at the end. */
async function stepThread(
  direction: 'next' | 'prev',
  args: Record<string, unknown>,
): Promise<unknown> {
  const steps = Math.max(1, Math.min(49, Number(args?.steps) || 1))
  const selector = direction === 'next' ? 'a[aria-label="Next thread"]' : 'a[aria-label="Previous thread"]'

  let stoppedEarly = 0
  for (let i = 0; i < steps; i++) {
    const err = await navigateByAnchorFast(selector, direction)
    if (err !== null) {
      if (i === 0) return err // no pager at all — surface the hint
      stoppedEarly = i
      break
    }
    await sleep(350) // let the SPA settle between pager clicks
  }
  await sleep(600) // final render settle before reading
  const view = readThreadView() as Record<string, unknown>
  view.steps_moved = stoppedEarly || steps
  view.steps_requested = steps
  return view
}

export const jmailToolImplementations: Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> = {
  async search_emails(args) {
    const query = String(args.query || '').trim()
    if (!query) throw new Error('query is required')
    const limit = Math.max(1, Math.min(25, Number(args.limit) || 10))

    const input = await waitFor(() =>
      document.querySelector<HTMLInputElement>('input[name="q"]')
    )
    setSearchValue(input, query)
    await sleep(60)
    // The site's form navigates to /search?q=… on submit (client-side).
    input.form?.requestSubmit()

    // Must actually reach the search view — do NOT shortcut on rows,
    // because leftover thread-view links also match row probing.
    await waitFor(() => (location.pathname === '/search' ? ({} as const) : null), {
      timeoutMs: 10000,
    })
    // Site full-text search can be genuinely slow on big result sets —
    // wait generously and SOFT-FAIL: the results usually land a few
    // seconds later (readable via get_current_view), so don't throw.
    const rows = await waitFor(() => {
      const r = readRows(limit)
      return r.length > 0 ? r : null
    }, { timeoutMs: 20000 }).catch(() => null)

    if (!rows) {
      return {
        query,
        total_matches: readTotalCount(),
        count: 0,
        results: [],
        note: 'Search still rendering (site full-text search is slow on large result sets). Call get_current_view in a few seconds to read the rendered results.',
      }
    }

    return {
      query,
      total_matches: readTotalCount(),
      count: rows.length,
      results: rows,
      hint: 'Use open_result with the row index to open a thread and read its full text.',
    }
  },

  async open_result(args) {
    const index = Number(args.index)
    if (!Number.isInteger(index) || index < 0) throw new Error('index must be a non-negative integer')
    const rows = findRowElements()
    const row = rows[index]
    if (!row) throw new Error(`No result row at index ${index} (0-based; found ${rows.length} rows)`)

    // Click the subject area (not the checkbox) — React router navigates client-side.
    // Fallback ladder: exact subject div → longest-text div → the row itself,
    // because person-page rows carry DOJ badges that also match text probes.
    const parsed = parseRow(row, index)
    let clickTarget: HTMLElement = row
    if (parsed?.subject) {
      const divs = Array.from(row.querySelectorAll<HTMLElement>('div'))
      const exact = divs.find(
        (el) => el.children.length === 0 && (el.innerText || '').trim() === parsed.subject,
      )
      if (exact) {
        clickTarget = exact
      } else {
        const longest = divs
          .filter((el) => el.children.length === 0 && (el.innerText || '').trim())
          .sort((a, b) => (b.innerText || '').trim().length - (a.innerText || '').trim().length)[0]
        if (longest) clickTarget = longest
      }
    }
    clickTarget.click()

    await waitFor(() => (location.pathname.startsWith('/thread/') ? ({} as const) : null), {
      timeoutMs: 10000,
    })
    // Wait for the thread body to actually render (some threads are slow
    // scanned-doc views — a fixed delay reads empty text there).
    await waitFor(
      () => {
        const text = readThreadView().text
        return text && text.trim().length > 0 ? ({} as const) : null
      },
      { timeoutMs: 6000 },
    ).catch(() => {
      // render didn't settle in time — return whatever rendered so the
      // caller can retry with get_current_view instead of hard-failing
    })
    return readThreadView()
  },

  async open_thread(args) {
    const docId = String(args.doc_id || '').trim()
    if (!docId || !/^[A-Za-z0-9_\-.]+$/.test(docId)) {
      throw new Error('doc_id is required (letters, digits, _ - . only)')
    }
    // No in-DOM anchor for arbitrary doc ids, and Next.js App Router ignores
    // synthetic popstate — the only reliable in-place navigation is a real
    // same-tab location assignment, which re-runs the page scripts.
    location.assign(`/thread/${encodeURIComponent(docId)}?view=inbox`)
    // This script's context dies on navigation — reply softly so the agent
    // re-reads via get_current_view on the fresh page instead of failing.
    return {
      doc_id: docId,
      navigated: true,
      note: 'Full page navigation started. Tools re-inject automatically; call get_current_view in a few seconds to read the thread.',
    }
  },

  async get_current_view() {
    return readThreadView()
  },

  async list_topics() {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/topic/"]'))
    const seen = new Set<string>()
    const topics: Array<{ slug: string; label: string }> = []
    for (const a of links) {
      const slug = (a.getAttribute('href') || '').replace(/^\/topic\//, '')
      if (!slug || seen.has(slug)) continue
      seen.add(slug)
      topics.push({ slug, label: filterIconNoise(a.innerText || '').trim() })
    }
    return { count: topics.length, topics }
  },

  async go_home() {
    // Click the real "Inbox" sidebar anchor (next/link) — App Router only
    // renders on genuine link clicks; synthetic popstate is ignored.
    const inbox = document.querySelector<HTMLAnchorElement>('nav a[href="/"]')
      || document.querySelector<HTMLAnchorElement>('header a[href="/"]')
    if (inbox) {
      inbox.click()
    } else {
      location.assign('/')
    }
    // URL flips fast; the inbox list takes a moment to fetch. Wait for
    // thread rows (checkbox rows) to appear in the main view.
    await waitFor(
      () => {
        if (location.pathname !== '/') return null
        return findRowElements().length > 0 ? ({} as const) : null
      },
      { timeoutMs: 10000 },
    )
    const rows = readRows(5)
    return {
      url: location.pathname,
      page_title: document.title,
      inbox_count: readTotalCount(),
      latest: rows,
      hint: 'Inbox loaded. Use search_emails or open_result to explore.',
    }
  },

  async next_thread(args) {
    return stepThread('next', args)
  },

  async filter_by_date(args) {
    const after = typeof args.after === 'string' ? args.after.trim() : ''
    const before = typeof args.before === 'string' ? args.before.trim() : ''
    const limit = Math.max(1, Math.min(25, Number(args.limit) || 10))
    if (!after && !before) throw new Error('Provide at least one of after / before (YYYY-MM-DD)')
    const DATE_FMT = /^\d{4}-\d{2}-\d{2}$/
    if (after && !DATE_FMT.test(after)) throw new Error('after must be YYYY-MM-DD')
    if (before && !DATE_FMT.test(before)) throw new Error('before must be YYYY-MM-DD')

    // 1. Open the Date dropdown (Radix popover, closed by default).
    const trigger = await waitFor(
      () => document.querySelector<HTMLButtonElement>('button[aria-label="Filter by date range"]'),
      { timeoutMs: 8000 },
    )
    trigger.click()
    let panel = await waitFor(
      () =>
        document.querySelector<HTMLDivElement>('.date-filter-dropdown[data-state="open"]'),
      { timeoutMs: 5000 },
    )

    // 1b. Clear any residual active filter FIRST: a leftover after value
    // both pollutes the new query and stamps a `min` constraint on the
    // Before input (blocking earlier dates). Clear closes the panel and
    // resets the URL — reopen and continue from a clean state.
    if (trigger.classList.contains('date-filter-active') || location.search.includes('after=') || location.search.includes('before=')) {
      const clear = panel.querySelector<HTMLButtonElement>('.date-filter-clear')
      if (clear) {
        clear.click()
        await sleep(500)
        trigger.click()
        panel = await waitFor(
          () =>
            document.querySelector<HTMLDivElement>('.date-filter-dropdown[data-state="open"]'),
          { timeoutMs: 5000 },
        )
      }
    }

    // 2. Fill the native date inputs via the React-safe native setter.
    const fillDate = (label: 'after' | 'before', value: string) => {
      const fields = Array.from(panel.querySelectorAll<HTMLLabelElement>('.date-filter-field'))
      const field = fields.find((f) => (f.innerText || '').toLowerCase().includes(label))
      const input = field?.querySelector<HTMLInputElement>('input[type="date"]')
      if (!input) throw new Error(`"${label}" date input not found in the filter panel`)
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      if (setter) setter.call(input, value)
      else input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
    if (after) fillDate('after', after)
    if (before) fillDate('before', before)

    // 3. Apply and wait for the FILTERED list to actually render.
    //    URL params flip before the list data re-renders — waiting on the
    //    URL alone returns the stale (unfiltered) rows. Instead wait until
    //    the first visible row's date falls inside the requested range.
    const apply = panel.querySelector<HTMLButtonElement>('.date-filter-apply')
    if (!apply) throw new Error('Apply button not found in the filter panel')
    apply.click()

    // Parse "MMM D, YYYY" row dates into a comparable form.
    const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const parseRowDate = (s: string): number => {
      const m = s.trim().match(/^([A-Za-z]{3}) (\d{1,2}), (\d{4})$/)
      if (!m) return NaN
      const mo = MONTHS.indexOf(m[1].toLowerCase())
      return mo < 0 ? NaN : new Date(Number(m[3]), mo, Number(m[2])).getTime()
    }
    const afterTs = after ? new Date(after + 'T00:00:00').getTime() : -Infinity
    const beforeTs = before ? new Date(before + 'T23:59:59').getTime() : Infinity

    await waitFor(
      () => {
        const hasParam = after
          ? location.search.includes(`after=${after}`)
          : location.search.includes(`before=${before}`)
        if (!hasParam) return null
        const rows = readRows(3)
        if (rows.length === 0) return {} as const // empty range — valid outcome
        const first = parseRowDate(rows[0].date)
        return Number.isFinite(first) && first >= afterTs && first <= beforeTs ? ({} as const) : null
      },
      { timeoutMs: 15000 },
    )

    const rows = readRows(limit)
    return {
      url: location.pathname + location.search,
      page_title: document.title,
      total: readTotalCount(),
      count: rows.length,
      results: rows,
      note: rows.length === 0
        ? 'No emails in this date range. Call go_home or filter_by_date with a wider range.'
        : undefined,
    }
  },

  async clear_date_filter() {
    // Only meaningful when a filter is actually active (button carries the
    // date-filter-active class, or the URL has after/before params).
    const trigger = await waitFor(
      () => document.querySelector<HTMLButtonElement>('button[aria-label="Filter by date range"]'),
      { timeoutMs: 8000 },
    )
    const active =
      trigger.classList.contains('date-filter-active') ||
      location.search.includes('after=') ||
      location.search.includes('before=')
    if (!active) {
      return { cleared: false, note: 'No date filter is currently active.' }
    }

    trigger.click()
    const panel = await waitFor(
      () =>
        document.querySelector<HTMLDivElement>('.date-filter-dropdown[data-state="open"]'),
      { timeoutMs: 5000 },
    )
    const clear = panel.querySelector<HTMLButtonElement>('.date-filter-clear')
    if (!clear) throw new Error('Clear button not found in the filter panel')
    clear.click()

    // Clear closes the panel, resets the URL and re-renders the unfiltered
    // list. Wait for: no filter params left + rows back.
    await waitFor(
      () =>
        !location.search.includes('after=') && !location.search.includes('before=')
          ? ({} as const)
          : null,
      { timeoutMs: 10000 },
    )
    await waitFor(() => (findRowElements().length > 0 ? ({} as const) : null), {
      timeoutMs: 15000 },
    ).catch(() => {})

    const rows = readRows(5)
    return {
      cleared: true,
      url: location.pathname + location.search,
      page_title: document.title,
      total: readTotalCount(),
      latest: rows,
      note: 'Date filter cleared; full inbox restored. (On a thread page, call go_home first.)',
    }
  },

  async prev_thread(args) {
    return stepThread('prev', args)
  },

  async browse_person(args) {
    const slug = String(args.person || '').trim()
    if (!slug) throw new Error('person is required (slug from list_people, e.g. ghislaine-maxwell)')
    return navigateByAnchor(`nav a[href="/person/${CSS.escape(slug)}"]`, `person:${slug}`)
  },

  async browse_folder(args) {
    // Sidebar folder tabs (nav a.nav-item). hrefs verified against the
    // live site: / , /starred , /unredactions , /sent , /attachments ,
    // /activity/2014 . Validate against the whitelist so a bad folder
    // fails fast instead of matching nothing.
    const FOLDERS: Record<string, string> = {
      inbox: '/',
      starred: '/starred',
      unredactions: '/unredactions',
      sent: '/sent',
      attachments: '/attachments',
      activity: '/activity/2014',
    }
    const folder = String(args.folder || '')
      .trim()
      .toLowerCase()
    const href = FOLDERS[folder]
    if (!href) {
      return {
        navigated: false,
        error: `Unknown folder "${folder}". Available: ${Object.keys(FOLDERS).join(', ')}.`,
      }
    }
    return navigateByAnchor(`nav a.nav-item[href="${href}"]`, `folder:${folder}`)
  },

  async browse_topic(args) {
    const slug = String(args.topic || '').trim()
    if (!slug) throw new Error('topic is required (slug from list_topics, e.g. damage-control)')
    return navigateByAnchor(`a[href="/topic/${CSS.escape(slug)}"]`, `topic:${slug}`)
  },

  async list_people() {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('nav a[href^="/person/"]'))
    const seen = new Set<string>()
    const people: Array<{ slug: string; label: string }> = []
    for (const a of links) {
      const slug = (a.getAttribute('href') || '').replace(/^\/person\//, '')
      if (!slug || slug === '' || seen.has(slug)) continue
      seen.add(slug)
      people.push({ slug, label: filterIconNoise(a.innerText || '').trim() })
    }
    return { count: people.length, people }
  },
}
