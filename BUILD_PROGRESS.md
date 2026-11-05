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

## Website improvements (2026-11-05, second session)

Customer experience and community-partnership improvements. No prices, services, routes, or booking workflows were changed or removed.

- Homepage: two visitor paths ("Get Personal Tech Help" and "Partner With Kindred"), a new senior living section ("Make Technology Support a Resident Amenity."), seven trust standards, and an updated service-area summary. "How It Works" and "How We Can Help" are kept; the "Who we help" block was folded into the two paths so the page did not get longer.
- Senior Living page: new headline and copy. The recurring monthly resident program is the primary offer, followed by a 5-step "How it works", benefits, an example 3-hour visit (capacity depends on resident needs), the other arrangements as secondary options, privacy, a ~75-mile partnership territory around Gnadenhutten, a 10-question community FAQ, and the proposal request form. Pricing stays custom quoted.
- Proposal form: adds state, community type, and preferred visit frequency; groups fields; single column on phones. The submit button reads "Request a Community Partnership Proposal".
- Services page: each of the 8 categories shows what is included, the appointment length, the price (from the database), and a consistent "Schedule a Visit" button. Tech Help Day services are listed in a new community section that links to the partnership page.
- Pricing page: residential and community pricing are separated, the table becomes cards on phones, a notice explains that additional cost is always approved first, and community pricing links to the proposal form.
- Service areas: the residential in-home area is unchanged (database-driven); a separate community partnership territory (East-Central and Northeast Ohio) was added.
- FAQ: community partnership group (10 questions) on /faq and /senior-living.
- Calls to action are consistent: "Schedule a Visit" (residential), "Request a Partnership Proposal" (communities), "Contact Kindred" (general).
- SEO: updated titles and descriptions; Service structured data for the resident program with a GeoCircle service radius (no office addresses claimed).
- Admin: community leads are separated from residential leads on the dashboard and in Messages & Leads, and the new inquiry fields are shown and carried over when an inquiry is converted to a facility. A new staff-notification email is queued for new leads when an admin notification address is set.
- Accessibility: small buttons are now 44px tall, footer text uses the base size, and form fieldsets have legends. The axe scan covers 12 public pages.
- Database: migration `facility_inquiry_details` adds three nullable columns to `FacilityInquiry`.
- Tests: 217 unit and integration tests pass, 23 end-to-end and accessibility tests pass, and the production build passes.

## Website photography, Media Library, and Tech Tips (third session)

No prices, services, booking, payment, or contact-form behavior was changed.

- **Media Library** (Admin > Website): upload JPG, PNG and WebP images (15 MB max, validated by file contents), a thumbnail gallery, search and filters, renaming, alt text, descriptions, source and license fields, cropping, focal points, replacing a photo everywhere it is used, usage tracking, and deleting unused images (blocked while in use).
- **Image processing** (sharp): photos are auto-rotated and all EXIF metadata, including GPS, is stripped. Masters are capped at 3200 px. Responsive WebP and JPEG variants are generated on demand and cached in storage. Version-stamped URLs are cached for a year and never go stale; layout-stable `<picture>` markup has lazy loading below the fold and high priority for hero images.
- **Storage**: S3-compatible object storage (Railway Buckets, R2, S3) in production. Production without bucket settings refuses uploads. Development uses a local folder. Verified against an S3-compatible server (s3rver).
- **Page Images**: six slots (homepage hero and secondary, Senior Living hero and partnership, About owner, Services featured). Each has library selection or upload, crop locked to the slot's shape, desktop and mobile focal points, alt text, a live desktop and phone preview, publish, and remove (text-only layout restored).
- **About page**: optional "Meet the owner" section driven by new Settings fields (owner name, title, introduction). Nothing is invented.
- **Tech Tips**: public directory (featured, recent, categories, search, pagination), category pages, article pages (breadcrumbs, featured image, date, reading time, related tips, sharing, "Still Need a Hand?" call to action), Article and Breadcrumb structured data, canonical URLs and Open Graph tags, sitemap entries, and "Tech Tips" in the navigation. The homepage shows the 3 latest tips (hidden when none are published).
- **Article management**: TipTap rich-text editor with Media Library images, drafts, publish, schedule, unpublish, duplicate, delete, featured flag, SEO fields, categories, bulk publish and unpublish, and admin-only previews. Content is sanitized on save. Scheduled articles go live at their time even if the worker is late; the worker then marks them published.
- **20 articles** were written and seeded as drafts (730–863 words each). The seed is idempotent and preserves edits.
- **Photography**: stock-photo sites were blocked by the build environment's network policy, so no stock photos were added. All slots are unassigned and articles use a branded placeholder until photos are uploaded.
- **Migration**: `website_media_and_tech_tips` (new tables MediaAsset, PageImage, ArticleCategory, Article; additive only).
- **Tests**: 241 unit and integration tests and 27 end-to-end tests (including accessibility scans of the new pages) pass, and the production build passes with no warnings.

## Accessibility, readability, and our story (fourth session)

No prices, services, booking rules, payments, partnerships, Tech Tips, Media Library, data, colors, or logo were changed.

- **Readability**: body text is 18px by default with 1.65 line height. Secondary text is at least 16px. Paragraphs are capped at a comfortable line length (`.measure`, 68ch). Navigation links and tap targets are larger, focus outlines are stronger (3px), and the footer and card text are easier to read.
- **Text size control** (A−, A, A+) in the header top bar: five steps from 16px to 27px, saved in the browser, applied before first paint, available on every page. At larger sizes the desktop navigation switches to the menu button so nothing overlaps. Verified with no horizontal overflow at every size on phone, tablet, and desktop; at 200% browser zoom; and with the browser's text-only font size set to 200%.
- **High contrast mode**: a toggle that is remembered. It follows the operating system's "increase contrast" setting until the visitor makes a choice. Standard appearance remains the default. Uses darker brand tones, underlined links, solid borders, and a yellow-and-black focus ring. Windows forced-colors mode is respected.
- **Navigation**: new accessible mobile menu (button with expanded state, Escape to close with focus returned, closes on navigation, large links, current-page indication), visible "Step X of 6" in the booking wizard, a "How booking works" guide on the Schedule page, and a skip link that stays first in tab order.
- **Call Kindred**: a click-to-call button shown next to "Schedule a Visit" (header bar, homepage hero, call-to-action bands, Schedule, Contact, mobile menu) only when a business phone number is set in Admin > Settings. No number is invented.
- **Our story**: "Why Kindred Exists" on the About page (copy as provided, presented as personal motivation) and "A Little More Than Technology Support" on the homepage with a link to it. The optional owner photo slot now sits beside the story and shows text only until a real photo is assigned.
- **Tests**: new `e2e/readability.spec.ts` (text size and persistence, high contrast and OS preference, keyboard focus, mobile menu, Call button visibility, story sections, axe scans in high contrast and at the largest text size, and booking on a phone at the largest text size). 241 unit and integration tests and 37 end-to-end tests pass, and the production build passes.
