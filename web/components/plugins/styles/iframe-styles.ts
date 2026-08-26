/**
 * Plugin Iframe Styles
 * Shared CSS styles injected into plugin iframe
 */

export const IFRAME_STYLES = `
  :root {
    --plugin-primary: #2563eb;
    --plugin-primary-hover: #1d4ed8;
    --plugin-success: #16a34a;
    --plugin-warning: #ca8a04;
    --plugin-danger: #dc2626;
    --plugin-gray-50: #f9fafb;
    --plugin-gray-100: #f3f4f6;
    --plugin-gray-200: #e5e7eb;
    --plugin-gray-400: #9ca3af;
    --plugin-gray-500: #6b7280;
    --plugin-gray-600: #4b5563;
    --plugin-gray-700: #374151;
    --plugin-gray-900: #111827;
  }

  * { box-sizing: border-box; }

  body {
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: var(--plugin-gray-700);
    margin: 0;
    padding: 16px;
    background: transparent;
  }

  h1, h2, h3, h4, h5, h6 {
    margin: 0 0 12px 0;
    font-weight: 600;
    color: var(--plugin-gray-900);
  }

  h1 { font-size: 24px; }
  h2 { font-size: 20px; }
  h3 { font-size: 16px; }

  p { margin: 0 0 12px 0; }

  a {
    color: var(--plugin-primary);
    text-decoration: none;
  }
  a:hover { text-decoration: underline; }

  code, pre {
    font-family: ui-monospace, "SF Mono", Monaco, "Cascadia Code", monospace;
    background: var(--plugin-gray-100);
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
  .plugin-card {
    background: white;
    border: 1px solid var(--plugin-gray-200);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 12px;
  }

  /* Metrics Grid */
  .plugin-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
    margin: 12px 0;
  }

  .plugin-metric {
    background: var(--plugin-gray-50);
    border-radius: 6px;
    padding: 12px;
  }

  .plugin-metric-label {
    font-size: 12px;
    color: var(--plugin-gray-600);
    margin-bottom: 4px;
  }

  .plugin-metric-value {
    font-size: 20px;
    font-weight: 600;
    color: var(--plugin-gray-900);
  }

  /* Table */
  .plugin-table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
  }

  .plugin-table th,
  .plugin-table td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid var(--plugin-gray-200);
  }

  .plugin-table th {
    font-weight: 600;
    color: var(--plugin-gray-700);
    background: var(--plugin-gray-50);
  }

  .plugin-table tr:last-child td {
    border-bottom: none;
  }

  /* Badge */
  .plugin-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 500;
  }

  .plugin-badge-success { background: #dcfce7; color: #166534; }
  .plugin-badge-warning { background: #fef9c3; color: #854d0e; }
  .plugin-badge-error { background: #fee2e2; color: #991b1b; }
  .plugin-badge-info { background: #dbeafe; color: #1e40af; }

  /* Button */
  .plugin-btn {
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

  .plugin-btn-primary {
    background: var(--plugin-primary);
    color: white;
  }
  .plugin-btn-primary:hover { background: var(--plugin-primary-hover); }

  .plugin-btn-secondary {
    background: white;
    border: 1px solid var(--plugin-gray-200);
    color: var(--plugin-gray-700);
  }
  .plugin-btn-secondary:hover { background: var(--plugin-gray-50); }

  .plugin-btn-danger {
    background: var(--plugin-danger);
    color: white;
  }
  .plugin-btn-danger:hover { opacity: 0.9; }

  /* Progress Bar */
  .plugin-progress {
    width: 100%;
    height: 8px;
    background: var(--plugin-gray-200);
    border-radius: 4px;
    overflow: hidden;
  }

  .plugin-progress-bar {
    height: 100%;
    background: var(--plugin-primary);
    transition: width 0.3s ease;
  }

  /* Tabs */
  .plugin-tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--plugin-gray-200);
    margin-bottom: 16px;
  }

  .plugin-tab {
    padding: 8px 16px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--plugin-gray-600);
    cursor: pointer;
  }

  .plugin-tab:hover { color: var(--plugin-gray-900); }

  .plugin-tab.active {
    color: var(--plugin-primary);
    border-bottom-color: var(--plugin-primary);
  }

  /* Accordion */
  .plugin-accordion-item {
    border: 1px solid var(--plugin-gray-200);
    border-radius: 6px;
    margin-bottom: 8px;
    overflow: hidden;
  }

  .plugin-accordion-header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: var(--plugin-gray-50);
    border: none;
    cursor: pointer;
    font-weight: 500;
  }

  .plugin-accordion-content {
    padding: 12px 16px;
    border-top: 1px solid var(--plugin-gray-200);
  }

  /* Input */
  .plugin-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--plugin-gray-200);
    border-radius: 6px;
    font-size: 14px;
  }

  .plugin-input:focus {
    outline: none;
    border-color: var(--plugin-primary);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  /* Select */
  .plugin-select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--plugin-gray-200);
    border-radius: 6px;
    font-size: 14px;
    background: white;
  }
`
