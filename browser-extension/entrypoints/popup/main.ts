// Build-time Codex OAuth feature flag (see wxt.config.ts).
// Store builds (CW_CODEX_OAUTH=0) hide the whole Codex box in the popup.
declare const __CW_CODEX_OAUTH__: boolean;

function t(key: string, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(key as any, substitutions) || key;
}

function localizeStaticContent(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(function (element) {
    element.textContent = t(element.dataset.i18n || '');
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach(function (element) {
    element.title = t(element.dataset.i18nTitle || '');
  });
}

localizeStaticContent();
try { document.getElementById('version')!.textContent = 'v' + chrome.runtime.getManifest().version; } catch {}

// Show build mode badge — DEV builds only.
// Production builds hide the badge entirely: store users shouldn't see a
// "PROD" tag (it leaks internal jargon and looks unpolished).
(function () {
  var el = document.getElementById('buildMode');
  if (!el) return;
  // WXT/Vite injects `import.meta.env` typings via `wxt-env.d.ts` (generated).
  // MODE is one of 'development' | 'production' per Vite contract.
  var mode = import.meta.env.MODE || 'production';
  var isDev = mode === 'development';
  if (!isDev) {
    el.remove();
    return;
  }
  // DEV build: reveal and fill the badge (static HTML ships it hidden/empty).
  el.removeAttribute('hidden');
  el.className = 'build-mode ' + (isDev ? 'dev' : 'prod');
  el.textContent = isDev ? 'DEV' : 'PROD';
})();

// WebMCP tools discovered in this window — grouped by hostname.
// Mirrors the web app's Settings → WebMCP host list (WebMCPHostList.tsx):
// hostname + tool count + per-host authorization switch. Clicking the
// host name jumps to the source tab; the switch writes the extension-side
// authorization store (enforced by the background invoke gate).
(function () {
  var box = document.getElementById('webmcpBox');
  var list = document.getElementById('webmcpList');
  var summary = document.getElementById('webmcpSummary');
  if (!box || !list || !summary) return;

  // hostname → latest authorization state (default: enabled)
  var hostEnabled: Record<string, boolean> = {};

  function renderIdle() {
    summary.textContent = chrome.i18n.getMessage('webmcpScanning') || 'Scanning tabs…';
    list.textContent = '';
  }

  function renderEmpty() {
    box.style.display = 'none';
  }

  // Debug visibility: a silent hide makes "no tools" indistinguishable from
  // "discovery crashed". Keep the box visible with a reason when discovery
  // responded but found nothing, so issues are diagnosable at a glance.
  function renderNoTools(detail?: string) {
    box.style.display = '';
    const base = chrome.i18n.getMessage('webmcpNoTools') || 'No WebMCP tools found in this window';
    summary.textContent = detail ? base + ' — ' + detail : base;
    list.textContent = '';
  }

  function renderError(detail: string) {
    box.style.display = '';
    summary.textContent = (chrome.i18n.getMessage('webmcpDiscoverError') || 'WebMCP discovery failed') + ': ' + detail;
    list.textContent = '';
  }

  function cssEscape(value: string): string {
    return (window as any).CSS && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
  }

  function setHostEnabledState(hostname: string, enabled: boolean) {
    hostEnabled[hostname] = enabled;
    var row = list && list.querySelector('[data-host="' + cssEscape(hostname) + '"]');
    if (row) {
      row.classList.toggle('disabled-host', !enabled);
      var toggle = row.querySelector('input.webmcp-toggle') as HTMLInputElement | null;
      if (toggle) {
        toggle.checked = enabled;
        toggle.disabled = false;
        toggle.title = enabled
          ? (chrome.i18n.getMessage('webmcpToggleHostTitle') || "Allow the agent to use this site's tools")
          : (chrome.i18n.getMessage('webmcpHostDisabled') || 'Disabled — tools from this site are blocked');
      }
      var leftEl = row.querySelector('.webmcp-host-left') as HTMLElement | null;
      if (leftEl) {
        leftEl.title = enabled
          ? (row.getAttribute('data-tools') || '')
          : (chrome.i18n.getMessage('webmcpHostDisabled') || 'Disabled — tools from this site are blocked');
      }
    }
  }

  function buildToggle(opts: {
    checked: boolean;
    titleOn: string;
    titleOff: string;
    onToggle: (next: boolean, done: (ok: boolean) => void) => void;
  }): HTMLLabelElement {
    var toggleLabel = document.createElement('label');
    toggleLabel.style.margin = '0';
    toggleLabel.style.flex = '0 0 auto';
    var toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'webmcp-toggle';
    toggle.checked = opts.checked;
    toggle.title = opts.checked ? opts.titleOn : opts.titleOff;
    toggle.addEventListener('change', function () {
      var next = toggle.checked;
      toggle.disabled = true;
      opts.onToggle(next, function (ok) {
        if (!ok) {
          toggle.checked = !next;
          toggle.disabled = false;
          return;
        }
        toggle.checked = next;
        toggle.disabled = false;
        toggle.title = next ? opts.titleOn : opts.titleOff;
      });
    });
    toggleLabel.appendChild(toggle);
    return toggleLabel;
  }

  function sendSetEnabled(message: any, done: (ok: boolean) => void) {
    chrome.runtime.sendMessage(message, function (resp: any) {
      if (chrome.runtime.lastError || !resp || !resp.ok) { done(false); return; }
      done(true);
    });
  }

  function renderList(tools: any[]) {
    if (!tools || tools.length === 0) {
      renderEmpty();
      return;
    }
    box.style.display = '';
    // Group by hostname → { groups: Map<groupKey, {count, tabId, toolNames, enabled}> , hostEnabled }
    var byHost: Record<string, {
      count: number;
      tabId: number;
      groups: Record<string, { count: number; tabId: number; toolNames: string[]; enabled?: boolean }>;
      enabled?: boolean;
    }> = {};
    for (var i = 0; i < tools.length; i++) {
      var tool = tools[i];
      var host = tool.hostname || 'unknown';
      if (!byHost[host]) byHost[host] = { count: 0, tabId: tool.tabId, groups: {} };
      byHost[host].count++;
      if (typeof tool.hostEnabled === 'boolean') byHost[host].enabled = tool.hostEnabled;
      var gk = tool.groupKey || (host + '_default');
      if (!byHost[host].groups[gk]) byHost[host].groups[gk] = { count: 0, tabId: tool.tabId, toolNames: [] };
      byHost[host].groups[gk].count++;
      if (typeof tool.groupEnabled === 'boolean') byHost[host].groups[gk].enabled = tool.groupEnabled;
      if (byHost[host].groups[gk].toolNames.length < 4) byHost[host].groups[gk].toolNames.push(tool.name);
    }
    var hosts = Object.keys(byHost);
    var totalTools = tools.length;
    // chrome.i18n.getMessage handles $HOSTS$/$TOOLS$ via declared placeholders
    // + substitutions — bare $NAME in the message gets eaten by Chrome's own
    // substitution parser ("$HOSTS" rendered as "OSTS").
    summary.textContent = chrome.i18n.getMessage('webmcpFoundSummary', [String(hosts.length), String(totalTools)])
      || (hosts.length + ' site(s), ' + totalTools + ' tool(s)');

    list.textContent = '';
    hosts.sort().forEach(function (host) {
      var info = byHost[host];
      var hostOn = info.enabled !== false;
      hostEnabled[host] = hostOn;

      var item = document.createElement('div');
      item.className = 'webmcp-host' + (hostOn ? '' : ' disabled-host');
      item.dataset.host = host;

      var left = document.createElement('div');
      left.className = 'webmcp-host-left';
      left.addEventListener('click', function () {
        if (typeof info.tabId === 'number') {
          chrome.tabs.update(info.tabId, { active: true });
          window.close();
        }
      });
      var name = document.createElement('span');
      name.className = 'webmcp-host-name';
      name.textContent = host;
      var count = document.createElement('span');
      count.className = 'webmcp-host-count';
      count.textContent = String(info.count);
      left.appendChild(name);
      left.appendChild(count);

      var hostToggle = buildToggle({
        checked: hostOn,
        titleOn: chrome.i18n.getMessage('webmcpToggleHostTitle') || "Allow the agent to use this site's tools",
        titleOff: chrome.i18n.getMessage('webmcpHostDisabled') || 'Disabled — tools from this site are blocked',
        onToggle: function (next, done) {
          sendSetEnabled({ type: 'webmcp_set_host_enabled', hostname: host, enabled: next }, done);
        },
      });
      // Header row keeps name area and switch on the same line.
      var head = document.createElement('div');
      head.className = 'webmcp-host-head';
      head.appendChild(left);
      head.appendChild(hostToggle);
      item.appendChild(head);

      // Nested group rows (mirror the web app's WebMCPHostList hierarchy).
      var groupKeys = Object.keys(info.groups);
      if (groupKeys.length > 0) {
        var groupsWrap = document.createElement('div');
        groupsWrap.className = 'webmcp-groups';
        groupKeys.forEach(function (gk, idx) {
          var g = info.groups[gk];
          var groupOn = hostOn && g.enabled !== false;
          var row = document.createElement('div');
          row.className = 'webmcp-group' + (groupOn ? '' : ' disabled-host');

          var gLeft = document.createElement('div');
          gLeft.className = 'webmcp-group-left';
          gLeft.title = g.toolNames.join(', ');
          gLeft.addEventListener('click', function () {
            if (typeof g.tabId === 'number') {
              chrome.tabs.update(g.tabId, { active: true });
              window.close();
            }
          });
          var gName = document.createElement('span');
          gName.className = 'webmcp-group-name';
          gName.textContent = 'Group ' + (idx + 1);
          var gCount = document.createElement('span');
          gCount.className = 'webmcp-group-count';
          gCount.textContent = String(g.count);
          gLeft.appendChild(gName);
          gLeft.appendChild(gCount);

          var gToggle = buildToggle({
            checked: groupOn,
            titleOn: chrome.i18n.getMessage('webmcpToggleGroupTitle') || 'Allow the agent to use this tool group',
            titleOff: chrome.i18n.getMessage('webmcpGroupDisabled') || 'Disabled — this tool group is blocked',
            onToggle: function (next, done) {
              sendSetEnabled({ type: 'webmcp_set_group_enabled', groupKey: gk, enabled: next }, done);
            },
          });
          row.appendChild(gLeft);
          row.appendChild(gToggle);
          groupsWrap.appendChild(row);
        });
        item.appendChild(groupsWrap);
      }

      list.appendChild(item);
    });
  }

  renderIdle();
  chrome.runtime.sendMessage({ type: 'webmcp_discover_tools' }, function (resp: any) {
    if (chrome.runtime.lastError) {
      renderError(chrome.runtime.lastError.message || 'runtime error');
      return;
    }
    if (!resp) {
      renderError('no response from background');
      return;
    }
    if (!resp.ok) {
      renderError(resp.error || 'unknown error');
      return;
    }
    const tools = resp.tools || [];
    if (tools.length === 0) {
      renderNoTools(resp.scannedTabs != null ? `${resp.scannedTabs} tab(s) scanned, 0 tools` : undefined);
      return;
    }
    renderList(tools);
  });
})();

// Check injection status
(function () {
  var el = document.getElementById('status')!;
  var dot = document.getElementById('statusDot')!;
  var text = document.getElementById('statusText')!;

  function setStatus(type: string, msg: string) {
    el.className = 'status ' + type;
    dot.className = 'status-dot ' + type;
    text.textContent = msg;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs && tabs[0];
    if (!tab || !tab.id) {
      setStatus('disabled', t('cannotAccessCurrentPage'));
      return;
    }
    var url = tab.url || '';
    if (url.indexOf('chrome') === 0 || url.indexOf('about:') === 0) {
      setStatus('disabled', t('browserInternalPage'));
      return;
    }
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: function () { return !!(window.__agentWeb && (window.__agentWeb as any).ready); }
    }, function (results) {
      if (chrome.runtime.lastError) {
        setStatus('disabled', t('injectionCheckFailed'));
        return;
      }
      if (results && results[0] && results[0].result === true) {
        setStatus('active', t('apiReady'));
      } else {
        setStatus('inactive', t('apiInactive'));
      }
    });
  });
})();

(function () {
  // Whole IIFE is folded away in store builds (CW_CODEX_OAUTH=0) via the
  // __CW_CODEX_OAUTH__ block guard; markup/CSS/locales are also stripped at
  // build time (wxt.config.ts). Dev builds keep full functionality.
  if (__CW_CODEX_OAUTH__) {
  var logEl = document.getElementById('codexLog')!;
  var btn = document.getElementById('codexLoginBtn')!;
  var resetBtn = document.getElementById('codexResetBtn')!;
  var resetCreditBox = document.getElementById('resetCreditBox')!;
  var resetCreditCount = document.getElementById('resetCreditCount')!;
  var resetCreditMeta = document.getElementById('resetCreditMeta')!;
  var resetCreditBtn = document.getElementById('resetCreditBtn')!;
  if (!logEl || !btn || !resetBtn || !resetCreditBox || !resetCreditCount || !resetCreditMeta || !resetCreditBtn) return;

  function sleep(ms: number) { return new Promise<void>(function (r) { setTimeout(r, ms); }); }
  function log(line: string) { logEl.textContent += (logEl.textContent ? '\n' : '') + line; }
  function sendMessage(message: any): Promise<any> {
    return new Promise(function (resolve, reject) {
      try {
        chrome.runtime.sendMessage(message, function (resp) {
          var lastErr = chrome.runtime.lastError;
          if (lastErr) {
            reject(new Error(lastErr.message || 'runtime.lastError'));
            return;
          }
          resolve(resp);
        });
      } catch (e) {
        reject(e);
      }
    });
  }
  function savePendingAuth(data: any): Promise<void> {
    return chrome.storage.local.set({ codex_pending_auth: data });
  }
  function clearPendingAuth(): Promise<void> {
    return chrome.storage.local.remove('codex_pending_auth');
  }
  function loadPendingAuth(): Promise<any> {
    return new Promise(function (resolve) {
      chrome.storage.local.get('codex_pending_auth', function (res) {
        resolve(res && res.codex_pending_auth ? res.codex_pending_auth : null);
      });
    });
  }

  var statusDot = document.getElementById('codexStatusDot')!;
  var statusText = document.getElementById('codexStatusText')!;

  function setCodexStatus(state: string, text: string) {
    if (statusDot) {
      var colors: Record<string, string> = {
        authorized: '#22c55e',
        pending: '#eab308',
        expired: '#ef4444',
        idle: '#d1d5db',
        error: '#ef4444',
      };
      statusDot.style.background = colors[state] || '#d1d5db';
    }
    if (statusText) statusText.textContent = text;
  }

  // Check current auth status from background on popup open
  sendMessage({ type: 'codex_get_status' }).then(function (resp) {
    if (!resp || !resp.ok || !resp.data) {
      setCodexStatus('error', t('statusCheckFailed'));
      return;
    }
    var d = resp.data;
    switch (d.authState) {
      case 'authorized':
        setCodexStatus('authorized', t('authorized'));
        break;
      case 'pending':
        setCodexStatus('pending', t('authorizationPending'));
        break;
      case 'expired':
        setCodexStatus('expired', t('tokenExpired'));
        break;
      default:
        setCodexStatus('idle', t('notAuthorized'));
    }

    // Load usage data if authorized
    if (d.authState === 'authorized') {
      loadUsageData();
    }

    // Only poll when the background explicitly reports a pending device-code
    // authorization. An expired/missing token must not revive a stale pending
    // record left by an earlier login attempt.
    if (d.authState === 'pending') {
      loadPendingAuth().then(function (p) {
        if (p && p.device_auth_id && p.user_code && p.expires_at && p.expires_at > Date.now()) {
          setCodexStatus('pending', t('waitingForAuthorization'));
          // Start polling every 5 seconds within the popup
          var pollInterval = setInterval(function () {
            sendMessage({
              type: 'codex_auth_poll',
              deviceAuthId: p.device_auth_id,
              userCode: p.user_code,
            }).then(function (pollResp) {
              if (pollResp && pollResp.done) {
                clearInterval(pollInterval);
                setCodexStatus('authorized', t('authorizedCanUseCodex'));
                document.getElementById('deviceCodeBox')!.style.display = 'none';
                loadUsageData();
              } else if (pollResp && pollResp.pending) {
                setCodexStatus('pending', t('waitingForAuthorization'));
              } else if (!pollResp || !pollResp.ok) {
                clearInterval(pollInterval);
                setCodexStatus('error', t('authorizationFailed'));
              }
            }).catch(function (err: any) {
              clearInterval(pollInterval);
              // Do not leave the popup stuck on “checking” when the
              // background service worker is unavailable or the message fails.
              setCodexStatus('error', t('authorizationFailed'));
              log(t('pollError', String(err?.message || err)));
            });
            // Stop polling if expired
            if (p.expires_at && p.expires_at <= Date.now()) {
              clearInterval(pollInterval);
              setCodexStatus('expired', t('authorizationCodeExpired'));
            }
          }, 5000);
        }
      });
    }
  }).catch(function () {
    setCodexStatus('error', t('failedToCheckStatus'));
  });

  loadPendingAuth().then(function (p) {
    if (!p) return;
    if (p.user_code && p.expires_at && p.expires_at > Date.now()) {
      showDeviceCode(p.user_code, p.verification_uri_complete || p.verification_uri);
    }
  });

  // ── Usage display helpers ──

  function parseWindow(headers: Record<string, string>, prefix: string) {
    var pctStr = headers[prefix + '-used-percent'];
    if (pctStr == null) return null;
    var pct = parseFloat(pctStr);
    if (!isFinite(pct)) return null;
    var winStr = headers[prefix + '-window-minutes'];
    var resetStr = headers[prefix + '-reset-at'];
    var windowMinutes = winStr ? parseInt(winStr, 10) || null : null;
    var resetAt = resetStr ? parseInt(resetStr, 10) || null : null;
    // codex-rs `has_data` guard: a window whose fields are all zero/empty is
    // a placeholder the server emits when no secondary limit applies, not a
    // real 100%-remaining bar. Drop it so we don't render a phantom row.
    var hasData = pct !== 0 || (windowMinutes != null && windowMinutes !== 0) || resetAt != null;
    if (!hasData) return null;
    return {
      usedPercent: pct,
      windowMinutes: windowMinutes,
      resetAt: resetAt,
    };
  }

  // Ported from codex-rs `get_limits_duration` (tui/src/chatwidget.rs).
  // Derives a short label from the window duration so the popup stays correct
  // no matter which windows OpenAI returns (5h / weekly / monthly / ...).
  function formatDurationLabel(windowMinutes: number | null, fallback: string): string {
    var M = 60, D = 24 * M, W = 7 * D, MO = 30 * D, BIAS = 3;
    if (windowMinutes == null || windowMinutes < 0) return fallback;
    if (windowMinutes <= D + BIAS) {
      var hours = Math.max(1, Math.floor((windowMinutes + BIAS) / M));
      return hours + 'h';
    }
    if (windowMinutes <= W + BIAS) return 'Wk';
    if (windowMinutes <= MO + BIAS) return 'Mo';
    return 'Yr';
  }

  function formatResetTime(resetAt: number) {
    if (!resetAt) return '';
    var d = new Date(resetAt * 1000);
    var now = Date.now();
    if (d.getTime() <= now) return t('resetting');
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    var today = new Date(now);
    if (d.toDateString() === today.toDateString()) {
      return t('todayAt', hh + ':' + mm);
    }
    var month = d.getMonth() + 1;
    var day = d.getDate();
    return month + '/' + day + ' ' + hh + ':' + mm;
  }

  function getBarColor(pct: number) {
    if (pct >= 90) return '#ef4444';
    if (pct >= 70) return '#f59e0b';
    return '#22c55e';
  }

  function renderWindow(containerId: string, label: string, win: any) {
    var el = document.getElementById(containerId)!;
    if (!el || !win) { if (el) el.innerHTML = ''; return; }
    var remaining = Math.max(0, 100 - win.usedPercent);
    var color = getBarColor(win.usedPercent);
    var resetLabel = formatResetTime(win.resetAt);
    el.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">' +
        '<span style="font-size:10px;font-weight:600;color:#6b7280;width:22px;">' + label + '</span>' +
        '<div style="flex:1;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;">' +
          '<div style="height:100%;width:' + Math.min(100, remaining) + '%;background:' + color + ';border-radius:3px;transition:width 0.3s;"></div>' +
        '</div>' +
        '<span style="font-size:10px;font-weight:600;color:' + color + ';min-width:36px;text-align:right;">' + t('percentLeft', String(Math.round(remaining))) + '</span>' +
      '</div>' +
      (resetLabel ?
        '<div style="font-size:10px;color:#9ca3af;margin-left:30px;">' + t('resetsAt', resetLabel) + '</div>'
        : '');
  }

  // ── Device code display + copy ──

  function showDeviceCode(code: string, url?: string) {
    var box = document.getElementById('deviceCodeBox')!;
    var textEl = document.getElementById('deviceCodeText')!;
    var linkEl = document.getElementById('deviceCodeLink')!;
    if (!box || !textEl) return;
    textEl.textContent = code || '';
    box.style.display = 'block';
    if (url) {
      linkEl.innerHTML = '<a href="' + url + '" target="_blank" style="color: #0d9488; text-decoration: none;">' + url + '</a>';
    } else {
      linkEl.innerHTML = '';
    }
  }

  document.getElementById('copyCodeBtn')!.addEventListener('click', function () {
    var code = (document.getElementById('deviceCodeText')!.textContent || '').trim();
    if (!code) return;
    var btn = document.getElementById('copyCodeBtn')!;
    navigator.clipboard.writeText(code).then(function () {
      btn.textContent = '✓';
      btn.style.color = '#22c55e';
      setTimeout(function () {
        btn.textContent = '📋';
        btn.style.color = '#6b7280';
      }, 1500);
    });
  });

  function loadResetCredits() {
    sendMessage({ type: 'codex_get_reset_credits' }).then(function (resp) {
      if (!resp || !resp.ok || !resp.data) {
        resetCreditBox.style.display = 'none';
        return;
      }
      var credits = Array.isArray(resp.data.credits) ? resp.data.credits : [];
      var available = credits.filter(function (credit: any) { return credit && credit.status === 'available' && credit.id; });
      var count = typeof resp.data.available_count === 'number' ? resp.data.available_count : available.length;
      if (count <= 0 || available.length === 0) {
        resetCreditBox.style.display = 'none';
        return;
      }
      resetCreditBox.style.display = 'block';
      resetCreditCount.textContent = t('availableCount', String(count));
      var expiresAt = available
        .map(function (credit: any) { return credit.expires_at ? new Date(credit.expires_at).getTime() : Infinity; })
        .filter(function (value: number) { return isFinite(value); })
        .sort(function (a: number, b: number) { return a - b; })[0];
      resetCreditMeta.textContent = isFinite(expiresAt)
        ? t('resetCreditExpires', new Date(expiresAt).toLocaleDateString())
        : '';
      resetCreditBtn.dataset.creditId = available[0].id;
    }).catch(function () {
      resetCreditBox.style.display = 'none';
    });
  }

  function loadUsageData() {
    loadResetCredits();
    sendMessage({ type: 'codex_get_usage' }).then(function (resp) {
      if (!resp || !resp.ok || !resp.data) return;
      var usage = resp.data;
      var headers = usage.headers || {};
      // Both windows are optional — render whichever the server returns and
      // hide the other. Labels are derived from each window's `window-minutes`
      // (matching codex-rs), so this stays correct if OpenAI re-enables the
      // 5-hour window or changes durations later.
      var primary = parseWindow(headers, 'x-codex-primary');
      var secondary = parseWindow(headers, 'x-codex-secondary');
      if (!primary && !secondary) return;

      var container = document.getElementById('codexUsage')!;
      if (container) container.style.display = 'block';

      var planType = headers['x-codex-plan-type'] || headers['x-codex-active-limit'] || '';
      var planEl = document.getElementById('usagePlan')!;
      if (planEl && planType) planEl.textContent = planType;

      renderWindow('usagePrimary', formatDurationLabel(primary && primary.windowMinutes, '5h'), primary);
      renderWindow('usageSecondary', formatDurationLabel(secondary && secondary.windowMinutes, 'Wk'), secondary);

      if (usage.updatedAt) {
        var updatedEl = document.getElementById('usageUpdated')!;
        if (updatedEl) updatedEl.textContent = t('updatedAt', new Date(usage.updatedAt).toLocaleTimeString());
      }
    }).catch(function () {});
  }

  resetCreditBtn.addEventListener('click', async function () {
    var creditId = resetCreditBtn.dataset.creditId || '';
    if (!creditId) return;
    if (!window.confirm(t('useResetCreditConfirm'))) return;
    resetCreditBtn.disabled = true;
    try {
      var resp = await sendMessage({ type: 'codex_consume_reset_credit', creditId: creditId });
      if (!resp || !resp.ok) {
        log(t('resetCreditFailed', String(resp?.message || resp?.errorCode || 'unknown error')));
        return;
      }
      log(t('resetCreditUsed'));
      resetCreditBox.style.display = 'none';
      loadUsageData();
    } catch (err: any) {
      log(t('resetCreditFailed', String(err?.message || err)));
    } finally {
      resetCreditBtn.disabled = false;
    }
  });

  resetBtn.addEventListener('click', async function () {
    await chrome.storage.local.remove(['codex_pending_auth', 'codex_tokens', 'codex_token_saved_at', 'codex_usage']);
    logEl.textContent = '';
    setCodexStatus('idle', t('notAuthorized'));
    var usageEl = document.getElementById('codexUsage')!;
    if (usageEl) usageEl.style.display = 'none';
    log(t('loginStateCleared'));
  });

  btn.addEventListener('click', async function () {
    logEl.textContent = '';

    var pending = await loadPendingAuth();
    var d: any;

    if (pending && pending.device_auth_id && pending.user_code && pending.expires_at && pending.expires_at > Date.now()) {
      d = {
        user_code: pending.user_code,
        device_auth_id: pending.device_auth_id,
        verification_uri: pending.verification_uri,
        verification_uri_complete: pending.verification_uri_complete,
        expires_in: Math.max(1, Math.floor((pending.expires_at - Date.now()) / 1000)),
        interval: 5,
      };
      log(t('resumingLogin'));
      showDeviceCode(d.user_code, d.verification_uri_complete || d.verification_uri);
    } else {
      var start;
      try {
        start = await sendMessage({ type: 'codex_auth_start' });
      } catch (err: any) {
        log(t('startError', String((err && err.message) || err || 'runtime sendMessage failed')));
        return;
      }
      if (!start) {
        log(t('noBackgroundResponse'));
        return;
      }
      if (!start.ok) {
        log(t('startError', JSON.stringify(start.error || start)));
        return;
      }

      d = start.data || {};
      showDeviceCode(d.user_code, d.verification_uri_complete || d.verification_uri);

      await savePendingAuth({
        user_code: d.user_code,
        device_auth_id: d.device_auth_id,
        verification_uri: d.verification_uri,
        verification_uri_complete: d.verification_uri_complete,
        expires_at: Date.now() + (d.expires_in || 900) * 1000,
      });

      if (d.verification_uri_complete || d.verification_uri) {
        chrome.tabs.create({ url: d.verification_uri_complete || d.verification_uri });
      }
    }

    var intervalMs = (d.interval || 5) * 1000;
    var deadline = Date.now() + (d.expires_in || 900) * 1000;

    while (Date.now() < deadline) {
      await sleep(intervalMs);
      var poll = await sendMessage({
        type: 'codex_auth_poll',
        deviceAuthId: d.device_auth_id,
        userCode: d.user_code,
      });

      if (!poll || !poll.ok) {
        log(t('pollError', JSON.stringify(poll && poll.error ? poll.error : poll)));
        return;
      }

      if (poll.done) {
        await clearPendingAuth();
        log(t('authorizationSucceeded'));
        setCodexStatus('authorized', t('authorizedCanUseWebApp'));
        document.getElementById('deviceCodeBox')!.style.display = 'none';
        return;
      }

      if (poll.pending) {
        log(t('authorizationPendingLog', String(poll.code)));
        if (poll.code === 'slow_down') intervalMs += 2000;
      }
    }

    await clearPendingAuth();
    log(t('authorizationExpiredLog'));
  });
  } // end if (__CW_CODEX_OAUTH__)
})();

document.getElementById('openDocs')!.addEventListener('click', function () {
  chrome.tabs.create({ url: 'https://github.com/nutstore/creatorweave/blob/main/browser-extension/README.md' });
});
document.getElementById('openGithub')!.addEventListener('click', function () {
  chrome.tabs.create({ url: 'https://github.com/nutstore/creatorweave' });
});
