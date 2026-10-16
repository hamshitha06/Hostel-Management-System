# Roomies — Hostel Management System

A hostel portal for **students, wardens and accountants**, built with Node.js and SQLite. It retains the original purple theme, hostel background, top navigation and card layout.

## Features

| Role | Available features |
| --- | --- |
| Student | Register, explore hostels, select a room, track booking approval, pay the approved booking fee, view receipts, submit complaints, request departure, read notices and edit profile details |
| Warden | Manage assigned hostels and rooms, review applications, view room residents, update complaint statuses, approve/reject vacating requests, view vacated-resident history and publish notices |
| Accountant | View payment records, filter financial reports by hostel/date, review outstanding fees and export CSV reports |

- Multiple hostels, campuses, room types, capacities, facilities and fees.
- Hostel-specific warden access, enforced by the backend.
- Persistent bookings, receipts, complaints and vacating requests.
- UPI, debit/credit card and net banking **demonstration** payments.
- Dates and times displayed in **IST (Asia/Kolkata)**, including receipts and CSV exports.

## Requirements

- **Node.js 24 or later**, with npm and built-in SQLite support.
- Git, if cloning or pushing the repository.

No runtime packages or separate database server are required. The build command validates the source; no compilation step is needed. Node 24 may display an experimental SQLite warning.

## Get the project

```bash
git clone https://github.com/hamshitha06/Hostel-Management-System.git
cd Hostel-Management-System
```

If you already have the project, use that folder instead of cloning another copy. Each copy has its own local database.

## Run on Windows — Command Prompt

For the existing Downloads folder:

```cmd
cd /d "C:\Users\Hp\Downloads\Hostel-Management-System"
if not exist .env copy .env.example .env
npm run build
npm test
set PORT=3001
npm start
```

Open **http://127.0.0.1:3001** and leave the terminal running. Stop the server with **Ctrl+C**. After backend changes, restart it; after page updates, refresh the browser with **Ctrl+F5**.

The commands above are for **Command Prompt**. In Git Bash, use `cd /c/Users/Hp/Downloads/Hostel-Management-System` and start with `PORT=3001 npm start`. In PowerShell, use `$env:PORT='3001'` before `npm start`; copy the configuration with `Copy-Item .env.example .env` only if `.env` does not already exist.

Do not open HTML files directly or use Live Server. The website needs its Node.js backend for authentication and data. If port 3001 is occupied, stop the earlier server or choose another port. Without an override, `.env.example` uses port 3000.

## Accounts and hostel assignments

Students create their own accounts through **Register**. All roles use the same **Login** form; the saved account role determines the portal. There are no default staff accounts or passwords.

### Create a warden

Open a second Command Prompt in the project folder. Replace the password placeholder with a unique password of **12–128 characters**:

```cmd
set "STAFF_PASSWORD=ReplaceWithYourOwnLongPassword"
npm run staff -- warden warden@example.edu "Hostel Warden" 1
set STAFF_PASSWORD=
```

The final `1` assigns this warden to hostel ID 1. Log in with the email and password used above. The email/name are examples, not pre-existing credentials. Setting `STAFF_PASSWORD` again does not change an account that has already been created.

To list hostel IDs, run `npm run assign`. Assign another hostel to an existing warden with:

```cmd
npm run assign -- warden@example.edu 2
```

To revoke that assignment:

```cmd
npm run assign -- warden@example.edu 2 remove
```

A warden may manage multiple hostels, and a hostel may have multiple wardens. Existing hostels require an operator assignment; newly created hostels are assigned to their creator. An unassigned warden cannot access other hostels' records.

### Create an accountant

```cmd
set "STAFF_PASSWORD=ReplaceWithAnotherLongPassword"
npm run staff -- accountant accountant@example.edu "Hostel Accountant"
set STAFF_PASSWORD=
```

Do not add a hostel number when creating an accountant.

## Main workflows

### Room booking and payment

1. **Student:** open Rooms, choose a hostel/type and click **Select this room**.
2. Review the selected room and click **Confirm selection & send to warden**.
3. **Assigned warden:** approve or reject the application in Bookings.
4. Approval reserves a bed for **24 hours** and changes the booking to **Payment pending**.
5. **Student:** open Payments and pay the fee for that approved booking. Choose UPI, card or net banking.
6. Successful demonstration payment saves a receipt and confirms the room in the database. Failed payment leaves it pending for retry. Repeating a successful request does not create another receipt.
7. The student can check in from Bookings. The Rooms page continues to show the selected room and status; assigned wardens can see checked-in residents and reserved allocations.

Selecting a room alone does not allocate it. A payment-history example is not evidence of payment against an actual booking. Only the approved booking's checkout confirms the allocation. Reservations expire if payment is not completed before the deadline.

### Complaints

- **Student:** open Complaints, choose the hostel if not already allocated, write the issue and click **Send complaint to warden**.
- The complaint is saved with the student's identity and routed to the hostel's assigned wardens. A current allocation determines the hostel automatically.
- **Warden:** open Complaints and use **Refresh complaints** to load new submissions. Student ID, department, contact details, hostel and room are shown where available.
- Use **Edit status** to resolve or reopen a complaint. Resolving requires a resolution note. Students see the saved status and reply in their complaint history.

### Vacating requests and history

- A student needs a **confirmed or occupied room allocation** to request departure.
- Open Vacate. The allocated room is filled automatically; enter a departure date and reason, then click **Send vacating request to warden**.
- If approval/payment is still pending, the page shows the selected room and the next action instead of an unusable room selector.
- **Assigned warden:** open Vacate, refresh requests and choose **Approve** or **Reject**.
- Approval releases the room immediately and adds the resident to **Vacated residents history**, with student details, hostel, room and the recorded vacating time in IST. Rejection keeps the allocation active.
- Pending requests and decisions remain available after reloading because they are stored in SQLite. Duplicate pending requests are blocked.

The requested departure date is a preference, not an automatic future checkout. Wardens should approve when the allocation is to be released.

### Notices and reports

Wardens publish notices for their assigned hostels. Students can read the notice board. Illustrative student notices and historical payment examples may appear in the interface; they are separate from saved operational records.

Accountants can generate reports by hostel/date, view received and outstanding fees, and download CSV files. Date-only report filters use the stored UTC dates; timestamps shown in the interface and exports are converted to IST.

## Payment scope

**This project does not transfer real money.** `PAYMENT_MODE=demo` simulates payment verification; `PAYMENT_MODE=disabled` rejects payment attempts. Do not enter real card numbers, CVVs, bank passwords or UPI PINs.

The approved-booking payment is recorded in SQLite and updates booking status. A production payment gateway, signed webhook verification, refunds and bank reconciliation are not implemented.

## Configuration and database

| Setting | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Local interface to listen on |
| `PORT` | `3000` | Server port; the instructions above override it to 3001 |
| `DATABASE_PATH` | `data/hostel.sqlite` | Persistent database location |
| `PAYMENT_MODE` | `demo` | Demonstration payments or `disabled` |
| `COOKIE_SECURE` | `false` | Set to `true` when hosting behind HTTPS |

The database is created on first start. A fresh database contains six fictional residences across two fictional campuses, with configurable rooms and fees. It does not create staff credentials or paid allocations. Schema version 1 is backed up before its transactional upgrade to version 2.

Passwords are stored using salted scrypt hashes. Sessions are stored server-side with hashed tokens, expire after eight hours and are revoked on logout. The API checks roles, hostel assignments, CSRF tokens and record ownership. Public registration creates students only.

For a consistent backup, stop the server and copy the entire `data/` directory to protected storage. Restore with the server stopped. Never commit `.env`, live database files or backups. These are excluded by `.gitignore`.

## Project structure

```text
public/          Live HTML, JavaScript, CSS and image assets
server/          HTTP API, authentication, database and schema migration
server/staff.js  Staff account creation
server/assign.js Warden-to-hostel assignment
scripts/         Build validation
tests/          HTTP and SQLite integration tests
docs/           API reference, specification audit and upgrade notes
legacy/          Preserved original static pages and assets
data/           Local database; ignored by Git
.env.example     Configuration template without credentials
```

## Verification and limitations

```cmd
npm run build
npm test
```

The published folder passed build validation and **16 automated tests**. Coverage includes hostel isolation, staff assignments, authentication/CSRF, booking approval, payment methods, complaints, vacating, capacity constraints, database migration and persistence. Tests use temporary databases rather than application data.

The welcome/login interface was visually checked. Complete browser testing, live gateway payments, external email/SMS and production deployment have not been verified. This is a local assignment application; review hosting security and operational requirements before using it for real residents or fee collection.

The [API reference](docs/API.md), [initial specification audit](docs/AUDIT.md) and [multi-hostel upgrade notes](docs/MULTI-HOSTEL.md) provide additional detail. Older audit entries describe earlier versions; this README describes the current project.

## Team — ROOMIES

- Hamshitha P
- Jothsna Kishore
- Tarikha S
