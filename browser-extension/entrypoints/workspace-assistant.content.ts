// ============================================================
// Workspace Assistant Content Script (MAIN world)
// Only runs on workspace.jianguoyun.com
//
// 职责（workspace 站点专属）：
// 1. 注入 __sidePanelContextProvider（mock 实现，模拟上游站点后续要提供的）
//    严格遵循 docs/developer/guides/side-panel-context-provider.md 契约：
//      - 必须挂在 window 上
//      - 必须提供 getContext(): unknown | Promise<unknown>
//      - 字段 shape 由上游自定，CreatorWeave 不解析
//    页面如果自己暴露了同名 provider，本脚本会让位（不覆盖）。
//
// 通用页面元数据（URL / title）的捕获已经拆到独立的
// upstream-page.content.ts（<all_urls>，所有站点都注入 __cwUpstreamPage）。
// 这个脚本只负责 workspace 站点的业务 provider。
//
// 按钮注入和点击处理在 ISOLATED world (side-panel-button.content.ts) 中
// 因为 chrome.sidePanel.open() 需要用户手势上下文，
// MAIN→ISOLATED 的 postMessage 中转会丢失手势。
// ============================================================

export default defineContentScript({
  // Narrow to task pages only — the mock produces ticket-detail data,
  // which is meaningless outside /task/*. Other workspace pages (dashboard,
  // settings, mail) should fall through to the generic __cwUpstreamPage
  // context only (no providerContext).
  matches: ['*://workspace.jianguoyun.com/task/*'],
  runAt: 'document_idle',
  world: 'MAIN',

  main() {
    // ── 注入 __sidePanelContextProvider（mock）──
    // Runtime guard: matches pattern is the broad filter (/task/*),
    // this narrows further to actually look like a ticket detail URL.
    // Prevents mock from claiming "ticket_detail" on /task list pages
    // or any non-ticket path under /task.
    const url = window.location.href
    const ticketMatch = url.match(/\/task\/tickets\/([^/?#]+)/)
    if (!ticketMatch) return

    // 如果页面自己已经提供了，就不覆盖（上游站点后续接入时自然接管）
    if (!(window as any).__sidePanelContextProvider) {
      ;(window as any).__sidePanelContextProvider = {
        getContext: () => {
          let public_id = ''
          if (ticketMatch) {
            public_id = '[从URL解析: ' + ticketMatch[1].substring(0, 12) + '...]'
          }

          // 尝试从页面标题提取任务号
          const titleMatch = document.title.match(/#?(\d{5,7})/)
          if (titleMatch) {
            public_id = titleMatch[1]
          }

          // 只返回"上游才知道"的信息（业务字段）。
          // 通用页面元数据（URL / title / 选中文字）由
          // upstream-page.content.ts 注入的 __cwUpstreamPage 提供，
          // 不要在这里重复，避免责任混淆。
          return {
            page_type: 'ticket_detail',
            public_id,
          }
        },
      }
      // eslint-disable-next-line no-console
      console.log('[Workspace Assistant] ✅ Mock __sidePanelContextProvider injected')
    } else {
      // eslint-disable-next-line no-console
      console.log('[Workspace Assistant] ✅ __sidePanelContextProvider already exists (provided by page)')
    }
  },
})
