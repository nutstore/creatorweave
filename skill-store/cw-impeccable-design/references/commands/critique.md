### Purpose

Resolve one stable target, run two independent assessments, synthesize a design critique, persist a snapshot, and ask the user what to improve next. The chat response is the primary deliverable; the snapshot is an archive/backlog for future commands.

### Hard Invariants

- Assessment A (design review) and Assessment B (detector/browser evidence) are both required.
- Assessment A and B SHOULD run as two isolated sub-agents whenever a sub-agent/Task tool is exposed. Running them inline in this context is a degraded run.
- If you degrade for any reason, the report's first line MUST be a banner: `⚠️ DEGRADED: single-context (<reason>)`. A silent degraded critique is a failed critique.
- Assessment A must finish before detector findings enter the parent synthesis context. Detector output is deterministic, but it still anchors judgment.
- A skipped detector is a failed critique run unless `detect.mjs` is missing or crashes after a real attempt.
- Viewable targets require browser inspection when available.
- Any local server started only for critique visualization must run in the background, have a recorded stop method, and be stopped before final reporting unless the user asks to keep it.
- Do not claim a user-visible overlay exists unless script injection succeeded and the detector ran in the page.

### Setup

1. **Resolve the target** to a concrete file path or URL. Prefer a source path over a dev-server URL when both identify the same surface; ports drift, paths do not.
   - "the homepage" → `site/pages/index.astro` or `index.html`
   - "the settings modal" → the primary component file
   - "this page" → the current URL or source file
2. **Confirm the target slugs cleanly** (best-effort; missing helper is not a failure in EO2Weave). In EO2Weave, slug is derived locally from the resolved target.
3. **Read `.impeccable/critique/ignore.md`** if it exists. Drop matching findings silently; it is the only prior-run input critique consumes.

### Assessment Orchestration

Delegate Assessment A and Assessment B to separate sub-agents when available. They must not see each other's output. Do not show findings to the user until synthesis.

If sub-agents are unavailable (no Task/spawn tool), fall back sequentially: finish and record Assessment A, then run Assessment B, then synthesize, and emit the degraded banner.

If browser automation is available, each assessment creates its own new tab. Never reuse an existing tab.

### Assessment A: Design Review

Read relevant source files and visually inspect the live page when browser automation is available. Think like a design director.

Evaluate:
- **Design specificity**: Is the composition, interaction, and visual language grounded in this product, or could an unrelated product use it unchanged? Make this judgment before seeing detector output.
- **Holistic design**: hierarchy, IA, emotional fit, discoverability, composition, typography, color, accessibility, states, copy, and edge cases.
- **Cognitive load**: consult the Cognitive Load Assessment below; report checklist failures and decision points with >4 visible options.
- **Emotional journey**: peak-end rule, emotional valleys, reassurance at high-stakes moments.
- **Nielsen heuristics**: consult the Heuristics Scoring Guide below; score all 10 heuristics 0-4, marking any heuristic the mode-applicability rule allows as `n/a` instead of forcing a number.

Return: design-specificity verdict, heuristic scores, cognitive load, emotional journey, 2-3 strengths, 3-5 priority issues, persona red flags, minor observations, and provocative questions.

### Assessment B: Detector + Browser Evidence

Run the bundled detector and browser visualization evidence. Assessment B is mandatory and must remain isolated from Assessment A until both are complete.

**EO2Weave adaptation**: there is no `detect.mjs` runtime (no Node, no npx in the bash sandbox). Substitute `assets/anti-patterns.md` (the LLM-driven detector equivalent) and run an in-context review against each rule. Browser visualization requires EO2Weave's web_fetch + web_search to inspect the live page; when not available, skip visualization and report the fallback signal.

CLI scan equivalent: review the target's source for anti-pattern hits per `assets/anti-patterns.md` (slop / quality categories). Return: rule hits with snippets, false positives, skipped rules with reasons.

Browser visualization is required for a viewable target when browser automation is available. Use EO2Weave's `web_fetch` against a localhost dev/static URL for local files; avoid `file://`. Overlay flow:

1. Create a fresh page request and fetch. Prefer EO2Weave's web_fetch path before hand-rolling a script; only fall back to a custom script when no native web tool is exposed.
2. If mutation is unavailable, skip live server, browser presentation, and injection; report fallback signal.
3. If a real browser session is available (e.g. via the web extension), start a local server in the background, present the browser if supported, label `[Human]`, scroll top, inject the detector, wait 2-3 seconds, read console messages, then stop the live server.
4. For multi-view targets, inspect 3-5 representative pages.

Return: CLI findings JSON/counts, browser console findings if applicable, false positives, and skipped/failed browser steps with concrete reasons.

After Assessment B returns usable findings, reuse them. Do not rerun the detector in the parent unless Assessment B failed, was truncated, or omitted count, rule names, or file locations.

### Generate Combined Critique Report

Synthesize both assessments into a single report. Do NOT simply concatenate. Weave the findings together, noting where the LLM review and detector agree, where the detector caught issues the LLM missed, and where detector findings are false positives.

The chat response is the primary user-facing deliverable. Present the full structured critique below in chat; do not replace it with a summary and a link. The persisted snapshot is only an archive/backlog for later commands.

Structure your feedback as a design director would:

#### Report header provenance

The report's first line MUST declare how the assessments were run, so a degraded run is never silent:
- Dual-agent: `Method: dual-agent (A: <agent-id> · B: <agent-id>)`
- Degraded: `⚠️ DEGRADED: single-context (<reason, e.g. no sub-agent tool exposed>)`

#### Design Health Score

Present the Nielsen's 10 heuristics scores as a table:

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | ? | [specific finding or "n/a" if solid] |
| 2 | Match System / Real World | ? | |
| 3 | User Control and Freedom | ? | |
| 4 | Consistency and Standards | ? | |
| 5 | Error Prevention | ? | |
| 6 | Recognition Rather Than Recall | ? | |
| 7 | Flexibility and Efficiency | ? | |
| 8 | Aesthetic and Minimalist Design | ? | |
| 9 | Error Recovery | ? | |
| 10 | Help and Documentation | ? | |
| **Total** | | **??/[applicable max]** | **[Rating band]** |

The applicable maximum is 4 times the number of heuristics you actually scored: **/40** when all ten apply, **/32** when two are `n/a`. Never print `/40` over a partial set.

Be honest with scores. A 4 means genuinely excellent. Most real interfaces score 20-32 out of 40.

**Mode applicability**: heuristics 7 (Flexibility and Efficiency) and 10 (Help and Documentation) may be scored `n/a` on Persuade and Experience surfaces, as may any other heuristic that genuinely cannot apply to the surface under review. Write `n/a` in the Score cell with a one-line reason, and renormalize the total to the applicable maximum.

#### Design Specificity Verdict

**Start here.** Does the result feel authored for this product, or category-interchangeable?

**LLM assessment**: Your unanchored evaluation of design specificity. Cover overall coherence, structural sameness, category-interchangeable choices, and missed opportunities for product character.

**Deterministic scan**: Summarize what the automated detector found, with counts and file locations. Note any additional issues the detector caught that you missed, and flag any false positives.

**Visual overlays** (if injection succeeded): Tell the user that overlays are now visible in the **[Human]** tab in their browser, highlighting the detected issues.

#### Overall Impression

A brief gut reaction: what works, what doesn't, and the single biggest opportunity.

#### What's Working

Highlight 2-3 things done well. Be specific about why they work.

#### Priority Issues

The 3-5 most impactful design problems, ordered by importance.

For each issue, tag with **P0-P3 severity**:

- **[P?] What**: Name the problem clearly
- **Why it matters**: How this hurts users or undermines goals
- **Fix**: What to do about it (be concrete)
- **Suggested command**: Which command could address this (refer to the 23 commands in SKILL.md)

#### Persona Red Flags

Auto-select 2-3 personas most relevant to this interface type.

For each selected persona, walk through the primary user action and list specific red flags found. Be specific. Name the exact elements and interactions that fail each persona.

#### Minor Observations

Quick notes on smaller issues worth addressing.

#### Questions to Consider

Provocative questions that might unlock better solutions.

**Remember**:
- Be direct. Vague feedback wastes everyone's time.
- Be specific. "The submit button," not "some elements."
- Say what's wrong AND why it matters to users.
- Give concrete suggestions. Cut "consider exploring..." entirely.
- Prioritize ruthlessly. If everything is important, nothing is.
- Don't soften criticism. Developers need honest feedback to ship great design.

### Persist the Snapshot (best-effort in EO2Weave)

In Impeccable's native flow, write the body to `.impeccable/critique/<slug>.md` so the user can refer back. In EO2Weave, the equivalent is to write to a project file like `.impeccable/critique/<slug>.md` (or surface it in the conversation if the project structure doesn't permit).

If the Setup slug was null (vague or root-level target), skip this step.

In EO2Weave, persistence is best-effort; failures don't block the critique.

### Ask the User

**After presenting findings**, use targeted questions based on what was actually found.

Ask questions along these lines (adapt to the specific findings; do NOT ask generic questions):

1. **Priority direction**: Based on the issues found, ask which category matters most to the user right now. Offer the top 2-3 issue categories as options.
2. **Design intent**: If the critique found a tonal mismatch, ask whether it was intentional. Offer 2-3 tonal directions as options.
3. **Scope**: Ask how much the user wants to take on. Offer scope options.
4. **Constraints** (optional; only ask if relevant): If the findings touch many areas, ask if anything is off-limits.

**Rules for questions**:
- Every question must reference specific findings from the report.
- Keep it to 2-4 questions maximum.
- Offer concrete options, not open-ended prompts.
- If findings are straightforward, skip questions and go directly to Recommended Actions.

### Recommended Actions

**After receiving the user's answers**, present a prioritized action summary.

#### Action Summary

List recommended commands in priority order, based on the user's answers:

1. **`command-name`**: Brief description of what to fix (specific context from critique findings)
2. **`command-name`**: Brief description (specific context)

**Rules for recommendations**:
- Only recommend from the 23 commands in SKILL.md
- Order by the user's stated priorities first, then by impact
- Each item's description should carry enough context that the command knows what to focus on
- Map each Priority Issue to the appropriate command
- Skip commands that would address zero issues
- End with `polish` as the final step if any fixes were recommended

After presenting the summary, tell the user:

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `critique` after fixes to see your score improve.

---

## Reference Material

The sections below are deep context for the critique flow. They live inline so the reference is in one place.

### Cognitive Load Assessment

Cognitive load is the total mental effort required to use an interface. Overloaded users make mistakes, get frustrated, and leave.

**Three Types of Cognitive Load**

- **Intrinsic Load**: The task itself. Manage by breaking complex tasks, scaffolding, progressive disclosure, grouping.
- **Extraneous Load**: Bad design. Eliminate ruthlessly. Common sources: confusing navigation, unclear labels, visual clutter, inconsistent patterns, unnecessary steps.
- **Germane Load**: Learning effort. This is good. Support with progressive disclosure, consistent patterns, feedback, onboarding through action.

**Cognitive Load Checklist**

- [ ] **Single focus**: Can the user complete the primary task without distraction?
- [ ] **Chunking**: Information in digestible groups (≤4 items)?
- [ ] **Grouping**: Related items visually grouped (proximity, borders, shared background)?
- [ ] **Visual hierarchy**: Is it clear what's most important?
- [ ] **One thing at a time**: Can the user focus on a single decision?
- [ ] **Minimal choices**: ≤4 visible options at any decision point?
- [ ] **Working memory**: User doesn't need to remember from previous screen?
- [ ] **Progressive disclosure**: Complexity revealed only when needed?

**Scoring**: 0-1 failures = low (good). 2-3 = moderate. 4+ = high (critical).

**Working Memory Rule**: ≤4 items in working memory at once. 5-7 = boundary. 8+ = overloaded.

**Common Violations**: Wall of Options, Memory Bridge, Hidden Navigation, Jargon Barrier, Visual Noise Floor, Inconsistent Pattern, Multi-Task Demand, Context Switch.

### Heuristics Scoring Guide

Score each of Nielsen's 10 Usability Heuristics on a 0-4 scale. Be honest: a 4 means genuinely excellent.

1. **Visibility of System Status**: Loading, confirmation, progress, location, validation. 0=none, 4=every action confirms.
2. **Match System / Real World**: Familiar terms, logical order, recognizable icons, plain language. 0=jargon, 4=fluent.
3. **User Control and Freedom**: Undo, cancel, back, clear filters, escape. 0=trapped, 4=full control.
4. **Consistency and Standards**: Same terms, same actions, same results, platform conventions. 0=stitched-together, 4=cohesive.
5. **Error Prevention**: Confirmation, constraints, smart defaults, autosave. 0=errors easy, 4=errors nearly impossible.
6. **Recognition Rather Than Recall**: Visible options, contextual help, autocomplete, labels. 0=heavy memorization, 4=everything discoverable.
7. **Flexibility and Efficiency**: Shortcuts, customization, batch, power features. 0=rigid, 4=highly flexible.
8. **Aesthetic and Minimalist Design**: Only necessary info, clear hierarchy, no clutter. 0=overwhelming, 4=every pixel earns its place.
9. **Error Recovery**: Plain language, specific, actionable, near source, non-blocking. 0=cryptic, 4=perfect recovery.
10. **Help and Documentation**: Searchable, contextual, task-focused, concise. 0=no help, 4=excellent contextual help.

**Total possible**: 40 (10 × 4). Bands: 36-40 Excellent, 28-35 Good, 20-27 Acceptable, 12-19 Poor, 0-11 Critical.

When heuristics are `n/a`, renormalize to the applicable maximum; read the band off the percentage instead of the raw number (90%+ Excellent, 70%+ Good, 50%+ Acceptable, 30%+ Poor, below Critical).

#### Issue Severity (P0–P3)

| Priority | Name | Description | Action |
|----------|------|-------------|--------|
| **P0** | Blocking | Prevents task completion entirely | Fix immediately; showstopper |
| **P1** | Major | Causes significant difficulty or confusion | Fix before release |
| **P2** | Minor | Annoyance, but workaround exists | Fix in next pass |
| **P3** | Polish | Nice-to-fix, no real user impact | Fix if time permits |

**Tip**: If unsure between two levels, ask "Would a user contact support about this?" If yes, P1.

### Persona-Based Design Testing

Test the interface through 5 distinct user archetypes.

#### 1. Impatient Power User: "Alex"
Expert, expects efficiency, hates hand-holding. Skips onboarding, looks for shortcuts, batch-edits, abandons if slow.

Red Flags: Forced tutorials, no keyboard shortcuts, slow animations, one-at-a-time workflows, redundant confirmations.

#### 2. Confused First-Timer: "Jordan"
Never used this type of product, needs guidance, abandons rather than figure out. Reads instructions, hesitates, looks for help, takes labels literally.

Red Flags: Icon-only nav, technical jargon, no visible help, ambiguous next steps, no success confirmation.

#### 3. Accessibility-Dependent User: "Sam"
Uses screen reader, keyboard-only, may have low vision or motor impairment. Tabs linearly, relies on ARIA, needs 4.5:1 contrast, uses zoom to 200%.

Red Flags: Click-only interactions, missing focus indicators, color-only meaning, unlabeled fields, custom components that break screen reader flow.

#### 4. Deliberate Stress Tester: "Riley"
Tests edges, tries unexpected inputs, probes for gaps. Tests empty states, long strings, emoji, RTL, multi-tab, refresh mid-flow.

Red Flags: Features that appear to work but silently fail, error handling that exposes internals, empty states with no guidance, data loss on refresh, inconsistent behavior.

#### 5. Distracted Mobile User: "Casey"
Phone one-handed on the go, frequently interrupted, slow connection. Uses thumb, prefers bottom-of-screen actions, low patience, prefers taps over typing.

Red Flags: Important actions at top of screen, no state persistence, large text inputs, heavy assets, tiny tap targets.

#### Selecting Personas

| Interface Type | Primary Personas |
|---------------|------------------|
| Landing page / marketing | Jordan, Riley, Casey |
| Dashboard / admin | Alex, Sam |
| E-commerce / checkout | Casey, Riley, Jordan |
| Onboarding flow | Jordan, Casey |
| Data-heavy / analytics | Alex, Sam |
| Form-heavy / wizard | Jordan, Sam, Casey |

**EO2Weave adaptation**: there is no `critique-storage.mjs` to persist snapshots. If the project has a `.impeccable/` directory, write the snapshot there; otherwise surface the critique in the conversation and offer to save it as a project file.
