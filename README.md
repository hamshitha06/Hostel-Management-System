# Roomies — Hostel Management System

A working student, warden and accountant portal with a Node.js HTTP backend and persistent SQLite database. The original team's HTML/CSS and background image are preserved in `legacy/`; the live client retains the original purple styling, hostel background image, top navigation, forms and card layout.

## Multiple-hostel update

The portal now supports independent hostel details, campuses, facilities, room catalogues, hostel-specific wardens, notice boards, dashboards, editable student profiles, and demonstration UPI/card/net banking payments with printable receipts. Accountants can filter reports by hostel and export payment methods in CSV.

See [the upgrade guide](docs/MULTI-HOSTEL.md) for warden assignments, migration and Command Prompt setup. Existing wardens must be assigned to hostels by an operator; they do not automatically receive access to every residence.

## Run on Windows

Install Node.js **24 or later**. No runtime packages, database service or compilation step is required.

```powershell
cd C:\Users\Hp\Downloads\Hostel-Management-System-final
Copy-Item .env.example .env
npm run build
npm test
npm start
```

Open **http://127.0.0.1:3000**. Keep the terminal running. Do not open HTML files directly or use Live Server: authentication and data require this backend. If working from another checkout, change the first path accordingly.

In Command Prompt use `copy .env.example .env` instead of `Copy-Item`. For an existing server on port 3001, stop it with Ctrl+C, run `set PORT=3001`, then `npm start`, and open **http://127.0.0.1:3001**. Do not replace an existing `.env`.

The database is initialized at `data/hostel.sqlite` on first start. Six fictional sample residences across two fictional campuses are available on a new database; rooms are empty and configurable; no fictitious residents or paid records are seeded. Fees are stored in paise and displayed in INR. SQLite's experimental warning on Node 24 is expected.

## Create staff accounts

Students register through the website with personal and academic details. Public registration cannot create staff. An operator with local database access provisions staff; there are no built-in passwords.

In a separate terminal in the same project directory:

```powershell
$staffSecret = Read-Host 'New staff password (12+ characters)' -AsSecureString
$env:STAFF_PASSWORD = [System.Net.NetworkCredential]::new('', $staffSecret).Password
npm run staff -- warden warden@example.edu "Hostel Warden"
Remove-Item Env:STAFF_PASSWORD
```

Repeat with role `accountant` and a separate email/password. Do not commit secrets or share staff credentials with students. The name/email examples above are placeholders; use the intended operator's details.

## Try the workflows

1. Register and sign in as a student. Search rooms and apply. View status/history under Bookings.
2. Sign in as a warden in another browser profile. Approve or reject applications. Approval reserves a bed for 24 hours.
3. As the student, submit a **demonstration** payment in Payments. A failed demonstration leaves the booking pending; success produces a receipt and confirms the allocation. Repeating success cannot charge or record twice. Then check in from Bookings.
4. Submit a facility complaint. Resolve it from the warden account.
5. Request departure after check-in. Warden approval releases the bed immediately. A rejected request keeps the room occupied.
6. Sign in as accountant to see receipts, date-filtered financial totals, current outstanding fees and CSV download.
7. Wardens can add hostels/rooms and edit room details; capacity cannot be reduced below occupied/reserved beds. Changes to room fees apply to future applications.

Notifications are displayed as booking history/status in the portal. No external email or SMS is sent.

## Payment boundary

`PAYMENT_MODE=demo` enables an explicitly labelled local demonstration ledger. **No money is transferred.** Do not enter bank/card details. Set `PAYMENT_MODE=disabled` to reject payments. A real gateway is not integrated; deployment for real fee collection requires provider-created orders, signed webhook verification, amount/currency checks, idempotency, failure/refund reconciliation and secure credentials before replacing demonstration verification. Client-submitted success must never be accepted as proof of a real payment.

## Organization and configuration

```text
public/             Live HTML, client JavaScript, shared CSS and images
server/             HTTP API, auth, role checks, schema and database access
server/staff.js     Local staff provisioning command
tests/              Real HTTP + SQLite integration tests
scripts/            Build validation
docs/               Specification audit, verification limits and API guide
legacy/             Preserved original static project
data/               Local database (ignored by Git)
```

`.env.example` documents `HOST`, `PORT`, `DATABASE_PATH`, `PAYMENT_MODE`, `COOKIE_SECURE`. Default binding is loopback. Sessions expire in 8 hours and logout revokes them server-side. Passwords use salted scrypt; only session-token hashes are stored. API mutations enforce CSRF and same-origin checks, login/registration are rate limited, input is bounded and SQL uses parameters. Client text is escaped and browser security headers restrict scripts to local files.

Before hosting for other users, configure HTTPS and `COOKIE_SECURE=true`, disable demonstration payments, protect database/file access and backups, and assess deployment/security needs. Keep the database on a local disk for this single-process assignment; do not run replicas sharing a network filesystem. Keep host clock accurate; report timestamps and payment deadlines use UTC internally.

For backups, stop the server cleanly, then copy the whole `data/` directory to protected storage. Restore with the server stopped. Never publish `.env`, live database files or backups. To reset a disposable demo, stop the server and move `data/` to a backup directory; next startup creates an empty database. User data is never automatically deleted.

## Verification

Run `npm run build` and `npm test`. Tests use temporary databases and never modify your application data. All 16 tests pass. The tests cover version-1 migration/backup, hostel isolation, staff assignment/revocation, all three payment methods, and complete HTTP booking/payment/complaint/vacating flows, roles, CSRF, isolation, concurrency/capacity guards, persistence, invalid transitions and timeout handling.

See [the audit](docs/AUDIT.md) for all 15 requirements and diagram mapping, and [API details](docs/API.md). Browser click-through and visual testing were blocked by the browser tool's local connection timeout. Real payments, external notifications and production deployment are unverified.

## Team

ROOMIES: Hamshitha P, Jothsna Kishore, Tarikha S.


UI correction: the original welcome screen, header, original three unchanged stylesheets and photo background are restored. The sidebar/maroon redesign was removed. All multi-hostel, warden, payment, notice and reporting functionality is retained.
