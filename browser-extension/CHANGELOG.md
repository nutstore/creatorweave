# Changelog

All notable changes to `browser-extension/` are documented here. Versions follow [Semantic Versioning](https://semver.org/). Dates are the release date.

## [1.2.0] - 2026-08-19

Brand refresh, native WebMCP GA, dual-domain web-app routing, and a Rust-based native host.

### Added

- **WebMCP native support (GA)** — push discovery via dual-world content scripts, per-host authorization with popup switches, group hierarchy, invocation gate, and enforcement-at-discovery time (disabled tools do not exist in the advertised set). The extension is now the single source of truth for authorization; the web app shows a read-only view.
- **WebMCP recipes** — user-enabled tool packs for non-native sites (jmail, jmessage).
- **Folder access (multi-root)** — store + native-host executor + UI backing for reading and writing files in user-designated folders. The browser's FS Access API has been retired in favor of a separate Rust binary.
- **Locale-aware web-app routing** — `navigator.language` → `weave.eo2suite.cn` for `zh*`, `weave.eo2suite.com` otherwise. A single source of truth (`lib/webapp-origins.ts`) keeps the legacy `creatorweave.eo2suite.cn` origin in the allowlist for compatibility.
- **Dev / prod build separation** — `wxt` writes to `chrome-mv3-dev` and `wxt build` to `chrome-mv3`, so a stable unpacked install and a live-reload dev build coexist. Dev builds are tagged "EO2Weave Dev" in the toolbar tooltip and the extensions page.
- **Side panel page actions + screenshots** — `act on pages` capability surfaced in the workspace.
- **Localized save status** for storage writes.
- **Bundled Monaco workers** — no runtime CDN fetch.

### Changed

- **Brand rename** — `CreatorWeave` → `EO2Weave` (English) / `怡氧知知` (zh-CN). Manifest name, action tooltip, toolbar icon, README, and `_locales/{en,zh_CN}/messages.json` all updated.
- **Native host** rewritten in Rust (`cw-native-host`) and shipped via `install.sh`; talks to the extension over Chrome Native Messaging. Manual install only — the extension works fully without it.
- **WebMCP** — web app becomes a read-only view of extension-managed authorization.
- **Domain change** — the preferred web-app origin is now `weave.eo2suite.{cn,com}`. The legacy `creatorweave.eo2suite.cn` origin is retained on the allowlist to keep older links alive.

### Fixed

- **WebMCP pipeline hardening** — dedup of concurrent discoveries, ghost-tab cleanup, soft navigation success detection, window scoping.
- **Page-action runner under strict CSP** — replaced `new Function()` synthesis with a direct import of `synthesizeElementLocators`, so locator enumeration works on bank / Google / GitHub pages where the earlier MAIN-world eval was blocked by `EvalError`.
- **Fallback model `maxTokens`** raised to 64K so long-form thinking-and-response tasks (e.g. deepseek-v4-pro) no longer truncate.
- **Popup layout** — widened to 360px, host header row restored, "Supported Sites" entry moved above the capability status line.
- **i18n placeholder handling** in the WebMCP authorization panel.
- **Codex OAuth** stripped from store builds (tree-shaken at build time via `CW_CODEX_OAUTH=0`); popup markup + locale keys + OpenAI client strings removed.
- Side-panel floating button offset 8px from the viewport edge to clear browser scrollbars (rolled in from the unlisted 1.1.1 patch).

### Notes

- The published minimum version shipped to the Chrome Web Store as "1.1.0" (2026-07-14). The 1.1.1 floating-button patch and subsequent intermediate bumps (1.1.2–1.1.4) were internal-only and never released publicly; this 1.2.0 is the first post-1.1.0 store release.
- `popup/index.html` and `_locales/*/messages.json` no longer carry a `<title>` tag — manifest `action.default_title` is the single source for the toolbar tooltip. The dev variant uses `'EO2Weave Dev'`.

## [1.1.1] - 2026-07-14 (internal patch, not separately released)

- Side-panel floating button offset 8px from the viewport edge so it no longer overlaps browser scrollbars.

## [1.1.0] - 2026-07-14

### Added

- Side panel toggle: floating button opens **and** closes the panel.
- `__cwUpstreamPage` auto-injects on all sites; captures URL / title / selected text live.
- Side panel context provider bridge: sites expose `__sidePanelContextProvider.getContext()`; result is injected into the LLM system prompt.
- "Open in new tab" button in the side-panel TopBar.
- Draggable floating button with edge-snapping + position persistence.

### Changed

- Side panel button: `<all_urls>` (was `workspace.jianguoyun.com` only).
- Project routing: per-hostname (was per-tab).
- System prompt context block split into `[Source — read live]` + `[Page details — provided by site]`.
