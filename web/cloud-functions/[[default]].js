/**
 * Cloud Function SPA fallback for EdgeOne direct-upload deployments.
 *
 * Why:
 * - If middleware is unavailable in the current deployment mode, refreshing
 *   client-side routes can hit EdgeOne platform 404.
 *
 * Strategy:
 * - Only handle browser HTML navigations.
 * - Return the "/" document so the SPA router can resolve the route.
 */
export default async function handler(request) {
  if (request.method !== 'GET') {
    return new Response('Not Found', { status: 404 })
  }

  const accept = request.headers.get('accept') || ''
  if (!accept.includes('text/html')) {
    return new Response('Not Found', { status: 404 })
  }

  const url = new URL(request.url)
  const pathname = url.pathname

  if (
    pathname === '/' ||
    pathname.includes('.') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/cloud-functions/') ||
    pathname.startsWith('/edge-functions/')
  ) {
    return new Response('Not Found', { status: 404 })
  }

  const indexUrl = new URL('/', url.origin)
  const indexResponse = await fetch(indexUrl.toString(), {
    headers: { accept: 'text/html' },
  })

  if (!indexResponse.ok) {
    return indexResponse
  }

  const headers = new Headers(indexResponse.headers)
  headers.set('x-spa-fallback', 'cloud-functions')

  return new Response(indexResponse.body, {
    status: 200,
    headers,
  })
}
