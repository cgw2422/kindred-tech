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

## Website photos and Tech Tips

Everything is managed from **Admin > Website** (owner and admin accounts only). Changes appear on the live site immediately, with no code change or redeploy.

### Image storage (needed before uploading in production)

Uploaded photos are stored in S3-compatible object storage, not on the server's disk, because Railway's application filesystem is temporary. Photo details (names, alt text, crops, and where each photo is used) are stored in the database.

On Railway:
1. In your project, add a **Bucket** (Railway's S3-compatible storage). Cloudflare R2 or AWS S3 also work.
2. On the **web** service, set `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` from the bucket's credentials (Railway reference variables work well). The bucket can stay private: the app serves images itself.
3. Redeploy. Admin > Website > Media Library shows a warning if storage is not configured.
4. If uploads fail with an addressing error, set `S3_FORCE_PATH_STYLE=true`.

In development, without S3 settings, images are saved to `.data/media` (git-ignored).

How images are processed: only JPG, PNG and WebP up to 15 MB are accepted, checked by reading the file itself. Photos are rotated upright, then all hidden metadata, including GPS location, is removed. Very large photos are reduced to 3200 px. Visitors receive resized WebP or JPEG versions (320 to 2000 px wide), created on first request and cached in the bucket. Every change to a photo produces new image addresses, so nobody sees an outdated image, and browsers can cache images for a year.

### Changing website photographs

1. **Admin > Website > Page Images** lists every photo spot: homepage hero and secondary photo, Senior Living hero and partnership photo, About owner photo, and Services featured photo. Each shows the recommended size and shape.
2. Choose a spot, then **Choose or upload a photo** (pick from the Media Library or upload a new one).
3. Drag and zoom to crop, then click the most important part of the photo for the **desktop** and **mobile** focal points.
4. Add alt text (a short description for screen reader users), check the desktop and phone **preview**, and click **Save and publish**.
5. **Remove photo** restores the page's original text-only layout.

The About page's "Meet the owner" section uses your name and introduction from **Admin > Settings > Business information**. If you only add a photo, it appears beside "Our mission".

**Admin > Website > Media Library** lists all uploaded photos. From there you can upload, search, filter (in use, not used, missing alt text), rename, edit alt text and descriptions, record the source and license, crop, set a focal point, replace a photo everywhere it is used, see where it is used, and delete unused photos.

### Writing and publishing Tech Tips

- **Admin > Website > Tech Tips** lists articles with search and filters. Tick articles and use **Publish** or **Unpublish** to change many at once.
- **New article** (or click a title) opens the editor: title, URL slug, summary, rich-text content (headings, bold, italic, lists, links, quotes, images from the Media Library), category, featured flag, featured image with alt text, and SEO title and meta description.
- **Save draft** keeps it private. **Publish now** makes it live. To schedule, pick a date and time (Eastern) and click **Schedule**; the article appears automatically at that time. **Unpublish** hides it again.
- **Preview saved version** shows the article exactly as visitors will see it, including drafts. Only signed-in admins can open previews.
- **Duplicate** creates a draft copy, and **Delete** removes an article permanently.
- Categories are edited under **Tech Tips > Categories**.

The 20 starter articles are seeded as **drafts** for your review. Re-running the seed never duplicates them and never overwrites your edits. When you have reviewed them, select them in the list and use **Publish**. Articles without a featured image show a branded placeholder until you add one.

## Deploying to Railway

The repo includes a `Dockerfile` and `railway.json`. Nothing has been deployed yet.

1. Create a Railway project and add a **PostgreSQL** database.
2. Add a service from this GitHub repo. Railway builds it with the Dockerfile. Set these variables:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `APP_URL` = your public URL (for example `https://kindredtechsupport.com`)
   - `SEED_OWNER_EMAIL`, `SEED_OWNER_NAME`, `SEED_OWNER_PASSWORD` (a strong password)
   - `SEED_ON_START` = `true` for the first deploy (see step 4)
   - Optional integrations from `.env.example`
3. Deploy. The container runs `prisma migrate deploy` before starting, and the health check is `/api/health`. Railway's Postgres user can create the `btree_gist` extension.
4. Seed the database. The easiest way needs no console: set `SEED_ON_START=true` on the web service and redeploy. The container runs the seed before starting, creating the owner account and reference data (sample data is never created in production). The seed is safe to repeat, but you can remove the variable once you have signed in. Alternatives: `railway run npm run db:seed` from your computer with the Railway CLI, or `npm run db:seed` in the Railway console.
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

### Troubleshooting Railway

- **Console shows "WebSocket connection failed" / "Disconnected":** the console can only attach to a deployment that is running. Open **Deployments**, select the latest deployment, and read its **Deploy Logs**. If the container is crashing, the console cannot connect.
- **`P1001: Can't reach database server`:** `DATABASE_URL` is missing or wrong. Set it to `${{Postgres.DATABASE_URL}}` (reference variable) on the web and worker services, then redeploy.
- **Health check fails:** the app listens on Railway's `PORT` automatically; make sure no custom start command or port override was added in the service settings.
- **Seeding without the console:** use `SEED_ON_START=true` (step 4).
