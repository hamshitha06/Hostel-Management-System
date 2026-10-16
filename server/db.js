import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password) {
 const salt=randomBytes(16).toString('hex');
 return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;
}
export function verifyPassword(password,stored) {
 const [salt,hash]=stored.split(':');
 return timingSafeEqual(Buffer.from(hash,'hex'),scryptSync(password,salt,64));
}
export function openDatabase(path) {
 const existing=path!==':memory:'&&existsSync(path);
 if(path!==':memory:') mkdirSync(dirname(path),{recursive:true});
 const db=new DatabaseSync(path);
 db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
 const version=db.prepare('PRAGMA user_version').get().user_version;
 if(version>2){db.close();throw Error('This database requires a newer application version');}
 if(existing&&version===1)db.prepare('VACUUM INTO ?').run(`${path}.before-v2-${Date.now()}.bak`);
 db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
 if(!db.prepare('SELECT id FROM hostels LIMIT 1').get()) {
  db.prepare('INSERT INTO hostels(name,address) VALUES(?,?)').run('Roomies Hostel','Campus residence');
  const add=db.prepare('INSERT INTO rooms(hostel_id,number,type,capacity,fee) VALUES(1,?,?,?,?)');
  for(const r of [['A101','Single',1,2500000],['A102','Double',2,2000000],['B201','Triple',3,1500000]]) add.run(...r);
 }
 if(version<2)transaction(db,()=>{
  db.exec(`ALTER TABLE hostels ADD COLUMN campus TEXT NOT NULL DEFAULT 'Main Campus';
   ALTER TABLE hostels ADD COLUMN description TEXT NOT NULL DEFAULT '';
   ALTER TABLE hostels ADD COLUMN amenities TEXT NOT NULL DEFAULT 'Wi-Fi, Study room, Laundry';
   ALTER TABLE payments ADD COLUMN method TEXT NOT NULL DEFAULT 'unspecified';
   ALTER TABLE complaints ADD COLUMN hostel_id INTEGER REFERENCES hostels(id);
   CREATE TABLE warden_hostels(warden_id INTEGER NOT NULL REFERENCES users(id),hostel_id INTEGER NOT NULL REFERENCES hostels(id),PRIMARY KEY(warden_id,hostel_id));
   CREATE TABLE notices(id INTEGER PRIMARY KEY,hostel_id INTEGER NOT NULL REFERENCES hostels(id),author_id INTEGER NOT NULL REFERENCES users(id),title TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
   UPDATE complaints SET hostel_id=(SELECT hostel_id FROM rooms WHERE rooms.id=complaints.room_id);
   PRAGMA user_version=2;`);
  const addHostel=db.prepare('INSERT OR IGNORE INTO hostels(name,address,campus,description,amenities) VALUES(?,?,?,?,?)');
  const samples=[['Maple Residence','East residential zone','Main Campus','A quiet residence close to the library.','Wi-Fi, Study room, Laundry, Drinking water'],['Cedar Residence','West residential zone','Main Campus','Shared rooms with common study spaces.','Wi-Fi, Common room, Laundry, Mess'],['Lotus Residence','South residential zone','Main Campus','A comfortable home near the academic blocks.','Wi-Fi, Study room, Mess, Sports court'],['River Residence','North residential zone','City Campus','A compact residence with easy campus access.','Wi-Fi, Laundry, Mess'],['Hill Residence','Upper residential zone','City Campus','Single and shared rooms with open common areas.','Wi-Fi, Study room, Recreation room']];
  for(const sample of samples){if(!addHostel.run(...sample).changes)continue;const h=db.prepare('SELECT id FROM hostels WHERE name=?').get(sample[0]);
   const addRoom=db.prepare('INSERT OR IGNORE INTO rooms(hostel_id,number,type,capacity,fee) VALUES(?,?,?,?,?)');
   for(const r of [['101','Single',1,2500000],['102','Double',2,2000000],['201','Triple',3,1500000],['202','Double',2,2000000]])addRoom.run(h.id,...r);
  }
 });
 return db;
}
export function transaction(db,fn) {
 db.exec('BEGIN IMMEDIATE');
 try { const result=fn(); db.exec('COMMIT'); return result; }
 catch(e) {db.exec('ROLLBACK'); throw e;}
}
