# Quality, reliability, and performance checklist

Review for defects likely to escape local testing, operational fragility, and meaningful maintenance/performance costs. Ignore purely stylistic preferences unless they obscure correctness.

## Error handling and observability

- Are exceptions/errors swallowed, converted to `null`/`false`, or logged without returning a failure signal where callers need one?
- Does a catch block accidentally treat cancellation, authorization failure, validation failure, and network failure the same way?
- Are retries bounded, backoff-aware where needed, and safe for non-idempotent operations?
- Do logs/metrics include actionable operation context without leaking sensitive data?
- Can a failed cleanup mask the primary error?

## Null, empty, and boundary cases

- Are optional values checked before dereference/use?
- Are empty lists, absent records, duplicate actions, and already-deleted resources deliberate paths?
- Are numeric boundaries, timezone/date boundaries, Unicode, large payloads, and pagination cursor edge cases relevant?
- Is user-visible state accurate during loading, failure, cancellation, and refresh?

## Async and resource management

- Are promises awaited/returned so failures cannot become unhandled rejections?
- Can concurrent requests finish out of order and commit stale state?
- Are network calls cancelable or safely ignored after unmount/navigation where appropriate?
- Are streams, iterators, database cursors, object URLs, timers, subscriptions, and file descriptors released?
- Is a retry/debounce/throttle implementation cancelling obsolete work?

## Data access and performance

- Is a database/API query issued inside a loop (N+1)? Can it be batched or joined?
- Does a new query have appropriate constraints, indexes, limits, projections, and pagination?
- Is expensive computation/rendering repeated for every item or render without memoization/caching where scale warrants it?
- Does the code load unbounded data or response bodies into memory?
- Are cache keys complete (tenant/user/version/input) and invalidated correctly?
- Is a micro-optimization being proposed without evidence of a hot path? If so, do not report it.

## Clarity and maintainability

- Is duplicated logic likely to diverge because it encodes a business rule in more than one place?
- Are names and types sufficient to express units, ownership, nullability, and side effects?
- Does a complex condition need extraction only because it is repeated or difficult to test?
- Does a feature flag, compatibility branch, or fallback have an owner and removal condition?
- Are tests added or adjusted for the behavior changed, especially a previously failing edge case?

## Tests and validation

- Does the changed behavior have a focused regression test at the appropriate layer?
- Are tests asserting behavior rather than implementation details?
- Are failure paths, authorization paths, async ordering, and cleanup covered where the diff changes them?
- If a test cannot be added, is there another concrete validation method?

## Reporting threshold

For each issue, explain why it matters at the expected scale and suggest the narrowest test or change that proves the fix. Do not make P2/P3 findings from hypothetical scale without evidence that the code can reach it.
