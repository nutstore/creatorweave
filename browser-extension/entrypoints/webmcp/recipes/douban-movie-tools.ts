// ============================================================
// movie.douban.com recipe implementation — DOM automation tools.
//
// Registered via @mcp-b/webmcp-polyfill in the page's MAIN world
// (see recipe-injector.content.ts). Douban Movie is a classic
// server-rendered site (no SPA router), so navigation uses plain
// location.assign — the tools re-inject automatically after the
// page reloads, and reads return soft pointers where navigation
// kills the script context.
//
// DOM facts verified against the live site (2026-09-01):
//   - search input:  input[name="search_text"] in the header form;
//     the form submits to search.douban.com/movie/subject_search
//     (results page is JS-rendered: div.result rows with a
//     a[href*="/subject/"] link + .rating score)
//   - now playing:   #screening li.ui-slide-item rows carrying
//     data-title / data-rating / data-region / data-director /
//     data-actors / data-release attributes + a.title link to
//     /subject/{id}
//   - weekly chart:  sidebar "weekly reputation" (#weekly) — table rows
//     with rank td, subject link and .rating_nums
//   - subject page:  span[property="v:itemreviewed"] title,
//     strong.rating_num, #info block, span[property="v:summary"]
//     intro, #hot-comments .comment-item short comments
//   - chart page:    /chart — table.item rows (.pl2 title link +
//     .rating_nums)
// All tools are read-only (readOnlyHint).
// ============================================================

// ── small DOM helpers ──

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitFor<T>(
  fn: () => T | null,
  { timeoutMs = 8000, pollMs = 150 }: { timeoutMs?: number; pollMs?: number } = {}
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const v = fn()
    if (v != null) return v
    if (Date.now() > deadline) throw new Error('Timed out waiting for a page element to appear')
    await sleep(pollMs)
  }
}

/** Server-rendered site: a plain navigation reloads the page and
 *  kills this script context. Reply softly so the agent re-reads
 *  via get_current_view on the fresh page instead of failing. */
function softNavigate(url: string, note: string): Record<string, unknown> {
  location.assign(url)
  return { navigated: true, url, note }
}

function cleanText(s: string | null | undefined): string {
  return (s || '').replace(/\s+/g, ' ').trim()
}

// ── parsers ──

export interface NowPlayingInfo {
  index: number
  title: string
  rating: string
  subject_id: string | null
  url: string | null
  release: string
  region: string
  director: string
  actors: string
}

function readNowPlaying(limit: number): NowPlayingInfo[] {
  const items = Array.from(document.querySelectorAll<HTMLElement>('#screening li.ui-slide-item'))
  const out: NowPlayingInfo[] = []
  for (const li of items) {
    const d = (li as HTMLElement & { dataset: Record<string, string> }).dataset || {}
    const title = cleanText(d.title)
    if (!title) continue
    const link = li.querySelector<HTMLAnchorElement>('a.title[href*="/subject/"]')
    const m = link?.getAttribute('href')?.match(/subject\/(\d+)/)
    out.push({
      index: out.length,
      title,
      rating: cleanText(d.rating) || '暂无评分',
      subject_id: m ? m[1] : null,
      url: link?.href || null,
      release: cleanText(d.release),
      region: cleanText(d.region),
      director: cleanText(d.director),
      actors: cleanText(d.actors),
    })
    if (out.length >= limit) break
  }
  return out
}

export interface ChartRow {
  rank: number
  title: string
  rating: string
  url: string | null
  subject_id: string | null
}

/** Weekly chart (homepage sidebar, "weekly reputation" section). */
function readWeeklyChart(): ChartRow[] {
  const root = document.querySelector<HTMLElement>('#weekly') ||
    Array.from(document.querySelectorAll<HTMLElement>('div, section'))
      .find((el) => cleanText(el.textContent).startsWith('一周口碑榜') && el.querySelector('a[href*="/subject/"]'))
      || null
  if (!root) return []
  const out: ChartRow[] = []
  for (const tr of Array.from(root.querySelectorAll('tr'))) {
    const link = tr.querySelector<HTMLAnchorElement>('a[href*="/subject/"]')
    const title = cleanText(link?.textContent)
    if (!link || !title) continue
    const m = link.getAttribute('href')?.match(/subject\/(\d+)/)
    out.push({
      rank: out.length + 1,
      title,
      rating: cleanText(tr.querySelector('.rating_nums')?.textContent),
      url: link.href,
      subject_id: m ? m[1] : null,
    })
  }
  return out
}

/** /chart page (ranked list): table.item rows. */
function readChartPage(limit: number): ChartRow[] {
  const out: ChartRow[] = []
  for (const table of Array.from(document.querySelectorAll('table.item'))) {
    const link = table.querySelector<HTMLAnchorElement>('td.title a, a[href*="/subject/"]')
    const title = cleanText(link?.textContent)
    if (!link || !title) continue
    const m = link.getAttribute('href')?.match(/subject\/(\d+)/)
    out.push({
      rank: out.length + 1,
      title,
      rating: cleanText(table.querySelector('.rating_nums')?.textContent),
      url: link.href,
      subject_id: m ? m[1] : null,
    })
    if (out.length >= limit) break
  }
  return out
}

export interface SearchRow {
  index: number
  title: string
  rating: string
  url: string | null
  subject_id: string | null
  detail: string
}

/** Search results page (search.douban.com/movie/subject_search,
 *  JS-rendered). Verified against the live site (2026-09-01):
 *  rows are anchored by a.title-text[href*="/subject/"] whose
 *  data-moreurl attribute carries subject_id; rating sits in
 *  .rating_nums ("暂无评分" rows have none); the meta line
 *  (region / genre / duration / director) is the item's
 *  .subject-cast or .detail text. */
function readSearchResults(limit: number): SearchRow[] {
  const out: SearchRow[] = []
  const anchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a.title-text[href*="/subject/"]'),
  )
  for (const a of anchors) {
    const title = cleanText(a.textContent).replace(/\s*\(\d{4}\)\s*$/, m => m) // keep year in title
    if (!title) continue
    // subject_id: prefer data-moreurl (explicit), fall back to href regex
    const moreurl = a.getAttribute('data-moreurl') || ''
    const id = moreurl.match(/subject_id:'(\d+)'/)?.[1]
      || a.getAttribute('href')?.match(/subject\/(\d+)/)?.[1]
      || null
    // result item container: the ancestor holding title + rating + meta
    const item = a.closest('div[class*="item"], .result, [class*="subject"]') || a.parentElement?.parentElement || a
    const ratingNum = item?.querySelector('.rating_nums')?.textContent?.trim()
    const rating = ratingNum
      ? `${ratingNum}（${cleanText(item?.querySelector('.rating')?.textContent).replace(/^[\d.]+/, '').replace(/[()（）]/g, '')}）`
      : '暂无评分'
    const meta = cleanText(
      item?.querySelector('.subject-cast, .detail, [class*="cat"]')?.textContent,
    )
    out.push({
      index: out.length,
      title,
      rating,
      url: a.href,
      subject_id: id,
      detail: meta,
    })
    if (out.length >= limit) break
  }
  return out
}

/** Full read of a subject (movie/TV) detail page. */
function readSubjectView(): Record<string, unknown> {
  const isSubject = /\/subject\/\d+/.test(location.pathname)
  const main = document.querySelector('#content') || document.body
  const base = {
    url: location.pathname + location.search,
    page_title: cleanText(document.title),
  }
  if (!isSubject) {
    return {
      ...base,
      is_subject_page: false,
      text: cleanText((main as HTMLElement).innerText).slice(0, 6000),
    }
  }

  // title h1: movie title + .year span
  const h1 = document.querySelector('#content h1')
  const year = cleanText(h1?.querySelector('.year')?.textContent)
  const titleSpan = h1?.querySelector('span[property="v:itemreviewed"]') ||
    h1?.querySelector('span') || h1
  const title = cleanText(titleSpan?.textContent).replace(/\d{4}$/, '').trim()

  // #info: label/value pairs are plain text nodes between spans —
  // parse the whole block's innerText line-wise.
  const info: Record<string, string> = {}
  const infoEl = document.querySelector('#info')
  if (infoEl) {
    let lastKey = ''
    for (const line of (infoEl as HTMLElement).innerText.split('\n')) {
      const idx = line.indexOf(':')
      if (idx > 0 && idx < 12) {
        lastKey = line.slice(0, idx).trim()
        info[lastKey] = line.slice(idx + 1).trim()
      } else if (lastKey) {
        info[lastKey] += ' ' + line.trim()
      }
    }
    for (const k of Object.keys(info)) info[k] = info[k].trim()
  }

  // rating panel
  const ratingNum = cleanText(document.querySelector('strong.rating_num')?.textContent)
  const ratingPeople = cleanText(
    document.querySelector('a.rating_people span[property="v:votes"]')?.textContent ||
    document.querySelector('a.rating_people')?.textContent,
  )
  const stars = Array.from(document.querySelectorAll('.rating_ind')).map((el, i) => {
    const per = el.parentElement?.querySelector('.rating_per')
    return { stars: `${5 - i}星`, percent: cleanText(per?.textContent) }
  }).filter((s) => s.percent)

  // intro — later <p>s may be display:none (collapsed); use textContent.
  const summary = cleanText(
    Array.from(document.querySelectorAll('span[property="v:summary"], .related-info .intro'))
      .map((el) => (el as HTMLElement).textContent || '')
      .join('\n'),
  )

  // hot short comments (need login for full list — read what renders)
  const comments = Array.from(document.querySelectorAll('#hot-comments .comment-item, #comments .comment-item'))
    .slice(0, 10)
    .map((c) => {
      const meta = cleanText(c.querySelector('.comment-info')?.textContent)
      const ratingEl = c.querySelector('.comment-info .rating') as HTMLElement | null
      const starsTitle = ratingEl?.title || ratingEl?.className?.match(/allstar(\d+)/)?.[1] || ''
      const votes = cleanText(c.querySelector('.vote-count')?.textContent)
      return {
        author: meta.replace(/\s*\d{4}-\d{2}-\d{2}.*$/, '').trim(),
        date: (meta.match(/\d{4}-\d{2}-\d{2}/) || [''])[0],
        stars: String(starsTitle).replace('力荐', '5星').replace('推荐', '4星')
          .replace('还行', '3星').replace('较差', '2星').replace('很差', '1星'),
        votes: votes.replace(/(\d+)\s*有用/, '$1'),
        text: cleanText(c.querySelector('.short')?.textContent),
      }
    })
    .filter((c) => c.text)

  return {
    ...base,
    is_subject_page: true,
    title,
    year: year.replace(/[()]/g, ''),
    rating: ratingNum || '暂无评分',
    rating_people: ratingPeople,
    star_distribution: stars,
    info,
    summary: summary.slice(0, 3000),
    hot_comments: comments,
  }
}

// ── tool implementations ──

/** Parse a star widget's class (e.g. "allstar30") or title into a
 *  readable rating. Verified live: .comment-info .rating carries
 *  class="allstar30 rating" + title="还行". */
function starClassToText(el: HTMLElement | null): string {
  if (!el) return ''
  const title = el.getAttribute('title')
  if (title) return title
  const m = el.className.match(/allstar(\d)0/)
  if (m) {
    const map: Record<string, string> = { '5': '力荐', '4': '推荐', '3': '还行', '2': '较差', '1': '很差' }
    return map[m[1]] || `${m[1]}星`
  }
  return ''
}

/** Read hot short comments on a movie/TV page. DOM verified live
 *  (2026-09-01): #hot-comments .comment-item[data-cid]; inside:
 *  .comment-info (author/meta line), .rating (star widget),
 *  .votes (useful count), .short (text), .comment-time (date). */
function readComments(limit: number) {
  return Array.from(document.querySelectorAll('#hot-comments .comment-item, #comments .comment-item'))
    .slice(0, limit)
    .map((c) => {
      const el = c as HTMLElement
      const meta = cleanText(el.querySelector('.comment-info')?.textContent)
      const date = (meta.match(/\d{4}-\d{2}-\d{2}/) || [''])[0]
      const author = meta.replace(/\s*(看过|想看|听过|在看).*$/, '').replace(/\d{4}-\d{2}-\d{2}.*$/, '').trim()
      return {
        author,
        date,
        stars: starClassToText(el.querySelector('.comment-info .rating') as HTMLElement | null),
        location: (meta.match(/\d{2}:\d{2}:?\d*\s*([^\s]+)$/) || [])[1] || '',
        votes: cleanText(el.querySelector('.votes, .vote-count')?.textContent),
        text: cleanText(el.querySelector('.short')?.textContent),
      }
    })
    .filter((x) => x.text)
}

/** Read popular full reviews on a movie/TV page. DOM verified live
 *  (2026-09-01): .review-item (id = review id); inside: .author
 *  meta, h2 a (title + href to /review/{id}/), .short-content
 *  (excerpt, may start with a spoiler notice). */
function readReviews(limit: number) {
  return Array.from(document.querySelectorAll('.review-item'))
    .slice(0, limit)
    .map((r) => {
      const el = r as HTMLElement
      const link = el.querySelector<HTMLAnchorElement>('h2 a[href*="/review/"]')
      // Author meta lives in the header row above the title: verified live
      // as a div with the author name + timestamp text (no stable class on
      // this page — take the first non-empty text block before the title).
      const metaEl = el.querySelector('.header-meta, .meta, .byline')
      let meta = cleanText(metaEl?.textContent)
      if (!meta) {
        // fall back: first descendant div containing a full timestamp
        for (const d of Array.from(el.querySelectorAll<HTMLElement>('div'))) {
          const t = cleanText(d.textContent)
          if (/\d{4}-\d{2}-\d{2}/.test(t) && t.length < 80) { meta = t; break }
        }
      }
      const excerptRaw = cleanText(el.querySelector('.short-content')?.textContent)
      const spoiler = excerptRaw.includes('剧透')
      const excerpt = excerptRaw
        .replace(/^这篇影评可能有剧透\s*/, '')
        .replace(/\(展开\)?$/, '')
        .slice(0, 300)
      return {
        review_id: el.id || (link?.getAttribute('href')?.match(/review\/(\d+)/)?.[1] ?? null),
        title: cleanText(link?.textContent),
        author: meta.split(/\d{4}-/)[0].trim(),
        date: (meta.match(/\d{4}-\d{2}-\d{2}/) || [''])[0],
        spoiler,
        excerpt,
        url: link?.href || null,
      }
    })
    .filter((x) => x.title)
}

/** Generic list-page row reader (works for Top 250, doulist and
 *  any page whose rows are anchored by a[href*="/subject/"]). */
function readSubjectListRows(limit: number, rootSelector?: string): (ChartRow & { detail?: string })[] {
  const root = rootSelector ? document.querySelector(rootSelector) : document
  const out: (ChartRow & { detail?: string })[] = []
  const seen = new Set<string>()
  const anchors = Array.from((root || document).querySelectorAll<HTMLAnchorElement>('a[href*="subject/"]'))
  for (const a of anchors) {
    const m = a.getAttribute('href')?.match(/subject\/(\d+)/)
    const id = m?.[1]
    const rawTitle = cleanText(a.textContent)
    if (!id || !rawTitle || seen.has(id)) continue
    const title = rawTitle.replace(/\s*\(\d{4}\)\s*$/, '').trim() || rawTitle
    const container = a.closest('table.item, .item, li, .ob, div') || a.parentElement
    const rating = cleanText(container?.querySelector('.rating_nums')?.textContent)
    const detail = cleanText(container?.querySelector('.pl, .subject-cast, .detail')?.textContent)
    seen.add(id)
    out.push({
      rank: out.length + 1,
      title,
      rating,
      url: a.href,
      subject_id: id,
      detail: detail || undefined,
    })
    if (out.length >= limit) break
  }
  return out
}

/** Full read of a /celebrity/{id} page. */
function readCelebrityView(): Record<string, unknown> {
  const isCelebrity = /\/celebrity\/\d+/.test(location.pathname)
  const base = {
    url: location.pathname + location.search,
    page_title: cleanText(document.title),
  }
  if (!isCelebrity) {
    const main = document.querySelector('#content') || document.body
    return { ...base, is_celebrity_page: false, text: cleanText((main as HTMLElement).innerText).slice(0, 4000) }
  }
  const name = cleanText(document.querySelector('#content h1')?.textContent)
  const bio = cleanText(
    Array.from(document.querySelectorAll('#intro p')).map((p) => (p as HTMLElement).textContent || '').join('\n'),
  )
  // filmography: per-section (as actor / director / writer …) subject rows
  const works: Record<string, { title: string; rating: string; subject_id: string }[]> = {}
  for (const mod of Array.from(document.querySelectorAll('#content .mod'))) {
    const heading = cleanText(mod.querySelector('h2')?.textContent)
    if (!heading) continue
    const rows = Array.from(mod.querySelectorAll('a[href*="/subject/"]')).slice(0, 10).map((a) => {
      const m = a.getAttribute('href')?.match(/subject\/(\d+)/)
      const container = a.closest('.ob, li, div') || a.parentElement
      return {
        title: cleanText(a.textContent).replace(/\s*\(\d{4}\)\s*$/, '').trim(),
        rating: cleanText(container?.querySelector('.rating_nums')?.textContent),
        subject_id: m?.[1] || '',
      }
    }).filter((r) => r.title && r.subject_id)
    if (rows.length) works[heading] = rows
  }
  const awards = cleanText(
    Array.from(document.querySelectorAll('#award-block, [data-category="awards"]')).map((el) => (el as HTMLElement).innerText || '').join('\n'),
  ).slice(0, 1500)
  const photo = document.querySelector<HTMLImageElement>('#mainpic img, #content .avatar')?.src || null
  return {
    ...base,
    is_celebrity_page: true,
    name,
    photo,
    bio: bio.slice(0, 2500),
    filmography: works,
    awards: awards || undefined,
  }
}

/** TV seasons/series + episodes from a series subject page.
 *  DOM verified live (2026-09-01, Nirvana in Fire subject page):
 *  - legacy seasons: #season / .seasons a[href*="/subject/"]
 *  - NEW series block: .«同系列作品» module — links to a /series/{key}
 *    aggregate page plus sibling-season subject links with poster imgs
 *  - legacy episodes: #eps-table rows (.episode + title + .rating_nums);
 *    new pages render an "episode comments" header linking to /subject/{id}/comments
 *    per-episode section (episode data itself is login-gated). */
function readTvInfo(episodeLimit: number): Record<string, unknown> {
  if (!/\/subject\/\d+/.test(location.pathname)) {
    return { error: 'Not on a movie/TV detail page. Call open_subject (subject_id) first, then get_tv_info.' }
  }
  // seasons (legacy #season tabs) or sibling series works (new DOM)
  const currentId = location.pathname.match(/subject\/(\d+)/)?.[1]
  const currentTitle = cleanText(document.querySelector('#content h1 span[property="v:itemreviewed"]')?.textContent)
  const seen = new Set<string>()
  const seasonList = Array.from(
    document.querySelectorAll('#season a[href*="/subject/"], .seasons a[href*="/subject/"], #content a[href*="/subject/"] img[src*="poster"], .subject-item a[href*="/subject/"]'),
  )
    .map((el) => (el instanceof HTMLImageElement ? el.closest('a') : el) as HTMLAnchorElement | null)
    .filter((a): a is HTMLAnchorElement => !!a?.getAttribute('href')?.match(/subject\/(\d+)/))
    .map((a) => {
      const m = a.getAttribute('href')?.match(/subject\/(\d+)/)
      return {
        season: cleanText(a.getAttribute('title') || a.querySelector('img')?.getAttribute('alt') || a.textContent).replace(/\s*\(\d{4}\)\s*$/, ''),
        subject_id: m?.[1] || '',
      }
    })
    .filter((s) => s.season && s.subject_id && s.subject_id !== currentId && !seen.has(s.subject_id) && seen.add(s.subject_id))

  // series aggregate link (new DOM: related-series module → /series/{key})
  const seriesLink = document.querySelector<HTMLAnchorElement>('a[href*="/series/"]')
  const series = seriesLink
    ? { key: seriesLink.getAttribute('href')?.match(/series\/([A-Z0-9]+)/)?.[1] || null, url: seriesLink.href }
    : null

  const episodes = Array.from(document.querySelectorAll('#eps-table tr')).slice(0, episodeLimit).map((tr) => {
    const el = tr as HTMLElement
    const link = el.querySelector<HTMLAnchorElement>('a')
    return {
      episode: cleanText(el.querySelector('.episode')?.textContent),
      title: cleanText(link?.textContent),
      rating: cleanText(el.querySelector('.rating_nums')?.textContent),
      url: link?.href || null,
    }
  }).filter((e) => e.title || e.episode)

  return {
    subject: currentTitle,
    episode_count: cleanText(document.querySelector('span[property="v:total-episodes"]')?.textContent) ||
      (document.body.innerHTML.match(/<span[^>]*property="v:total-episodes"[^>]*>(\d+)</)?.[1] ?? null),
    series,
    seasons: seasonList.length ? seasonList : undefined,
    episodes: episodes.length ? episodes : undefined,
    note: episodes.length === 0 && seasonList.length === 0 && !series
      ? 'No seasons/episodes found — this may be a movie, or episode data is login-gated.'
      : episodes.length === 0
        ? 'Episode-level data requires login; use the seasons/series fields to navigate between entries.'
        : undefined,
  }
}

export const doubanToolImplementations: Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> = {
  async search_movies(args) {
    const query = String(args.query || '').trim()
    if (!query) throw new Error('query is required')
    const tags = String(args.tags || '').trim()
    const fullQuery = tags ? `${query} ${tags}` : query
    const limit = Math.max(1, Math.min(25, Number(args.limit) || 10))

    // Already on the results page for this query? Just read it.
    if (/search\.douban\.com/.test(location.host) || location.pathname.includes('subject_search')) {
      const rows = readSearchResults(limit)
      if (rows.length > 0) return { query: fullQuery, count: rows.length, results: rows }
    }

    const input = await waitFor(() =>
      // The search box only exists on movie.douban.com pages — on
      // search.douban.com result pages fall back to URL navigation.
      document.querySelector<HTMLInputElement>('input[name="search_text"]')
      || (/search\.douban\.com/.test(location.host)
        ? 'url-fallback' as const
        : null)
    )
    if (input !== 'url-fallback') {
    // Classic form (no React) — plain value + submit is enough, but use
    // the native setter anyway for safety.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    if (setter) setter.call(input, fullQuery)
    else input.value = fullQuery
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(60)
    input.form?.requestSubmit()
    }

    // The form navigates to search.douban.com (full page load — this
    // script dies). If we're still here after a short grace period
    // (submit blocked, already on results), read what we have.
    await sleep(1500)
    if (/search\.douban\.com/.test(location.host)) {
      const rows = await waitFor(() => {
        const r = readSearchResults(limit)
        return r.length > 0 ? r : null
      }, { timeoutMs: 12000 }).catch(() => [] as SearchRow[])
      return {
        query,
        count: rows.length,
        results: rows,
        hint: rows.length
          ? 'Use open_result with the row index to open a movie and read its full details.'
          : 'No results rendered yet — call get_current_view in a few seconds.',
      }
    }
    return {
      query: fullQuery,
      navigated: true,
      note: 'Full page navigation to the search results started. Tools re-inject automatically; call get_current_view in a few seconds to read the results.',
    }
  },

  async open_result(args) {
    const index = Number(args.index)
    if (!Number.isInteger(index) || index < 0) throw new Error('index must be a non-negative integer')
    const rows = readSearchResults(25)
    const row = rows[index]
    if (!row?.url) throw new Error(`No result row at index ${index} (0-based; found ${rows.length} rows)`)
    return softNavigate(row.url, `Opening "${row.title}". Call get_current_view in a few seconds to read the movie details.`)
  },

  async open_subject(args) {
    const raw = String(args.subject_id || args.url || '').trim()
    const id = raw.match(/(\d{4,})/)?.[1]
    if (!id) throw new Error('subject_id is required (numeric id, e.g. 1292052 from search/now_playing/weekly results)')
    return softNavigate(
      `https://movie.douban.com/subject/${id}/`,
      'Opening the subject page. Call get_current_view in a few seconds to read the movie details (rating, info, summary, hot comments).',
    )
  },

  async get_current_view(args) {
    // Host-aware: on search.douban.com this means "read the search
    // results", not the generic page text.
    if (/search\.douban\.com/.test(location.host)) {
      const limit = Math.max(1, Math.min(25, Number(args?.limit) || 10))
      const rows = readSearchResults(limit)
      return {
        url: location.pathname + location.search,
        page_title: cleanText(document.title),
        query: (new URLSearchParams(location.search).get('search_text')) || null,
        count: rows.length,
        results: rows,
        hint: rows.length
          ? 'Use open_result with the row index (or open_subject with subject_id) to open a movie.'
          : 'No result rows rendered — if the page is still loading, call get_current_view again in a few seconds.',
      }
    }
    return readSubjectView()
  },

  async get_comments(args) {
    const onSubjectPage = /movie\.douban\.com/.test(location.host) && /\/subject\/\d+/.test(location.pathname)
    const onCommentsPage = /movie\.douban\.com/.test(location.host) && /\/subject\/\d+\/comments/.test(location.pathname)
    const start = Math.max(0, Number(args?.start) || 0)
    const sort = args?.sort === 'latest' ? 'latest' : 'hot'
    const score = ['1', '2', '3', '4', '5'].includes(String(args?.score)) ? String(args?.score) : null

    // Paging / star filtering live on /subject/{id}/comments
    if (start > 0 || score) {
      const m = location.pathname.match(/\/subject\/(\d+)/)
      if (!m) return { error: 'Not on a movie/TV detail page. Call open_subject first, then get_comments.' }
      const commentsUrl = `https://movie.douban.com/subject/${m[1]}/comments?start=${start}&status=P&sort=${sort === 'latest' ? 'new_score' : 'T'}${score ? `&score=${score}` : ''}`
      if (!onCommentsPage) {
        return softNavigate(commentsUrl, 'Navigating to the comments page. Call get_comments with the same start/score again in a few seconds to read it.')
      }
      // comments-page rows use the same .comment-item structure
      const limitPaged = Math.max(1, Math.min(20, Number(args?.limit) || 20))
      const rows = readComments(limitPaged)
      const total = document.body.innerHTML.match(/全部\s*([\d,]+)\s*条/)?.[1] || null
      return {
        subject: cleanText(document.querySelector('#content h1 a')?.textContent),
        start,
        sort,
        score,
        total_comments: total,
        count: rows.length,
        comments: rows,
        next_start: rows.length >= limitPaged ? start + limitPaged : null,
      }
    }

    if (!onSubjectPage) {
      return {
        error: 'Not on a movie/TV detail page. Call open_subject (subject_id) first, then get_comments.',
      }
    }
    const limit = Math.max(1, Math.min(20, Number(args?.limit) || 10))
    const comments = readComments(limit)
    const h2 = document.querySelector('#hot-comments h2, .mod-hd h2')
    const total = h2?.textContent?.match(/全部\s*([\d,]+)\s*条/)?.[1]
    return {
      subject: cleanText(document.querySelector('#content h1 span[property="v:itemreviewed"]')?.textContent),
      total_comments: total || null,
      count: comments.length,
      comments,
      note: comments.length === 0
        ? 'No comments rendered (login-gated or still loading) — try get_current_view.'
        : 'Paging / star filtering: call get_comments with start (0, 20, 40…) and optional sort=latest / score=1..5.',
    }
  },

  async get_reviews(args) {
    if (!/movie\.douban\.com/.test(location.host) || !/\/subject\/\d+/.test(location.pathname)) {
      return {
        error: 'Not on a movie/TV detail page. Call open_subject (subject_id) first, then get_reviews.',
      }
    }
    const limit = Math.max(1, Math.min(10, Number(args?.limit) || 5))
    const reviews = readReviews(limit)
    return {
      subject: cleanText(document.querySelector('#content h1 span[property="v:itemreviewed"]')?.textContent),
      count: reviews.length,
      reviews,
      hint: 'Use the url field (web_fetch or browser navigation) to read a full review.',
    }
  },

  async get_now_playing(args) {
    const limit = Math.max(1, Math.min(30, Number(args?.limit) || 10))
    const rows = readNowPlaying(limit)
    if (rows.length === 0) {
      // Not on the homepage — navigate there and let the agent re-read.
      return softNavigate('https://movie.douban.com/', 'Navigating to the homepage. Call get_now_playing again in a few seconds.')
    }
    return {
      count: rows.length,
      results: rows,
      hint: 'Use open_subject with subject_id to read a movie\'s details and comments.',
    }
  },

  async get_weekly_chart() {
    const rows = readWeeklyChart()
    if (rows.length === 0) {
      return softNavigate('https://movie.douban.com/', 'The weekly chart lives on the homepage. Navigating there — call get_weekly_chart again in a few seconds.')
    }
    return {
      count: rows.length,
      results: rows,
      hint: 'Use open_subject with subject_id to read a movie\'s details.',
    }
  },

  async browse_chart(args) {
    const limit = Math.max(1, Math.min(25, Number(args?.limit) || 10))
    if (location.pathname !== '/chart') {
      return softNavigate('https://movie.douban.com/chart', 'Navigating to the ranked chart page. Call browse_chart again in a few seconds to read it.')
    }
    await sleep(300)
    const rows = readChartPage(limit)
    return { count: rows.length, results: rows }
  },

  async browse_section(args) {
    const SECTIONS: Record<string, string> = {
      home: 'https://movie.douban.com/',
      nowplaying: 'https://movie.douban.com/cinema/nowplaying/',
      coming: 'https://movie.douban.com/cinema/later/',
      explore: 'https://movie.douban.com/explore',
      tv: 'https://movie.douban.com/tv/',
      chart: 'https://movie.douban.com/chart',
      reviews: 'https://movie.douban.com/review/best/',
    }
    const section = String(args.section || '').trim().toLowerCase()
    const url = SECTIONS[section]
    if (!url) {
      return {
        navigated: false,
        error: `Unknown section "${section}". Available: ${Object.keys(SECTIONS).join(', ')}.`,
      }
    }
    return softNavigate(url, `Navigating to "${section}". Call get_current_view in a few seconds to read it.`)
  },

  async get_top250(args) {
    const start = Math.max(0, Math.min(225, Number(args?.start) || 0))
    if (!/\/top250/.test(location.pathname)) {
      return softNavigate(
        `https://movie.douban.com/top250?start=${start}`,
        `Navigating to Top 250 (rows ${start + 1}–${start + 25}). Call get_top250 with the same start again in a few seconds to read it.`,
      )
    }
    const rows = readSubjectListRows(25, '#content')
    return {
      range: { from: start + 1, to: start + rows.length },
      count: rows.length,
      results: rows,
      next_start: start + rows.length < 250 ? start + 25 : null,
      hint: 'Use open_subject with a subject_id to read a movie\'s details.',
    }
  },

  async open_celebrity(args) {
    const raw = String(args.celebrity_id || args.url || '').trim()
    const id = raw.match(/(\d{3,})/)?.[1]
    if (!id) throw new Error('celebrity_id is required (numeric id, e.g. 1274297)')
    if (location.pathname === `/celebrity/${id}/`) {
      return readCelebrityView()
    }
    return softNavigate(
      `https://movie.douban.com/celebrity/${id}/`,
      'Opening the celebrity page. Call open_celebrity with the same id again in a few seconds to read it (name, bio, filmography, awards).',
    )
  },

  async get_doulist(args) {
    const raw = String(args.list_id || args.url || '').trim()
    const id = raw.match(/(\d{3,})/)?.[1]
    if (!id) throw new Error('list_id is required (numeric doulist id, e.g. 240962)')
    const start = Math.max(0, Number(args?.start) || 0)
    if (!/\/doulist\//.test(location.pathname)) {
      return softNavigate(
        `https://movie.douban.com/doulist/${id}/?start=${start}`,
        'Navigating to the doulist page. Call get_doulist with the same list_id/start again in a few seconds to read it.',
      )
    }
    const title = cleanText(document.querySelector('#content h1')?.textContent)
    const desc = cleanText(document.querySelector('.doulist-note, #content .intro')?.textContent)
    const rows = readSubjectListRows(25, '#content')
    return {
      list_id: id,
      title,
      description: desc || undefined,
      start,
      count: rows.length,
      results: rows,
      next_start: rows.length === 25 ? start + 25 : null,
    }
  },

  async get_tv_info(args) {
    const episodeLimit = Math.max(1, Math.min(100, Number(args?.episode_limit) || 30))
    if (!/\/subject\/\d+/.test(location.pathname)) {
      return { error: 'Not on a movie/TV detail page. Call open_subject (subject_id) first, then get_tv_info.' }
    }
    return readTvInfo(episodeLimit)
  },

  async go_home() {
    // On search.douban.com this is exposed as go_movie_site: navigate
    // to the MOVIE site homepage (different host — toolset swaps there).
    return softNavigate('https://movie.douban.com/', 'Navigating to the Douban Movie homepage. Its toolset registers after the page loads.')
  },

  async go_movie_site() {
    return softNavigate('https://movie.douban.com/', 'Navigating to the Douban Movie homepage. Its toolset registers after the page loads.')
  },
}
