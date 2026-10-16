# API and data model

Requests and responses use JSON. Mutations require `Content-Type: application/json`. Login returns a session cookie and CSRF token; send that token as `X-CSRF-Token` for authenticated POST requests. `GET /api/me` restores the user/token after reload. Errors use `{ "error": "..." }` with an appropriate HTTP status. All money values are integer INR paise.

| Method / route | Access / purpose |
| --- | --- |
| GET /api/health | Database schema version and service health |
| POST /api/register | Public student registration; fields name, email, password, studentId, department, academicYear, phone |
| POST /api/login | Public email/password; returns user and csrf, sets session cookie |
| GET /api/me; POST /api/logout | Authenticated session |
| GET /api/hostels | Authenticated hostel metadata and room counts |
| POST /api/hostels; POST /api/hostels/:id | Warden create/update hostel (name, address) |
| GET /api/rooms?q=&available=1 | Authenticated filtered rooms with fee, capacity, occupancy, reserved, available |
| POST /api/rooms | Warden create room (hostelId, number, type, capacity, fee) |
| POST /api/rooms/:id | Warden update room (number, type, capacity, fee); cannot reduce below assigned beds |
| GET /api/bookings | Student's records or warden's full review list |
| POST /api/bookings | Student applies with roomId |
| POST /api/bookings/:id/approve | Warden reserves bed; sets 24-hour payment deadline |
| POST /api/bookings/:id/reject | Warden; reason required |
| POST /api/bookings/:id/cancel | Owner student, before payment |
| POST /api/bookings/:id/pay | Owner student; demo-only outcome success/failed; amount calculated on server |
| POST /api/bookings/:id/check-in | Owner student, confirmed booking only |
| GET /api/bookings/:id/events | Owner student or warden; notification/history trail |
| GET /api/payments | Owner student or all receipts for accountant |
| GET /api/complaints; POST /api/complaints | Student's complaints or warden's queue; student POST description |
| POST /api/complaints/:id/resolve | Warden; resolution required |
| GET /api/vacates | Student's requests or warden's queue |
| POST /api/vacates | Student; bookingId, reason, requestedDate (YYYY-MM-DD) |
| POST /api/vacates/:id/approve or /reject | Warden; approval releases occupied bed immediately |
| GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD | Accountant received payments and totals for date interval; current outstanding list |

The base schema is in `server/schema.sql`; the version-2 migration is in `server/db.js` and is applied automatically. New migration versions must preserve existing data. Do not edit an already-applied table definition and expect it to alter an existing database.

`BEGIN IMMEDIATE` serializes allocation decisions and payment/checkout transitions. A partial unique index prevents multiple active bookings per student. Payments are unique per booking; pending vacating requests are unique per booking. Foreign keys protect relationships. Occupancy is derived from booking states, avoiding independent counters that can drift. Existing booking fees are snapshots, so room-price changes do not alter already submitted applications.


## Version 2 additions and access rules

- `GET /api/hostels` includes campus, description, amenities, assigned warden names, availability, capacity and minimum room fee. Warden responses include only assigned hostels.
- `GET /api/rooms` accepts `hostelId`, `campus` and `type` in addition to text/availability filters. Wardens see only their assigned rooms.
- Warden mutations and booking histories check hostel assignment, including room edits, hostel edits, applications, complaints and departure decisions. An unassigned warden has no access to another hostel's records. Creating a hostel assigns its creator.
- Hostel create/update accepts `campus`, `description`, `amenities` (comma-separated facilities).
- `POST /api/bookings/:id/pay` accepts `method: upi|card|netbanking` with `outcome: success|failed`. Old clients default to UPI. Real card/PIN/password fields are rejected; payment details are never collected. Existing receipts migrate with `method=unspecified`.
- `GET /api/reports` accepts `hostelId`; the hostel filter applies to both received and current outstanding fees, while dates filter only received payments.
- `GET /api/dashboard` returns role-appropriate summary counts without exposing another student's records or another warden's hostels.
- `GET /api/notices?hostelId=...` lists up to 100 recent hostel notices. Wardens see only their hostels; students/accountants may read the notice board. `POST /api/notices` is restricted to an assigned warden and accepts hostelId, title, body.
- `POST /api/profile` lets students edit name, phone, department and academicYear, without changing student ID, email or role.

`warden_hostels` supports multiple wardens per hostel and multiple hostels per warden. Assignment is a local operator action (`npm run assign`), not a public API. Version-1 databases are backed up using SQLite `VACUUM INTO` before a transactional schema migration. Existing credentials, sessions, applications, complaints and receipts are retained. Existing complaints linked to rooms inherit their hostel; old unallocated complaints without any hostel remain preserved but need an operator to assign a hostel before a warden can see them.
