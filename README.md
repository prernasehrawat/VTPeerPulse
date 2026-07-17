# VT PeerPulse

A university peer-evaluation platform: students evaluate teammates each sprint, instructors monitor team health with analytics, trends, alerts, and AI-generated feedback summaries.

## Stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind + shadcn/ui · Prisma 7 + PostgreSQL · Auth.js v5 (credentials + optional OIDC university SSO) · TanStack Query · Recharts · Vitest + Playwright · Docker + GitHub Actions CI.

## Quick start

```bash
# 1. Postgres running locally, then:
cp .env.example .env          # fill in AUTH_SECRET, DATABASE_URL
npm install
npx prisma migrate dev        # create schema
npx prisma db seed            # demo professor, students, teams, questions, open round
npm run dev
```

Seeded logins (password `password123`):

- Professor: `professor@vt.edu`
- Students: `joe@vt.edu`, `peter@vt.edu`, `sarah@vt.edu`, `aisha@vt.edu`, …

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
| `npm test` | Vitest unit + integration (uses `vtpeerpulse_test` DB from `.env.test`) |
| `npm run test:e2e` | Playwright smoke tests (starts dev server, uses seeded data) |
| `npm run db:migrate` / `db:seed` | Prisma migrate dev / seed |

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
- Students evaluate **only teammates**, never themselves, once per round; submissions are immutable (with browser-side draft autosave).
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
