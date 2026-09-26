# StockSense

An inventory workspace built by Volente Dynamics. Receive stock, reserve it for delivery, move it between locations, and reconcile physical counts with a complete movement history.

**Runs locally with no paid services, subscriptions, API keys, or cloud account.** The application, PostgreSQL database, and test email inbox all run on your computer. Internet is needed to download dependencies and push code to GitHub. A publicly hosted deployment is not included.

## Stack

- React 19, TypeScript, Vite 7, Tailwind CSS 4, Radix Dialog, Lucide icons
- TanStack Query, React Hook Form, Zod
- NestJS 11, Prisma 6, PostgreSQL 18
- HttpOnly session cookies, signed JWTs, bcrypt password hashes
- Nodemailer for Gmail SMTP or a local Mailpit test inbox
- Jest, Supertest, and Playwright

## Start on Windows

Prerequisites: free Node.js 22.12+ (Node 24 recommended) and PostgreSQL 18 binaries. Put PostgreSQL’s `bin` folder on PATH. The setup script creates an **independent cluster on port 55432** inside this project; it does not use or reconfigure a system database service. Run commands from the repository root.

```powershell
npm ci
npm run local:setup
npm run db:generate
npm run db:migrate
npm run db:seed
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-mailpit.ps1
npm run local:start
npm run dev
```

Open [StockSense](http://127.0.0.1:5173). The API listens on `127.0.0.1:3001`. Seeded accounts:

| Role              | Login ID    | Initial local demo password |
| ----------------- | ----------- | --------------------------- |
| Inventory manager | `manager`   | `StockSense!2026`           |
| Warehouse staff   | `warehouse` | `StockSense!2026`           |

`local:setup` generates random database credentials and a JWT secret in the ignored `apps/api/.env`. The documented passwords are for the synthetic local demo accounts, not credentials for any external service. Change `DEMO_PASSWORD` **before the first seed** to use another demo password. Rerunning the seed preserves an existing database.

On later launches, run `npm run local:start` followed by `npm run dev`. Stop the development servers with Ctrl+C, then run `npm run local:stop` to stop the project’s database and Mailpit. Do not delete `.local/postgres` if you want to keep your inventory data. Back it up with PostgreSQL’s `pg_dump` before transferring the workspace.

### Email verification and password reset

[Mailpit’s local inbox](http://127.0.0.1:8025) captures messages sent through local SMTP port 1025. Use `manager@stocksense.local` or `warehouse@stocksense.local` for the seeded accounts. Codes expire after 10 minutes, allow five attempts, and can be used once. Successful reset revokes previous sessions.

**Local messages do not reach external inboxes.** Mailpit binds to loopback and its installer verifies the official download's SHA-256 checksum. Automated tests always force local email mode, even when Gmail is configured for the demo.

New accounts start as unverified, pending staff. Signup sends a verification code, without creating a session. The user enters the code and their account password, then a manager approves access in **Settings > Team**. The manager can disable accounts or change roles; each change ends their existing sessions. A manager cannot change their own access, and the server preserves an active manager. The two synthetic seeded accounts are preverified; real accounts are not.

For real Gmail delivery at no added service cost, run this locally and enter a Gmail address plus its app password at the hidden prompt. Never put these credentials in chat or GitHub:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configure-gmail.ps1
node scripts/check-email.cjs
```

Restart `npm run dev` afterward. The connection checker tests SMTP authentication without sending a message. Then sign up with a real recipient address and complete verification to test inbox delivery. Check spam if necessary. Ordinary Gmail passwords will not work; see [Google's app-password instructions](https://support.google.com/mail/answer/185833?hl=en). App passwords require 2-Step Verification and may be unavailable under account restrictions. Gmail's normal sending limits apply. StockSense does not purchase a plan or enable billing.

The script sets `MAIL_MODE=smtp`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, and `SMTP_SECURE=true` in the ignored API environment file. SMTP credentials stay on the API. External STARTTLS connections require TLS; certificate verification stays enabled. See [Nodemailer's SMTP documentation](https://nodemailer.com/smtp). Set `MAIL_MODE=local` and restart to return to the test inbox. If signup reports a mail failure after creating an account, choose **Verify an existing account** on the sign-in page and resend the code after fixing the sender.

## What works

- Signup with email verification and manager approval, login, logout, profile editing, OTP password reset, and team access management
- Manager-maintained products, categories, contacts, warehouses, storage locations, and reordering rules
- Opening stock recorded as an adjustment; units in pieces, kilograms, litres, or metres
- Live on-hand, reserved, and available quantities per product and location
- Receipts, deliveries, transfers, and physical-count adjustments
- Draft editing, cancellation, automatic references, scheduling, responsible staff, and notes
- List and status-based Kanban operation views, search, filters, and pagination
- Pick and pack steps for deliveries, printable completed documents
- Dashboard counts, overdue operations, low-stock alerts, replenishment suggestions, and recent activity
- Permanent signed movement history with before/after quantities and the validating user
- Locally hosted Inter typography, larger controls, fixed navigation and account actions, keyboard-accessible mobile drawer, persistent filters and Kanban view, breadcrumbs, and unsaved-form warnings

## Inventory rules

Creating or confirming a receipt does not change physical stock. **Validation** adds it. Confirming a delivery or transfer reserves all its required stock if every line is available; otherwise the whole operation waits without reserving any line. Canceling an open operation releases its reservations. Delivery requires picking and packing before validation.

Transfers debit the source and credit the destination in one database transaction. Physical counts specify the **new total**, not a quantity to add. A count of 48 against recorded stock of 50 creates a `−2` movement. Counts become stale if another movement changes the balance; cancel and recount to continue. Counts below reserved stock are rejected.

All movement posting and reservations use serializable transactions with bounded conflict retries. A repeated validation request cannot apply stock twice. Completed documents cannot be edited or canceled. The ledger has no edit or delete API. Database constraints enforce nonnegative balances and ledger arithmetic. Available stock is `on hand − reserved`.

Managers maintain the catalog, team access, and adjustments. Staff can receive, deliver, and transfer goods. Newly registered accounts are pending staff; signup cannot grant manager permissions or inventory access.

## Verify

Keep the local PostgreSQL and Mailpit processes running while testing. The API suite exercises real SMTP delivery to the local inbox as well as the database.

```powershell
npm run typecheck
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Run API tests and browser tests **sequentially**. Both use `stocksense_test` on local port 55432 and reset only that named test database. URL guards reject development databases and remote hosts. Browser tests start their own API on port 3002 and frontend on 5174; they do not alter the demo inventory. Build the API before browser tests after any backend change.

API tests cover concurrency, repeat validation, stock reservations, transfers, decimal units, stale counts, rollback, roles, CSRF checks, email verification, access approval/revocation, mail failure recovery, rate limits, input boundaries, reset codes, and ledger reconciliation. Browser tests cover authentication through approval and reset, catalog setup, inventory lifecycle, draft editing and cancellation, filters, Kanban, network recovery, mobile/keyboard navigation, staff permissions, and automated WCAG checks. Tests produce local reports; see `docs/quality-review.md` for scope and limitations.

The reviewed test catalog contains **151 scenarios**. The recorded run passed **33 API tests and 14 browser tests**, plus three live Gmail flows (15 assertions), covering 139 catalog scenarios; 12 manual checks remain explicitly unexecuted. The live run confirmed both messages in the configured Gmail inbox, successful code use, old-session revocation, and code-reuse rejection. Its sanitized evidence is in `docs/gmail-execution.json`. `docs/test-case-catalog.json` holds the steps and expected results, and `docs/test-execution.json` records the executed test names and source fingerprint. To regenerate the tabular PDF after a fresh run, capture API results with `npm run test -w @stocksense/api -- --json --outputFile=../../.local/api-test-results.json`, run browser tests, then use `python scripts/build_test_document.py --output <report.pdf>` with the free ReportLab package installed.

`npm run dev` recompiles API source on changes and serves the UI with hot reload. To inspect production output locally, run `npm run build`, then `npm run start -w @stocksense/api` and `npm run preview -w @stocksense/web -- --port 5173`. This local HTTP workflow uses development cookie settings; an actual HTTPS deployment requires its own secure configuration.

## Repository layout

```text
apps/api/       NestJS API, PostgreSQL schema, migrations, demo seed, integration tests
apps/web/       React interface, shared components, and styles
scripts/        Local database/mail setup and isolated browser-test servers
tests/          Browser workflow tests
docs/           Architecture, requirement mapping, and demo walkthrough
```

Local environment files, database files, test output, dependencies, and private analysis notes are excluded from Git. The app is intentionally one workspace; there is no tenant isolation or production hosting configuration. Backorders, serial/lot tracking, multi-currency valuation, tax invoicing, POS, and payment processing are outside this inventory scope.
