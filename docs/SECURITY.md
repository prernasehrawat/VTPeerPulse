# VT PeerPulse — Security Overview

## Authentication

- **Passwords:** bcrypt (cost 10); minimum 10 characters; set only via hashed
  one-time tokens delivered by email (invite: 7-day TTL, reset: 2-hour TTL,
  single-use, previous tokens invalidated on reissue).
- **SSO:** optional OIDC provider (Azure AD, Okta, Shibboleth OIDC plugin).
  Roster-controlled: an SSO login succeeds only for an existing, active
  account — SSO never creates users.
- **Sessions:** JWT, 12-hour lifetime. Every API request re-checks the user's
  `active` flag and role in the database, so deactivation/role changes take
  effect immediately, not at token expiry.
- **Brute force:** sliding-window throttles per email (10/5min) and per IP
  (30/5min) on login; password-reset requests 3/15min per IP. In-memory —
  see RUNBOOK scaling caveats.

## Authorization

- Global roles (STUDENT/PROFESSOR) gate page trees at the edge proxy.
- **Course-level enforcement on every endpoint:** instructors must hold an
  INSTRUCTOR (or TA, where read-only is acceptable) enrollment in the course
  they're operating on; students must hold a STUDENT enrollment. IDs from the
  URL are always verified to belong to the caller's course.
- Student invariants (server-enforced + DB constraints + tests): evaluate
  teammates only, never self, once per round, immutable after submit; can read
  only their own submissions and explicitly released summaries.

## Input handling

- Zod validation on every body/query; Prisma parameterized queries (no raw
  SQL in request paths); CSV imports capped at 1 MB with per-row validation
  and a dry-run preview; comments capped at 4,000 chars server-side.
- **Prompt injection:** student comments enter AI prompts wrapped in
  `<comment>` tags with explicit instructions to treat contents as data;
  output is length-capped. Student-shareable summaries have roster names
  scrubbed from source text and require explicit instructor release.

## Transport & headers

- TLS terminates at the reverse proxy; app binds to localhost in the prod
  compose file.
- CSP (self-only origins), HSTS, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, restrictive Permissions-Policy and
  Referrer-Policy on every response.
- Auth cookies: Auth.js defaults (httpOnly, SameSite=Lax, Secure over https).
  CSRF protection on auth routes via Auth.js; state-changing API routes rely
  on SameSite cookies and JSON content types.

## Auditing & observability

- Every mutation writes an `AuditLog` row (actor, action, entity, metadata);
  instructors can browse it in-app.
- Every API error carries an `x-request-id` correlated with server logs.
- `/api/health` for liveness; pino structured logs.

## Reporting a vulnerability

Email the maintainers (see repository owners) with reproduction steps. Please
do not test against a live university deployment containing real student data.
