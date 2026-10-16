import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../server/index.js';
import {openDatabase,hashPassword} from '../server/db.js';

test('version 1 database migration preserves users, payments and bookings and creates a backup',()=>{
 const folder=mkdtempSync(join(tmpdir(),'roomies-upgrade-')),path=join(folder,'old.sqlite');
 try {
  let db=new DatabaseSync(path);
  db.exec(readFileSync(new URL('../server/schema.sql',import.meta.url),'utf8'));
  db.exec(`INSERT INTO hostels VALUES(1,'Existing residence','Existing address');
   INSERT INTO rooms VALUES(1,1,'A1','Single',1,100000);
   INSERT INTO users(id,name,email,password,role) VALUES(1,'Existing student','s@example.edu','unchanged-hash','student');
   INSERT INTO bookings(id,student_id,room_id,status,fee) VALUES(1,1,1,'confirmed',100000);
   INSERT INTO payments(id,booking_id,student_id,amount,mode,reference) VALUES(1,1,1,100000,'demo','ORIGINAL');
   PRAGMA user_version=1;`);db.close();
  db=openDatabase(path);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,2);
  assert.equal(db.prepare('SELECT password FROM users WHERE id=1').get().password,'unchanged-hash');
  assert.equal(db.prepare('SELECT status FROM bookings WHERE id=1').get().status,'confirmed');
  assert.equal(db.prepare('SELECT reference,method FROM payments WHERE id=1').get().reference,'ORIGINAL');
  assert.equal(db.prepare('SELECT method FROM payments WHERE id=1').get().method,'unspecified');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM hostels').get().n,6);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM warden_hostels').get().n,0);
  db.close();
  db=openDatabase(path);assert.equal(db.prepare('SELECT COUNT(*) n FROM hostels').get().n,6);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);db.close();
  const backups=readdirSync(folder).filter(f=>f.endsWith('.bak'));assert.equal(backups.length,1);
  const backup=new DatabaseSync(join(folder,backups[0]));assert.equal(backup.prepare('PRAGMA user_version').get().user_version,1);assert.equal(backup.prepare('SELECT reference FROM payments').get().reference,'ORIGINAL');backup.close();
 }finally{rmSync(folder,{recursive:true,force:true});}
});

test('hostel-specific wardens, notices, dashboards and UPI/card/netbanking demonstration payments',async t=>{
 const app=createApp({database:':memory:'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
 const base=`http://127.0.0.1:${app.server.address().port}/api`;
 const password='Strong test password 123!';
 const insert=app.db.prepare('INSERT INTO users(id,name,email,password,role,student_id,department,academic_year,phone) VALUES(?,?,?,?,?,?,?,?,?)');
 for(const [id,role]of [[1,'warden'],[2,'warden'],[3,'warden'],[4,'student'],[5,'accountant'],[6,'student']])insert.run(id,`User ${id}`,`u${id}@example.edu`,hashPassword(password),role,role==='student'?`S${id}`:null,'CSE',2,'1234567890');
 app.db.exec('INSERT INTO warden_hostels VALUES(1,1),(2,2)');
 async function call(path,{client={},body,expected=200}={}){
  const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Cookie:client.cookie||'',...(body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':client.csrf||''})},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json();assert.equal(r.status,expected,path+': '+JSON.stringify(data));return {data,r};
 }
 async function login(id){const {data,r}=await call('/login',{body:{email:`u${id}@example.edu`,password}});return {csrf:data.csrf,cookie:r.headers.get('set-cookie').split(';')[0]};}
 const w1=await login(1),w2=await login(2),unassigned=await login(3),student=await login(4),accountant=await login(5),otherStudent=await login(6);
 const rooms=(await call('/rooms?hostelId=2',{client:student})).data,roomId=rooms[0].id;
 let booking;
 await t.test('lists and decisions are isolated by assigned hostel',async()=>{
  assert.equal((await call('/hostels',{client:student})).data.length,6);
  assert.equal((await call('/hostels',{client:w1})).data.length,1);
  assert.equal((await call('/hostels',{client:unassigned})).data.length,0);
  assert.equal((await call('/rooms',{client:unassigned})).data.length,0);
  assert.equal((await call('/me',{client:w2})).data.hostels[0].id,2);
  await call('/hostels/2',{client:w1,body:{name:'Hijacked',address:'Bad'},expected:403});
  await call('/rooms/'+roomId,{client:w1,body:{number:'HACK',type:'Single',capacity:1,fee:1},expected:403});
  await call('/rooms',{client:w1,body:{hostelId:2,number:'HACK',type:'Single',capacity:1,fee:1},expected:403});
  booking=(await call('/bookings',{client:student,body:{roomId},expected:201})).data.id;
  assert.equal((await call('/bookings',{client:w1})).data.length,0);assert.equal((await call('/bookings',{client:w2})).data.length,1);
  await call(`/bookings/${booking}/events`,{client:w1,expected:403});
  await call(`/bookings/${booking}/approve`,{client:w1,body:{},expected:403});
  await call(`/bookings/${booking}/reject`,{client:w1,body:{reason:'Wrong hostel'},expected:403});
  assert.equal((await call('/dashboard',{client:w1})).data.pendingBookings,0);assert.equal((await call('/dashboard',{client:w2})).data.pendingBookings,1);
  await call(`/bookings/${booking}/approve`,{client:w2,body:{}});
  assert.equal((await call('/dashboard',{client:student})).data.current.hostel_id,2);
 });
 await t.test('all three methods are persisted and real credential fields rejected',async()=>{
  await call(`/bookings/${booking}/pay`,{client:student,body:{method:'cash',outcome:'success'},expected:400});
  await call(`/bookings/${booking}/pay`,{client:student,body:{method:'card',outcome:'success',cvv:'123'},expected:400});
  assert.equal((await call(`/bookings/${booking}/pay`,{client:student,body:{method:'netbanking',outcome:'failed'}})).data.status,'failed');
  await call(`/bookings/${booking}/pay`,{client:student,body:{method:'upi',outcome:'success'}});
  assert.equal((await call('/payments',{client:student})).data[0].method,'upi');
  await call(`/bookings/${booking}/check-in`,{client:student,body:{}});
  for(const method of ['card','netbanking']){
   const b=(await call('/bookings',{client:otherStudent,body:{roomId:rooms[1].id},expected:201})).data.id;
   await call(`/bookings/${b}/approve`,{client:w2,body:{}});await call(`/bookings/${b}/pay`,{client:otherStudent,body:{method,outcome:'success'}});await call(`/bookings/${b}/check-in`,{client:otherStudent,body:{}});
   const v=(await call('/vacates',{client:otherStudent,body:{bookingId:b,reason:'Demo lifecycle',requestedDate:new Date().toISOString().slice(0,10)},expected:201})).data.id;
   await call(`/vacates/${v}/approve`,{client:w2,body:{}});
  }
  const report=(await call('/reports',{client:accountant})).data;assert.equal(report.count,3);assert.deepEqual(new Set(report.payments.map(p=>p.method)),new Set(['upi','card','netbanking']));
  assert.equal((await call('/reports?hostelId=2',{client:accountant})).data.count,3);
  assert.equal((await call('/reports?hostelId=1',{client:accountant})).data.count,0);
 });
 await t.test('complaints and departures cannot be handled by a different hostel warden',async()=>{
  const c=(await call('/complaints',{client:student,body:{description:'Leaking tap'},expected:201})).data.id;
  assert.equal((await call('/complaints',{client:w1})).data.length,0);assert.equal((await call('/complaints',{client:w2})).data.length,1);
  await call(`/complaints/${c}/resolve`,{client:w1,body:{resolution:'Wrong warden'},expected:403});await call(`/complaints/${c}/resolve`,{client:w2,body:{resolution:'Fixed'}});
  const v=(await call('/vacates',{client:student,body:{bookingId:booking,reason:'Leaving',requestedDate:new Date().toISOString().slice(0,10)},expected:201})).data.id;
  assert.equal((await call('/vacates',{client:w1})).data.length,0);
  await call(`/vacates/${v}/approve`,{client:w1,body:{},expected:403});await call(`/vacates/${v}/approve`,{client:w2,body:{}});
  const c2=(await call('/complaints',{client:otherStudent,body:{hostelId:1,description:'General facility issue'},expected:201})).data.id;
  assert.ok((await call('/complaints',{client:w1})).data.some(c=>c.id===c2));
 });
 await t.test('notices, profile updates and new hostel ownership',async()=>{
  await call('/notices',{client:w1,body:{hostelId:2,title:'Intrusion',body:'No'},expected:403});
  await call('/notices',{client:student,body:{hostelId:2,title:'Intrusion',body:'No'},expected:403});
  await call('/notices',{client:w2,body:{hostelId:2,title:'Water maintenance',body:'Water supply resumes at 5 PM.'},expected:201});
  assert.equal((await call('/notices',{client:w1})).data.length,0);assert.equal((await call('/notices?hostelId=2',{client:student})).data.length,1);
  await call('/profile',{client:student,body:{name:'Updated student',phone:'9999999999',department:'ECE',academicYear:3,role:'warden'}});
  const me=(await call('/me',{client:student})).data.user;assert.equal(me.name,'Updated student');assert.equal(me.role,'student');assert.equal(me.studentId,'S4');
  const h=(await call('/hostels',{client:unassigned,body:{name:'New Residence',address:'New block',campus:'New Campus',description:'Test hostel',amenities:'Wi-Fi, Mess'},expected:201})).data.id;
  assert.equal((await call('/hostels',{client:unassigned})).data[0].id,h);
  await call(`/hostels/${h}`,{client:w1,body:{name:'No',address:'No'},expected:403});
 });
});
