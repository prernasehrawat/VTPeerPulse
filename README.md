# VT PeerPulse

A university peer-evaluation platform: students evaluate teammates each sprint, instructors monitor team health with analytics, trends, alerts, and AI-generated feedback summaries.

## Stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind + shadcn/ui · Prisma 7 + PostgreSQL · Auth.js v5 (credentials now, SSO-ready) · TanStack Query · Recharts · Vitest + Playwright · Docker.

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
    services/     business logic: evaluations, analytics, csv-import, rounds,
                  questions, summaries, users, settings, reports, audit
    ai/           AIProvider interface + OpenAI-compatible & mock implementations
  lib/            db (Prisma), auth (Auth.js), guards (RBAC + error mapping),
                  schemas (Zod), env, logger
  proxy.ts        edge auth guard for page routes
prisma/           schema, migrations, seed
tests/            Vitest suites   e2e/  Playwright
```

Key invariants (enforced server-side and covered by tests):

- Students evaluate **only teammates**, never themselves, once per round; submissions are immutable.
- Students never see others' evaluations or who evaluated them; AI prompts never include evaluator identities.
- Every API endpoint validates its input with Zod and checks role authorization.
- Questions are database-driven (CRUD, reorder, enable/disable); deleting a question with historical answers deactivates it instead, preserving history.
- Closing a round snapshots analytics and generates alerts (low average, downward trend, repeated concern, missing submission) with configurable thresholds.

### Swapping the AI provider

Implement `AIProvider` (`src/server/ai/provider.ts`) and return it from `getAIProvider()`. Any OpenAI-compatible endpoint works out of the box via `AI_BASE_URL`/`AI_MODEL`; with no `AI_API_KEY` a deterministic mock is used.

### University SSO later

Auth is centralized in `src/lib/auth.ts`. Add an OIDC/SAML provider to the `providers` array and map its profile to the `User` record — no other layer touches the auth implementation.
