# ============================================================================
# EO2Weave (web) — runtime image for the overseas AKS deployment
# (weave.eo2suite.com, namespace creatorweave — see deploy/k8s/overseas/)
#
# The app is BUILT ON THE JENKINS AGENT (nvm Node 22 + pnpm, the same proven
# flow as the domestic EdgeOne pipeline — see deploy/Jenkinsfile.overseas).
# This image only packages the prebuilt output:
#
#   web/.next/standalone   pruned Next.js server (bundles its own minimal
#                          node_modules; workspace packages are consumed as
#                          source via outputFileTracingRoot)
#   web/.next/static       client chunks
#   web/public/            pyodide, extension, docs, skills, PWA assets
#
# Region (NEXT_PUBLIC_DEPLOY_REGION=global) and the LLM gateway NEXT_PUBLIC_*
# values are inlined into the bundle at BUILD time (web/.env generated on the
# agent from Jenkins credentials). They are NOT needed at runtime, and the
# generated web/.env is deliberately NOT copied into the image (.dockerignore).
#
# HOSTNAME=0.0.0.0 is required: standalone Next otherwise binds the pod
# hostname interface and k8s probes fail with connection refused.
# Runtime Node major (22) matches the build-time NODE_VERSION on the agent.
# ============================================================================

FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# curl: container HEALTHCHECK / k8s httpGet probes.
# tini: PID 1 — reaps zombies, forwards SIGTERM for graceful shutdown.
RUN apk add --no-cache curl tini \
 && addgroup -g 1001 -S nodejs \
 && adduser -S nextjs -u 1001

# The standalone folder mirrors the monorepo layout
# (outputFileTracingRoot = repo root), so the server entry is web/server.js.
COPY --chown=nextjs:nodejs web/.next/standalone ./
COPY --chown=nextjs:nodejs web/.next/static ./web/.next/static
COPY --chown=nextjs:nodejs web/public ./web/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "web/server.js"]
