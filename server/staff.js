import { openDatabase,hashPassword,transaction } from './db.js';
const [role,email,name,hostelId]=process.argv.slice(2);
const password=process.env.STAFF_PASSWORD;
if(!['warden','accountant'].includes(role)||!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name||!password||password.length<12||password.length>128||(hostelId&&role!=='warden')) {
 console.error('Set STAFF_PASSWORD (12–128 characters), then npm run staff -- warden|accountant email "Full Name" [hostelId for warden]'); process.exit(1);
}
const db=openDatabase(process.env.DATABASE_PATH||'data/hostel.sqlite');
try { transaction(db,()=>{
 if(hostelId&&(!Number.isSafeInteger(Number(hostelId))||!db.prepare('SELECT id FROM hostels WHERE id=?').get(Number(hostelId))))throw Error('Hostel does not exist');
 const result=db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(name,email.toLowerCase(),hashPassword(password),role);
 if(hostelId)db.prepare('INSERT INTO warden_hostels(warden_id,hostel_id) VALUES(?,?)').run(Number(result.lastInsertRowid),Number(hostelId));
 });console.log(`Created ${role}: ${email}${hostelId?' (hostel '+hostelId+')':''}`); }
finally {db.close();}
