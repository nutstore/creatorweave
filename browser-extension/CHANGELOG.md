# Changelog

## [1.1.0] - 2026-07-14

### Added
- Side panel toggle: floating button opens AND closes the panel
- `__cwUpstreamPage`: auto-injects on all sites, captures URL/title/selected text live
- Side panel context provider bridge: sites expose `__sidePanelContextProvider.getContext()` → injected into LLM system prompt
- "Open in new tab" button in side panel TopBar
- Draggable button with edge-snapping + position persistence

### Changed
- Side panel button: `<all_urls>` (was workspace.jianguoyun.com only)
- Project routing: per-hostname (was per-tab)
- System prompt context block split into [Source — read live] + [Page details — provided by site]
