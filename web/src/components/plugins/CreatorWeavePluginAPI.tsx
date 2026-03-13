/**
 * CreatorWeave Plugin API
 *
 * Provides a comprehensive JavaScript API that plugins can call from within
 * their iframe to interact with the host application.
 *
 * Plugins can use:
 * - CreatorWeave.modal() - Show a modal dialog
 * - CreatorWeave.toast() - Show a toast notification
 * - CreatorWeave.confirm() - Show a confirmation dialog
 * - CreatorWeave.fullscreen() - Go fullscreen
 * - CreatorWeave.getAnalysisResult() - Get analysis data
 * - etc.
 */

import { useRef, useEffect, useState } from 'react'
import { useThemeStore } from '@/store/theme.store'

//=============================================================================
// Types
//=============================================================================

export interface PluginHTMLResult {
  render_type: 'html'
  content: string
  height?: number
  title?: string
}

export interface CreatorWeavePluginAPIProps {
  result: PluginHTMLResult
  onAction?: (action: string, data: unknown) => void
  analysisData?: AnalysisData // Passed from parent
}

export interface AnalysisData {
  fileCount: number
  totalSize: number
  averageSize: number
  folderCount: number
  duration: number
  files?: FileEntry[]
  pluginResults?: PluginResultEntry[]
}

export interface FileEntry {
  path: string
  name: string
  size: number
  extension?: string
  mimeType?: string
}

export interface PluginResultEntry {
  pluginId: string
  pluginName: string
  summary: string
  metrics?: unknown
}

type CreatorWeaveApiMessage = {
  id?: string
  action?: string
  data?: unknown
  type?: string
  pluginType?: string
}

type CreatorWeaveResponseSender = (data?: unknown, error?: string) => void

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function toToastType(value: unknown): ToastMessage['type'] {
  return value === 'success' || value === 'warning' || value === 'error' ? value : 'info'
}

//=============================================================================
// Shared Styles (injected into plugin iframe)
// Uses design system tokens where possible for theme consistency
//=============================================================================

const SHARED_STYLES = `
  :root {
    /* Primary (Teal - matching design system) */
    --creatorweave-primary: #14B8A6;
    --creatorweave-primary-hover: #0D9488;
    /* Status colors */
    --creatorweave-success: #16A34A;
    --creatorweave-warning: #D97706;
    --creatorweave-danger: #DC2626;
    /* Neutral palette (mapped to design system) */
    --creatorweave-gray-50: #FAFAFA;
    --creatorweave-gray-100: #F5F5F5;
    --creatorweave-gray-200: #E5E5E5;
    --creatorweave-gray-400: #A3A3A3;
    --creatorweave-gray-500: #737373;
    --creatorweave-gray-600: #525252;
    --creatorweave-gray-700: #404040;
    --creatorweave-gray-900: #171717;
    --creatorweave-surface: #FFFFFF;
  }

  .dark {
    --creatorweave-primary: #2DD4BF;
    --creatorweave-primary-hover: #5EEAD4;
    --creatorweave-success: #22C55E;
    --creatorweave-warning: #FBBF24;
    --creatorweave-danger: #F59E6B;
    --creatorweave-gray-50: #1A1A1A;
    --creatorweave-gray-100: #171717;
    --creatorweave-gray-200: #262626;
    --creatorweave-gray-400: #525252;
    --creatorweave-gray-500: #737373;
    --creatorweave-gray-600: #A3A3A3;
    --creatorweave-gray-700: #E5E5E5;
    --creatorweave-gray-900: #F5F5F5;
    --creatorweave-surface: #0A0A0A;
  }

  * { box-sizing: border-box; }

  body {
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: var(--creatorweave-gray-700);
    margin: 0;
    padding: 16px;
    background: transparent;
  }

  h1, h2, h3, h4, h5, h6 {
    margin: 0 0 12px 0;
    font-weight: 600;
    color: var(--creatorweave-gray-900);
  }

  h1 { font-size: 24px; }
  h2 { font-size: 20px; }
  h3 { font-size: 16px; }

  p { margin: 0 0 12px 0; }

  a {
    color: var(--creatorweave-primary);
    text-decoration: none;
  }
  a:hover { text-decoration: underline; }

  code, pre {
    font-family: ui-monospace, "SF Mono", Monaco, "Cascadia Code", monospace;
    background: var(--creatorweave-gray-100);
    border-radius: 4px;
  }

  code {
    padding: 2px 6px;
    font-size: 13px;
  }

  pre {
    padding: 12px;
    overflow-x: auto;
  }

  pre code {
    padding: 0;
    background: transparent;
  }

  /* Card Component */
  .creatorweave-card {
    background: var(--creatorweave-surface);
    border: 1px solid var(--creatorweave-gray-200);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 12px;
  }

  /* Metrics Grid */
  .creatorweave-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
    margin: 12px 0;
  }

  .creatorweave-metric {
    background: var(--creatorweave-gray-50);
    border-radius: 6px;
    padding: 12px;
  }

  .creatorweave-metric-label {
    font-size: 12px;
    color: var(--creatorweave-gray-600);
    margin-bottom: 4px;
  }

  .creatorweave-metric-value {
    font-size: 20px;
    font-weight: 600;
    color: var(--creatorweave-gray-900);
  }

  /* Table */
  .creatorweave-table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
  }

  .creatorweave-table th,
  .creatorweave-table td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid var(--creatorweave-gray-200);
  }

  .creatorweave-table th {
    font-weight: 600;
    color: var(--creatorweave-gray-700);
    background: var(--creatorweave-gray-50);
  }

  .creatorweave-table tr:last-child td {
    border-bottom: none;
  }

  /* Badge */
  .creatorweave-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 500;
  }

  .creatorweave-badge-success { background: var(--success-bg); color: var(--success-text); }
  .creatorweave-badge-warning { background: var(--warning-bg); color: var(--warning-text, var(--creatorweave-gray-700)); }
  .creatorweave-badge-error { background: var(--danger-bg); color: var(--danger-text, var(--creatorweave-gray-700)); }
  .creatorweave-badge-info { background: var(--creatorweave-gray-100); color: var(--creatorweave-primary); }

  /* Button */
  .creatorweave-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .creatorweave-btn-primary {
    background: var(--creatorweave-primary);
    color: white;
  }
  .creatorweave-btn-primary:hover { background: var(--creatorweave-primary-hover); }

  .creatorweave-btn-secondary {
    background: var(--creatorweave-surface);
    border: 1px solid var(--creatorweave-gray-200);
    color: var(--creatorweave-gray-700);
  }
  .creatorweave-btn-secondary:hover { background: var(--creatorweave-gray-50); }

  .creatorweave-btn-danger {
    background: var(--creatorweave-danger);
    color: white;
  }
  .creatorweave-btn-danger:hover { opacity: 0.9; }

  /* Progress Bar */
  .creatorweave-progress {
    width: 100%;
    height: 8px;
    background: var(--creatorweave-gray-200);
    border-radius: 4px;
    overflow: hidden;
  }

  .creatorweave-progress-bar {
    height: 100%;
    background: var(--creatorweave-primary);
    transition: width 0.3s ease;
  }

  /* Tabs */
  .creatorweave-tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--creatorweave-gray-200);
    margin-bottom: 16px;
  }

  .creatorweave-tab {
    padding: 8px 16px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--creatorweave-gray-600);
    cursor: pointer;
  }

  .creatorweave-tab:hover { color: var(--creatorweave-gray-900); }

  .creatorweave-tab.active {
    color: var(--creatorweave-primary);
    border-bottom-color: var(--creatorweave-primary);
  }

  /* Accordion */
  .creatorweave-accordion-item {
    border: 1px solid var(--creatorweave-gray-200);
    border-radius: 6px;
    margin-bottom: 8px;
    overflow: hidden;
  }

  .creatorweave-accordion-header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: var(--creatorweave-gray-50);
    border: none;
    cursor: pointer;
    font-weight: 500;
  }

  .creatorweave-accordion-content {
    padding: 12px 16px;
    border-top: 1px solid var(--creatorweave-gray-200);
  }

  /* Input */
  .creatorweave-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--creatorweave-gray-200);
    border-radius: 6px;
    font-size: 14px;
  }

  .creatorweave-input:focus {
    outline: none;
    border-color: var(--creatorweave-primary);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  /* Select */
  .creatorweave-select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--creatorweave-gray-200);
    border-radius: 6px;
    font-size: 14px;
    background: white;
  }
`

//=============================================================================
// CreatorWeave API Script (injected into iframe)
//=============================================================================

const BFSA_API_SCRIPT = (apiVersion: string, deviceId: string, theme: 'light' | 'dark'): string => `
  (function() {
    'use strict';

    const API_VERSION = '${apiVersion}';
    const DEVICE_ID = '${deviceId}';
    let _messageId = 0;
    let _pendingCallbacks = new Map();

    // Generate unique message ID
    function getMessageId() {
      return 'bfsa_' + Date.now() + '_' + (++_messageId);
    }

    // Send message to parent and optionally wait for response
    function send(action, data, waitForResponse = false) {
      return new Promise((resolve, reject) => {
        const messageId = getMessageId();

        if (waitForResponse) {
          _pendingCallbacks.set(messageId, { resolve, reject });
          // Timeout after 30 seconds
          setTimeout(() => {
            if (_pendingCallbacks.has(messageId)) {
              _pendingCallbacks.delete(messageId);
              reject(new Error('CreatorWeave API request timed out'));
            }
          }, 30000);
        }

        window.parent.postMessage({
          type: 'creatorweave-api-call',
          id: messageId,
          action: action,
          data: data
        }, '*');

        if (!waitForResponse) {
          resolve(undefined);
        }
      });
    }

    // Listen for responses from parent
    window.addEventListener('message', function(event) {
      const msg = event.data;
      if (msg && msg.type === 'creatorweave-api-response' && msg.id) {
        const callback = _pendingCallbacks.get(msg.id);
        if (callback) {
          _pendingCallbacks.delete(msg.id);
          if (msg.error) {
            callback.reject(new Error(msg.error));
          } else {
            callback.resolve(msg.data);
          }
        }
      }

      // Handle events from parent
      if (msg && msg.type === 'creatorweave-api-event') {
        const eventName = msg.event;
        if (window._bfsaEventListeners && window._bfsaEventListeners[eventName]) {
          window._bfsaEventListeners[eventName].forEach(fn => {
            try { fn(msg.data); } catch (e) { console.error(e); }
          });
        }
      }
    });

    //===========================================================================
    // CreatorWeave API - Main Object
    //===========================================================================

    window.CreatorWeave = {
      version: API_VERSION,

      //=========================================================================
      // UI Operations
      //=========================================================================

      ui: {
        // Go fullscreen
        fullscreen: function() {
          return send('ui.fullscreen', {});
        },

        // Exit fullscreen
        exitFullscreen: function() {
          return send('ui.exitFullscreen', {});
        },

        // Show modal dialog
        modal: function(content, options) {
          return send('ui.modal', { content, options }, true);
        },

        // Close current modal
        closeModal: function() {
          return send('ui.closeModal', {});
        },

        // Show toast notification
        toast: function(message, type) {
          type = type || 'info';
          return send('ui.toast', { message, type });
        },

        // Show confirmation dialog (returns Promise<boolean>)
        confirm: function(message, options) {
          return send('ui.confirm', { message, options }, true).then(result => !!result.confirmed);
        },

        // Show prompt dialog
        prompt: function(message, defaultValue, options) {
          return send('ui.prompt', { message, defaultValue, options }, true).then(result => result.value);
        },

        // Show sidebar
        showSidebar: function(content, position) {
          position = position || 'right';
          return send('ui.showSidebar', { content, position });
        },

        // Close sidebar
        closeSidebar: function() {
          return send('ui.closeSidebar', {});
        },

        // Resize iframe
        resize: function(height) {
          return send('ui.resize', { height });
        }
      },

      //=========================================================================
      // Data Access
      //=========================================================================

      data: {
        // Get analysis result
        getAnalysisResult: function() {
          return send('data.getAnalysisResult', {}, true);
        },

        // Get file list
        getFileList: function() {
          return send('data.getFileList', {}, true);
        },

        // Get file content
        getFileContent: function(path) {
          return send('data.getFileContent', { path }, true);
        },

        // Get plugin result
        getPluginResult: function(pluginId) {
          return send('data.getPluginResult', { pluginId }, true);
        },

        // Store data (persistent)
        setItem: function(key, value) {
          return send('data.setItem', { key, value });
        },

        // Get stored data
        getItem: function(key) {
          return send('data.getItem', { key }, true);
        },

        // Remove stored data
        removeItem: function(key) {
          return send('data.removeItem', { key });
        },

        // Clear all stored data
        clear: function() {
          return send('data.clear', {});
        }
      },

      //=========================================================================
      // Export Operations
      //=========================================================================

      export: {
        // Export as JSON file
        json: function(data, filename) {
          filename = filename || 'export.json';
          return send('export.json', { data, filename });
        },

        // Export as CSV
        csv: function(data, filename) {
          filename = filename || 'export.csv';
          return send('export.csv', { data, filename });
        },

        // Copy to clipboard
        copy: function(text) {
          return send('export.copy', { text }, true);
        },

        // Download file
        download: function(filename, content, mimeType) {
          mimeType = mimeType || 'text/plain';
          return send('export.download', { filename, content, mimeType });
        },

        // Print content
        print: function(content) {
          return send('export.print', { content });
        }
      },

      //=========================================================================
      // Plugin Communication
      //=========================================================================

      plugin: {
        // Get current plugin info
        getInfo: function() {
          return send('plugin.getInfo', {}, true);
        },

        // Get all loaded plugins
        getLoadedPlugins: function() {
          return send('plugin.getLoadedPlugins', {}, true);
        },

        // Request data from another plugin
        request: function(pluginId, action, data) {
          return send('plugin.request', { pluginId, action, data }, true);
        }
      },

      //=========================================================================
      // Theme & Style
      //=========================================================================

      theme: {
        // Get current theme
        get: function() {
          return Promise.resolve('${theme}');
        },

        // Get color palette (matches design system)
        getColors: function() {
          return Promise.resolve({
            primary: '#14B8A6',
            success: '#16A34A',
            warning: '#D97706',
            danger: '#DC2626',
            gray50: '#FAFAFA',
            gray100: '#F5F5F5',
            gray200: '#E5E5E5',
            gray500: '#737373',
            gray700: '#404040',
            gray900: '#171717'
          });
        },

        // Get device info
        getDeviceInfo: function() {
          return Promise.resolve({
            isMobile: window.innerWidth < 768,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            userAgent: navigator.userAgent,
            language: navigator.language
          });
        }
      },

      //=========================================================================
      // Events
      //=========================================================================

      on: function(event, callback) {
        if (!window._bfsaEventListeners) {
          window._bfsaEventListeners = {};
        }
        if (!window._bfsaEventListeners[event]) {
          window._bfsaEventListeners[event] = [];
        }
        window._bfsaEventListeners[event].push(callback);
      },

      off: function(event, callback) {
        if (window._bfsaEventListeners && window._bfsaEventListeners[event]) {
          if (callback) {
            window._bfsaEventListeners[event] = window._bfsaEventListeners[event].filter(fn => fn !== callback);
          } else {
            delete window._bfsaEventListeners[event];
          }
        }
      },

      emit: function(event, data) {
        send('event.emit', { event, data });
      },

      //=========================================================================
      // Utility Functions
      //=========================================================================

      utils: {
        // Format bytes
        formatBytes: function(bytes) {
          if (bytes === 0) return '0 B';
          const k = 1024;
          const sizes = ['B', 'KB', 'MB', 'GB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        },

        // Format number
        formatNumber: function(num) {
          return new Intl.NumberFormat().format(num);
        },

        // Format duration
        formatDuration: function(ms) {
          const seconds = Math.floor(ms / 1000);
          if (seconds < 60) return seconds + 's';
          const minutes = Math.floor(seconds / 60);
          if (minutes < 60) return minutes + 'm ' + (seconds % 60) + 's';
          const hours = Math.floor(minutes / 60);
          return hours + 'h ' + (minutes % 60) + 'm';
        },

        // Debounce function
        debounce: function(fn, delay) {
          let timeout;
          return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), delay);
          };
        },

        // Get file extension
        getExtension: function(filename) {
          const idx = filename.lastIndexOf('.');
          return idx > 0 ? filename.slice(idx + 1).toLowerCase() : '';
        }
      },
      // Generic action bridge
      send: function(action, data) {
        send('action', { action, data });
      }
    };

    // Notify parent that API is ready
    window.parent.postMessage({
      type: 'creatorweave-api-ready',
      version: API_VERSION
    }, '*');
    console.log('[CreatorWeave] Plugin API v' + API_VERSION + ' loaded');
  })();
`

//=============================================================================
// Main Component
//=============================================================================

export function CreatorWeavePluginAPIRenderer({ result, onAction, analysisData }: CreatorWeavePluginAPIProps) {
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(result.height || 400)
  const [isReady, setIsReady] = useState(false)
  const [modalContent, setModalContent] = useState<ModalContent | null>(null)
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null)

  // Handle messages from iframe
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verify source
      if (iframeRef.current && event.source === iframeRef.current.contentWindow) {
        const msg = event.data

        switch (msg.type) {
          case 'creatorweave-api-ready':
            setIsReady(true)
            console.log('[CreatorWeave] Plugin API ready')
            break

          case 'creatorweave-api-call':
            handleAPICall(msg)
            break

          case 'creatorweave-plugin-message':
            // Legacy message format
            onAction?.(msg.pluginType, msg.pluginData)
            break
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onAction, analysisData])
  /* eslint-enable react-hooks/exhaustive-deps */

  // Handle API calls from iframe
  function handleAPICall(msg: CreatorWeaveApiMessage) {
    const { id, action, data } = msg
    const iframe = iframeRef.current

    const sendResponse: CreatorWeaveResponseSender = (responseData?: unknown, error?: string) => {
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          {
            type: 'creatorweave-api-response',
            id,
            data: responseData,
            error,
          },
          '*'
        )
      }
    }

    // Dispatch action
    if (typeof action !== 'string') {
      sendResponse(undefined, 'Invalid action')
      return
    }
    const [category, method] = action.split('.')

    switch (category) {
      // UI Operations
      case 'ui':
        handleUIOperation(method, data, sendResponse)
        break

      // Data Access
      case 'data':
        handleDataOperation(method, data, sendResponse)
        break

      // Export Operations
      case 'export':
        handleExportOperation(method, data, sendResponse)
        break

      // Plugin Communication
      case 'plugin':
        handlePluginOperation(method, data, sendResponse)
        break

      // Events
      case 'event':
        {
          const payload = asRecord(data)
          const eventName = payload.event
          // Forward to parent
          if (typeof eventName === 'string') {
            onAction?.(eventName, payload.data)
          }
        }
        sendResponse()
        break

      default:
        // Forward unknown actions to parent
        onAction?.(action, data)
        sendResponse()
    }
  }

  // UI Operations
  const handleUIOperation = (
    method: string,
    data: unknown,
    sendResponse: CreatorWeaveResponseSender
  ) => {
    const payload = asRecord(data)
    switch (method) {
      case 'fullscreen':
        // Toggle fullscreen on iframe
        if (iframeRef.current) {
          if (document.fullscreenElement) {
            document.exitFullscreen()
          } else {
            iframeRef.current.requestFullscreen()
          }
        }
        sendResponse()
        break

      case 'exitFullscreen':
        document.exitFullscreen()
        sendResponse()
        break

      case 'modal':
        setModalContent({
          content: typeof payload.content === 'string' ? payload.content : '',
          options: asRecord(payload.options),
        })
        sendResponse()
        break

      case 'closeModal':
        setModalContent(null)
        sendResponse()
        break

      case 'toast':
        setToastMessage({
          message: typeof payload.message === 'string' ? payload.message : '',
          type: toToastType(payload.type),
        })
        setTimeout(() => setToastMessage(null), 3000)
        sendResponse()
        break

      case 'confirm': {
        // Simple confirm (in real app, use a nice dialog)
        const confirmed = window.confirm(typeof payload.message === 'string' ? payload.message : '')
        sendResponse({ confirmed })
        break
      }

      case 'prompt': {
        const value = window.prompt(
          typeof payload.message === 'string' ? payload.message : '',
          typeof payload.defaultValue === 'string' ? payload.defaultValue : undefined
        )
        sendResponse({ value })
        break
      }

      case 'resize':
        if (typeof payload.height === 'number') {
          setHeight(payload.height)
        }
        sendResponse()
        break

      default:
        sendResponse(undefined, `Unknown UI method: ${method}`)
    }
  }

  // Data Operations
  const handleDataOperation = (
    method: string,
    data: unknown,
    sendResponse: CreatorWeaveResponseSender
  ) => {
    const payload = asRecord(data)
    switch (method) {
      case 'getAnalysisResult':
        sendResponse(analysisData || {})
        break

      case 'getFileList':
        sendResponse(analysisData?.files || [])
        break

      case 'getFileContent':
        // In real app, load file content
        sendResponse({
          path: typeof payload.path === 'string' ? payload.path : '',
          content: null,
        })
        break

      case 'getPluginResult': {
        const pluginResult = analysisData?.pluginResults?.find(
          (p) => p.pluginId === payload.pluginId
        )
        sendResponse(pluginResult || null)
        break
      }

      case 'setItem':
        if (typeof payload.key === 'string') {
          localStorage.setItem(`bfsa_plugin_${payload.key}`, JSON.stringify(payload.value))
        }
        sendResponse()
        break

      case 'getItem':
        try {
          const value =
            typeof payload.key === 'string'
              ? localStorage.getItem(`bfsa_plugin_${payload.key}`)
              : null
          sendResponse(value ? JSON.parse(value) : null)
        } catch {
          sendResponse(null)
        }
        break

      case 'removeItem':
        if (typeof payload.key === 'string') {
          localStorage.removeItem(`bfsa_plugin_${payload.key}`)
        }
        sendResponse()
        break

      case 'clear':
        Object.keys(localStorage)
          .filter((k) => k.startsWith('bfsa_plugin_'))
          .forEach((k) => localStorage.removeItem(k))
        sendResponse()
        break

      default:
        sendResponse(undefined, `Unknown data method: ${method}`)
    }
  }

  // Export Operations
  const handleExportOperation = (
    method: string,
    data: unknown,
    sendResponse: CreatorWeaveResponseSender
  ) => {
    const payload = asRecord(data)
    switch (method) {
      case 'json':
        downloadFile(
          typeof payload.filename === 'string' ? payload.filename : 'export.json',
          JSON.stringify(payload.data, null, 2),
          'application/json'
        )
        sendResponse()
        break

      case 'csv': {
        // Simple CSV conversion
        const csv = jsonToCSV(Array.isArray(payload.data) ? payload.data : [])
        downloadFile(typeof payload.filename === 'string' ? payload.filename : 'export.csv', csv, 'text/csv')
        sendResponse()
        break
      }

      case 'copy':
        navigator.clipboard
          .writeText(String(payload.text ?? ''))
          .then(() => sendResponse({ success: true }))
          .catch(() => sendResponse(undefined, 'Failed to copy'))
        break

      case 'download':
        downloadFile(
          typeof payload.filename === 'string' ? payload.filename : 'export.txt',
          typeof payload.content === 'string' ? payload.content : String(payload.content ?? ''),
          typeof payload.mimeType === 'string' ? payload.mimeType : 'text/plain'
        )
        sendResponse()
        break

      case 'print': {
        const printWindow = window.open('', '_blank')
        if (printWindow) {
          printWindow.document.write(
            '<html><body>' + String(payload.content ?? '') + '</body></html>'
          )
          printWindow.document.close()
          printWindow.print()
        }
        sendResponse()
        break
      }

      default:
        sendResponse(undefined, `Unknown export method: ${method}`)
    }
  }

  // Plugin Operations
  const handlePluginOperation = (
    method: string,
    data: unknown,
    sendResponse: CreatorWeaveResponseSender
  ) => {
    const payload = asRecord(data)
    switch (method) {
      case 'getInfo':
        sendResponse({
          id: 'html-demo',
          name: 'HTML Demo Plugin',
          version: '0.1.0',
        })
        break

      case 'getLoadedPlugins':
        sendResponse(analysisData?.pluginResults || [])
        break

      case 'request':
        // Forward to parent for plugin-to-plugin communication
        onAction?.(`plugin.request:${String(payload.pluginId ?? '')}`, {
          action: payload.action,
          data: payload.data,
        })
        sendResponse()
        break

      default:
        sendResponse(undefined, `Unknown plugin method: ${method}`)
    }
  }

  // Helper: Download file
  const downloadFile = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // Helper: Convert JSON to CSV
  const jsonToCSV = (data: Array<Record<string, unknown>>): string => {
    if (!Array.isArray(data) || data.length === 0) return ''
    const headers = Object.keys(data[0])
    const rows = data.map((obj) => headers.map((h) => JSON.stringify(obj[h] ?? '')).join(','))
    return [headers.join(','), ...rows].join('\n')
  }

  // Build the complete iframe HTML
  const buildIframeHTML = (): string => {
    const userHTML = result.content
    const bodyMatch = userHTML.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    const headMatch = userHTML.match(/<head[^>]*>([\s\S]*?)<\/head>/i)

    const bodyContent = bodyMatch ? bodyMatch[1] : userHTML
    const userStyles = headMatch ? headMatch[1] : ''

    return `
      <!DOCTYPE html>
      <html class="${resolvedTheme}">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>${SHARED_STYLES}</style>
          <style>${userStyles}</style>
          <script>${BFSA_API_SCRIPT('1.0.0', 'plugin-' + Date.now(), resolvedTheme)}</script>
        </head>
        <body>${bodyContent}</body>
      </html>
    `
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900">
      {/* Header bar */}
      {result.title && (
        <div className="flex items-center justify-between rounded-t-lg border-b border-neutral-200 bg-white px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{result.title}</span>
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${isReady ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{isReady ? 'Plugin Ready' : 'Loading...'}</span>
          </div>
        </div>
      )}

      {/* Iframe */}
      <iframe
        ref={iframeRef}
        srcDoc={buildIframeHTML()}
        sandbox="allow-scripts allow-same-origin allow-modals"
        className="w-full bg-white dark:bg-neutral-950"
        style={{ height: `${height}px`, minHeight: '200px' }}
        title="Plugin Output"
      />

      {/* Footer with controls */}
      <div className="flex items-center justify-between rounded-b-lg border-t border-neutral-200 bg-white px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800">
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400 dark:text-neutral-500">CreatorWeave API v1.0</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const iframe = iframeRef.current
              iframe?.contentWindow?.location.reload()
            }}
            className="text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Modal Overlay */}
      {modalContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-lg rounded-lg bg-white shadow-xl dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="text-lg font-semibold dark:text-neutral-100">
                {modalContent.options.title || 'Plugin Modal'}
              </h3>
              <button
                onClick={() => setModalContent(null)}
                className="text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
              >
                ✕
              </button>
            </div>
            <div className="p-4 dark:text-neutral-200" dangerouslySetInnerHTML={{ __html: modalContent.content }} />
            <div className="flex justify-end gap-2 border-t p-4">
              <button
                onClick={() => setModalContent(null)}
                className="rounded px-4 py-2 text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMessage && (
        <div
          className={`fixed bottom-4 right-4 rounded-lg px-4 py-2 text-white shadow-lg ${
            toastMessage.type === 'success'
              ? 'bg-green-600'
              : toastMessage.type === 'error'
                ? 'bg-red-600'
                : toastMessage.type === 'warning'
                  ? 'bg-yellow-600'
                  : 'bg-blue-600'
          }`}
        >
          {toastMessage.message}
        </div>
      )}
    </div>
  )
}

//=============================================================================
// Internal Types
//=============================================================================

interface ModalContent {
  content: string
  options: {
    title?: string
    width?: number
    height?: number
    closable?: boolean
  }
}

interface ToastMessage {
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
}
