# VT PeerPulse — Privacy & FERPA Notes

This document supports a university's privacy/procurement review. It describes
what data the platform stores, who can see it, and the controls in place.
It is an engineering statement, not legal advice — route the final data
processing agreement through university counsel.

## What is stored

| Data | Where | Notes |
| --- | --- | --- |
| Student identity | `User` (name, university email) | No SSNs, student IDs, grades, or demographic data |
| Course membership | `Course`, `CourseEnrollment`, `Team`, `TeamMembership` | Per-course scoping |
| Peer evaluations | `Submission` → `PeerEvaluation` → `Answer` | Ratings 1–5 and free-text comments; education records under FERPA |
| Derived analytics | `AnalyticsSnapshot`, `Alert` | Aggregates of the above |
| AI summaries | `AISummary` | Generated from anonymized comment text |
| Audit trail | `AuditLog` | Who did what, when |
| Auth secrets | `User.passwordHash` (bcrypt), `AuthToken.tokenHash` (SHA-256) | Raw passwords/tokens are never stored |

## Who can see what (enforced server-side, covered by tests)

- **Students** see: their own submissions; their teammates' names; and only
  the anonymized feedback summaries an instructor has explicitly released to
  them. They can never see who evaluated whom, others' ratings, or another
  student's data.
- **Instructors/TAs** see data **only for courses they are enrolled in as
  staff** — every API call checks `CourseEnrollment`, not just the global
  professor role.
- Evaluator identity is visible to instructors (needed for completion
  tracking) but is **never included in AI prompts or student-facing output**;
  student-shareable summaries additionally have roster names scrubbed from
  comment text before the model sees them.

## AI processing

- With no `AI_API_KEY` configured, no data ever leaves the server (offline
  deterministic mock).
- With a key, only **comment text** (never names/emails of authors, never
  ratings tied to identities) is sent to the configured endpoint, which can be
  a university-hosted OpenAI-compatible model to keep data on premises.
- Every generated summary records which model produced it.
- Instructors review each summary and may edit its text before releasing it;
  a summary is only ever a draft until explicitly released, and once released
  its text is frozen. Edits are captured in the audit log.

## Retention & deletion

- Data persists for the deployment's lifetime; end-of-term archival is a
  Phase 2 roadmap item. Courses can be archived (hidden) today.
- Deleting a `Course` cascades to its teams, rounds, submissions, and answers.
- Individual-student erasure requests currently require operator SQL and
  should be routed through the registrar; a self-service anonymization tool is
  on the roadmap. Note: peer evaluations are records *about* multiple students;
  erasure policy needs a university decision on authorship vs. subject rights.

## Security controls relevant to review

- TLS at the reverse proxy; bcrypt password hashing; hashed one-time
  invite/reset tokens (7-day / 2-hour expiry); 12-hour sessions revalidated
  against the database on every API call (deactivation is immediate).
- Rate limiting on login, resets, imports, and AI generation.
- Strict security headers (CSP, HSTS, no framing).
- Full audit log with an in-app viewer.
- Nightly encrypted-at-rest database backups (encryption is the host volume's
  responsibility; document your disk-encryption posture).

## Known gaps to disclose in procurement

- No formal WCAG 2.1 AA audit yet (accessible components and keyboard
  navigation are in place; a screen-reader audit is scheduled).
- No SOC 2 / penetration-test report yet.
- Single-region, single-instance reference deployment.
