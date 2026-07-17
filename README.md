# VT PeerPulse

A university peer-evaluation platform: students evaluate teammates each sprint, instructors monitor team health with analytics, trends, alerts, and AI-generated feedback summaries.

## Stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind + shadcn/ui · Prisma 7 + PostgreSQL · Auth.js v5 (credentials + optional OIDC university SSO) · TanStack Query · Recharts · Vitest + Playwright · Docker + GitHub Actions CI.

## Prerequisites

- **Node 22** (matches CI; `nvm use 22`)
- **PostgreSQL 14+** running locally (or use the Docker path below)

## Quick start

```bash
# 1. Create the dev database (name is up to you; must match DATABASE_URL):
createdb vtpeerpulse

# 2. Configure env:
cp .env.example .env          # set AUTH_SECRET (openssl rand -base64 32) and DATABASE_URL

# 3. Install, apply schema, seed, run:
npm install
npx prisma migrate deploy     # apply all migrations (creates the schema)
npx prisma db seed            # demo professor, students, teams, questions, open round
npm run dev                   # http://localhost:3000
```

`migrate deploy` applies existing migrations as-is — use it for a fresh clone and
after every `git pull`. Only use `npx prisma migrate dev` when you are *authoring*
a new schema change locally.

Seeded logins (password `password123`):

- Professor: `professor@vt.edu`
- Students: `joe@vt.edu`, `peter@vt.edu`, `sarah@vt.edu`, `aisha@vt.edu`, …

### After pulling new changes

Schema changes ship as migrations, so after `git pull` on `main`, re-apply them
before running the app or you'll hit missing-table errors:

```bash
npm install                   # in case dependencies changed
npx prisma migrate deploy     # apply any new migrations
```

### Docker

```bash
AUTH_SECRET=$(openssl rand -base64 32) docker compose up --build
```

Brings up Postgres, runs migrations, and starts the app on :3000.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | develop / build / serve |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm test` | Vitest unit + integration (uses a **separate** `vtpeerpulse_test` DB from `.env.test`) |
| `npm run test:e2e` | Playwright smoke tests (starts dev server, uses seeded data) |
| `npm run db:migrate` / `db:seed` | Prisma migrate dev / seed |

### Running the tests locally

`npm test` runs against an **isolated** database (`vtpeerpulse_test`) so it never
touches your dev data — the suite truncates every table between tests. It reads
its own config from the committed `.env.test`, which is loaded with `override`, so
that file's `DATABASE_URL` always wins for tests.

First-time setup:

```bash
createdb vtpeerpulse_test
```

Heads-up: the committed `.env.test` points at Postgres user `prerna`
(`postgresql://prerna@localhost:5432/vtpeerpulse_test`). If your local Postgres
uses a different role, **edit that `DATABASE_URL` to match your own user** (and
password) or `npm test` fails immediately with `P1000: Authentication failed`.
Change it in your working copy only — don't commit local credentials. The Vitest
`global-setup` runs `prisma migrate deploy` against this DB automatically, so no
manual migrate step is needed for the test database.

## Architecture

```
src/
  app/            pages (student/, professor/) + api/ route handlers (thin)
  server/
    services/     business logic: courses, evaluations, analytics, csv-import,
                  rounds, questions, summaries, users, settings, reports,
                  audit, accounts (invites/resets), notifications, tokens
    ai/           AIProvider interface + OpenAI-compatible & mock implementations
    email/        EmailProvider (console for dev, Resend-compatible HTTP for prod)
    scheduler.ts  auto open/close scheduled rounds + deadline reminders
  lib/            db (Prisma), auth (Auth.js), guards (RBAC + error mapping),
                  schemas (Zod), env, logger
  proxy.ts        edge auth guard for page routes
prisma/           schema, migrations, seed
tests/            Vitest suites   e2e/  Playwright
```

Key invariants (enforced server-side and covered by tests):

- Everything is scoped to a **course** (multi-course tenancy): rosters, teams, questions, rounds, alerts. Instructors only reach courses they teach.
- Students evaluate **only teammates**, never themselves, once per round; submissions are immutable. In-progress answers autosave to the server, so a student can resume on any device; the draft is cleared on submit.
- Instructors get a per-round **submission tracker** (submitted / in-progress / not-started) and can **nudge** outstanding students on demand (rate-limited per round).
- **Bulk AI summaries** fan out over every student or team with feedback in a round as a background job with live progress; re-runs are idempotent (already-summarized subjects are skipped).
- **Semester rollover** clones a course into a new term (questions + optional roster/teams) without carrying over any rounds, submissions, or summaries.
- Students never see others' evaluations or who evaluated them; AI prompts never include evaluator identities.
- Every API endpoint validates its input with Zod and checks role authorization.
- Questions are database-driven (CRUD, reorder, enable/disable); deleting a question with historical answers deactivates it instead, preserving history.
- Closing a round snapshots analytics and generates alerts (low average, downward trend, repeated concern, missing submission) with configurable thresholds; closed rounds are always served from the frozen snapshot.
- Sessions are revalidated against the database on every API call — deactivating a user takes effect immediately.
- Imported students receive email invites with one-time set-password links; password resets are self-service.
- AI feedback for students requires explicit instructor release, with roster names scrubbed from the source text.

### Swapping the AI provider

Implement `AIProvider` (`src/server/ai/provider.ts`) and return it from `getAIProvider()`. Any OpenAI-compatible endpoint works out of the box via `AI_BASE_URL`/`AI_MODEL`; with no `AI_API_KEY` a deterministic mock is used.

### University SSO

Set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` (any OIDC-compliant IdP: Azure AD, Okta, Shibboleth OIDC plugin) and a "Sign in with University SSO" button appears. SSO is roster-controlled — accounts must already exist via CSV import; it never auto-provisions users.

## Production & operations

- `docker-compose.prod.yml` — hardened topology (localhost-only app behind your TLS proxy, nightly backups with retention, health checks).
- `docs/RUNBOOK.md` — deploy, monitoring, backup/restore drills, incident basics.
- `docs/SECURITY.md` / `docs/PRIVACY.md` — security posture and FERPA notes for procurement review.
- `GET /api/health` — load-balancer probe. Every API error carries an `x-request-id` for log correlation.
