# Contributing to CreatorWeave

Thanks for your interest in contributing! 🎉

## Why Contribute?

CreatorWeave is exploring what's possible when you combine **AI**, **browser-native computing**, and **local-first privacy** in a single product. We believe the browser can be a powerful platform for creative work — and we'd love your help building it.

**What you'll get from contributing:**
- Work with cutting-edge browser APIs (File System Access, OPFS, SharedArrayBuffer)
- Build with Rust/WASM, React 18, SQLite WASM, Pyodide
- Shape the direction of an open-source AI-native platform
- Join a growing community of developers who care about privacy-first tools

## Quick Start

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/creatorweave.git
cd creatorweave

# 2. Install dependencies
pnpm install

# 3. Start dev server
pnpm -C web run dev

# 4. Open http://localhost:5173
```

For detailed setup, see the [Quick Start Guide](./docs/development/quick-start.md).

## Where to Start

### 🟢 Good First Issues

Look for issues labeled [`good first issue`](https://github.com/nutstore/creatorweave/labels/good%20first%20issue) or [`help wanted`](https://github.com/nutstore/creatorweave/labels/help%20wanted). These are specifically chosen to be approachable for new contributors.

### 🔧 Areas Where We Need Help

| Area | Tech Stack | What You'd Do |
|------|-----------|---------------|
| **Agent System** | TypeScript | Build new tools, improve multi-agent orchestration |
| **WASM Modules** | Rust | Add new high-performance operations, optimize existing ones |
| **Plugin System** | TypeScript + Rust | Improve plugin SDK, build example plugins |
| **UI/UX** | React + Tailwind | Improve components, accessibility, mobile experience |
| **Testing** | Vitest + Playwright | Increase test coverage, add E2E tests |
| **Documentation** | Markdown | Write guides, translate docs, improve API docs |
| **i18n** | TypeScript | Add or improve language translations |
| **Data Analysis** | Python + TypeScript | Improve Pyodide integration, add visualization features |
| **Mobile Web** | React | Build mobile remote control features |
| **DevOps** | GitHub Actions | Improve CI/CD, add automated releases |

### 💬 Not Sure Where to Start?

Open a [GitHub Discussion](https://github.com/nutstore/creatorweave/discussions) and tell us:
- What technologies you're comfortable with
- What kind of contribution you're interested in
- How much time you can commit

We'll help you find the right task!

## Development Workflow

### Branch and Commit

1. Create a feature branch from `main`.
2. Keep commits focused and descriptive.
3. Prefer Conventional Commit style when possible:
   - `feat(conversation): add loop delete action`
   - `fix(sqlite): handle schema initialization fallback`
   - `docs(agent): add tool development guide`

### Local Checks

Before opening a PR, run:

```bash
pnpm -C web run typecheck
pnpm -C web run lint
pnpm -C web run test -- --run
```

### Pull Request Checklist

1. **Explain what changed and why** — context helps reviewers
2. **Link related issue(s)**, if any
3. **Include screenshots or logs** for UI/runtime behavior changes
4. **Confirm tests and typecheck pass** locally
5. **Keep PR size manageable** — small, focused PRs get reviewed faster

## Code Style

1. Follow existing project patterns.
2. Avoid unrelated refactors in the same PR.
3. Add tests for behavior changes and regressions.
4. Run `pnpm -C web run format` before committing.

## Project Architecture

```
creatorweave/
├── web/                   # React frontend (Desktop) — main application
│   ├── src/agent/         # AI agent system, tools, LLM adapters
│   ├── src/components/    # React UI components (30+ directories)
│   ├── src/store/         # Zustand state management (17 stores)
│   ├── src/sqlite/        # SQLite WASM storage (Repository pattern)
│   ├── src/python/        # Pyodide Python integration
│   ├── src/workers/       # Web Workers (7 workers)
│   └── src/export/        # Data export
├── relay-server/          # Socket.IO relay server
├── wasm/                  # Rust + WebAssembly (6 crates)
├── packages/              # Shared packages (ui, conversation, encryption, i18n)
├── plugins/               # Example plugins
└── docs/                  # Documentation
```

For more details, see the [Architecture Overview](./docs/architecture/overview.md).

## Reporting Issues

When opening an issue, include:

1. **Environment**: OS, browser, Node.js version, pnpm version
2. **Reproduction steps**: How to trigger the issue
3. **Expected vs actual behavior**
4. **Relevant logs or screenshots**

## Security

Please do not disclose security vulnerabilities publicly.
See [SECURITY.md](./SECURITY.md) for reporting instructions.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).

---

<div align="center">

**Questions?** Open a [Discussion](https://github.com/nutstore/creatorweave/discussions) or reach out!

</div>
