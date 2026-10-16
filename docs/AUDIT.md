# Initial audit and verification — 16 October 2026

The following records the initial delivery. See [the multi-hostel upgrade guide](MULTI-HOSTEL.md) for the latest changes and 16-test verification result.

## Baseline

The requested local folder `C:\Users\Hp\Downloads\SWE_ASSIGNMENT-4` contained a music-video HTML/CSS assignment and image assets. It was accessible but was not a copy of the hostel repository. Those files were preserved.

The GitHub repository's main branch contained nine static HTML pages, three stylesheets, one background image, and a README. Forms had no handlers; rooms, payments and dashboard records were hard-coded. There was no JavaScript, backend, database, authentication, role authorization or test suite. Original files are retained under `legacy/`; the supported application is served from `public/`.

## Specification

The referenced `/mnt/data/SWE_assignment-Roomies(1).pdf` was unavailable at that Linux path. A matching filename was found at `C:\Users\Hp\Downloads\SWE_assignment-Roomies(1).pdf`. All 15 requirements were extracted from page 2, and all diagram pages 3–8 were rendered and visually inspected. The PDF itself is not published in this repository.

| Requirement on page 2 | Implementation | Verification |
| --- | --- | --- |
| 1. Personal and academic registration | Name, email, phone, student ID, department, academic year | HTTP integration test |
| 2. Secure student login | Salted scrypt passwords, hashed server sessions, HttpOnly cookies, CSRF tokens | Login, invalid credentials, expiry, logout, CSRF tests |
| 3. Search available rooms | Search hostel/room/type, available-only filter | HTTP search test |
| 4. Book available room | Student application with one active booking | Booking and duplicate tests |
| 5. Update availability | Reserved + confirmed + occupied beds deducted transactionally | Capacity, payment, vacating tests |
| 6. Warden approval/rejection | Protected approval and reasoned rejection | Role and decision tests |
| 7. Fee payments | Explicit local demonstration payment, failed/success paths; disabled mode | Demonstration and disabled-mode tests; real payments NOT integrated |
| 8. Maintain payment records | Immutable unique receipt per booking, server-calculated fee | Retry and amount-tampering tests |
| 9. Submit complaints | Student complaints linked to allocated room when present | HTTP submission/isolation tests |
| 10. Warden resolution | Resolution text and resolving staff stored | HTTP resolution/role tests |
| 11. Vacating requests | Occupied booking, preferred date, reason | HTTP submission/validation tests |
| 12. Warden vacating approval | Transactional release on approval; rejection retains occupancy | HTTP approval/rejection/replay tests |
| 13. Accountant reports | Received/outstanding totals, date filters, CSV client export | HTTP totals/filter/permission tests; CSV browser download NOT visually verified |
| 14. Hostel and room information | Persistent hostel/address, room/type/capacity/fee; derived occupancy and availability; warden maintenance | HTTP creation, capacity and room-edit tests |
| 15. Booking records | IDs, student and room joins, timestamp, status, decision and event history | Lifecycle and persistence tests |

## Diagram reconciliation

- Pages 3–4: log in → search → submit → warden review → payment request → verified payment → confirmed allocation. Rejection and confirmation appear in the student's booking history; no external email/SMS provider is configured.
- Page 5: relational tables represent Student/Warden/Accountant users, Hostel, Room, Booking, Payment and Complaint. Vacating requests, sessions and booking events extend the diagram to support the listed requirements.
- Page 6: public registration creates students only. Wardens and accountants are provisioned locally by an operator. Accountant access is limited to payments/reports; wardens cannot fetch the financial ledger.
- Page 7: `requested` and `approved` are recorded as events; stable application states are `under_review` and `payment_pending`. Later states are `confirmed`, `occupied`, `vacated`, `rejected`, `cancelled`. Students may cancel before payment. Payment pending expires after 24 hours. Expiration runs before API operations, so persisted status is reconciled on the next request, rather than by a background scheduler.
- Page 8: data is stored in relational records with foreign keys and server-side access checks, rather than browser storage.

An application under review does not reserve a bed. Approval reserves one, payment confirms it, and check-in increments physical occupancy. Availability deducts both reservations and occupancy, preventing oversubscription. Approved vacating releases the bed immediately; the date is a preferred departure date, and wardens should approve when departure occurs. There is no automatic future checkout.

## Verified and limitations

`npm run build` checks JavaScript syntax and required static/schema assets; no transpilation is needed. `npm test` exercises a real HTTP server backed by temporary SQLite files and an in-memory disabled-payment instance. Tests verify the complete API lifecycle, negative permissions, record isolation, payment replay, capacity checks, timeouts, session expiry, database foreign keys, and static serving. These are HTTP end-to-end tests, not a browser automation suite.

Final local result: build passed and all 9 tests passed, including two independent database connections competing for the final bed, preventing reduction of capacity below reserved beds, and preserving submitted booking fees when room prices change.

The Codex browser could not reach the local server (connection timeout). Actual browser rendering, click-through flows, responsive appearance, CSV downloading and assistive-technology behavior remain unverified. No public deployment or live payment provider was configured. This is a locally runnable assignment implementation with a demonstration ledger, not a production payment system.

Node 24's built-in SQLite API emits an experimental warning. SQLite is appropriate for this single-host assignment. Multiple application replicas and a production security/load assessment are outside the verified scope. There is no password recovery, email verification, external notification service, real refunds or live gateway webhook integration.

## Delivery and publishing

Changes are committed on `codex/complete-hostel-system`. The connected GitHub service allowed repository metadata reads, but returned HTTP 403 `Resource not accessible by integration` when creating a Git tree and branch. A normal Git push also failed because credential-manager/prompt execution was unavailable. No remote branch or PR was created, and main was not modified. CI is configured for Windows and Linux but has not run on GitHub.

The complete project is placed in `C:\Users\Hp\Downloads\SWE_ASSIGNMENT-4\Hostel-Management-System`, preserving the unrelated files directly in the parent folder. The accompanying ZIP contains tracked source, documentation, tests and original legacy assets, with no live database or secrets. After restoring GitHub write access, run `git push -u origin codex/complete-hostel-system` from this checkout and open a PR against main.
