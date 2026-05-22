try { document.getElementById('version')!.textContent = 'v' + chrome.runtime.getManifest().version; } catch {}

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
      setStatus('disabled', '无法访问当前页面');
      return;
    }
    var url = tab.url || '';
    if (url.indexOf('chrome') === 0 || url.indexOf('about:') === 0) {
      setStatus('disabled', '浏览器内部页面，不支持注入');
      return;
    }
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: function () { return !!(window.__agentWeb && (window.__agentWeb as any).ready); }
    }, function (results) {
      if (chrome.runtime.lastError) {
        setStatus('disabled', '检测失败');
        return;
      }
      if (results && results[0] && results[0].result === true) {
        setStatus('active', 'API 已注入，可以使用');
      } else {
        setStatus('inactive', '未注入，刷新页面后生效');
      }
    });
  });
})();

(function () {
  var logEl = document.getElementById('codexLog')!;
  var btn = document.getElementById('codexLoginBtn')!;
  var resetBtn = document.getElementById('codexResetBtn')!;
  if (!logEl || !btn || !resetBtn) return;

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
      setCodexStatus('error', 'Status check failed');
      return;
    }
    var d = resp.data;
    switch (d.authState) {
      case 'authorized':
        setCodexStatus('authorized', '✅ Authorized');
        break;
      case 'pending':
        setCodexStatus('pending', '⏳ Authorization pending…');
        break;
      case 'expired':
        setCodexStatus('expired', '⚠️ Token expired, please re-authorize');
        break;
      default:
        setCodexStatus('idle', 'Not authorized. Click below to start.');
    }

    // Load usage data if authorized
    if (d.authState === 'authorized') {
      loadUsageData();
    }

    // If pending auth exists, proactively poll now (background alarm may have missed it)
    if (d.authState !== 'authorized') {
      loadPendingAuth().then(function (p) {
        if (p && p.device_auth_id && p.user_code && p.expires_at && p.expires_at > Date.now()) {
          setCodexStatus('pending', '⏳ Checking authorization status…');
          // Start polling every 5 seconds within the popup
          var pollInterval = setInterval(function () {
            sendMessage({
              type: 'codex_auth_poll',
              deviceAuthId: p.device_auth_id,
              userCode: p.user_code,
            }).then(function (pollResp) {
              if (pollResp && pollResp.done) {
                clearInterval(pollInterval);
                setCodexStatus('authorized', '✅ Authorized! You can now use Codex.');
                document.getElementById('deviceCodeBox')!.style.display = 'none';
                loadUsageData();
              } else if (pollResp && pollResp.pending) {
                setCodexStatus('pending', '⏳ Waiting for authorization…');
              } else if (!pollResp || !pollResp.ok) {
                clearInterval(pollInterval);
                setCodexStatus('error', '❌ Authorization failed');
              }
            }).catch(function () {
              clearInterval(pollInterval);
            });
            // Stop polling if expired
            if (p.expires_at && p.expires_at <= Date.now()) {
              clearInterval(pollInterval);
              setCodexStatus('expired', '⚠️ Authorization code expired. Please try again.');
            }
          }, 5000);
        }
      });
    }
  }).catch(function () {
    setCodexStatus('error', 'Failed to check status');
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
    return {
      usedPercent: pct,
      windowMinutes: winStr ? parseInt(winStr, 10) || null : null,
      resetAt: resetStr ? parseInt(resetStr, 10) || null : null,
    };
  }

  function formatResetTime(resetAt: number) {
    if (!resetAt) return '';
    var d = new Date(resetAt * 1000);
    var now = Date.now();
    if (d.getTime() <= now) return 'resetting...';
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    var today = new Date(now);
    if (d.toDateString() === today.toDateString()) {
      return 'today ' + hh + ':' + mm;
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
          '<div style="height:100%;width:' + Math.min(100, win.usedPercent) + '%;background:' + color + ';border-radius:3px;transition:width 0.3s;"></div>' +
        '</div>' +
        '<span style="font-size:10px;font-weight:600;color:' + color + ';min-width:36px;text-align:right;">' + Math.round(remaining) + '% left</span>' +
      '</div>' +
      (resetLabel ?
        '<div style="font-size:10px;color:#9ca3af;margin-left:30px;">resets ' + resetLabel + '</div>'
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

  function loadUsageData() {
    sendMessage({ type: 'codex_get_usage' }).then(function (resp) {
      if (!resp || !resp.ok || !resp.data) return;
      var usage = resp.data;
      var headers = usage.headers || {};
      var primary = parseWindow(headers, 'x-codex-primary');
      var secondary = parseWindow(headers, 'x-codex-secondary');
      if (!primary && !secondary) return;

      var container = document.getElementById('codexUsage')!;
      if (container) container.style.display = 'block';

      var planType = headers['x-codex-plan-type'] || headers['x-codex-active-limit'] || '';
      var planEl = document.getElementById('usagePlan')!;
      if (planEl && planType) planEl.textContent = planType;

      renderWindow('usagePrimary', '5h', primary);
      renderWindow('usageSecondary', 'Wk', secondary);

      if (usage.updatedAt) {
        var updatedEl = document.getElementById('usageUpdated')!;
        if (updatedEl) updatedEl.textContent = 'Updated ' + new Date(usage.updatedAt).toLocaleTimeString();
      }
    }).catch(function () {});
  }

  resetBtn.addEventListener('click', async function () {
    await chrome.storage.local.remove(['codex_pending_auth', 'codex_tokens', 'codex_token_saved_at', 'codex_usage']);
    logEl.textContent = '';
    setCodexStatus('idle', 'Not authorized. Click below to start.');
    var usageEl = document.getElementById('codexUsage')!;
    if (usageEl) usageEl.style.display = 'none';
    log('🧹 已清除登录状态，请重新点击 Start Device Code Login');
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
      log('继续上次登录流程');
      showDeviceCode(d.user_code, d.verification_uri_complete || d.verification_uri);
    } else {
      var start;
      try {
        start = await sendMessage({ type: 'codex_auth_start' });
      } catch (err: any) {
        log('start error: ' + String((err && err.message) || err || 'runtime sendMessage failed'));
        return;
      }
      if (!start) {
        log('start error: no response from background (please reload extension after npm run watch)');
        return;
      }
      if (!start.ok) {
        log('start error: ' + JSON.stringify(start.error || start));
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
        log('poll error: ' + JSON.stringify(poll && poll.error ? poll.error : poll));
        return;
      }

      if (poll.done) {
        await clearPendingAuth();
        log('✅ Authorized!');
        setCodexStatus('authorized', '✅ Authorized! You can now use Codex in the web app.');
        document.getElementById('deviceCodeBox')!.style.display = 'none';
        return;
      }

      if (poll.pending) {
        log('pending: ' + poll.code);
        if (poll.code === 'slow_down') intervalMs += 2000;
      }
    }

    await clearPendingAuth();
    log('❌ expired, retry please');
  });
})();

document.getElementById('openDocs')!.addEventListener('click', function () {
  chrome.tabs.create({ url: 'https://github.com/nutstore-nut/creatorweave/blob/main/browser-extension/README.md' });
});
document.getElementById('openGithub')!.addEventListener('click', function () {
  chrome.tabs.create({ url: 'https://github.com/nutstore-nut/creatorweave' });
});
