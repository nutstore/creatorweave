import { defineConfig } from 'wxt';

export default defineConfig({
  outDir: 'dist',
  manifest: {
    name: 'CreatorWeave',
    description: 'Provides web_search and web_fetch capabilities for in-browser Agents',
    version: '1.0.1',
    permissions: ['scripting', 'tabs'],
    host_permissions: ['<all_urls>'],
    icons: {
      '16': 'icon.svg',
      '32': 'icon.svg',
      '48': 'icon.svg',
      '128': 'icon.svg',
    },
    action: {
      default_icon: {
        '16': 'icon.svg',
        '32': 'icon.svg',
        '48': 'icon.svg',
        '128': 'icon.svg',
      },
    },
  },
});
