# VT PeerPulse — Operations Runbook

## Deploy (single host)

```bash
# 1. Provision secrets (untracked .env or a secrets manager):
#    POSTGRES_PASSWORD, AUTH_SECRET (openssl rand -base64 32),
#    NEXTAUTH_URL + APP_BASE_URL (public https URL),
#    EMAIL_PROVIDER=resend + EMAIL_API_KEY + EMAIL_FROM for real email,
#    optionally AI_API_KEY and OIDC_* for SSO.
# 2. Put a TLS-terminating reverse proxy (Caddy/nginx/university LB) in front
#    of 127.0.0.1:3000 — the app is not exposed publicly by the compose file.
docker compose -f docker-compose.prod.yml up -d --build
```

Migrations run automatically (the `migrate` service) before the app starts.

## Health & monitoring

- **Probe:** `GET /api/health` → `{"status":"ok"}` / 503 when the DB is unreachable.
  Point the load balancer and an uptime monitor (with alerting) at it.
- **Logs:** pino JSON on stdout — ship with your platform's log driver.
  Every API error response carries an `x-request-id` header and `requestId`
  field; grep the logs for it when a user reports an error.
- **Scheduler:** logs `scheduler started` on boot and one line per action
  (`scheduler: opened round`, `sent round reminders`). If scheduled rounds
  aren't opening, check the app container was started with
  `SCHEDULER_ENABLED=true` and only **one** app instance is running.

## Backups & restore

- The `backup` service takes a nightly `pg_dump` into `./backups/` (14-day
  retention). Manual: `DATABASE_URL=... scripts/backup.sh`.
- **Restore drill (do this before the first semester, and quarterly):**
  1. `DATABASE_URL=postgresql://...staging scripts/restore.sh backups/<file>.dump`
  2. Smoke check: `/api/health`, professor login, one analytics page.
- Off-host copies: sync `./backups/` to university object storage (the compose
  file deliberately keeps this a cron/rclone concern, not app logic).

## Common operations

| Task | How |
| --- | --- |
| Invite students who never set a password | Teams & Students → "Send pending invites" (or `POST /api/courses/:id/invites`) |
| Deactivate a student immediately | Teams & Students → Deactivate. Takes effect on their next request (sessions are DB-revalidated). |
| Round didn't auto-close | Check `closesAt` on the round, scheduler logs, then close manually from Rounds. |
| Email not arriving | `EMAIL_PROVIDER=console` logs instead of sending — check env; then check provider dashboard for bounces. |
| Rate-limit lockout (429s) | In-memory windows reset on app restart: `docker compose restart app`. |
| Rotate AUTH_SECRET | Update env + restart; all sessions are invalidated (users re-login). |

## Pre-launch checks

- **AI evaluation:** `npx tsx scripts/ai-eval.ts` — validates prompt hygiene,
  injection resistance, and roster-name scrubbing through the real service
  path. Run it **with a real `AI_API_KEY`** and review the output before
  enabling summaries for a real course; it exits non-zero on any failure.
- **Load test:** `STUDENTS=300 CONCURRENCY=40 npx tsx scripts/load-test.ts` —
  simulates a whole course logging in and submitting at a deadline via the
  real HTTP auth flow, then a professor reading analytics. Reference numbers
  (dev mode, laptop): 300/300 submissions, 0 errors, submit p95 ≈ 380 ms.
  Run it against staging with production-like sizing before each term.

## Incident basics

1. `docker compose -f docker-compose.prod.yml ps` — is anything restarting?
2. `docker compose logs --tail 200 app` — look for `Unhandled API error` with request IDs.
3. Database full/unreachable → `/api/health` 503s; check `db` container and disk.
4. Bad deploy → roll back to the previous image; migrations are additive (never
   destructive without a review), so the previous app version keeps working.

## Scaling caveats (single-instance assumptions)

Two components assume one app instance: the **in-memory rate limiter** and the
**in-process scheduler**. Before running multiple replicas, move rate-limit
state to Redis and the scheduler loop to a single dedicated worker
(`SCHEDULER_ENABLED=false` on web replicas).
