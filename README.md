# StockSense

An inventory workspace built by Volente Dynamics. Receive stock, reserve it for delivery, move it between locations, and reconcile physical counts with a complete movement history.

**Runs locally with no paid services, subscriptions, API keys, or cloud account.** The application, PostgreSQL database, and test email inbox all run on your computer. Internet is needed to download dependencies and push code to GitHub. A publicly hosted deployment is not included.

## Stack

- React 19, TypeScript, Vite 7, Tailwind CSS 4, Radix Dialog, Lucide icons
- TanStack Query, React Hook Form, Zod
- NestJS 11, Prisma 6, PostgreSQL 18
- HttpOnly session cookies, signed JWTs, bcrypt password hashes
- Nodemailer and Mailpit for local password reset email
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

### Password reset email

[Mailpit’s local inbox](http://127.0.0.1:8025) captures messages sent through local SMTP port 1025. Use `manager@stocksense.local` or `warehouse@stocksense.local` for the seeded accounts. Codes expire after 10 minutes, allow five attempts, and can be used once. Successful reset revokes previous sessions.

**Local messages do not reach external inboxes.** This makes the complete reset flow demonstrable without buying email service or supplying real email credentials. Mailpit binds to loopback and its installer verifies the official download’s SHA-256 checksum.

## What works

- Signup, login, logout, profile editing, and OTP password reset
- Manager-maintained products, categories, contacts, warehouses, storage locations, and reordering rules
- Opening stock recorded as an adjustment; units in pieces, kilograms, litres, or metres
- Live on-hand, reserved, and available quantities per product and location
- Receipts, deliveries, transfers, and physical-count adjustments
- Draft editing, cancellation, automatic references, scheduling, responsible staff, and notes
- List and status-based Kanban operation views, search, filters, and pagination
- Pick and pack steps for deliveries, printable completed documents
- Dashboard counts, overdue operations, low-stock alerts, replenishment suggestions, and recent activity
- Permanent signed movement history with before/after quantities and the validating user
- Responsive navigation and tables

## Inventory rules

Creating or confirming a receipt does not change physical stock. **Validation** adds it. Confirming a delivery or transfer reserves all its required stock if every line is available; otherwise the whole operation waits without reserving any line. Canceling an open operation releases its reservations. Delivery requires picking and packing before validation.

Transfers debit the source and credit the destination in one database transaction. Physical counts specify the **new total**, not a quantity to add. A count of 48 against recorded stock of 50 creates a `−2` movement. Counts become stale if another movement changes the balance; cancel and recount to continue. Counts below reserved stock are rejected.

All movement posting and reservations use serializable transactions with bounded conflict retries. A repeated validation request cannot apply stock twice. Completed documents cannot be edited or canceled. The ledger has no edit or delete API. Database constraints enforce nonnegative balances and ledger arithmetic. Available stock is `on hand − reserved`.

Managers maintain the catalog and adjustments. Staff can receive, deliver, and transfer goods. Newly registered accounts are staff; signup cannot grant manager permissions.

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

API tests cover concurrency, repeat validation, stock reservations, transfers, decimal units, stale counts, rollback, roles, CSRF checks, signup, reset codes, and ledger reconciliation. Browser tests cover the complete inventory lifecycle, filters, Kanban, mobile navigation, and staff permissions.

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
