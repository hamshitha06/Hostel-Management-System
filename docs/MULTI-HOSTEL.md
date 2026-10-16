# Multi-hostel portal update

## What changed

- Hostel catalogue with separate campuses, descriptions, facilities, assigned warden names, room counts, minimum fees and availability. A new database has six fictional residences; existing data is retained and five fictional residences are added during upgrade.
- Each warden manages only assigned hostels. This applies to lists, direct record URLs, approval/rejection, room and hostel edits, complaint resolution, departure approval and notices. A hostel can have more than one warden, and a warden can manage more than one hostel.
- The original interface is retained: purple gradient buttons, hostel photograph background, horizontal navigation, rounded white cards, original login/registration styling and two-column dashboard. Hostel-specific features, accommodation details, dues, complaints and staff queues use that existing design. This is not the official My Amrita app or an integration with Amrita accounts.
- Demonstration checkout with UPI, debit/credit card and net banking choices, fee summary, failed-payment retry, saved method and printable receipts. All choices simulate payment; no real credentials or money are collected.
- Hostel notice boards, student profile editing, hostel-filtered accountant reports and payment-method CSV columns.
- Friendly port-in-use error, preserving the existing port configuration.

The request/payment workflow was informed by the existing functional specification and the public [My Amrita payment guide](https://mycampus.amrita.edu/My%20Amrita/how-to-make-payments-through-student-portal). No private My Amrita account, code, logo or data was accessed.

## Activate the update (Command Prompt)

The updated source is installed at `C:\Users\Hp\Downloads\Hostel-Management-System-final`. Existing `.env` and `data/` are not replaced. In the terminal running the old app, press **Ctrl+C**, then:

```cmd
cd /d C:\Users\Hp\Downloads\Hostel-Management-System-final
set PORT=3001
npm start
```

Refresh `http://127.0.0.1:3001` (Ctrl+F5 if needed). A restart is necessary because the backend does not hot-reload.

On first startup, schema version 1 upgrades to version 2. SQLite first writes a consistent backup named `data/hostel.sqlite.before-v2-<timestamp>.bak`. Migration is transactional, preserves passwords/records, and does not assign new privileges to existing staff. Do not run the old backend after upgrading: use the updated source for every running instance.

## Assign existing wardens

In another Command Prompt in the project folder:

```cmd
npm run assign
```

This displays hostel IDs and names (the usage listing exits with code 1 because no assignment arguments were supplied). Then assign the correct account to each hostel:

```cmd
npm run assign -- warden@example.edu 1
npm run assign -- anotherwarden@example.edu 2
```

Replace emails with existing warden accounts and numbers with the intended hostel IDs. An existing warden sees no hostel records until assigned. To remove an assignment:

```cmd
npm run assign -- warden@example.edu 1 remove
```

Refresh the page after changing assignments. Requests check the current assignment on the server, so removal immediately blocks access. Wardens cannot reassign other wardens through the website.

## Create a new hostel-specific warden

Use a unique password of 12–128 characters. Command Prompt example (replace the placeholder before executing):

```cmd
set "STAFF_PASSWORD=replace-with-a-unique-long-password"
npm run staff -- warden warden@example.edu "Hostel Warden" 2
set STAFF_PASSWORD=
```

The final number is an optional hostel ID; creation and initial assignment are atomic. Accountants are created without a hostel number. No default staff passwords or automatically created staff accounts are included.

Wardens can create new hostels from Hostel management; a newly created hostel is assigned to its creator. They can then add/edit rooms, update facilities and publish notices for that hostel.

## Verification

`npm run build` passes; all **16 automated tests** pass. Coverage includes:

- Existing complete booking/payment/complaint/vacating lifecycle, session expiry, CSRF, record isolation, deadlines and concurrent capacity protection.
- Version-1 upgrade, consistent backup contents, unchanged password hashes/receipts and repeat-start idempotency.
- Separate wardens' lists and direct mutations, unassigned warden restrictions, notice ownership and scoped dashboard counts.
- UPI/card/net banking recording, failed-payment retry, rejection of real credential fields and hostel-filtered reports.
- Operator-created warden assignments, adding/removing access, and rollback on invalid hostel assignment.

The refreshed installed sign-in screen was visually checked in the browser and rendered correctly. The isolated new preview server was not reachable from the browser tool. Authenticated click-through verification and print/CSV downloads remain unverified until the user restarts the updated backend. The update requires that restart; the old running process continues using the old backend until then. No real gateway or Amrita account integration is present.

The code is kept on `codex/multi-hostel-payments`. Creating the new remote branch through the connected GitHub integration was retried and returned HTTP 403 Resource not accessible by integration; no remote branch or PR was created. A source ZIP includes the project and tests, with no user database or `.env` secrets.


UI correction: the original welcome screen, header, original three unchanged stylesheets and photo background are restored. The sidebar/maroon redesign was removed. All multi-hostel, warden, payment, notice and reporting functionality is retained.
