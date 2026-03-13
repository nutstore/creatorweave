/**
 * CreatorWeave Plugin Iframe Styles
 * Shared CSS styles injected into plugin iframe
 */

export const IFRAME_STYLES = `
  :root {
    --creatorweave-primary: #2563eb;
    --creatorweave-primary-hover: #1d4ed8;
    --creatorweave-success: #16a34a;
    --creatorweave-warning: #ca8a04;
    --creatorweave-danger: #dc2626;
    --creatorweave-gray-50: #f9fafb;
    --creatorweave-gray-100: #f3f4f6;
    --creatorweave-gray-200: #e5e7eb;
    --creatorweave-gray-400: #9ca3af;
    --creatorweave-gray-500: #6b7280;
    --creatorweave-gray-600: #4b5563;
    --creatorweave-gray-700: #374151;
    --creatorweave-gray-900: #111827;
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
    background: white;
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

  .creatorweave-badge-success { background: #dcfce7; color: #166534; }
  .creatorweave-badge-warning { background: #fef9c3; color: #854d0e; }
  .creatorweave-badge-error { background: #fee2e2; color: #991b1b; }
  .creatorweave-badge-info { background: #dbeafe; color: #1e40af; }

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
    background: white;
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
