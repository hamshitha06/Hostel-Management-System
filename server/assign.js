import { openDatabase } from './db.js';
const db=openDatabase(process.env.DATABASE_PATH||'data/hostel.sqlite');
try {
 const [email,hostelId,operation='add']=process.argv.slice(2);
 if(!email||!hostelId){console.log('Usage: npm run assign -- warden@email.edu hostelId [add|remove]');console.table(db.prepare('SELECT id,name,campus FROM hostels').all());process.exitCode=1;}
 else {
  const w=db.prepare("SELECT id FROM users WHERE email=? AND role='warden'").get(email.toLowerCase());
  const h=db.prepare('SELECT id,name FROM hostels WHERE id=?').get(Number(hostelId));
  if(!w||!h||!['add','remove'].includes(operation))throw Error('Choose an existing warden, hostel and add/remove operation');
  if(operation==='add')db.prepare('INSERT OR IGNORE INTO warden_hostels(warden_id,hostel_id) VALUES(?,?)').run(w.id,h.id);
  else db.prepare('DELETE FROM warden_hostels WHERE warden_id=? AND hostel_id=?').run(w.id,h.id);
  console.log(`${operation==='add'?'Assigned':'Unassigned'} ${email}: ${h.name}`);
 }
}finally{db.close();}
