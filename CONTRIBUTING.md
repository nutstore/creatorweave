# Contributing to CreatorWeave

Thanks for contributing.

## Quick Start

1. Fork and clone the repository.
2. Install dependencies:
   - `pnpm install`
3. Run local checks before opening a PR:
   - `pnpm -C web run typecheck`
   - `pnpm -C web run lint`
   - `pnpm -C web run test -- --run`

## Branch and Commit

1. Create a feature branch from `main`.
2. Keep commits focused and descriptive.
3. Prefer Conventional Commit style when possible, for example:
   - `feat(conversation): add loop delete action`
   - `fix(sqlite): handle schema initialization fallback`

## Pull Request Checklist

1. Explain what changed and why.
2. Link related issue(s), if any.
3. Include screenshots or logs for UI/runtime behavior changes.
4. Confirm tests and typecheck pass locally.
5. Keep PR size manageable.

## Code Style

1. Follow existing project patterns.
2. Avoid unrelated refactors in the same PR.
3. Add tests for behavior changes and regressions.

## Reporting Issues

When opening an issue, include:

1. Environment (OS, browser, Node, pnpm).
2. Reproduction steps.
3. Expected vs actual behavior.
4. Relevant logs or screenshots.

## Security

Please do not disclose security vulnerabilities publicly.
See [SECURITY.md](./SECURITY.md) for reporting instructions.
