# VT PeerPulse — Future Work & Handoff Notes

Handoff notes from the outgoing developer. This project is being handed over for
deployment; the items below are features the professor has asked about or that
could be refined further. Nothing here is a bug — the app is production-ready as
built. Treat each item as "pick up if the professor wants it," and **talk to the
professor before building**, since most of these are product decisions, not just
code.

Each entry lists its current state, the open question(s), and where in the code
to start.

---

## 1. Student self-evaluation in the survey

**Status:** requested by the professor · attempted then deliberately deferred —
needs a scoring decision before it's built.

**What the professor wants:** let a student evaluate *themselves* on the same
survey questions they use for teammates, so self-assessment sits alongside peer
assessment in one form.

**Why it was deferred:** I was not confident how a self-score should be *counted*.
Today, analytics pools every rating by the person being evaluated, so if a
self-rating is added naively it would silently fold into that student's **peer
average** — and self-scores tend to run high, which would distort the number the
professor relies on. That weighting question needs a real answer first.

**Get clarity on (discuss with the professor):**
- Should a self-score count toward the student's average at all? If yes, at full
  weight, or shown separately?
- Is the more useful metric actually the **self-vs-peer gap** (how a student rates
  themselves compared to how teammates rate them)?
- Is self-evaluation required or optional per round?

**Suggested approach (my recommendation):** store self-ratings **separately** from
peer ratings and surface them as a "self vs. peer" comparison, rather than blending
them into the peer average. That keeps the peer number clean and gives the
professor a genuinely useful signal.

**Where to start in the code:**
- `src/server/services/evaluations.ts` — self-evaluation is currently blocked in
  three places: `getTeammates()` excludes the user; `submitEvaluation()` rejects
  `evaluateeId === userId`; and it requires evaluating *exactly* the set of
  teammates. All three would need to change.
- `src/server/services/analytics.ts` — this is where ratings are pooled by
  evaluatee; it must decide whether/how self-ratings enter the averages.
- `src/app/student/evaluation-form.tsx` — the form UI would need a "yourself"
  section.
- Add tests in `tests/evaluations.test.ts` and `tests/analytics.test.ts`.

**Effort/risk:** medium. The UI is small; the real work (and risk) is the
analytics/scoring decision — get that signed off before touching code.

---

## 2. Self-service sign-up on the login page

**Status:** idea · needs a product decision with the professor.

**Current state:** login is **roster-controlled and invite-only** by design.
There is no sign-up page. Accounts are created when an instructor imports a roster
(CSV) or adds students; each student then receives a one-time email link to set
their password (`/set-password`). Logins are also restricted to allowed email
domains (`ALLOWED_EMAIL_DOMAINS`, default `vt.edu`), and optional university SSO is
likewise roster-controlled — it never auto-creates users.

**The open question:** adding open sign-up would change that security model. Decide
with the professor:
- Who is allowed to self-register — anyone with a `vt.edu` address, or only
  students the instructor expects?
- If someone signs up, **which course/team** do they land in? (Enrollment is
  per-course today; a self-signup has no course context.)
- Does a new account need instructor approval before it can do anything?

**My take:** the current invite-only model is a feature, not a limitation — it
guarantees only real, rostered students exist, which matters for FERPA and for
clean analytics. If the professor mainly wants less manual work, a lighter option
than open sign-up is a **self-enroll code/link per course** (instructor shares a
join code) that still keeps enrollment under the instructor's control. Worth
proposing that as the middle ground.

**Where to start in the code:**
- `src/app/login/` (login UI), `src/lib/auth.ts` (Auth.js providers),
  `src/server/services/accounts.ts` (invite/account creation).
- Keep the `ALLOWED_EMAIL_DOMAINS` check on any new path.

**Effort/risk:** medium–high, mostly because of the policy/authorization
implications — not the form itself.

---

## 3. AI summary review & edit before release — ✅ DONE

**Status:** implemented and shipped (kept here for context, not action).

The professor asked to be able to **review and edit an AI-generated summary before
it goes to students**, rather than sending the AI text verbatim. This is built:

- On the **AI Summaries** page, each draft summary has an **Edit** button; the
  professor can revise the wording and save before releasing.
- Editing is only allowed while a summary is a **draft**; once **released** to a
  student, the text is frozen (the record of what the student saw). Edits are
  audit-logged, and an "Edited by instructor" badge marks revised drafts.
- Each summary type has an inline **"how it works" explainer** (a collapsible
  guide panel plus a per-type hint under the dropdown) so it's clear what each one
  is for.

**Code:** `src/server/services/summaries.ts` (`editSummary`),
`src/app/api/summaries/[id]/route.ts`, `src/app/professor/summaries/`.

*Possible future refinement:* a released summary is currently frozen. If the
professor ever needs to correct a released summary and re-notify the student,
that would need a small versioning + re-release flow — worth a conversation only
if the need comes up.

---

## 4. Audit log visibility in the professor nav

**Status:** cosmetic/nav decision · discuss with the professor.

**Current state:** "Audit log" is a link in the **instructor sidebar**
(`/professor/audit`). It is already **instructor-only** — it does not appear in the
student navigation and students cannot reach it. It shows every state-changing
action across the platform, newest first.

**The question:** the professor may not want the audit log surfaced as a top-level
nav item during everyday use (it's more of an operations/compliance tool than a
daily one). Options to discuss:
- **Leave it** as-is (useful for transparency and incident review).
- **Tuck it away** — move it under "Reports & Settings" or a "More" menu so it's
  still reachable but less prominent.
- **Gate it** behind a role/flag if, in future, TAs share the instructor view and
  shouldn't see the full audit trail.

**Where to start in the code:**
- `src/app/professor/nav.tsx` — remove or relocate the `Audit log` entry (the
  page itself at `src/app/professor/audit/` can stay; hiding the link doesn't
  delete the feature).

**Effort/risk:** trivial — it's a one-line nav change once the professor decides.

---

## See also

A few other forward-looking notes live in the existing docs:

- [`PRIVACY.md`](./PRIVACY.md) — end-of-term archival and self-service data
  erasure/anonymization (roadmap items relevant to whoever deploys for FERPA).
- [`RUNBOOK.md`](./RUNBOOK.md) — "Scaling caveats": what to change before running
  multiple app instances (move the in-memory rate limiter to Redis, run the
  scheduler as a single dedicated worker).

---

_Last updated at handover. When one of these is built or decided, update this file
(or move it to a tracked GitHub issue) so the next person knows the current state._
