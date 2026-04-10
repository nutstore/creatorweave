# Project Documentation Index

This directory is the documentation source of truth for the repository.

## Start Here

- User docs: `docs/user/`
- Developer docs (Chinese): `docs/developer/`
- Developer guides (English): `docs/development/`
- Architecture: `docs/architecture/`
- Design and workflow: `docs/design/`, `docs/workflow/`
- Technical topics: `docs/plugin-system/`, `docs/relay-server/`, `docs/sqlite/`, `docs/skills/`

## Recommended Reading Paths

- New users:
  - `docs/user/getting-started.md`
  - `docs/user/workspace.md`
  - `docs/user/conversation.md`
- New contributors:
  - `docs/developer/guides/quick-start.md` (中文)
  - `docs/development/quick-start.md` (English)
  - `docs/developer/architecture/index.md`

## Maintenance Rules

- Source of truth is `docs/`.
- `web/public/docs/` is a synced copy used by the web app docs viewer.
- `web/public/docs/` is generated content and should not be edited manually.
- Prefer editing files in `docs/` first, then sync to `web/public/docs/` when needed.
- Keep the same relative path when adding mirrored docs.
- Use descriptive file names and place docs under the closest topic directory.

## Notes

- `docs/developer/` and `docs/development/` are both active:
  - `docs/developer/`: structured Chinese developer docs with section indexes.
  - `docs/development/`: English developer guides kept for compatibility and external readers.
