# Built-in Skills Global Mount — Developer Guide

> This document describes the architecture of the global built-in Skills directory and the independent Pyodide mount point.
> Intended for CreatorWeave Web platform developers.

## Architecture Overview

```
                  Build Time                         Runtime (startup)
             ┌──────────────┐              ┌──────────────────────────┐
             │  Vite ?raw   │              │  SkillManager.init()     │
             │  imports     │              │    ↓                     │
             │    ↓         │              │  initializeRegistry()    │
             │  BUNDLED_    │──── in-mem ─→│    ↓                     │
             │  SKILL_FILES │              │  ensureMaterialized()    │
             │    ↓         │              │    ↓ → writes to OPFS    │
             │  buildBundled│              │  isSkillsDirHealthy()    │
             │  Manifest()  │              │    ↓                     │
             └──────────────┘              │  registerSlashCmds()     │
                                           └──────────────────────────┘
                                                    ↓
                                           ┌──────────────────────────┐
                                           │  Pyodide Worker          │
                                           │  ensureSkillsMounted()   │
                                           │  → /mnt_skills/          │
                                           └──────────────────────────┘
```

## Package Structure

### `@creatorweave/skills-system` (platform-agnostic core)

Path: `packages/skills-system/`

```
packages/skills-system/
├── package.json
├── tsconfig.json
└── src/
    ├── types.ts        ← Type definitions + PlatformAdapter interface
    ├── diff.ts         ← Version diff computation (local vs bundled manifest)
    ├── materialize.ts  ← Incremental sync pipeline
    ├── paths.ts        ← /mnt_skills path utilities
    └── index.ts        ← Public exports
```

**Design principle**: Zero platform dependencies. Consumers inject platform-specific implementations via the `PlatformAdapter` interface (OPFS for web, mocks for tests).

### Web Layer

| File | Responsibility |
|------|---------------|
| `web/src/skills/skills-platform-adapter.ts` | OPFS implementation of `PlatformAdapter` |
| `web/src/skills/builtin-packages-registry.ts` | Build-time file registration + manifest generation |
| `web/src/skills/skills-system-init.ts` | Init orchestration (register → sync → health check → slash commands) |
| `web/src/skills/skills-mount.ts` | OPFS directory handle management + health check |
| `web/src/skills/slash-command-registry.ts` | Unified slash command registry |

### Worker Layer

| File | Changes |
|------|---------|
| `web/src/python/worker.ts` | +`ensureSkillsMounted()` / +`mountSkills` message handler / unmount cleanup for `/mnt_skills` |
| `web/src/python/worker-types.ts` | +`MountSkillsRequest` type / +`skillsDir` field on `ExecuteRequest` |

## Data Flow

### 1. Build Time: File Inlining

```ts
// builtin-packages-registry.ts
import brainstormSkillMd from './builtin-packages/socratic-brainstorm/SKILL.md?raw'

registerSkill('socratic-brainstorm', [
  { path: 'SKILL.md', content: brainstormSkillMd },
])
```

Vite's `?raw` query inlines files as strings. `BUNDLED_SKILL_FILES` is the global file map.

### 2. Startup: Manifest Build + Incremental Sync

```
initializeRegistry()
  → buildBundledManifest()       // Build manifest from BUNDLED_SKILL_FILES
  → ensureMaterialized(adapter)
      → readLocalManifest()       // Read manifest.json from OPFS
      → appVersion comparison     // Skip if unchanged
      → computeDiff()              // added / updated / unchanged
      → Write added/updated files to OPFS
      → writeLocalManifest()       // Update manifest.json
```

### 3. During Sessions: Agent Read + Python Execution

**Read path** (Tool, low overhead):
```
read_skill("brainstorm")
  → DB query for skill metadata
  → Returns SKILL.md content + resource index
  → Appends /mnt_skills path hint for built-in skills
```

**Execution path** (Python, requires real file paths):
```
/mnt_skills/builtin/socratic-brainstorm/scripts/generate_questions.py
                    ↑
          Pyodide mountNativeFS
          mapping to OPFS .skills/ directory
```

## OPFS Directory Layout

```
opfs-root/
├── projects/                          ← Project files (mounted at /mnt/)
│   └── <project-a>/
└── .skills/                           ← Global Skills (mounted at /mnt_skills/)
    ├── manifest.json                  ← Sync manifest (version, file hashes)
    └── builtin/
        └── socratic-brainstorm/
            ├── SKILL.md
            ├── references/
            │   └── questioning-patterns.md
            └── scripts/
                └── generate_questions.py
```

## Adding a New Built-in Skill

### Step 1: Create the Skill directory

```
web/src/skills/builtin-packages/<skill-name>/
├── SKILL.md               ← Required
├── references/            ← Optional
├── scripts/               ← Optional
└── assets/                ← Optional
```

### Step 2: Register in the Registry

Edit `web/src/skills/builtin-packages-registry.ts`:

```ts
import newSkillMd from './builtin-packages/<skill-name>/SKILL.md?raw'
import newScript from './builtin-packages/<skill-name>/scripts/do-something.py?raw'

registerSkill('<skill-name>', [
  { path: 'SKILL.md', content: newSkillMd },
  { path: 'scripts/do-something.py', content: newScript },
])
```

### Step 3: Verify

- Launch the app and check the console for `[Skills System]` logs.
- Confirm `written: 1` or `skipped: 1`.
- Test in Python: `os.listdir('/mnt_skills/builtin/<skill-name>')`.

## Version Upgrade Strategy

- **Fast skip**: `appVersion` unchanged → skip entire sync.
- **Incremental update**: `appVersion` changed → per-skill version diff → write only added/updated skills.
- **Deletion**: Old skill directories are preserved by default.

The version source is `__APP_VERSION__` in `vite.config.ts` (from `npm_package_version`).

## Error Handling & Degradation

| Scenario | Handling |
|----------|----------|
| Skills system init fails | Non-fatal; does not block SkillManager initialization |
| Individual skill sync fails | Skip that skill; other skills are unaffected |
| OPFS write fails | DB capabilities preserved (`read_skill` still works) |
| `/mnt_skills` mount fails | Disable Python script execution path; prompt agent to use `read_skill_resource` instead |
| Manifest corrupted | Fall back to full sync |

## Slash Command Registration

Built-in Skills are automatically registered as slash commands (`source: 'skill'`), managed alongside app-level commands like `compact` (`source: 'builtin'`) through the unified `slash-command-registry.ts`.

`SlashCommandExtension.ts` is a pure UI layer — it no longer hardcodes commands, but queries the registry via `searchSlashCommands(query)`.

## Key Interfaces

### PlatformAdapter (`@creatorweave/skills-system`)

```ts
interface PlatformAdapter {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string | ArrayBuffer): Promise<void>
  exists(path: string): Promise<boolean>
  readdir(path: string): Promise<string[]>
  remove(path: string): Promise<void>
  readLocalManifest(): Promise<BuiltinSkillsManifest | null>
  writeLocalManifest(manifest: BuiltinSkillsManifest): Promise<void>
  getBundledManifest(): BuiltinSkillsManifest
  readBundledFile(skillName: string, filePath: string): Promise<string>
  getAppVersion(): string
}
```

### Worker Message Types (new)

```ts
// Mount the global .skills directory
interface MountSkillsRequest {
  id: string
  type: 'mountSkills'
  dirHandle: FileSystemDirectoryHandle
}

// Extended ExecuteRequest
interface ExecuteRequest {
  // ...existing fields...
  skillsDir?: FileSystemDirectoryHandle  // NEW
}
```

## File Index

| Category | Files |
|----------|-------|
| Core package | `packages/skills-system/src/{types,diff,materialize,paths,index}.ts` |
| Web adapters | `web/src/skills/{skills-platform-adapter,builtin-packages-registry,skills-system-init,skills-mount}.ts` |
| Slash commands | `web/src/skills/slash-command-registry.ts` |
| UI layer | `web/src/components/agent/SlashCommandExtension.ts` |
| Worker | `web/src/python/worker.ts`, `web/src/python/worker-types.ts` |
| Integration | `web/src/skills/skill-manager.ts`, `web/src/skills/skill-tools.ts` |
| Build config | `web/vite.config.ts` (`__APP_VERSION__` define) |
| Example Skill | `web/src/skills/builtin-packages/socratic-brainstorm/` |
| User docs | `docs/user/builtin-skills.md` |
