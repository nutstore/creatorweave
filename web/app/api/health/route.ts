import { NextResponse } from 'next/server'

/**
 * Liveness/readiness endpoint for k8s probes (see
 * deploy/k8s/overseas/deployment.yaml) and the Docker HEALTHCHECK.
 *
 * This application is local-first: it holds no server-side state, sessions,
 * or database connections, so a healthy process is a healthy pod. The body
 * is intentionally minimal and dependency-free — it must never fail because
 * of an upstream service outage.
 */
export const dynamic = 'force-static'

export function GET() {
  return NextResponse.json({ status: 'ok' })
}
