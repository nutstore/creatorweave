# Project Documentation Index

This directory is the documentation source of truth for the repository, organized by language:

- `docs/zh/` — Chinese docs (user + developer)
- `docs/en/` — English docs (user + developer)

Each language has two categories served by the docs center:

- `user/` — product usage guides
- `developer/` — developer guides (guides / architecture / reference)

Internal-only docs (design specs, relay-server internals, plugin system, requirements, product ideas) live in the separate `weave-docs` repository next to this repo.

Note: completed feature PRDs / plans / migration designs are removed from the repo once shipped; consult git history (`git log -- docs/`) if needed.

## Recommended Reading Paths

- New users:
  - `docs/zh/user/getting-started.md` / `docs/en/user/getting-started.md`
- New contributors:
  - `docs/zh/developer/guides/quick-start.md` (中文)
  - `docs/en/developer/quick-start.md` (English)
  - `docs/zh/developer/architecture/index.md`

## Maintenance Rules

- Source of truth is `docs/`.
- `web/public/docs/` is a synced copy used by the web app docs viewer.
- `web/public/docs/` is generated content and should not be edited manually.
- Prefer editing files in `docs/` first, then sync to `web/public/docs/` when needed.
- Every docs-center page needs YAML frontmatter (`title`, `order`) for sidebar ordering.
