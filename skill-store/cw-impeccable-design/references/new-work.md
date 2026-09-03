# New visual work

Use this flow when making a new surface or replacing a visual identity. PRODUCT.md owns product truth. DESIGN.md owns durable visual decisions. A surface brief keeps strategy that belongs only to one route or artifact. Complete [init.md](commands/init.md) first when PRODUCT.md is missing; a missing DESIGN.md does not route back to init.

## 1. Decide what is already true

Read DESIGN.md, representative code, tokens, components, and assets.

- **Redesign:** preserve product truth, content, function, constraints, and explicit brand commitments; replace the old visual world rather than polishing it. The old look is evidence of what the subject is, not authority over what it becomes.
- **Established world:** inherit it. A missing DESIGN.md does not erase a coherent identity already present in code; document that identity instead of inventing a replacement.
- **Incomplete brand:** preserve confirmed assets and recognizable traits, then help the user expand the system for this new surface.
- **No visual authority:** create a new world with the user.

A section, component, feature, or state inside an established surface inherits that surface. Do not turn a local addition into a new identity exercise.

## 2. Ask what will change the work

Ask one round of two or three related questions through the structured question tool when available. Skip settled facts; a precise request may need only a compact confirmation.

- **Persuade:** clarify who must act, what they should believe, and which real proof, content, or assets can earn that belief.
- **Operate:** clarify the task, information, important states, frequency, and constraints.
- **Read:** clarify the reader's question, source material, structure, and wayfinding.
- **Experience:** clarify what leads, how exploration unfolds, and which interaction or transition matters.

Across modes, ask what success looks like, what must remain untouched, and what would make a polished result feel wrong. Do not ask for CSS values or canned aesthetic lanes.

## 3. Choose the right amount of invention

### Extend an existing surface

Inherit its world and composition. Resolve only the new purpose, content, hierarchy, states, interaction, and how the addition joins the surrounding experience. Do not run a concept tournament or change DESIGN.md unless the user approves a durable system change.

### Create a whole surface inside an established world

Keep the visual system fixed. Derive five to seven materially different structures from the content, task, and user behavior, ordered by resonance. For a genuinely open whole page, screen, or flow, propose and rank candidate structures by what the user actually comes here to do; the top-ranked structure is what every run would ship, so the ranking comes from outside (peer review, user input, or the user's stated priorities), not the model's preference.

### Create or replace the visual world

1. Name the product's unique mechanism in one sentence, the audience's real scene, its cultural home, and what this first surface must prove. Note the page this category always ships and its predictable opposite; name both as the rut and keep them out of the candidate list. A brief that paints its own picture, a product name, a titled artifact, a governing metaphor, adds its literal reading to the rut: spend at most one candidate on it and derive the rest from elsewhere in the audience's world.
2. From that cultural world, list seven concrete visual systems, artifacts, places, or rituals the audience knows by heart, each with one line on why it resonates and can carry the mechanism, ordered by resonance. The audience's world includes its graphic and screen traditions, not only its physical objects: the notation, publications, identity programs, data graphics, and interfaces it reads daily; a nameable abstract system (a school of poster, a documentation standard) is as concrete a candidate as any artifact. What would this thing look like as a physical object; what did its world look like before the web? Near-duplicates count once. When more than three of the seven share one material family, the derivation stopped at the subject's most obvious artifact; dig until the list spans at least three families.
3. Turn that material into complete directions: each joins a reusable visual world to a concrete first-surface experience.
4. Present one direction, fully committed: its world, first viewport, visitor path, signature interaction, cross-surface reach, and honest risk. Alongside it, offer 2-3 challengers as named alternates, with the case for each written in one line. Drop a challenger from the hand only on a named product-truth failure, disclosed. Add re-roll with an optional one-line steer.
5. Never present a ranked menu of your own grounded candidates; a lineup of those invites the safest card.

The standing exit: every direction round offers one quiet, permanent alternative, the category standard, played straight. It is the user's door, never yours: never recommend it, never weigh it against the roll, never let it soften the dealt directions; the counterweights bind the unchosen default, not the chosen one. When the user takes it, in the canon action, a safer-steer, or plain words asking for the familiar or competitor-like path, convention becomes the commitment: ask once for two or three products this should sit alongside, make their craft level the bar, and execute the canon at full fidelity, without irony or smuggled quirk. A standing preference gets recorded as a brand commitment in PRODUCT.md. Re-roll eliminates every direction already shown, grounded and challenger alike; after two consecutive re-rolls, ask what quality is missing. You may re-roll on your own only on named factual grounds, when the assigned direction cannot carry the product's truth or task; taste is never grounds. The user may re-roll freely, and a user- or brief-pinned direction beats the roll, always.

**EO2Weave adaptation**: no `concept-seed.mjs` (no Node, no npx). Skip the roll, present 2-3 candidate directions directly with the standing-exit canon option, and let the user pick. Use the structured question tool (EO2Weave's `ask_user_question`) for the choice. If the user wants to defer, take the canon exit and proceed.

When image generation exists, every card also declares a `sketch` path. In EO2Weave, no image generation is built-in; surface briefs and design directions carry their identity in palette chips, type samples, and structured prose. That is a complete design direction, not a lesser version.

Catalog worlds are working systems, not mood references. When one survives, carry its palette and material, type and composition, topology, controls and state, and responsive rules into the product. When the source is itself an interface language, commit to its native grammar across navigation, content, controls, and states. They set the craft level the build must reach, a rendered reference's finish, commitment, and art direction, never the composition; your surface serves this product.

Every direction must already be viable: every relationship and claim it visualizes true, a real palette and component family, a distinctive composition with one product-specific experience, workable at full-surface scale within the available assets, tools, and performance budget. A candidate that fails on truth is replaced before the roll, never rescued by it. Truth binds claims, not demonstrations: in greenfield work, author whatever illustrative material the concept needs at full fidelity, label it synthetic wherever a visitor could mistake it for the real thing, and hand the user the list of what to replace with real material. What stays uninventable are commercial and factual claims: prices, customers, benchmarks, endpoints, capabilities the product does not have.

For **Persuade**, the opening must make the offer intelligible and desirable, expose a clear action, and demonstrate something only this product can prove. Conversion lives inside the form's own vocabulary: a hook that lands in one line, a visible primary action, a legible reading order. A committed form that hides the offer or the action has not finished translating. For **Operate**, expression may never obscure the task, state, or familiar affordance. For **Read**, comprehension and wayfinding remain intact. For **Experience**, the work itself leads from the first viewport.

## 4. Commit the world

Pick a color strategy before picking colors: Restrained (neutrals plus one accent; the default when the visitor came to operate or read), Committed (one saturated color carries 30-60% of the surface), Full palette (3-4 named roles), or Drenched (the surface IS the color). Persuade and Experience surfaces have permission for the bolder strategies; take them when the brief allows. Color commits at page scale: fields that own whole regions, not accents scattered over a neutral ground. Dark or light is never a default: write one sentence of physical scene (who uses this, where, under what light) and let it force the answer.

Choose faces like objects from the subject's world, in the mode's register. Operate and Read surfaces are well served by system stacks and workhorse UI faces; Persuade and Experience surfaces want faces with a point of view, and these training-data defaults mean you stopped looking: Fraunces, Playfair Display, Cormorant, Lora, Crimson, Newsreader, Syne, Space Grotesk, Space Mono, IBM Plex, Inter-as-display, DM Sans, DM Serif, Outfit, Plus Jakarta Sans, Instrument Sans. Naming one of these faces anyway requires a reason no other face could satisfy, and a subject association is never that reason: books wanting a serif, bookshops wanting hand-lettering, and tech wanting a mono are the associations the list exists to break.

Calibration: AI-generated interfaces cluster around a few looks regardless of subject: warm cream ground, high-contrast serif display, and a terracotta or signal-red accent; near-black with one neon accent and glowing edges; broadsheet-editorial hairlines, italic display serif, and small tracked mono labels. All are legitimate when the brief calls for them. Where the brief leaves the aesthetic free, landing in one means the self-check failed: if someone could guess your aesthetic from the category alone, or from category-plus-avoidance, rework until neither answer is obvious. Energy is not the enemy of trust: a brief's negative constraints (no gamification, no hype) rule out those devices, not exuberance, and adjectives describing the product's behavior (quiet support, calm coaching) do not dictate the surface's energy. A bookish, warm, or child-facing subject does not soften the calibration: book cloth, thread, jackets, endpapers, and shelf ephemera span the whole saturated spectrum, and cream paper is the smallest corner of that world; landing on cream plus serif for a book subject is the default wearing the subject's clothes. A brief-pinned world pins the world, not its softest rendition: the pinned world's full material range stays in play, and a rendition that matches what any model ships for that world failed the self-check at execution rather than selection.

## 5. Record the decision

Before code, state the chosen direction as a contract in the artifact's opening comment, five short blocks, 150 words at most, in a form that survives the production build: an HTML comment in the emitted markup, never only a templating-frontmatter comment, placed as the first child of the document's body in the root layout. After the first production build, grep the built output for the seed key; a contract the build erased is a contract nobody can audit.

- **THESIS**: the one idea this surface owns and the category-default arrangement it refuses.
- **OWN-WORLD**: the palette and component language, specific enough to be recognizable with all content removed.
- **STORY**: what the visitor understands, believes, and does.
- **FIRST VIEWPORT**: the exact composition, what is where and at what scale, and where the primary action sits.
- **FORM**: the chosen form, its position on your ordered list, and the seed key the script printed.

Close the comment with one more line, **FINISH**: the run's exit condition, verbatim "unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md". The comment tops the artifact you re-open on every edit, the one reminder that survives a long build: a page that looks complete with the FINISH line undischarged is not done, it is abandoned at the finish line. If a block reads like a mood, the direction is not decided yet; the finishing review audits the render against this contract.

On a new or replacement world, DESIGN.md is written at finish, from the built world; a rulebook written before the build gets defended against reality instead of describing it. A new world shipped with no DESIGN.md is still an incomplete run. An ordinary extension does not rewrite DESIGN.md.

If the work establishes durable strategy for a route or artifact, read its existing surface brief, then update it. In EO2Weave, surface briefs are project files at `.impeccable/surfaces/<slug>.md` (or in the same directory pattern).

For `shape`, return the selected direction to [shape.md](commands/shape.md) and stop before persistence or implementation.

## 6. Build with full commitment

Build the assigned direction, not a safer interpretation of it. The form supplies structure, reading order, component conventions, and native motion; the product supplies every fact. Commit every atom: nav, buttons, inputs, and links are rebuilt in the form's vocabulary, and a stock component inside a committed form is a lapse. Land the first build fully committed; committing is the hard part, and the passes that follow exist to make the committed thing clear and effective, never to dilute it.

- **The first viewport is a thesis, not a header.** Demonstrate the mechanism immediately, at the scale the form has in life; do not trap the concept inside a standard hero or card shell. The memory test: if someone left after one viewport, what would they describe an hour later? If the honest answer is a mood, the concept has not committed yet.
- **Prove the hero before building past it.** Render the first viewport, capture it, and review before any later section: the hero carries the run's ambition, and every following section inherits its shortfall.
- **Prove, don't claim.** Show the subject doing its job: the interface at work, the mechanism dramatized, specifics a competitor could not copy-paste. Sections that restate a claim in different words add length, not substance.
- **Author the assets; never substitute chrome.** Great surfaces live on carefully made content: names, entries, copy, covers, thumbnails, textures. In greenfield work every blank the ask round left open is yours to author at production fidelity.
- **Build the form's web leverage.** When the chosen world names a technique (canvas, WebGL, view transitions, generative motion), build the technique itself, not a static imitation of it; the graceful fallback serves constrained clients, it is not the default experience.
- **Pace the scroll like a studio.** Vary density, scale, image, motion, and quiet inside one grammar; a dense passage earns a quiet one, and the page ends anchored by a real close.
- **Use real, verified imagery when the brief implies it.** Search for the subject's physical object rather than the category; one decisive photo beats five mediocre ones. Verify stock URLs resolve.
- **Author motion as material.** The form has native motion, what it does in life between states; give the page that motion once, orchestrated, rather than scattered hover effects.

Preserve semantics, accessibility, performance, responsiveness, project conventions, and working behavior.

## 7. Inspect and finish

Inspect desktop and mobile in one batched screenshot round, critique the render against the user's request and the direction contract, fix material gaps, and confirm with one final round; two rounds is the ceiling, and fixes batch between them rather than earning per-tweak screenshots.

After the second inspection round the build thread's polishing is over: no further defect hunts, micro-edit scripts, or rebuilds here; whatever remains ships through the handoffs, where a fresh context does the finding better and cheaper. Where this harness runs no design hook, run the in-context detector from `assets/anti-patterns.md` on the changed targets once here, fix what is mechanical, and pass the remaining findings to the reviewer; a hookless build that skips this ships every tell the hook exists to catch. Capture desktop and mobile screenshots when possible, then run the finish review in a fresh context (EO2Weave: a fresh subagent when available; otherwise a fresh in-thread pass after stepping fully out of the build context, loading `degraded/finish-reviewer.md`). A substituted or failed-and-replaced review is disclosed in one line at finish, never silently. When the reviewer's first material fix is a rebuild directive, fidelity failed wholesale rather than in patches, so skip the fix batch and execute the rebuild immediately. Otherwise apply the material fixes in one batch, rebuild once, and recapture the same viewports. A recapture measures positions, loading, and overflow; it cannot measure whether a fix reached the quality the finding named, so send the recaptured screenshots back to the same reviewer for a verdict scoring every material fix resolved, partial, or unresolved. Fixes scored partial or unresolved get another batch, recapture, and verdict. Two rounds is the budget an unattended run ends at; an attended session's ceiling belongs to the user, so when the second verdict still lists open items, put the table in front of them and let them choose between shipping as it stands and funding another round. Report the final verdict table to the user as it stands, open items included, under the reviewer's own disposition word: a table with open material findings is never announced as a pass, and never under a softer label than the reviewer wrote.

Then run the documenter pass: in EO2Weave, write `DESIGN.md` and the sidecar (`.impeccable/design.json`) from the built world. The shipped assets are ground truth over intention. A clean detector pass is not finished; finished is the contract kept, the comp honored, the review closed, and the system recorded.
