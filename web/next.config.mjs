import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || process.env.npm_package_version || 'dev'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // EO2Weave remains a client-first, CDN-deployed application. Runtime project
  // IDs only exist in the browser's OPFS/SQLite state, so the static host
  // rewrites application paths to the exported app shell.
  output: 'export',
  distDir: 'dist',
  outputFileTracingRoot: path.resolve(dirname, '..'),
  // Prevent the historical src/pages documentation components from being
  // interpreted as Pages Router routes during the App Router migration.
  pageExtensions: ['page.tsx', 'page.ts'],
  reactStrictMode: true,
  transpilePackages: [
    '@creatorweave/config',
    '@creatorweave/encryption',
    '@creatorweave/i18n',
    '@creatorweave/skills-system',
    '@creatorweave/ui',
  ],
  env: {
    NEXT_PUBLIC_APP_BUILD_ID: buildId,
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version || '0.0.0',
    NEXT_PUBLIC_EXTENSION_LATEST_VERSION: process.env.EXTENSION_LATEST_VERSION || '0.0.0',
  },
  webpack(config) {
    config.module.rules.push({
      resourceQuery: /raw/,
      type: 'asset/source',
    })
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@': path.join(dirname, 'src'),
      '@wasm': path.join(dirname, 'public/wasm'),
      'node:zlib': path.join(dirname, 'src/shims/node-zlib.ts'),
      zlib: path.join(dirname, 'src/shims/node-zlib.ts'),
      '@mongodb-js/zstd': false,
    }
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      fs: false,
      path: false,
      process: false,
    }
    return config
  },
}

export default nextConfig
