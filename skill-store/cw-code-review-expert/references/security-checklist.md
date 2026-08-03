# Security and data-integrity checklist

Use for code that accepts untrusted input, crosses trust boundaries, accesses credentials/data, performs network or filesystem work, or coordinates concurrent state. Establish the attacker-controlled input and the affected asset before reporting a security finding.

## Authentication and authorization

- Is authentication required at every sensitive entry point, not only in the UI?
- Is authorization checked against the target resource, tenant, organization, or owner—not merely the caller's existence?
- Can an ID from request parameters/body be swapped to access another user's resource (IDOR/BOLA)?
- Are privilege changes, admin routes, and impersonation flows explicitly protected?
- Are session/token expiration, revocation, audience, and signature validation handled by the trusted library contract?

## Input, output, and injection

- **SQL/NoSQL/ORM:** Is attacker-controlled data parameterized rather than concatenated into a query/filter/order expression?
- **XSS:** Is untrusted HTML rendered/sanitized intentionally? Are URL, attribute, markdown, and template contexts escaped correctly?
- **Command/template injection:** Can input reach a shell, eval, dynamic import, template expression, or interpreter?
- **Path traversal:** Can user-controlled path segments escape an allowed base directory through `..`, encoded separators, symlinks, or platform-specific paths?
- **Redirect/open URL:** Is an untrusted URL validated against a strict allowlist where sensitive redirects, fetching, or navigation occur?

## Network and external services

- **SSRF:** Can a caller select an internal IP/host, cloud metadata endpoint, local service, or non-HTTP scheme? Are DNS rebinding and redirect chains relevant?
- Are outbound requests bounded by timeouts, response-size limits, and appropriate redirect policy?
- Is TLS verification or certificate validation disabled?
- Is externally supplied content treated as data rather than trusted instructions/configuration?

## Secrets and sensitive data

- Are API keys, tokens, credentials, encryption keys, or private URLs hard-coded, logged, committed, or returned to clients?
- Is sensitive data redacted from errors, analytics, audit logs, and debug output?
- Does client-side storage hold secrets unnecessarily or with a persistence scope beyond the intended session?
- Are secrets passed using an approved secret store/environment mechanism rather than source-controlled config?

## File and upload handling

- Is the file type determined by trusted parsing/signature where it matters, rather than filename alone?
- Are filenames normalized and generated server-side if exposed to filesystem/object storage?
- Are archives protected against zip-slip and decompression bombs?
- Are access controls enforced when downloading, transforming, previewing, or deleting a file?

## Concurrency, transactions, and integrity

Look specifically for a time gap between validation and side effect.

- **TOCTOU / check-then-act:** `if available/authorized/exists` followed by a separate create/update/delete; can state change in between?
- **Read-modify-write:** Does concurrent work overwrite a newer value, double-spend inventory, or lose an update?
- **Database concurrency:** Should the operation use a transaction, constraint, atomic update, row lock, optimistic version check, or idempotency key?
- **Distributed retries:** Can message redelivery or request retry cause duplicate charges/emails/writes?
- **Shared process state:** Is mutable cache/map/counter updated from concurrent async requests without a guard?

## Logging, errors, and abuse resistance

- Do error messages reveal internals, account existence, tokens, or stack traces to untrusted users?
- Are expensive endpoints rate-limited, paginated, or bounded against resource exhaustion?
- Does authorization happen before expensive work or data lookup where practical?
- Are audit trails required for sensitive mutations?

## Reporting threshold

State the source, sink, missing control, and impact. For example: “A caller-controlled `url` is fetched without an allowlist and can reach `169.254.169.254`; this exposes cloud metadata.” Do not report generic “possible SSRF” when the URL is fixed or validated.
