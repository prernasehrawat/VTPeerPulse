# VT PeerPulse — Project Guide

A plain-language walkthrough of what this app is, how it's built, and how to test every feature by hand before adding more.

---

## 1. What the app does

VT PeerPulse is a **university peer-evaluation platform**. In team-based courses, students rate their teammates each sprint. Professors see analytics, trends, alerts about struggling students/teams, and AI-generated summaries of the written feedback — without students ever seeing each other's evaluations.

Two roles:

| Role | What they can do |
| --- | --- |
| **Student** | Evaluate teammates in the open round (once, immutable), view their own past submissions |
| **Professor** | Manage teams/students (CSV import), manage questions, open/close rounds, view analytics + trends, resolve alerts, generate AI summaries, export reports |

---

## 2. Languages & tech stack

| Layer | Technology |
| --- | --- |
| Language | **TypeScript** (strict mode) everywhere — frontend, backend, database access |
| Framework | **Next.js 16** (App Router) — one codebase serves both the UI pages and the API |
| UI | React 19, Tailwind CSS v4, shadcn/ui components (in `src/components/ui/`), Recharts for charts |
| Data fetching (client) | TanStack Query (`src/lib/api-client.ts`) |
| Forms | react-hook-form + Zod validation |
| Backend | Next.js API route handlers (`src/app/api/`) — thin wrappers over a service layer |
| Database | **PostgreSQL** via **Prisma 7** ORM (`prisma/schema.prisma`) |
| Auth | Auth.js v5 (next-auth) with email + password (bcrypt); SSO-ready |
| Validation | Zod schemas (`src/lib/schemas.ts`) on every API input |
| AI | Provider interface (`src/server/ai/`) — OpenAI-compatible API or deterministic mock |
| Logging | pino structured logger |
| Tests | Vitest (unit + integration), Playwright (end-to-end browser tests) |
| Packaging | Docker + docker-compose (Postgres + app together) |

---

## 3. Architecture — how a request flows

```
Browser
  │
  ▼
src/proxy.ts ──────────── edge guard: redirects to /login if not signed in,
  │                        blocks students from /professor pages and vice versa
  ▼
src/app/... (pages) ───── React pages: student/ and professor/ sections
  │  (fetch via TanStack Query → /api/...)
  ▼
src/app/api/... ────────── route handlers: parse request, call guard, call service
  │
  ├── src/lib/guards.ts ── requires a session + correct role, maps errors to
  │                        proper HTTP codes (401/403/404/422)
  ├── src/lib/schemas.ts ─ Zod validation of every request body/query
  ▼
src/server/services/ ──── ALL business logic lives here (one file per domain):
  │                        evaluations, rounds, questions, analytics, summaries,
  │                        csv-import, users, settings, reports, audit
  ├── src/server/ai/ ───── AIProvider interface + OpenAI-compatible + mock impls
  ▼
src/lib/db.ts ─────────── Prisma client singleton
  │
  ▼
PostgreSQL
```

**Key rule:** route handlers are thin. If you add a feature, put the logic in a service, validate with Zod, guard with role checks, and call the service from the route.

### Database models (`prisma/schema.prisma`)

- `User` (role STUDENT/PROFESSOR) ── belongs to one `Team` via `TeamMembership`
- `EvaluationRound` (DRAFT → OPEN → CLOSED, one per sprint)
- `Question` (RATING 1–5 or TEXT; orderable; deactivated instead of deleted if it has history)
- `Submission` ── one per (round, evaluator); **unique constraint makes re-submission impossible**
  - `PeerEvaluation` ── one per teammate evaluated
    - `Answer` ── one per question (rating or comment)
- `AnalyticsSnapshot` ── frozen analytics JSON captured when a round closes
- `AISummary` ── generated text (per round / team / student, several kinds)
- `Alert` ── LOW_AVERAGE, DOWNWARD_TREND, REPEATED_CONCERN, MISSING_SUBMISSION (severity info/warning/critical)
- `Setting` ── key-value config (alert thresholds)
- `AuditLog`, `Notification`

### Security invariants (enforced server-side, covered by tests)

1. Students evaluate **only teammates**, never themselves, once per round; submissions are immutable.
2. Students can never see others' evaluations or who evaluated them; AI prompts never include evaluator identities.
3. Every API endpoint validates input with Zod and checks role authorization.

---

## 4. Getting it running

```bash
# Option A — Docker (easiest, one command)
AUTH_SECRET=$(openssl rand -base64 32) docker compose up --build
# → Postgres + migrations + app on http://localhost:3000

# Option B — local dev
cp .env.example .env        # set AUTH_SECRET and DATABASE_URL
npm install
npx prisma migrate dev      # create tables
npx prisma db seed          # demo data
npm run dev                 # http://localhost:3000
```

**Seeded logins** (all password `password123`):

- Professor: `professor@vt.edu`
- Students: `joe@vt.edu`, `peter@vt.edu`, `sarah@vt.edu` (Team Alpha); `aisha@vt.edu`, `marcus@vt.edu`, … (Team Beta)

The seed creates the professor, students in teams, 5 default questions (4 rating + 1 text), and an **open round** so you can submit evaluations immediately.

---

## 5. Feature-by-feature manual test walkthrough

Do these in order — it follows the real lifecycle of a course sprint.

### Step 1 — Auth & role routing
1. Open `http://localhost:3000` → you should be redirected to `/login`.
2. Log in as `joe@vt.edu` / `password123` → lands on the **student dashboard**.
3. Manually visit `/professor` → you should be blocked/redirected (role guard).
4. Log out, log in as `professor@vt.edu` → lands on the **professor dashboard**; `/student` should now be blocked.

### Step 2 — Student submits an evaluation
1. As **joe@vt.edu**: the dashboard shows the open round and your teammates (Peter and Sarah — note **you are not listed**, no self-evaluation).
2. Fill the form: ratings 1–5 per question per teammate, optional text feedback. Required questions must be answered (try submitting incomplete → validation error).
3. Submit → success. The form should now be gone/locked.
4. Refresh and try to submit again → not possible (one submission per round, immutable).
5. Check **History** (`/student/history`) → your submission appears.
6. Repeat as `peter@vt.edu` and `sarah@vt.edu` so the round has data. Optionally give one student consistently low ratings — that will trigger alerts in Step 5.

### Step 3 — Professor: teams & students
1. As professor, open **Teams** → see Team Alpha/Beta with members.
2. Try the **CSV import**: upload a CSV of `name,email,team` rows → new students/teams created; bad rows reported with errors, not silently dropped.

### Step 4 — Professor: questions
1. Open **Questions** → the 5 seeded questions.
2. Add a new question, edit one, **reorder** them, disable one.
3. Try deleting a question that already has answers → it gets **deactivated instead of deleted** (history preserved). A question with no answers deletes cleanly.

### Step 5 — Professor: rounds lifecycle (the core workflow)
1. Open **Rounds** → the seeded round is OPEN and shows a **submission tracker** (who submitted, who's missing).
2. **Close the round.** This is the big moment — closing:
   - snapshots analytics into `AnalyticsSnapshot` (frozen numbers),
   - generates **alerts**: low average score, downward trend vs. earlier sprints, repeated concern, missing submission (thresholds configurable in Settings).
3. After closing, students can no longer submit.
4. Create a new round for sprint 2 (DRAFT), open it, have students submit again with different scores — this gives the **trends chart** something to show.

### Step 6 — Professor: analytics & trends
1. Open **Analytics** → per-round averages by team and by student, per-question breakdowns.
2. Open the **trends** view → line chart across rounds. With two closed rounds you should see movement; a student whose scores dropped should trend downward.

### Step 7 — Professor: alerts
1. Open **Alerts** → the alerts generated when you closed rounds (the student you rated low should have LOW_AVERAGE; anyone who didn't submit gets MISSING_SUBMISSION).
2. **Resolve** an alert → it moves out of the active list.
3. In **Settings**, change alert thresholds and close another round to see the effect.

### Step 8 — Professor: AI summaries
1. Open **Summaries**, pick a closed round, generate summaries (complaints / positives / constructive, per round, team, or student).
2. Without an `AI_API_KEY` in `.env`, a **deterministic mock** generates them — fine for testing the flow. With a key (any OpenAI-compatible endpoint via `AI_BASE_URL`/`AI_MODEL`), real AI output.
3. Verify anonymity: summaries talk about the evaluatee, never name who wrote the feedback.

### Step 9 — Professor: reports
1. Open **Reports**, pick a closed round → export/download the round report (per-student scores and feedback rollup).

### Step 10 — Automated tests (confirm everything above in one shot)

```bash
npm run lint          # code style
npm run typecheck     # TypeScript strict check
npm test              # Vitest — needs a `vtpeerpulse_test` Postgres DB (.env.test)
npm run test:e2e      # Playwright — starts dev server, drives real browser flows
```

Test files map to features: `evaluations.test.ts`, `analytics.test.ts`, `questions-rounds.test.ts`, `summaries.test.ts`, `csv-import.test.ts`, `api-auth.test.ts`, plus `e2e/smoke.spec.ts`.

---

## 6. Where to add new features

| You want to… | Touch these |
| --- | --- |
| New page | `src/app/student/...` or `src/app/professor/...` |
| New API endpoint | `src/app/api/.../route.ts` (thin) + a function in `src/server/services/` + Zod schema in `src/lib/schemas.ts` |
| New DB table/field | `prisma/schema.prisma` → `npm run db:migrate` |
| Change AI behavior | `src/server/ai/` (implement `AIProvider`) |
| Add SSO login | `src/lib/auth.ts` (add OIDC/SAML provider to the array) |
| New alert type | `AlertType` enum in schema + logic in `src/server/services/rounds.ts`/`analytics.ts` |

Always add a matching test in `tests/` — the invariants in section 3 are the things that must never break.
