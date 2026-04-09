/**
 * ActivityHeatmap - Refined contribution heatmap
 *
 * Theme-aware, uses project accent color.
 * Staggered cell reveal animation, summary stats, and a proper React tooltip.
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import { getSQLiteDB } from '@/sqlite/sqlite-database'
import { useT, useLocale } from '@/i18n'
import { useTheme } from '@/store/theme.store'

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
  totalActive: number
  longestStreak: number
  currentStreak: number
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
  while (start.getDay() !== 0) {
    start.setDate(start.getDate() - 1)
  }

  let maxCount = 0
  let totalActive = 0
  data.forEach((v) => {
    if (v > maxCount) maxCount = v
    if (v > 0) totalActive += v
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

  // Streaks
  const allDays = weeks.flat()
  let longestStreak = 0
  let currentStreak = 0
  let tempStreak = 0

  for (let i = 0; i < allDays.length; i++) {
    if (allDays[i].count > 0) {
      tempStreak++
      longestStreak = Math.max(longestStreak, tempStreak)
    } else {
      tempStreak = 0
    }
  }

  // Current streak from the end
  for (let i = allDays.length - 1; i >= 0; i--) {
    if (allDays[i].count > 0) {
      currentStreak++
    } else {
      break
    }
  }

  return { weeks, maxCount, totalActive, longestStreak, currentStreak }
}

//-----------------------------------------------------------------------------
// Component
//-----------------------------------------------------------------------------

const MONTH_NAMES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_NAMES_ZH = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

const CELL_SIZE = 11
const CELL_GAP = 3
const CELL_RADIUS = 2.5
const TOOLTIP_OFFSET_Y = 44

export function ActivityHeatmap() {
  const t = useT()
  const [locale] = useLocale()
  const { isDark } = useTheme()
  const [data, setData] = useState<Map<string, number>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [hoveredCell, setHoveredCell] = useState<DayCell | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    fetchActivityData()
      .then((d) => {
        setData(d)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const { weeks, totalActive, currentStreak } = useMemo(() => buildGrid(data), [data])

  const monthNames = locale === 'zh-CN' || locale === 'ja-JP' ? MONTH_NAMES_ZH : MONTH_NAMES_EN
  const dayLabels = locale === 'zh-CN' ? ['', '一', '', '三', '', '五', ''] : ['', 'Mon', '', 'Wed', '', 'Fri', '']

  // Theme-aware cell colors using oklch derived from accent hue
  const getCellColor = useCallback(
    (level: number): string => {
      // Read the CSS variable at runtime to stay in sync with accent color changes
      if (typeof document === 'undefined') {
        return level === 0 ? '#ebedf0' : '#9be9a8'
      }

      const root = document.documentElement
      const primary = root.style.getPropertyValue('--primary').trim()

      if (!primary) {
        // Fallback
        const fallback = isDark
          ? ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353']
          : ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']
        return fallback[level] || fallback[0]
      }

      // Parse "H S% L%" format
      const match = primary.match(/(\d+)\s+(\d+)%\s+(\d+)%/)
      if (!match) return '#ebedf0'

      const h = parseInt(match[1])
      const s = parseInt(match[2])
      const l = parseInt(match[3])

      if (level === 0) {
        return isDark
          ? `hsl(${h}, ${Math.max(5, s * 0.2)}%, 14%)`
          : `hsl(${h}, ${Math.max(5, s * 0.2)}%, 94%)`
      }

      // Build a perceptual ramp from faint to saturated
      const lightnessShift = isDark
        ? [0, 12, 8, 4, -2][level]
        : [0, -8, -14, -22, -32][level]

      return `hsl(${h}, ${Math.min(80, s * 1.2)}%, ${l + lightnessShift}%)`
    },
    [isDark]
  )

  // Memoize color map for all 5 levels
  const levelColors = useMemo(() => {
    return [0, 1, 2, 3, 4].map((l) => getCellColor(l))
  }, [getCellColor])

  // Build month labels
  const monthLabels = useMemo(() => {
    const labels: { name: string; span: number }[] = []
    let prevMonth = -1
    for (const week of weeks) {
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

  const handleCellHover = useCallback(
    (cell: DayCell, el: HTMLElement) => {
      setHoveredCell(cell)
      const rect = el.getBoundingClientRect()
      setTooltipPos({
        x: rect.left + rect.width / 2,
        y: rect.top - TOOLTIP_OFFSET_Y,
      })
    },
    []
  )

  const handleCellLeave = useCallback(() => {
    setHoveredCell(null)
    setTooltipPos(null)
  }, [])

  if (!loaded) {
    return (
      <div className="home-reveal rounded-xl border border-border/60 bg-card/60 p-5">
        <div className="h-[120px] flex items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <span className="home-mono text-[11px] text-tertiary dark:text-muted">
              {t('common.loading') || 'Loading...'}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="home-reveal home-delay-3 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-5">
        {/* Header with stats */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 rounded-full bg-primary/60" />
            <span className="home-mono text-[11px] uppercase tracking-wider text-secondary dark:text-secondary-foreground">
              {t('projectHome.activity.title')}
            </span>
          </div>

          {/* Summary stats */}
          {totalActive > 0 && (
            <div className="hidden sm:flex items-center gap-4">
              <div className="flex items-baseline gap-1">
                <span className="home-mono text-sm font-medium text-primary dark:text-primary-foreground">
                  {totalActive}
                </span>
                <span className="home-mono text-[10px] text-tertiary dark:text-muted">
                  {t('projectHome.activity.count')}
                </span>
              </div>
              {currentStreak > 0 && (
                <>
                  <div className="w-px h-3 bg-border" />
                  <div className="flex items-baseline gap-1">
                    <span className="home-mono text-sm font-medium text-primary dark:text-primary-foreground">
                      {currentStreak}d
                    </span>
                    <span className="home-mono text-[10px] text-tertiary dark:text-muted">streak</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Heatmap grid */}
        <div className="relative overflow-x-auto scrollbar-none">
          <div className="inline-flex">
            {/* Day labels */}
            <div
              className="flex flex-col shrink-0 mr-1.5"
              style={{ gap: CELL_GAP, paddingTop: 18 }}
            >
              {dayLabels.map((label, i) => (
                <div
                  key={i}
                  className="text-[10px] leading-none text-tertiary/70 dark:text-muted/70 select-none"
                  style={{ height: CELL_SIZE, width: 20, textAlign: 'right', lineHeight: `${CELL_SIZE}px` }}
                >
                  {label}
                </div>
              ))}
            </div>

            <div>
              {/* Month labels */}
              <div className="flex text-[10px] text-tertiary/70 dark:text-muted/70 mb-1 select-none">
                {monthLabels.map((m, i) => (
                  <div key={i} style={{ width: m.span * (CELL_SIZE + CELL_GAP), textAlign: 'left' }}>
                    {m.name}
                  </div>
                ))}
              </div>

              {/* Grid cells */}
              <div className="flex" style={{ gap: CELL_GAP }}>
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col" style={{ gap: CELL_GAP }}>
                    {week.map((cell) => (
                      <div
                        key={cell.date}
                        className="heat-cell rounded-[2.5px] cursor-pointer"
                        title={`${cell.date} · ${cell.count} ${t('projectHome.activity.count')}`}
                        aria-label={`${cell.date}, ${cell.count} ${t('projectHome.activity.count')}`}
                        style={{
                          width: CELL_SIZE,
                          height: CELL_SIZE,
                          backgroundColor: levelColors[cell.level],
                          borderRadius: CELL_RADIUS,
                          animationDelay: `${wi * 8}ms`,
                        }}
                        onMouseEnter={(e) => handleCellHover(cell, e.currentTarget)}
                        onMouseLeave={handleCellLeave}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-1.5 mt-3">
          <span className="home-mono text-[10px] text-tertiary/60 dark:text-muted/60">
            {t('projectHome.activity.less')}
          </span>
          {levelColors.map((c, i) => (
            <div
              key={i}
              className="rounded-[2px]"
              style={{ width: CELL_SIZE, height: CELL_SIZE, backgroundColor: c, borderRadius: CELL_RADIUS - 0.5 }}
            />
          ))}
          <span className="home-mono text-[10px] text-tertiary/60 dark:text-muted/60">
            {t('projectHome.activity.more')}
          </span>
        </div>

        {/* Cell animation + hover styles */}
        <style>{`
          @keyframes heatCellIn {
            from { opacity: 0; transform: scale(0.3); }
            to   { opacity: 1; transform: scale(1); }
          }
          .heat-cell {
            animation: heatCellIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
            transition: transform 0.15s ease-out;
          }
          .heat-cell:hover {
            transform: scale(1.4);
            z-index: 10;
            position: relative;
          }
        `}</style>
      </div>

      {/* Tooltip rendered outside the card to avoid overflow clipping */}
      {hoveredCell && tooltipPos && (
        <div
          className="fixed pointer-events-none"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: 'translate(-50%, -100%)',
            zIndex: 9999,
          }}
        >
          <div
            className="rounded-lg px-3 py-2 text-xs whitespace-nowrap"
            style={{
              backgroundColor: isDark ? 'rgba(28, 28, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
              color: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)',
              boxShadow: isDark
                ? '0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)'
                : '0 4px 16px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.04)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          >
            <div className="font-medium" style={{ marginBottom: 2 }}>
              {hoveredCell.date}
            </div>
            <div className="opacity-70">
              {hoveredCell.count} {t('projectHome.activity.count')}
            </div>
          </div>
          {/* Arrow */}
          <div
            className="mx-auto"
            style={{
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: isDark
                ? '4px solid rgba(28, 28, 30, 0.95)'
                : '4px solid rgba(255, 255, 255, 0.95)',
            }}
          />
        </div>
      )}
    </>
  )
}
