/**
 * ActivityHeatmap - GitHub-style contribution heatmap
 *
 * Shows user activity frequency over the past year.
 * Data sources: conversations + file ops + snapshots from SQLite.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { getSQLiteDB } from '@/sqlite/sqlite-database'
import { useT, useLocale } from '@/i18n'

//-----------------------------------------------------------------------------
// Types
//-----------------------------------------------------------------------------

interface DayCell {
  date: string // YYYY-MM-DD
  count: number
  level: 0 | 1 | 2 | 3 | 4
  dow: number // 0=Sun ... 6=Sat
}

interface ActivityData {
  weeks: DayCell[][]
  maxCount: number
}

//-----------------------------------------------------------------------------
// Data layer
//-----------------------------------------------------------------------------

async function fetchActivityData(): Promise<Map<string, number>> {
  const db = getSQLiteDB()
  const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000

  try {
    const rows = await db.queryAll<{ day: string; cnt: number }>(
      `
      SELECT day, SUM(cnt) AS cnt FROM (
        SELECT strftime('%Y-%m-%d', updated_at / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS cnt
        FROM conversations WHERE updated_at >= ? GROUP BY day
        UNION ALL
        SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS cnt
        FROM fs_ops WHERE created_at >= ? GROUP BY day
        UNION ALL
        SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) * 3 AS cnt
        FROM fs_changesets WHERE created_at >= ? GROUP BY day
      )
      GROUP BY day
      `,
      [oneYearAgo, oneYearAgo, oneYearAgo]
    )

    const map = new Map<string, number>()
    for (const r of rows) {
      if (r.day) map.set(r.day, r.cnt)
    }
    return map
  } catch {
    // Tables might not exist yet – return empty
    return new Map()
  }
}

//-----------------------------------------------------------------------------
// Helpers
//-----------------------------------------------------------------------------

function getLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0 || max === 0) return 0
  const r = count / max
  if (r < 0.2) return 1
  if (r < 0.45) return 2
  if (r < 0.7) return 3
  return 4
}

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function buildGrid(data: Map<string, number>): ActivityData {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const start = new Date(now)
  start.setDate(start.getDate() - 52 * 7)
  // Align to Sunday
  while (start.getDay() !== 0) {
    start.setDate(start.getDate() - 1)
  }

  // Find max
  let maxCount = 0
  data.forEach((v) => {
    if (v > maxCount) maxCount = v
  })

  const weeks: DayCell[][] = []
  let cursor = new Date(start)

  while (cursor <= now) {
    const week: DayCell[] = []
    for (let dow = 0; dow < 7; dow++) {
      const key = toDateKey(cursor)
      const count = data.get(key) || 0
      week.push({
        date: key,
        count,
        level: cursor <= now ? getLevel(count, maxCount) : 0,
        dow,
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  }

  return { weeks, maxCount }
}

//-----------------------------------------------------------------------------
// Component
//-----------------------------------------------------------------------------

const LEVEL_COLORS_LIGHT = [
  '#ebedf0', // 0
  '#9be9a8', // 1
  '#40c463', // 2
  '#30a14e', // 3
  '#216e39', // 4
]

const LEVEL_COLORS_DARK = [
  '#161b22', // 0
  '#0e4429', // 1
  '#006d32', // 2
  '#26a641', // 3
  '#39d353', // 4
]

const MONTH_NAMES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_NAMES_ZH = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

export function ActivityHeatmap() {
  const t = useT()
  const [locale] = useLocale()
  const [data, setData] = useState<Map<string, number>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchActivityData()
      .then((d) => {
        setData(d)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const { weeks } = useMemo(() => buildGrid(data), [data])

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const colors = isDark ? LEVEL_COLORS_DARK : LEVEL_COLORS_LIGHT
  const monthNames = locale === 'zh-CN' || locale === 'ja-JP' ? MONTH_NAMES_ZH : MONTH_NAMES_EN
  const dayLabels = locale === 'zh-CN' ? ['', '一', '', '三', '', '五', ''] : ['', 'Mon', '', 'Wed', '', 'Fri', '']

  // Build month labels from weeks
  const monthLabels = useMemo(() => {
    const labels: { name: string; span: number }[] = []
    let prevMonth = -1
    for (const week of weeks) {
      // Use Wednesday (index 3) of each week to determine month
      const mid = week[3]
      if (!mid) continue
      const m = parseInt(mid.date.split('-')[1], 10) - 1
      if (m !== prevMonth) {
        labels.push({ name: monthNames[m], span: 1 })
        prevMonth = m
      } else if (labels.length > 0) {
        labels[labels.length - 1].span++
      }
    }
    return labels
  }, [weeks, monthNames])

  const showTooltip = (cell: DayCell, el: HTMLElement) => {
    const tip = tooltipRef.current
    if (!tip) return
    const rect = el.getBoundingClientRect()
    tip.innerHTML = `<div style="font-weight:600">${cell.date}</div><div>${cell.count} ${t('projectHome.activity.count')}</div>`
    tip.style.opacity = '1'
    tip.style.left = rect.left + rect.width / 2 - tip.offsetWidth / 2 + 'px'
    tip.style.top = rect.top - tip.offsetHeight - 8 + 'px'
  }

  const hideTooltip = () => {
    const tip = tooltipRef.current
    if (!tip) return
    tip.style.opacity = '0'
  }

  // Don't render until data is loaded
  if (!loaded) {
    return (
      <div
        className="rounded-xl border border-border bg-card p-5"
        style={{ animationDelay: '0.2s' }}
      >
        <div className="h-[100px] flex items-center justify-center text-xs text-tertiary">
          {t('common.loading') || 'Loading...'}
        </div>
      </div>
    )
  }

  return (
    <div
      className="home-reveal home-delay-3 rounded-xl border border-border bg-card p-5"
      style={{ animationDelay: '0.2s' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <svg
          className="w-4 h-4 text-emerald-500 dark:text-emerald-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="12" width="4" height="9" rx="1" />
          <rect x="10" y="7" width="4" height="14" rx="1" />
          <rect x="17" y="3" width="4" height="18" rx="1" />
        </svg>
        <span className="home-mono text-[11px] uppercase tracking-wider text-tertiary dark:text-muted">
          {t('projectHome.activity.title')}
        </span>
      </div>

      {/* Heatmap grid */}
      <div className="relative overflow-x-auto">
        <div className="inline-flex">
          {/* Day labels */}
          <div className="flex flex-col gap-[3px] mr-1.5" style={{ paddingTop: 18 }}>
            {dayLabels.map((label, i) => (
              <div
                key={i}
                className="text-[10px] leading-[11px] text-tertiary dark:text-muted"
                style={{ height: 11, width: 20, textAlign: 'right' }}
              >
                {label}
              </div>
            ))}
          </div>

          <div>
            {/* Month labels row */}
            <div className="flex text-[10px] text-tertiary dark:text-muted mb-1">
              {monthLabels.map((m, i) => (
                <div key={i} style={{ width: m.span * 14, textAlign: 'left', paddingLeft: 0 }}>
                  {m.name}
                </div>
              ))}
            </div>

            {/* Grid cells */}
            <div ref={gridRef} className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((cell) => (
                    <div
                      key={cell.date}
                      className="rounded-[2px] cursor-pointer transition-transform duration-100 hover:scale-150 hover:z-10 hover:relative"
                      style={{
                        width: 11,
                        height: 11,
                        backgroundColor: colors[cell.level],
                      }}
                      onMouseEnter={(e) => showTooltip(cell, e.currentTarget)}
                      onMouseLeave={hideTooltip}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-1.5 mt-3 text-[10px] text-tertiary dark:text-muted">
        <span>{t('projectHome.activity.less')}</span>
        {colors.map((c, i) => (
          <div
            key={i}
            className="rounded-[2px]"
            style={{ width: 11, height: 11, backgroundColor: c }}
          />
        ))}
        <span>{t('projectHome.activity.more')}</span>
      </div>

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="fixed pointer-events-none opacity-0 transition-opacity duration-150 z-50 text-xs rounded-md shadow-lg whitespace-nowrap px-2.5 py-1.5"
        style={{
          backgroundColor: 'var(--tooltip-bg, #1f2328)',
          color: 'var(--tooltip-fg, #fff)',
        }}
      />
    </div>
  )
}
