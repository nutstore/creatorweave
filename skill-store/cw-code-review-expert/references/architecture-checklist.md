# Architecture and correctness checklist

Use this checklist after understanding the intended behavior. Apply only relevant sections; it is a decision aid, not a quota for findings.

## Contracts and behavior

- Does the implementation preserve the public API, schema, type, event, or UI contract expected by callers?
- Are defaults, optional values, pagination, ordering, and backward compatibility handled deliberately?
- Does a renamed or reshaped field still work at every producer and consumer?
- Is the success path correct for empty, duplicate, stale, or partially completed state?
- Does the code return/throw a result that callers already know how to handle?

## Boundaries and ownership

- Is input validated at the boundary where it first becomes trusted?
- Does one module own each important state transition, side effect, or external protocol?
- Is a UI/controller/service doing persistence, network transport, and domain policy together without a necessary reason?
- Are dependencies pointed inward toward stable interfaces, or has a lower-level utility begun importing feature/UI policy?
- Does a new abstraction remove repeated complexity, or merely add indirection for one call site?

## SOLID signals

### Single responsibility
Ask: **How many independent reasons would this unit change?**

Potential issue signals:
- one component mixes rendering, networking, state persistence, and domain rules;
- a service both parses transport data and decides business policy;
- unrelated changes repeatedly touch the same large function.

### Open/closed and extension paths
- Does adding a new case require editing a fragile switch across unrelated modules?
- Is a registry/strategy genuinely needed for repeated extension, rather than premature abstraction?
- Are unknown enum/event values handled safely?

### Interface and dependency boundaries
- Are consumers forced to depend on methods/data they cannot use?
- Did an implementation-specific type leak through a public interface?
- Is code coupled to a global singleton where a caller-provided dependency or scoped context is required?

## State, lifecycle, and async behavior

- Are state transitions atomic from the caller's perspective?
- Can stale async results overwrite newer state after navigation, cancellation, retry, or rapid user actions?
- Are subscriptions, timers, file handles, streams, object URLs, and event listeners cleaned up?
- Is a retry idempotent, or can it duplicate writes/requests/notifications?
- Is mutable shared state accessed from multiple asynchronous paths without ordering or ownership?

## Error and recovery contracts

- Is failure converted into a silent success, fallback, or empty result that hides the actual problem?
- Are cleanup and rollback aligned with the point at which side effects happen?
- Does the error retain enough context to diagnose the failed operation without exposing secrets?
- Is retry safe and bounded?

## Data and schema evolution

- Are database/schema changes paired with migration, rollback, and old-data handling?
- Is serialization/deserialization compatible with old values and unknown fields where required?
- Are identifiers stable and scoped correctly?
- Does a delete/update preserve referential integrity and related cleanup?

## Reporting threshold

Report an architecture concern only if you can connect the structure to a credible failure mode, a recurring maintenance cost, or a blocked future change. Prefer a focused refactor suggestion over “rewrite this module.”
