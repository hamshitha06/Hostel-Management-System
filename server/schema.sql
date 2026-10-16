PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','warden','accountant')),
 student_id TEXT UNIQUE, department TEXT, academic_year INTEGER, phone TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS hostels(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, address TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rooms(id INTEGER PRIMARY KEY, hostel_id INTEGER NOT NULL REFERENCES hostels(id), number TEXT NOT NULL, type TEXT NOT NULL, capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 20), fee INTEGER NOT NULL CHECK(fee>0), UNIQUE(hostel_id,number));
CREATE TABLE IF NOT EXISTS bookings(
 id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES users(id), room_id INTEGER NOT NULL REFERENCES rooms(id),
 status TEXT NOT NULL CHECK(status IN ('under_review','payment_pending','confirmed','occupied','rejected','cancelled','vacated')),
 fee INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deadline INTEGER, decision_by INTEGER REFERENCES users(id), reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_booking ON bookings(student_id) WHERE status IN ('under_review','payment_pending','confirmed','occupied');
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY, booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id), student_id INTEGER NOT NULL REFERENCES users(id), amount INTEGER NOT NULL CHECK(amount>0), mode TEXT NOT NULL, reference TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS complaints(id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES users(id), room_id INTEGER REFERENCES rooms(id), description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')), resolution TEXT, resolved_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS vacates(id INTEGER PRIMARY KEY, booking_id INTEGER NOT NULL REFERENCES bookings(id), reason TEXT NOT NULL, requested_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), decision_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_vacate ON vacates(booking_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, booking_id INTEGER NOT NULL REFERENCES bookings(id), actor_id INTEGER REFERENCES users(id), status TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
