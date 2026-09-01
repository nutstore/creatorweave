// ============================================================
// movie.douban.com recipe — DOM-automation WebMCP tools for
// Douban Movie, China's largest film rating & review community.
//
// Douban Movie is a classic server-rendered site (no SPA
// router), so every navigation is a full page load: tools that
// move the page return a soft pointer and the agent re-reads via
// get_current_view after re-injection.
//
// DOM facts verified against the live site (2026-09-01):
//   - search input:  input[name="search_text"] (header form)
//   - now playing:   #screening li.ui-slide-item with
//     data-title/data-rating/... attributes
//   - weekly chart:  homepage sidebar "weekly reputation" table
//   - subject page:  h1 span[property="v:itemreviewed"],
//     strong.rating_num, #info, span[property="v:summary"],
//     #hot-comments .comment-item
// Almost all content is public (no login needed) — only the full
// comments list requires an account.
// All tools are read-only (readOnlyHint).
// ============================================================

import type { WebMCPRecipe } from './types'

export const doubanMovieRecipe: WebMCPRecipe = {
  id: 'douban-movie',
  hostname: 'movie.douban.com',
  // No pathPrefixes — movie.douban.com serves the whole movie app
  // (home, /subject/*, /cinema/*, /chart, /tv, /review/*, /annual/*,
  // /celebrity/*, /trailers, /tag, /explore, …). Every route under
  // the hostname gets the toolset; tools that need a specific view
  // navigate there themselves (soft pointer + re-injection).
  pathPrefixes: undefined,
  displayName: '豆瓣电影 — Douban Movie',
  description:
    'Search movies, read the now-playing lineup and the weekly reputation chart, and open movie pages with ratings, info, summaries and hot short comments on movie.douban.com (public, no login needed).',
  category: 'reference',
  version: '1.1.0',
  glyph: '🎬',
  tools: [
    {
      name: 'get_top250',
      title: 'Read the Top 250 chart',
      description:
        'Read Douban Movie Top 250 (豆瓣电影 Top 250), page by page (25 rows per page). Use start (0, 25, 50 …) to page through; on a wrong page it navigates first — call again in a few seconds.',
      inputSchema: {
        type: 'object',
        properties: {
          start: { type: 'number', description: '0-based row offset, multiple of 25 (default 0)', minimum: 0, maximum: 225 },
        },
      },
    },
    {
      name: 'open_celebrity',
      title: 'Open a celebrity page',
      description:
        'Open an actor/director (影人) page by celebrity id and return name, bio summary, filmography highlights and awards. Navigate-and-read: call again in a few seconds if it reports navigation.',
      inputSchema: {
        type: 'object',
        properties: {
          celebrity_id: { type: 'string', description: 'Numeric celebrity id (e.g. 1274297 from a subject page link)' },
        },
        required: ['celebrity_id'],
      },
    },
    {
      name: 'get_doulist',
      title: 'Read a douban movie list',
      description:
        'Read a 豆瓣片单 (doulist, e.g. /doulist/240962/): title, description and its movie rows (title, rating, subject id). Page through with start (25 items per page).',
      inputSchema: {
        type: 'object',
        properties: {
          list_id: { type: 'string', description: 'Numeric doulist id (e.g. 240962)' },
          start: { type: 'number', description: '0-based item offset, multiple of 25 (default 0)', minimum: 0 },
        },
        required: ['list_id'],
      },
    },
    {
      name: 'get_tv_info',
      title: 'Read TV seasons and episodes',
      description:
        'On the currently open TV series page, read the season structure: all available seasons (subject id each) and — when the page shows them — the first/featured season episode list (episode number, title, rating). Call open_subject first if not on a series page.',
      inputSchema: {
        type: 'object',
        properties: {
          episode_limit: { type: 'number', description: 'Max episodes to return (default 30)', minimum: 1, maximum: 100 },
        },
      },
    },
    {
      name: 'search_movies',
      title: 'Search movies',
      description:
        'Search Douban Movie by keyword (movie / TV series / celebrity) using the header search box. Returns matching subjects (title, rating, subject id) — use open_result or open_subject to read one in detail.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keywords (e.g. 肖申克的救赎 or Nolan)' },
          limit: {
            type: 'number',
            description: 'Max results to return (default 10, max 25)',
            minimum: 1,
            maximum: 25,
          },
          tags: {
            type: 'string',
            description: 'Optional filter tags appended to the query, e.g. "美国 剧情" or "日本 动画 2020s". Combined with the search box keywords.',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_now_playing',
      title: 'Read now playing',
      description:
        'Read the「正在热映」lineup from the homepage: title, rating, region, director, main actors, release date and subject id for each film currently in theatres.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max movies to return (default 10, max 30)', minimum: 1, maximum: 30 },
        },
      },
    },
    {
      name: 'get_weekly_chart',
      title: 'Read weekly reputation chart',
      description:
        'Read the「一周口碑榜」(weekly reputation chart) from the homepage sidebar: rank, title, rating and subject id.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'browse_chart',
      title: 'Browse the ranked chart page',
      description:
        'Open the /chart ranked list page (排行榜) and read its top rows (title, rating, subject id).',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max rows to return (default 10, max 25)', minimum: 1, maximum: 25 },
        },
      },
    },
    {
      name: 'open_result',
      title: 'Open a search result',
      description:
        'Open the Nth row (0-based) from the last search_movies result list. Full page navigation — call get_current_view in a few seconds to read the details.',
      inputSchema: {
        type: 'object',
        properties: {
          index: { type: 'number', description: '0-based row index from search_movies results', minimum: 0 },
        },
        required: ['index'],
      },
    },
    {
      name: 'open_subject',
      title: 'Open a movie page',
      description:
        "Open a movie/TV detail page by subject id (e.g. 1292052) and return its content: Douban rating, vote count, star distribution, metadata (director / writers / actors / genres / release), summary and hot short comments.",
      inputSchema: {
        type: 'object',
        properties: {
          subject_id: {
            type: 'string',
            description: 'Numeric subject id from search/now_playing/weekly results (e.g. 1292052)',
          },
        },
        required: ['subject_id'],
      },
    },
    {
      name: 'get_comments',
      title: 'Read hot short comments',
      description:
        'Read the hot short comments (热门短评) from the currently open movie/TV page: author, date, star rating, useful-vote count and text. On a movie page by default; call open_subject first if elsewhere. Full comment pagination requires login — this reads what renders publicly.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max comments to return (default 10, max 20)', minimum: 1, maximum: 20 },
          start: { type: 'number', description: '0-based comment offset for paging through /comments (multiple of 20). Navigates to the comments page when set.', minimum: 0 },
          sort: { type: 'string', enum: ['hot', 'latest'], description: 'hot = 最热门 (default), latest = 最新' },
          score: { type: 'string', enum: ['1', '2', '3', '4', '5'], description: 'Filter by star rating (1=很差 … 5=力荐). Requires start-based paging.' },
        },
      },
    },
    {
      name: 'get_reviews',
      title: 'Read popular reviews',
      description:
        'Read the popular full reviews (热门影评) listed on the currently open movie/TV page: author, title, spoiler flag, excerpt and the review URL (use web_fetch or navigate to read the full text). Call open_subject first if not on a movie page.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max reviews to return (default 5, max 10)', minimum: 1, maximum: 10 },
        },
      },
    },
    {
      name: 'get_current_view',
      title: 'Read the current page',
      description:
        'Read whatever movie.douban.com page is currently open — on a subject page returns structured details (rating, info, summary, hot comments); on other pages returns the rendered text.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'browse_section',
      title: 'Go to a section',
      description:
        'Navigate to a site section: home, nowplaying (影讯&购票), coming (即将上映), explore (选电影), tv (选剧集), chart (排行榜), reviews (影评).',
      inputSchema: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            enum: ['home', 'nowplaying', 'coming', 'explore', 'tv', 'chart', 'reviews'],
            description: 'Section to open',
          },
        },
        required: ['section'],
      },
    },
    {
      name: 'go_home',
      title: 'Back to homepage',
      description: 'Navigate back to the movie.douban.com homepage (now playing + weekly chart).',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}

// ============================================================
// Douban Movie search results live on a DIFFERENT hostname:
// search.douban.com/movie/subject_search?search_text=… It needs
// its own recipe with a SEARCH-ORIENTED toolset: the movie-home
// tools (now playing / weekly chart / …) target movie.douban.com
// DOM and would either no-op or navigate back off this host.
// Implementations reuse the same file but are host-aware.
// ============================================================

export const doubanSearchRecipe: WebMCPRecipe = {
  id: 'douban-search',
  hostname: 'search.douban.com',
  pathPrefixes: undefined,
  displayName: '豆瓣搜索 — Douban Movie Search',
  description:
    'Read and refine Douban Movie search results on search.douban.com: list result rows (title, rating, subject id), re-search by keyword, and open movies. Public, no login needed.',
  category: 'reference',
  version: '1.1.0',
  glyph: '🔍',
  tools: [
    {
      name: 'get_current_view',
      title: 'Read the current search results',
      description:
        'Read the search results currently rendered on search.douban.com: each row (title, rating, subject id, url). If the page navigated to a movie/subject page, returns the movie details instead.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max rows to return (default 10, max 25)', minimum: 1, maximum: 25 },
        },
      },
    },
    {
      name: 'search_movies',
      title: 'Search movies',
      description:
        'Run a new Douban Movie search using the search box on search.douban.com (fills the box and submits — stays on this host). Returns the result rows.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keywords' },
          limit: { type: 'number', description: 'Max results to return (default 10, max 25)', minimum: 1, maximum: 25 },
        },
        required: ['query'],
      },
    },
    {
      name: 'open_result',
      title: 'Open a search result',
      description:
        'Open the Nth row (0-based) from the current search results. Navigates to the movie.douban.com subject page — its toolset (open_subject / get_current_view …) registers after the page loads.',
      inputSchema: {
        type: 'object',
        properties: {
          index: { type: 'number', description: '0-based row index from the results list', minimum: 0 },
        },
        required: ['index'],
      },
    },
    {
      name: 'open_subject',
      title: 'Open a movie page',
      description:
        "Open a movie/TV detail page by subject id (e.g. 1292052). Navigates to movie.douban.com — its toolset registers after the page loads; call get_current_view there to read details.",
      inputSchema: {
        type: 'object',
        properties: {
          subject_id: { type: 'string', description: 'Numeric subject id from the results (e.g. 38581618)' },
        },
        required: ['subject_id'],
      },
    },
    {
      name: 'go_movie_site',
      title: 'Back to Douban Movie',
      description:
        'Navigate to the movie.douban.com homepage (now playing, weekly chart, explore …). The toolset swaps to the Douban Movie recipe after the page loads.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}
