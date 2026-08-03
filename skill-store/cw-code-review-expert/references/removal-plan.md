# Safe removal and migration guide

Use this guide when a diff replaces, deprecates, or bypasses existing code. The goal is to remove obsolete code safely—not to turn every review into an unbounded cleanup project.

## Classify the candidate

### Safe to remove now
Use only when all are true:

- no imports/callers/references remain in the relevant repository scope;
- no dynamic/configuration/runtime lookup is expected to reference it;
- no supported data, API, serialized value, or external integration depends on it;
- tests/build/type checks support the conclusion.

Examples: unreachable private helper after all direct callers were removed; duplicate branch made impossible by the same diff.

### Requires a migration plan
Use when removal could affect persisted data, public APIs, clients, operational tooling, compatibility, feature rollout, or unknown dynamic consumers.

Examples: public endpoint, database column, config key, feature flag, event type, stored document shape, SDK export, analytics field.

## Staged removal template

```markdown
### Removal candidate: [name/path]

**Why it is obsolete:** [Replacement path and evidence.]  
**Consumers to migrate:** [Known callers/clients/data.]  
**Compatibility period:** [Version/date/rollout condition.]  
**Instrumentation:** [Metric/log/search that shows remaining use.]  
**Migration steps:**
1. [Introduce replacement or compatibility adapter.]
2. [Migrate internal callers and external consumers.]
3. [Observe remaining usage for the agreed period.]
4. [Remove deprecated path, tests, docs, config, and telemetry together.]
**Rollback:** [How to restore compatibility if adoption fails.]
```

## Review questions

- Is the apparent dead code referenced via reflection, dynamic import, plugin registry, config, routing, serialization, or external automation?
- Is a feature flag merely off locally but enabled for another environment/tenant?
- Does deletion leave stale docs, exports, migrations, metrics, tests, or configuration?
- Can old persisted records or delayed messages still invoke the removed path?
- Is a compatibility adapter cheaper and safer than a big-bang deletion?

## Reporting rules

- Report direct deletion only with positive evidence.
- For uncertain candidates, use a P2/P3 “investigate / plan removal” recommendation, not “delete this.”
- Keep removal findings separate from correctness defects so they do not obscure merge-blocking risks.
