import { defineConfig } from 'wxt';
import pkg from './package.json';

// Codex OAuth feature flag.
// The Codex device-code login reuses the official Codex CLI's OAuth client_id
// and calls chatgpt.com/backend-api — fine for an internal/dev build, but NOT
// for the Chrome Web Store build (impersonation / OpenAI ToS review risk;
// see store-listing/cws-copy-and-permissions.md).
// Set CW_CODEX_OAUTH=0 to strip the feature at build time: `__CW_CODEX_OAUTH__`
// becomes `false` and treeshaking removes every OpenAI endpoint / client_id /
// UA string from the bundle. Default ON (internal builds keep full features).
const CODEX_OAUTH = process.env.CW_CODEX_OAUTH !== '0';

// Stable Chromium extension key (RSA public key DER, base64).
// Keeps a consistent extension ID across loads/updates so the native messaging
// manifest's `allowed_origins` stays valid. Override at build time via
// CREATORWEAVE_CHROMIUM_EXTENSION_KEY if you need a different key pair.
const DEFAULT_CHROMIUM_EXTENSION_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq7brlUY/QJP5fnbKrcvOAbirr3GLFgiXDbT2g8D5NKi8GDVBp+OIHCt96LsJ3zTiFlvx4W7bhcvX5JF3eUfP0qjLaaoUw8b683Uupui3iLPaGYrVDxFRNYJR28BDUtExCkb/rehk/QVtLapPVB63YboFzuU2L0SUyGjfzXi6sLYOIFGnYfrrcLQu3pLf+iuRr04yjkfcvlXIG3Ws+Am5AfFFvWxYX1zvV58GyHM5kaKZy2MqugOMiwbQvID5Lkm35NhOxpO/lrjrOy5ZhNObiWZZk70VzJxGM3saE/q/aUEeOwY+0RLqzWb7cs/f8E1tMxB23rifheL7M58tuFpXDwIDAQAB';

export default defineConfig({
  outDir: 'dist',
  // WXT copies public assets AFTER vite's closeBundle, so locale stripping
  // runs in WXT's own `build:done` hook (after everything is on disk).
  hooks: {
    'build:done': () => {
      if (CODEX_OAUTH) return;
      const fs = require('fs') as typeof import('fs');
      const pathMod = require('path') as typeof import('path');
      const localesDir = pathMod.resolve(__dirname, 'dist/chrome-mv3/_locales');
      // eslint-disable-next-line no-console
      console.log(`[strip-codex-locales] rewriting ${localesDir}`);
      if (!fs.existsSync(localesDir)) return;
      for (const locale of fs.readdirSync(localesDir)) {
        const file = pathMod.join(localesDir, locale, 'messages.json');
        if (!fs.existsSync(file)) continue;
        try {
          const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
          let changed = false;
          for (const key of Object.keys(parsed)) {
            if (/codex|devicecode|resetcredit|useresetcredit|authorizedcanuse|waitingforauthorization/i.test(key)) {
              delete parsed[key];
              changed = true;
            }
          }
          if (changed) fs.writeFileSync(file, JSON.stringify(parsed, null, 2));
        } catch {
          // leave file untouched on parse failure
        }
      }
    },
  },
  // NOTE: `define` must live inside the `vite` hook — a top-level `define` key
  // is silently ignored by WXT, leaving `__CW_CODEX_OAUTH__` un-replaced in
  // the bundle (verified in the first store build; OpenAI strings survived).
  vite: () => ({
    define: {
      __CW_CODEX_OAUTH__: JSON.stringify(CODEX_OAUTH),
    },
    // Store build: also strip the Codex box from popup.html at build time.
    // (main.ts removes it at runtime, but the markup would still ship in the
    // zip for reviewers to find.) The .codex-box div is the last element
    // before <footer>, so a greedy match up to the last </div> before footer
    // removes exactly that block.
    plugins: CODEX_OAUTH
      ? []
      : [
          {
            name: 'strip-codex-popup',
            transformIndexHtml: {
              order: 'post' as const,
              handler(html: string) {
                // Strip the Codex markup block AND its CSS class definitions
                // (.codex-box / .codex-btn / .codex-log / .reset-credit-*) so
                // no trace of the feature ships in the store zip.
                let out = html.replace(/[ \t]*<div class="codex-box">[\s\S]*<\/div>(\s*<footer)/, '$1');
                out = out.replace(/[ \t]*\.(?:codex-[a-z-]+|reset-credit-[a-z-]+)[^{]*\{[^}]*\}[\s\S]*?(?=\n[ \t]*\.|\n[ \t]*<\/style>)/g, '');
                return out;
              },
            },
          },
        ],
  }),
  // Dev mode outputs to `dist/chrome-mv3` (not the default `chrome-mv3-dev`),
  // so the web app's vite-plugin-extension-serve (which watches dist/chrome-mv3)
  // serves the DEV build. Without this, dev artifacts land in chrome-mv3-dev and
  // the web keeps serving the stale PROD build → popup shows PROD.
  outDirTemplate: '{{browser}}-mv{{manifestVersion}}',
  // Don't auto-launch a separate browser during `wxt dev`. CreatorWeave loads
  // the extension via a zip downloaded from the web app, not via web-ext's
  // managed browser. The manual runner just logs the output path.
  runner: {
    disabled: true,
  },
  manifest: {
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    version: pkg.version,
    // Pin a stable extension ID derived from a fixed public key.
    key: process.env.CREATORWEAVE_CHROMIUM_EXTENSION_KEY || DEFAULT_CHROMIUM_EXTENSION_KEY,
    permissions: ['scripting', 'tabs', 'storage', 'alarms', 'notifications', 'sidePanel', 'nativeMessaging'],
    host_permissions: ['<all_urls>'],
    // Fixed Firefox add-on ID for native messaging registration.
    browser_specific_settings: {
      gecko: {
        id: 'creatorweave-bridge@creatorweave.local',
      },
    },
    // No global side_panel config — side panel is only enabled per-tab
    // via setOptions({ tabId }) when user clicks the workspace assistant button.
    // icons and action icon are auto-generated by WXT from public/icon.png
  },
});
