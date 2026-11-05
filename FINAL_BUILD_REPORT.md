# Final Build Report: Kindred Tech Support

Date: 2026-11-05. Branch: `ccr-4db24d50-xiczse`.

The application runs locally against a real PostgreSQL database with migrations, seed data, and automated tests. It has **not** been deployed (no Railway credentials were available), and **no live Stripe, Resend, or maps calls have been made** (no keys were available). Those integrations are written and tested with signed fixtures or fake providers, as described below.

## Verification summary

| Check | Result |
| --- | --- |
| TypeScript (`tsc --noEmit`) | 0 errors |
| ESLint | 0 errors, 0 warnings |
| Unit and integration tests (Vitest, real Postgres) | 206 passed, 0 failed (22 files) |
| End-to-end (Playwright, dev server) | 19 passed, 0 failed (17 functional plus 2 axe-core accessibility scans) |
| End-to-end against the production build | 17 functional tests passed |
| Production build | Passes, including with no database reachable at build time |
| Background worker | Smoke-tested; processed every job type |

## 1. Fully implemented and tested

"Tested" means covered by automated tests and/or exercised in a real browser against the running app.

**Foundation and security**
- PostgreSQL schema (about 45 models) with Prisma migrations. Includes a database-level exclusion constraint that makes overlapping technician bookings impossible, plus check constraints.
- Authentication: email and password (scrypt hashes), one-time email sign-in links (no-password option for customers), password reset, account lockout after repeated failures, database sessions in httpOnly cookies (12 hours for staff, 14 days for customers), sign-out of other sessions on password change.
- Role-based permissions (Owner, Admin, Dispatcher, Technician, Customer, Facility Contact), enforced on the server in every page and action. Tests and e2e confirm that technicians, dispatchers, customers, and facility contacts are refused areas they should not see.
- Input validation (zod), database-backed rate limiting (login, booking, forms, public APIs), audit log with sensitive fields stripped, security headers, honeypots on public forms, CSV formula-injection protection.
- Data retention job (communications, audit log, jobs, expired sessions and tokens), configurable in Settings.

**Public website**
- Home, Services, the 8 service pages, Senior Living, Pricing, About, Service Areas, Schedule a Visit, Contact, FAQ (21 questions), Privacy, Terms, Accessibility, 404.
- Prices come from the database. Contact details come from Settings and are hidden until entered. No invented testimonials, certifications, staff, phone numbers, or addresses.
- SEO: per-page metadata and canonical URLs, sitemap.xml, robots.txt, JSON-LD (business, services, FAQ).
- Contact form and facility inquiry form (saved, rate-limited, spam-protected), and marketing unsubscribe.
- Accessibility: axe-core reports no WCAG 2.0, 2.1, or 2.2 A/AA violations on 20 public and signed-in pages. The site has a 18px base font, skip links, visible focus, labelled fields, and an error summary in the booking wizard. Phone layouts have no horizontal scrolling (tested).

**Booking**
- Six-step wizard: service, who it is for (self or family member), address with live service-area check, details (add-ons, extra time, discount code), live available times, review with a server-calculated estimate, terms. No account needed.
- Availability respects business hours, technician schedules, travel buffers, existing bookings, Tech Help Days, holidays and blocked dates, technician time off, minimum notice, and the booking horizon.
- Double booking is prevented by advisory locks plus the database constraint. A test fires 6 simultaneous bookings for one slot and exactly one succeeds.
- Approval workflow (Requested, then Confirmed), out-of-area requests flagged for review, and statuses Requested, Confirmed, Assigned, En Route, In Progress, Completed, Canceled, No-Show with enforced transitions and history.
- Secure self-service reschedule and cancel through a tokenized link and the customer portal, with the cancellation cutoff enforced.
- Family members who book are recorded as authorized contacts who can pay or receive updates but cannot see private details.

**Admin**
- Dashboard (today, upcoming, pending requests, monthly revenue, outstanding invoices, active memberships and MRR, recent customers, upcoming facility visits, new leads, invoice requests).
- Calendar (day, week, and month views, technician filter, help days and closures shown).
- Appointments: list and filters, detail, confirm, assign, reschedule (optional outside-hours override that still cannot overlap), cancel, notes, history, email log, invoice from estimate, manual booking for phone calls.
- Customer CRM: contact info and preferences, multiple addresses, authorized family contacts with separate permissions (schedule, pay, receive updates, view details), devices, appointment and service history, technician notes, membership, invoices and payments, consent records, communication history, logging calls and notes.
- Global search (customers, appointments, invoices, facilities) and a messages and leads inbox.
- Services and pricing (fixed, starting-at, and custom-quote pricing; extension blocks; add-ons; bundles; discounts; service areas with travel fees), technicians (schedules, time off), business closures and holidays, settings (business info, hours, booking rules, cancellation policy, billing, notifications, privacy, integration status), users and roles (cannot remove the last owner), email templates (editor, live preview, test send), communications log and job queue (retry, run now), audit log.
- Reports, all with CSV export: revenue, by service, by technician, by facility, appointments, average ticket, repeat customers, membership MRR and churn, cancellations, outstanding invoices with aging, technician utilization, travel mileage, lead sources, booking conversion. A test checks that unverified payments are not counted as revenue.

**Technician portal (mobile-first, installable)**
- Today and week views, Google Maps directions, tap-to-call, status updates (En Route, In Progress, Completed, No-Show), work timer, checklist, troubleshooting notes and visit summary, customer-approved additional work (approval required), signature capture (drawn or typed), completion, and invoice request.
- Technicians can see only their own assigned jobs and only field-relevant details. No billing data is shown. Tested.
- Subscription Review & Savings: customer authorization is required first and recorded as consent. For each subscription it records category, price, frequency, decision, cancellation help, estimated savings (labelled "not guaranteed"), and follow-up. On-screen reminders say never to ask for banking passwords.

**Dispatch and routing**
- Day dispatch board per technician: assign unassigned jobs (with a nearest-technician hint), visit order with manual override (move up or down), "Open route in Google Maps" links, nearby-job grouping, and a schematic map of saved coordinates.
- Confirmed appointment times are never moved. Tight connections are flagged, not "fixed."
- Without a maps key, a clearly labelled manual mode shows no travel estimates. With a key, the code geocodes addresses and calculates drive times and mileage; this was tested with a fake provider (see section 2).

**Billing**
- Invoices: draft, edit lines, issue, public pay link, void, deposits, discount lines, tax, bill to an authorized family payer, print view. Manual cash or check payments are recorded with an overpayment guard, and the status is derived (unpaid, partially paid, paid, refunded).
- Stripe webhook processing is signature-verified and idempotent. Tested with real signed payloads: duplicate delivery, unpaid sessions, failed payments, subscription renewal and failure, cancellation, and refunds.
- Public pay page shows "confirming" rather than "paid" until the webhook verifies the payment.

**Memberships (Kindred Care, $49/month)**
- Configurable plans (priority scheduling, remote-minute allowance, annual review, in-home discount; never unlimited visits). Statuses: pending, active, past due, paused, canceled. Manual activation for offline billing, a family member can purchase for a parent, usage tracking with allowance enforcement (safe under concurrent requests), one annual review per membership year, MRR and churn. Member discounts apply to booking estimates.

**Senior living**
- Facility CRM (type, address, contacts by role, partnership status, the four partnership models, facility-specific rates, agreements with renewal dates, internal notes, residents, invoices, session requests), inquiry-to-facility conversion, and portal invitations.
- Tech Help Days: single or recurring (weekly, every other week, monthly on the nth weekday). Conflicting dates are listed, not moved. Slot grid; resident booking by staff or through a public sign-up page; overlapping slots are prevented (concurrency tested); facility-sponsored and contract days are free to residents; sponsored-day and monthly-contract invoices (no duplicates); cancellation with resident notifications; printable sign-up sheet.
- Facility portal: schedule, request more sessions, invoices (if permitted), agreement, promotional flyer and newsletter text, aggregate usage only. Tests confirm no resident names or details are exposed and that other facilities' data is inaccessible.

**Customer portal**
- Overview, appointments (reschedule and cancel within the policy), billing and membership, support requests, profile and marketing preferences (consent recorded). Family members see only what the customer permitted. Tested.

**Email and jobs**
- 18 editable templates covering every requested message (booking received, confirmation, reminder, rescheduled, canceled, technician on the way, completed, invoice issued, payment receipt, review request, membership welcome, payment failure, facility inquiry received, Tech Help Day confirmation, contract renewal reminder), plus sign-in links, a staff notification, and a sample marketing template.
- Merge variables with HTML escaping, a durable queue with retries, backoff, idempotency, and dead-lettering, and a delivery log. Transactional and marketing messages are kept separate; marketing requires consent and includes unsubscribe links and the List-Unsubscribe header.
- Periodic jobs: appointment reminders, review requests (off by default), facility renewal reminders, and data retention.

## 2. Implemented but requiring credentials

These are written and covered by tests with signed fixtures or fake providers, but have **never been run against the real service**.

| Feature | Needs | What was tested |
| --- | --- | --- |
| Card payments through Stripe Checkout (invoices, deposits) | `STRIPE_SECRET_KEY` | Code paths compile; checkout creation was not called |
| Stripe webhooks | `STRIPE_WEBHOOK_SECRET`, endpoint in the Stripe dashboard | Signature verification and event handling with real signed test payloads |
| Card refunds | Stripe keys | Refund records and webhook finalization (fixtures) |
| Membership subscriptions, Stripe billing portal | Stripe keys, Billing Portal configured | Webhook lifecycle (fixtures) |
| Sending email | `RESEND_API_KEY`, `EMAIL_FROM` (verified domain), `EMAIL_DELIVERY_MODE` | Rendering, queueing, retry and idempotency with a fake provider; the "skipped, not configured" path |
| Geocoding, drive times, mileage | `GOOGLE_MAPS_API_KEY` or `MAPBOX_ACCESS_TOKEN` | Route calculation, late-arrival flags, and mileage with a fake provider |
| Railway deployment | Railway account | Docker build steps match the verified local build; the image itself was not built here |

## 3. Partially implemented

- **File storage (S3):** environment variables and an integration-status indicator exist, but nothing uploads files yet. Signatures are stored as small PNG data URLs in the database, and the logo is a built-in SVG (a logo URL can be set in Settings).
- **SMS:** shown as "not implemented" in Settings. Templates and the communications log are channel-aware, ready for a provider.
- **Map display:** the dispatch map is a schematic diagram drawn from coordinates, not an interactive street map. The "Open in Google Maps" links give full navigation.
- **Route optimization:** with a provider, flexible stops are inserted where they add the least driving and the order is then refined. All booked appointments are treated as fixed times, so in practice the suggested order is chronological and the value is in drive-time feasibility checks, technician suggestions, and job grouping. There is no automatic time-slot suggestion for unconfirmed requests.
- **PWA:** web manifest and icons are in place, so the technician portal is installable. There is no service worker or offline mode.
- **Technician service areas:** the `serviceAreaIds` field exists, but there is no editor and availability does not filter by territory yet. All technicians serve all areas.
- **Admin work orders** are read-only apart from creating the invoice. Technicians edit them in the field.

## 4. Not implemented

- Real deployment, domain, DNS, or production email domain. Nothing was purchased or activated.
- Website analytics. Booking conversion is measured from bookings, not visitors.
- Moving a booked Tech Help Day resident to another slot (staff cancel and rebook instead).
- Stripe disputes, `checkout.session.expired`, and asynchronous payment failure events.
- Multi-facility switching for one facility-portal login (the first linked facility is shown).
- A QR code on facility flyers (the sign-up link is printed as text).

## 5. Known defects and limitations

1. When a family member pays for a membership, their card attaches to the senior's Stripe customer (one Stripe customer per CRM customer). The Stripe billing portal is available only to the account holder.
2. `Invoice.stripePaymentLinkUrl` stores the full pay URL, including the raw pay token. Only a hash of the token is used for lookups, but anyone with database read access can see working pay links. Treat database access as sensitive, or remove that column's use.
3. After some technician and membership admin actions, the success message disappears because that form is replaced by the new state; the page itself shows the updated state.
4. If the status change succeeds but the work-order update fails during job completion, the appointment and work order can disagree. The two steps are not in one transaction.
5. Seeded Tuscarawas County ZIP codes should be verified. Some ZIPs cross county lines.
6. Privacy Policy and Terms of Service are reasonable templates marked as needing review by the owner and a lawyer.
7. Rate limits rely on the hosting proxy adding the client IP to `X-Forwarded-For`; this is correct on Railway. Behind a different proxy, check this.

## 6. Required manual setup

1. **Railway:** create the project, Postgres, the web service, and the worker service (`npm run worker`), and set the environment variables (see README, "Deploying to Railway").
2. **Seed** once with `SEED_OWNER_EMAIL` and `SEED_OWNER_PASSWORD` set, sign in, and change the password if needed.
3. **Admin > Settings:** enter the business phone, email, address (and whether to show it), hours, booking rules, cancellation policy, tax rate (Ohio service tax rules may apply; confirm with an accountant), admin notification email, and review URL.
4. **Admin > Services & Pricing:** confirm prices, durations, and service areas and ZIPs. Add travel fees if wanted.
5. **Admin > Technicians:** set your working schedule and home base, and add holidays and closures.
6. **Stripe:** create the account, set the keys, add the webhook endpoint with the events listed in the README, configure the Billing Portal, and optionally create a Price for Kindred Care and enter it on the plan.
7. **Resend:** verify the sending domain and set `EMAIL_FROM`. Use `EMAIL_DELIVERY_MODE=allowlist` with your own address to test, then switch to `live`.
8. **Maps:** create a Google Maps Platform key restricted to the Geocoding and Distance Matrix APIs (or a Mapbox token).
9. **Backups:** enable Postgres backups and test a restore.
10. **Legal and content review:** Privacy Policy, Terms, About page, FAQ answers, and the facility-inquiry promise to respond "within two business days."
11. **Do not claim HIPAA compliance.** The app avoids collecting medical information but has not had a formal assessment.
