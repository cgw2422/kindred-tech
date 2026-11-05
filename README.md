# Kindred Tech Support

**Modern Technology. Old-Fashioned Service.**

The business application for Kindred Tech Support, an in-home technology help service for seniors, families, and senior living communities in Tuscarawas County, Ohio. It is a single Next.js app (a "modular monolith") that contains:

| Area | Path | Who uses it |
| --- | --- | --- |
| Public website and online booking | `/`, `/services/*`, `/schedule`, ... | Everyone |
| Admin dashboard | `/admin` | Owner, admins, dispatchers |
| Technician portal (mobile-first, installable) | `/tech` | Technicians |
| Customer portal | `/portal` | Customers and authorized family members |
| Facility portal | `/facility` | Senior living community contacts |
| Public invoice payment | `/pay/<token>` | Anyone with an invoice link |

See `FINAL_BUILD_REPORT.md` for what is finished, tested, and still outstanding, and `BUILD_PROGRESS.md` for the build log.

## Technology

- Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind CSS 4
- PostgreSQL with Prisma 6 migrations (needs the `btree_gist` extension, which is created by the first migration)
- Session authentication (scrypt password hashes, database sessions, httpOnly cookies) plus one-time email sign-in links
- Stripe (Checkout, webhooks, refunds, subscriptions), Resend (email), Google Maps Platform or Mapbox (geocoding, drive times). All three are optional.
- Durable background jobs stored in Postgres, run by a separate worker process
- Vitest for unit and integration tests, Playwright and axe-core for end-to-end and accessibility tests

## Local setup

Requirements: Node.js 20.9 or newer (22 recommended) and PostgreSQL 14 or newer.

```bash
npm install
cp .env.example .env          # then edit DATABASE_URL and APP_URL

# The database user needs permission to create the btree_gist extension the
# first time migrations run (superuser locally, or create it once by hand:
#   CREATE EXTENSION IF NOT EXISTS btree_gist;)
npx prisma migrate deploy     # or: npm run db:migrate:dev
npm run db:seed               # service catalog, settings, templates, owner account, sample data

npm run dev                   # http://localhost:3000
npm run worker                # in a second terminal: emails, reminders, maintenance
```

### Development logins (from the seed; development only)

All use the password `KindredDev!2026` (override the owner's with `SEED_OWNER_PASSWORD`).

| Email | Role |
| --- | --- |
| owner@example.com | Owner (also the first technician) |
| dispatcher@example.com | Dispatcher |
| tech@example.com | Technician |
| margaret.sample@example.com | Customer (has a paying family contact) |
| activities.sample@example.com | Facility contact for "Sample Senior Living Community" |

Sample records are labelled "(Sample)" and use `example.com` addresses. Set `SEED_SAMPLE_DATA=false` to skip them; they are never created when `NODE_ENV=production`.

When email delivery is not configured, the sign-in page shows the one-time link on screen **in development only**, so you can test email sign-in.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server (`PORT` is respected) |
| `npm run worker` | Background worker (job queue, reminders, renewals, retention) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | All unit and integration tests (Vitest) |
| `npm run test:e2e` | Playwright end-to-end and accessibility tests |
| `npm run db:seed` | Seed reference data (safe to re-run; never overwrites your edits) |

### Tests

Integration tests use a separate database and **truncate it**. They refuse to run unless the database name contains `_test`.

```bash
createdb kindred_test
DATABASE_URL=postgresql://USER:PASS@localhost:5432/kindred_test npx prisma migrate deploy
TEST_DATABASE_URL=postgresql://USER:PASS@localhost:5432/kindred_test npm test
```

End-to-end tests expect the development seed data and either reuse a server on port 3000 or start `npm run dev`. To test a production build: `E2E_BASE_URL=http://localhost:3100 npm run test:e2e`. If Playwright cannot find its browser, set `PW_CHROMIUM_PATH` to a Chromium executable.

## Configuration

Every environment variable is documented in `.env.example`. Integrations are optional; when one is missing the app keeps working and says so plainly. It never fakes a payment, an email, or a drive-time estimate.

- **Email (Resend):** set `RESEND_API_KEY` and `EMAIL_FROM` (a verified sender domain). Nothing is sent unless `EMAIL_DELIVERY_MODE` is `allowlist` (only addresses in `EMAIL_ALLOWLIST`) or `live`. Every message is logged under Admin > Communications with its status (sent, skipped and why, failed).
- **Stripe:** set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Create a webhook endpoint at `https://YOUR_DOMAIN/api/stripe/webhook` for these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `payment_intent.payment_failed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `charge.refunded`, `charge.refund.updated`, `refund.created`, `refund.updated`, `refund.failed`. Configure the Customer Billing Portal in the Stripe dashboard if members should manage their own cards. Without Stripe, invoices still work and staff record cash or check payments by hand.
- **Maps:** set `GOOGLE_MAPS_API_KEY` (Geocoding API and Distance Matrix API enabled) or `MAPBOX_ACCESS_TOKEN`. Without one, dispatch runs in a clearly labelled manual mode.
- **Business details** (phone, email, address, hours, booking rules, cancellation policy, tax, notifications, data retention) are edited in Admin > Settings. No phone number or address is invented; public pages hide contact details until you enter them.

## Deploying to Railway

The repo includes a `Dockerfile` and `railway.json`. Nothing has been deployed yet.

1. Create a Railway project and add a **PostgreSQL** database.
2. Add a service from this GitHub repo. Railway builds it with the Dockerfile. Set these variables:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `APP_URL` = your public URL (for example `https://kindredtechsupport.com`)
   - `SEED_OWNER_EMAIL`, `SEED_OWNER_NAME`, `SEED_OWNER_PASSWORD` (a strong password)
   - Optional integrations from `.env.example`
3. Deploy. The container runs `prisma migrate deploy` before starting, and the health check is `/api/health`. Railway's Postgres user can create the `btree_gist` extension.
4. Seed once from your machine or a Railway shell: `npm run db:seed`. This creates the owner account and reference data; sample data is never created in production.
5. Add a second service from the same repo for the **worker**, with the same variables and start command `npm run worker`. Without it, emails, reminders, and renewal notices stay queued. (Alternative: set `CRON_SECRET` and have a scheduler POST to `/api/cron` every few minutes with `Authorization: Bearer <CRON_SECRET>`.)
6. Attach your domain and set `APP_URL` to match. Then configure the Stripe webhook and Resend sender domain, and switch `EMAIL_DELIVERY_MODE` to `allowlist` for testing, and to `live` when ready.

### Backups and data protection

- Turn on Railway's Postgres backups (or schedule `pg_dump` to S3-compatible storage). Test a restore before launch.
- Data retention periods are set in Admin > Settings > Privacy and applied daily by the worker (communications log, audit log, finished jobs, expired sessions and tokens).
- Secrets live only in environment variables. Card data is handled by Stripe and never stored here. The app never asks for banking passwords.

## Project layout

```
prisma/                 schema, migrations (including the double-booking exclusion constraint), seed
src/app/(public)/       marketing site, booking wizard, appointment self-service, help-day sign-up
src/app/admin/          admin dashboard and all back-office sections
src/app/tech/           technician portal
src/app/portal/         customer portal
src/app/facility/       facility partner portal
src/app/pay/            public invoice payment
src/app/api/            availability, estimate, Stripe webhook, cron, health
src/lib/                domain logic (booking, billing, payments, memberships, facilities, routing, email, jobs, auth)
src/worker.ts           background worker entry point
tests/                  Vitest unit and integration tests
e2e/                    Playwright end-to-end and accessibility tests
```
