# Build Progress

Build of the Kindred Tech Support application, overnight session of 2026-11-05. See `FINAL_BUILD_REPORT.md` for the status summary.

## Stages

| Stage | Status |
| --- | --- |
| 1. Foundation: project, database, auth, brand system, public website | Done |
| 2. Booking: CRM, service catalog, online booking, calendar, confirmations | Done |
| 3. Operations: technician portal, work orders, scheduling, dispatch, routing | Done (drive times need a maps key) |
| 4. Billing: invoices, Stripe, payment tracking, notifications | Done (live Stripe needs keys) |
| 5. Senior living: facility CRM, partnerships, Tech Help Days, facility portal, contract billing | Done |
| 6. Memberships: plans, billing, usage tracking, customer portal | Done |
| 7. Quality: tests, security review, accessibility, error handling | Done (see known issues) |
| 8. Deployment | Prepared (Dockerfile, railway.json, docs). Not deployed: no Railway credentials. |

## Log

1. Scaffolded Next.js 16, React 19, TypeScript, Tailwind 4, Prisma 6, local PostgreSQL 16.
2. Wrote the full Prisma schema (about 45 models). The first migration adds a Postgres exclusion constraint (`btree_gist`) so a technician can never hold two overlapping appointment blocks, even under concurrent requests.
3. Built core libraries: time-zone helpers (DST-safe), money, settings (typed and admin-editable), audit log, rate limiting, permissions, sessions, password hashing (scrypt).
4. Built the availability engine (pure and unit-tested) and the booking service (transactions, advisory locks, service-area checks, notice and horizon limits, family contacts, consent records, email queueing).
5. Built the email system: template renderer with merge variables and HTML escaping, 18 default templates, delivery gate (disabled, allowlist, or live), Resend adapter, durable Postgres job queue with retries, backoff, idempotency, and dead-lettering.
6. Built the brand system (logo, colors, fonts, components) and the admin shell.
7. Built the remaining areas in parallel: public website; technician portal and work orders; billing, Stripe, and memberships; senior living and the facility portal; admin configuration. In this main thread: booking wizard, appointment self-service, admin dashboard, appointments, calendar, customer CRM, search, leads, dispatch and routing, reports, customer portal, worker, and deployment.
8. Integrated everything. Fixed shared issues found during integration: invoice overpayment and deposit validation, a race between concurrent sends of the same email, job claiming limited to registered handler types, help-day sessions guarded from the generic reschedule and assign paths, login rate limiting (per-account limit now counts failures only), client IP taken from the proxy-appended `X-Forwarded-For` entry, and the canceled state on the manage page.
9. Accessibility: ran axe-core (WCAG 2.0, 2.1, and 2.2 A/AA rules) on 20 pages and fixed what it found (link underlines, the logo link's accessible name, duplicate form ids on the login page).
10. Verified the production build, including a build with no database reachable (as on Railway), and ran the end-to-end suite against the production server.

## Latest test results

Run on 2026-11-05:

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | 0 errors |
| `npx eslint .` | 0 errors, 0 warnings |
| `npm test` (Vitest, 22 files) | 206 / 206 passed |
| `npx playwright test` against the dev server | 19 / 19 passed (17 functional plus 2 axe accessibility scans) |
| Playwright functional suite against the production build | 17 / 17 passed (before the accessibility scans were added) |
| `npm run build` | Passes, including with an unreachable `DATABASE_URL` |
| Worker smoke test (`npx tsx src/worker.ts`) | Ran every periodic job type successfully |

## Outstanding

See "Partially implemented", "Not implemented", and "Known defects" in `FINAL_BUILD_REPORT.md`.
