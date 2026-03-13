/**
 * CreatorWeave API Script
 * JavaScript code injected into plugin iframe to provide CreatorWeave.* API
 */

export function generateCreatorWeaveAPIScript(version: string = '2.0.0'): string {
  return `
  (function() {
    'use strict';

    const API_VERSION = '${version}';
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
    });

    // =============================================================================
    // CreatorWeave API - Main Object
    // =============================================================================

    window.CreatorWeave = {
      version: API_VERSION,

      // -------------------------------------------------------------------------
      // Notification & Interaction
      // -------------------------------------------------------------------------
      notify: {
        // Show toast notification
        toast: function(message, type) {
          type = type || 'info';
          return send('notify.toast', { message, type });
        },

        // Show confirmation dialog (returns Promise<boolean>)
        confirm: function(message) {
          return send('notify.confirm', { message }, true)
            .then(result => !!result.confirmed);
        }
      },

      // -------------------------------------------------------------------------
      // Data Access
      // -------------------------------------------------------------------------
      data: {
        // Get complete analysis result
        getResult: function() {
          return send('data.getResult', {}, true);
        },

        // Get file list
        getFiles: function() {
          return send('data.getFiles', {}, true);
        },

        // Store data (persistent, namespaced to plugin)
        set: function(key, value) {
          return send('data.set', { key, value });
        },

        // Get stored data
        get: function(key) {
          return send('data.get', { key }, true);
        },

        // Remove stored data
        remove: function(key) {
          return send('data.remove', { key });
        },

        // Clear all plugin data
        clear: function() {
          return send('data.clear', {});
        }
      },

      // -------------------------------------------------------------------------
      // Export
      // -------------------------------------------------------------------------
      export: {
        // Export as JSON file
        json: function(data, filename) {
          filename = filename || 'export.json';
          return send('export.json', { data, filename });
        },

        // Export as CSV file
        csv: function(data, filename) {
          filename = filename || 'export.csv';
          return send('export.csv', { data, filename });
        },

        // Copy text to clipboard
        copy: function(text) {
          return send('export.copy', { text }, true);
        }
      },

      // -------------------------------------------------------------------------
      // UI Control
      // -------------------------------------------------------------------------
      ui: {
        // Resize iframe height
        resize: function(height) {
          return send('ui.resize', { height });
        },

        // Toggle fullscreen mode
        fullscreen: function() {
          return send('ui.fullscreen', {});
        }
      }
    };

    // =============================================================================
    // Notify parent that API is ready
    // =============================================================================

    window.parent.postMessage({
      type: 'creatorweave-api-ready',
      version: API_VERSION
    }, '*');

    console.log('[CreatorWeave] Plugin API v' + API_VERSION + ' loaded');
  })();
`
}
