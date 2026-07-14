// ============================================================
// Side Panel Button Content Script (ISOLATED world)
//
// Generic entry point for CreatorWeave's side panel feature — runs on
// ALL URLs (matches <all_urls>) so users can invoke the side panel
// from any page they're browsing. Injects a compact floating button
// labeled "怡氧知知" that toggles the side panel on click.
// The button is draggable: release snaps to the nearest screen edge.
//
// What this script needs from the page:
//   - Just `window.location.href`. Everything else (URL/title/selected
//     text) is fetched fresh by background via `__cwUpstreamPage` (a
//     separate MAIN-world content script). This keeps the click handler
//     light and avoids shipping stale or wrong-shaped context.
//
// Why ISOLATED world (not MAIN):
//   - `chrome.runtime.sendMessage` is only available in ISOLATED.
//   - `chrome.sidePanel.open()` needs the user gesture in the SAME sync
//     call stack. MAIN→ISOLATED postMessage loses the gesture, so the
//     click handler must run in ISOLATED and send synchronously.
//
// Per-site provider opt-in is independent:
//   - Sites that want richer context (e.g. ticket data) can expose
//     `window.__sidePanelContextProvider.getContext()` and background
//     will pick it up automatically. No code change in this script.
// ============================================================

const POS_KEY = 'cw_side_panel_btn_pos'

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  // 默认 ISOLATED world — 不需要 world: 'MAIN'

  main() {
    const BUTTON_ID = 'cw-side-panel-btn'

    // Don't inject the button on CreatorWeave's own pages — the side
    // panel *is* CreatorWeave, so having a "唤起怡氧知知" button there
    // is confusing and recursive.
    //
    // Detection: CreatorWeave sets `document.documentElement.dataset.creatorweave`
    // at app load (main.tsx). We check the DOM (not window vars) because
    // this content script runs in the ISOLATED world and can't read
    // MAIN-world window properties. Falls back to origin check in case
    // the data attribute hasn't been set yet (e.g. page still loading).
    if (
      document.documentElement.dataset.creatorweave === 'true' ||
      window.location.origin === 'http://localhost:5173' ||
      window.location.origin === 'https://creatorweave.eo2suite.cn'
    ) {
      // eslint-disable-next-line no-console
      console.log('[CreatorWeave Side Panel] skipped: this is a CreatorWeave page')
      return
    }

    function removeButton() {
      const existing = document.getElementById(BUTTON_ID)
      if (existing) existing.remove()
    }

    function injectButton() {
      if (document.getElementById(BUTTON_ID)) return

      const container = document.createElement('div')
      container.id = BUTTON_ID
      container.style.cssText = [
        'position: fixed',
        'z-index: 2147483647',
        'background: linear-gradient(135deg, #14B8A6, #0D7377)',
        'color: #fff',
        'border: 1px solid rgba(255,255,255,0.2)',
        'border-radius: 10px',
        'padding: 8px 7px',
        'cursor: pointer',
        'font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
        'font-size: 12px',
        'font-weight: 500',
        'box-shadow: 0 2px 10px rgba(0,0,0,0.2)',
        'display: flex',
        'flex-direction: column',
        'align-items: center',
        'gap: 3px',
        'transition: background 0.2s, opacity 0.3s',
        'user-select: none',
        'touch-action: none',
        'opacity: 0',
      ].join(';')
      container.title = '点击唤起怡氧知知 AI 助手'

      container.innerHTML = `
        <svg id="cw-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 5l7 7-7 7"/>
        </svg>
        <span style="writing-mode: vertical-rl; letter-spacing: 1px;">怡氧知知</span>
      `

      // ── Position logic ──
      // We remember which EDGE (left/right) and the Y coordinate.
      // On every reposition we clamp to the current viewport, so window
      // resize / side-panel-open both trigger a reposition.
      let edge: 'left' | 'right'
      let posY: number

      const savedPos = (() => {
        try {
          const raw = localStorage.getItem(POS_KEY)
          if (!raw) return null
          const pos = JSON.parse(raw) as { edge: string; y: number }
          if (pos.edge !== 'left' && pos.edge !== 'right') return null
          if (typeof pos.y !== 'number') return null
          return pos as { edge: 'left' | 'right'; y: number }
        } catch {
          return null
        }
      })()
      if (savedPos) {
        edge = savedPos.edge
        posY = savedPos.y
      } else {
        edge = 'right'
        posY = window.innerHeight / 2
      }

      // Recalculate and apply position based on current viewport.
      // Called on load, after drag, on window resize, and after toggle.
      function reposition() {
        const w = window.innerWidth
        const h = window.innerHeight
        const clampedY = Math.max(40, Math.min(posY, h - 40))
        const x = edge === 'left' ? 0 : w
        container.style.left = `${x}px`
        container.style.top = `${clampedY}px`
        container.style.transform = edge === 'left' ? 'translate(0, -50%)' : 'translate(-100%, -50%)'

        // Arrow points toward the side panel direction: → on right edge,
        // ← on left edge. Flips via scaleX(-1) for instant re-rendering
        // without rebuilding the DOM node.
        const arrow = container.querySelector('#cw-arrow')
        if (arrow) arrow.style.transform = edge === 'left' ? 'scaleX(-1)' : 'none'
      }
      reposition()

      // Reposition on viewport changes (window resize, side panel open/close,
      // devtools toggle, zoom level change). rAF-debounced for smoothness.
      let resizeRaf = 0
      window.addEventListener('resize', () => {
        cancelAnimationFrame(resizeRaf)
        resizeRaf = requestAnimationFrame(reposition)
      })

      // ── Toggle click (fire-and-forget) ──
      container.addEventListener('click', (e) => {
        // If this click ended a drag, suppress the toggle
        if (wasDragging) {
          e.preventDefault()
          e.stopPropagation()
          return
        }
        chrome.runtime.sendMessage({
          type: 'cw_side_panel_toggle',
          url: window.location.href,
        })
        // Side panel open/close changes available viewport width.
        // Reposition after Chrome has finished the panel animation.
        // 300ms covers Chrome's default side panel open animation.
        setTimeout(reposition, 300)
      })

      // ── Hover ──
      container.addEventListener('mouseenter', () => {
        container.style.background = '#14b8a6'
      })
      container.addEventListener('mouseleave', () => {
        container.style.background = '#0d9488'
      })

      // ── Drag: mousedown → move → mouseup snaps to nearest edge ──
      let isDragging = false
      let wasDragging = false
      let startX = 0
      let startY = 0
      let offsetX = 0
      let offsetY = 0
      const DRAG_THRESHOLD = 5 // px movement before it counts as a drag

      container.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return // left button only for mouse
        isDragging = true
        wasDragging = false
        startX = e.clientX
        startY = e.clientY
        const rect = container.getBoundingClientRect()
        offsetX = e.clientX - rect.left - rect.width / 2
        offsetY = e.clientY - rect.top - rect.height / 2
        container.setPointerCapture(e.pointerId)
        // Disable transition during drag for 1:1 tracking
        container.style.transition = 'none'
        e.preventDefault()
      })

      container.addEventListener('pointermove', (e) => {
        if (!isDragging) return
        const dx = e.clientX - startX
        const dy = e.clientY - startY
        if (!wasDragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
          wasDragging = true
        }
        if (!wasDragging) return

        // Follow cursor, centered on pointer
        let cx = e.clientX - offsetX
        let cy = e.clientY - offsetY
        // Clamp to viewport
        cx = Math.max(20, Math.min(cx, window.innerWidth - 20))
        cy = Math.max(20, Math.min(cy, window.innerHeight - 20))
        container.style.left = `${cx}px`
        container.style.top = `${cy}px`
        container.style.transform = 'translate(-50%, -50%)'
      })

      container.addEventListener('pointerup', (e) => {
        if (!isDragging) return
        isDragging = false
        container.releasePointerCapture(e.pointerId)
        container.style.transition = 'background 0.2s'

        if (!wasDragging) return // it was a click, not a drag

        // ── Snap to nearest edge ──
        const w = window.innerWidth
        const h = window.innerHeight
        const rect = container.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2

        edge = centerX < w / 2 ? 'left' : 'right'
        posY = Math.max(40, Math.min(rect.top + rect.height / 2, h - 40))
        reposition()

        // Persist
        try {
          localStorage.setItem(POS_KEY, JSON.stringify({ edge, y: posY }))
        } catch {}
      })

      document.body.appendChild(container)
      // Trigger slide-in animation (opacity transition from 0→1).
      // requestAnimationFrame ensures the browser registers opacity:0
      // before we switch to 1, otherwise the transition is skipped.
      requestAnimationFrame(() => {
        container.style.opacity = '1'
      })
    }

    function tryInject() {
      if (document.body) {
        injectButton()
      } else {
        setTimeout(tryInject, 200)
      }
    }
    tryInject()

    // SPA 路由变化时重新注入按钮
    let lastUrl = window.location.href
    const urlObserver = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href
        removeButton()
        setTimeout(tryInject, 500)
      }
    })
    urlObserver.observe(document.documentElement, { childList: true, subtree: true })

    // eslint-disable-next-line no-console
    console.log('[CreatorWeave Side Panel] ✅ Button injected on', window.location.hostname)
  },
})
