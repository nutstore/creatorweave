import CreatorWeaveClientShell from '../../src/app/CreatorWeaveClientShell'

// Emit the public, fixed route prefixes for static hosting. Dynamic project and
// workspace identifiers are local OPFS/SQLite values, so CDN rewrites send
// those deep links to index.html; next dev still resolves them through this
// catch-all route.
export function generateStaticParams() {
  return [
    { path: ['projects'] },
    { path: ['workspace'] },
    { path: ['preview'] },
    { path: ['webcontainer-preview'] },
    { path: ['docs'] },
    { path: ['docs', 'zh'] },
    { path: ['docs', 'en'] },
  ]
}

export default function CreatorWeaveCatchAllPage() {
  return <CreatorWeaveClientShell />
}
