/**
 * StandalonePreview - Standalone preview page component (used in new tab)
 * Features:
 * 1. Preview HTML files in iframe
 * 2. Element inspector mode: hover highlight, click to copy element info
 * 3. Floating debug control buttons
 * 4. Selected element info panel
 */

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'

// Inspector script injected into iframe
const INSPECTOR_SCRIPT = `
(function() {
  if (window.__ELEMENT_INSPECTOR_LOADED__) return;
  window.__ELEMENT_INSPECTOR_LOADED__ = true;

  var isInspecting = false; // Default off
  var currentHighlight = null;
  var tooltip = null;
  var highlightOverlay = null;

  // Create highlight overlay
  function createHighlightOverlay() {
    if (highlightOverlay) return;
    highlightOverlay = document.createElement('div');
    highlightOverlay.id = 'inspector-highlight';
    Object.assign(highlightOverlay.style, {
      position: 'fixed',
      border: '2px solid #3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.15)',
      pointerEvents: 'none',
      zIndex: '2147483646',
      display: 'none',
      transition: 'all 0.1s ease'
    });
    document.body.appendChild(highlightOverlay);
  }

  // Create tooltip
  function createTooltip() {
    if (tooltip) return;
    tooltip = document.createElement('div');
    tooltip.id = 'inspector-tooltip';
    Object.assign(tooltip.style, {
      position: 'fixed',
      display: 'none',
      background: '#1e1e1e',
      color: '#fff',
      padding: '6px 10px',
      borderRadius: '4px',
      fontSize: '11px',
      zIndex: '2147483647',
      pointerEvents: 'none',
      fontFamily: 'system-ui, sans-serif'
    });
    document.body.appendChild(tooltip);
  }

  // Highlight element
  function highlight(el) {
    createHighlightOverlay();
    if (!highlightOverlay) return;
    currentHighlight = el;
    var r = el.getBoundingClientRect();
    highlightOverlay.style.width = r.width + 'px';
    highlightOverlay.style.height = r.height + 'px';
    highlightOverlay.style.left = r.left + 'px';
    highlightOverlay.style.top = r.top + 'px';
    highlightOverlay.style.display = 'block';
  }

  // Clear highlight
  function clear() {
    currentHighlight = null;
    if (highlightOverlay) highlightOverlay.style.display = 'none';
    if (tooltip) tooltip.style.display = 'none';
  }

  // Get element selector
  function getSelector(el) {
    if (el.id) return '#' + el.id;
    var path = [], cur = el;
    while (cur && cur !== document.body) {
      var sel = cur.tagName.toLowerCase();
      if (cur.className && typeof cur.className === 'string') {
        var cls = cur.className.split(' ').filter(function(c) { return c && c.indexOf('inspector') < 0; });
        if (cls.length > 0) sel += '.' + cls.slice(0, 2).join('.');
      }
      var par = cur.parentElement;
      if (par) {
        var sibs = Array.from(par.children).filter(function(c) { return c.tagName === cur.tagName; });
        if (sibs.length > 1) sel += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
      }
      path.unshift(sel);
      cur = cur.parentElement;
      if (path.length > 5) break;
    }
    return path.join(' > ');
  }

  // Get XPath
  function getXPath(el) {
    var path = [], cur = el;
    while (cur && cur !== document.body) {
      var idx = 1, sib = cur.previousSibling;
      while (sib) { if (sib.nodeType === 1 && sib.tagName === cur.tagName) idx++; sib = sib.previousSibling; }
      path.unshift(cur.tagName.toLowerCase() + '[' + idx + ']');
      cur = cur.parentElement;
    }
    return '/' + path.join('/');
  }

  // Get element info
  function getInfo(el) {
    var tagName = el.tagName.toLowerCase();
    var id = el.id || null;
    var classes = el.className ? el.className.split(' ').filter(function(c) { return c; }) : [];
    var text = el.innerText ? el.innerText.trim().substring(0, 100) : '';
    return {
      tag: tagName,
      id: id,
      class: classes.length > 0 ? classes.join(' ') : null,
      text: text,
      selector: getSelector(el),
      xpath: getXPath(el)
    };
  }

  // Copy to clipboard
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function() {});
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  // Mouse move event
  function handleMouseMove(e) {
    if (!isInspecting) return;
    var t = e.target;
    if (!t || t === document.body || t === tooltip || t === highlightOverlay) return;
    if (t.id && (t.id.includes('inspector') || t.id.includes('tooltip'))) return;
    if (t.className && typeof t.className === 'string' && t.className.includes('inspector')) return;
    highlight(t);
  }

  // Click event
  function handleClick(e) {
    if (!isInspecting) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    var t = e.target;
    if (!t || t === document.body || t === tooltip) return;

    var info = getInfo(t);
    copyToClipboard(JSON.stringify(info, null, 2));

    // Visual feedback
    if (highlightOverlay) {
      highlightOverlay.style.borderColor = '#22c55e';
      highlightOverlay.style.backgroundColor = 'rgba(34, 197, 94, 0.2)';
      setTimeout(function() {
        highlightOverlay.style.borderColor = '#3b82f6';
        highlightOverlay.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
      }, 1500);
    }

    // Notify parent component
    try {
      parent.postMessage({ type: 'element-inspector-selected', elementInfo: info }, '*');
    } catch(err) {}
  }

  // Keyboard event
  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      isInspecting = false;
      document.body.style.cursor = '';
      clear();
    }
  }

  // Listen for messages from parent component
  window.addEventListener('message', function(e) {
    if (e.data?.type === 'element-inspector-enable') {
      isInspecting = true;
      document.body.style.cursor = 'crosshair';
      createTooltip();
      createHighlightOverlay();
    } else if (e.data?.type === 'element-inspector-disable') {
      isInspecting = false;
      document.body.style.cursor = '';
      clear();
    }
  });

  // Initialize event listeners
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown, true);
})();
`

interface StandalonePreviewProps {
  content?: string
  filePath?: string
}

export function StandalonePreview({ content, filePath }: StandalonePreviewProps) {
  const [htmlContent, setHtmlContent] = useState<string | null>(content || null)
  const [loading, setLoading] = useState(!content)
  const [inspectorActive, setInspectorActive] = useState(true)
  const [iframeKey, setIframeKey] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Show toast notification
  const showToast = useCallback((message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 2000)
  }, [])

  // Get content from URL params or localStorage
  useEffect(() => {
    if (content) {
      setHtmlContent(content)
      setLoading(false)
      return
    }

    const path = filePath || new URLSearchParams(window.location.search).get('path')

    if (path) {
      try {
        const stored = localStorage.getItem('preview-content-' + path)
        if (stored) {
          setHtmlContent(stored)
          setLoading(false)
          return
        }
      } catch (e) {
        console.warn('[StandalonePreview] localStorage read error:', e)
      }
    }

    setLoading(false)
  }, [content, filePath])

  // Listen for OPFS file changes
  useEffect(() => {
    const channel = new BroadcastChannel('opfs-file-changes')
    const currentPath = filePath || new URLSearchParams(window.location.search).get('path')

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'opfs-file-changed') {
        if (currentPath && event.data.path && event.data.path !== currentPath) {
          return
        }
        setIframeKey(k => k + 1)
      }
    }

    channel.addEventListener('message', handleMessage)
    return () => {
      channel.removeEventListener('message', handleMessage)
      channel.close()
    }
  }, [filePath])

  // Create blob URL with injected inspector script
  const blobUrl = useMemo(() => {
    if (!htmlContent) return null

    const scriptTag = '<script>' + INSPECTOR_SCRIPT + '</script>\n'
    let html = htmlContent

    const bodyEndMatch = html.match(/<\/body>/i)
    if (bodyEndMatch) {
      const insertIndex = html.indexOf(bodyEndMatch[0])
      html = html.slice(0, insertIndex) + scriptTag + html.slice(insertIndex)
    } else {
      const headEndMatch = html.match(/<\/head>/i)
      if (headEndMatch) {
        const insertIndex = html.indexOf(headEndMatch[0]) + headEndMatch[0].length
        html = html.slice(0, insertIndex) + '\n' + scriptTag + html.slice(insertIndex)
      } else {
        html = html + '\n' + scriptTag
      }
    }

    return URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  }, [htmlContent])

  // Send inspector state to iframe
  const sendInspectorCommand = useCallback((command: 'enable' | 'disable') => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: 'element-inspector-' + command },
        '*'
      )
    }
  }, [])

  // Send command when inspector toggle changes
  useEffect(() => {
    sendInspectorCommand(inspectorActive ? 'enable' : 'disable')
  }, [inspectorActive, sendInspectorCommand])

  // Send command when iframe loads
  const handleIframeLoad = useCallback(() => {
    sendInspectorCommand(inspectorActive ? 'enable' : 'disable')
  }, [inspectorActive, sendInspectorCommand])

  // Listen for element selection feedback from iframe
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'element-inspector-selected') {
        if (event.data.elementInfo) {
          showToast('已复制到剪贴板')
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Refresh iframe
  const handleRefresh = useCallback(() => {
    setIframeKey(k => k + 1)
  }, [])

  // Loading state
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-900 text-neutral-400">
        加载中...
      </div>
    )
  }

  // No content
  if (!htmlContent) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-900 text-neutral-400">
        <div className="text-center">
          <p className="mb-2">无法加载预览内容</p>
          <button onClick={handleRefresh} className="text-blue-400 hover:underline">
            点击重试
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-neutral-900">
      {/* 预览区域 */}
      <div className="h-full w-full">
        {blobUrl && (
          <iframe
            ref={iframeRef}
            key={iframeKey}
            src={blobUrl}
            title="Preview"
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-popups"
            onLoad={handleIframeLoad}
          />
        )}
      </div>

      {/* 浮动工具栏 - 右下角 Technical Brutalist Style */}
      <div className="absolute bottom-6 right-6 z-50 flex items-center border border-white/20 bg-neutral-900/95 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
        {/* 刷新按钮 */}
        <button
          type="button"
          onClick={() => { handleRefresh(); showToast('已刷新') }}
          className="group flex h-10 items-center gap-2 px-4 text-neutral-500 transition-all hover:bg-white/10 hover:text-neutral-200 active:bg-white/5"
          title="刷新"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="square"
            strokeLinejoin="miter"
            className="transition-transform duration-500 group-hover:rotate-180"
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          <span className="font-mono text-[10px] uppercase tracking-widest">刷新</span>
        </button>

        {/* 分隔线 - 技术感 */}
        <div className="h-6 w-px bg-gradient-to-b from-transparent via-white/30 to-transparent" />

        {/* 审查开关 */}
        <button
          type="button"
          onClick={() => {
            const newState = !inspectorActive
            setInspectorActive(newState)
            showToast(newState ? '已启用审查 - 点击页面元素复制信息' : '已关闭审查')
          }}
          className={`relative flex h-10 items-center gap-2 px-4 transition-all ${
            inspectorActive
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'text-neutral-500 hover:bg-white/10 hover:text-neutral-300'
          }`}
          title={inspectorActive ? '审查中 - 点击关闭' : '点击启用审查'}
        >
          {/* 活性指示灯 */}
          <span
            className={`absolute left-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 ${
              inspectorActive
                ? 'bg-emerald-400 shadow-[0_0_8px_theme(colors.emerald.400)]'
                : 'bg-neutral-600'
            }`}
          />

          {/* 准星图标 */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="square"
            strokeLinejoin="miter"
            className={inspectorActive ? 'animate-[pulse_2s_ease-in-out_infinite]' : ''}
          >
            {/* 靶心十字丝 */}
            <line x1="12" y1="2" x2="12" y2="8" />
            <line x1="12" y1="16" x2="12" y2="22" />
            <line x1="2" y1="12" x2="8" y2="12" />
            <line x1="16" y1="12" x2="22" y2="12" />
            {/* 中心圆 */}
            <circle cx="12" cy="12" r="4" />
            {/* 角落标记 */}
            <path d="M12 12 L10 10 M12 12 L14 10 M12 12 L10 14 M12 12 L14 14" strokeWidth="1" />
          </svg>

          <span className="font-mono text-[10px] uppercase tracking-widest">
            {inspectorActive ? '审查中' : '审查'}
          </span>

          {/* 扫描线效果 - 仅激活时显示 */}
          {inspectorActive && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute inset-0 animate-[scan_2s_linear_infinite] bg-gradient-to-b from-transparent via-emerald-500/10 to-transparent" />
            </div>
          )}
        </button>
      </div>

      {/* Toast 提示 */}
      {toast && (
        <div className="absolute bottom-20 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="rounded-xl border border-white/10 bg-neutral-800/95 px-4 py-2.5 shadow-2xl backdrop-blur-md">
            <p className="text-sm text-neutral-200">{toast}</p>
          </div>
        </div>
      )}

    </div>
  )
}
