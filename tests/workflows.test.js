import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/index.js';
import { hashPassword,openDatabase } from '../server/db.js';

test('persistent hostel lifecycle, capacity, roles, failed/replayed payments and security',async t=>{
 const folder=mkdtempSync(join(tmpdir(),'roomies-')),file=join(folder,'test.sqlite');let time=Date.now();
 const app=createApp({database:file,now:()=>time});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await app.close();rmSync(folder,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${app.server.address().port}`;
 async function request(path,{body,client={},expected=200,headers={}}={}){const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':client.csrf||''}),Cookie:client.cookie||'',...headers},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,expected,`${path}: ${JSON.stringify(data)}`);return {data,response:r};}
 const password='Strong student password 123!';
 async function register(n,extra={}){return request('/register',{body:{name:`Student ${n}`,email:`s${n}@example.edu`,password,studentId:`S${n}`,department:'CSE',academicYear:2,phone:'9876543210',...extra},expected:201});}
 async function login(email,p=password){const {data,response}=await request('/login',{body:{email,password:p}});return {csrf:data.csrf,cookie:response.headers.get('set-cookie').split(';')[0]};}
 await t.test('registration, auth, CSRF and role escalation',async()=>{
  await request('/rooms',{expected:401});await register(1);await register(2);await register(3);
  await request('/register',{body:{email:'evil@example.edu',password,role:'warden'},expected:403});
  await request('/register',{body:{name:'Copy',email:'s1@example.edu',password,studentId:'copy',department:'CSE',academicYear:1,phone:'123'},expected:409});
  await request('/login',{body:{email:'s1@example.edu',password:'wrong password twelve'},expected:401});
 });
 for(const role of ['warden','accountant'])app.db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(role,`${role}@example.edu`,hashPassword(password),role);
 const wid=app.db.prepare("SELECT id FROM users WHERE role='warden'").get().id;app.db.prepare('INSERT INTO warden_hostels(warden_id,hostel_id) VALUES(?,1)').run(wid);
 const s1=await login('s1@example.edu'),s2=await login('s2@example.edu'),s3=await login('s3@example.edu'),warden=await login('warden@example.edu'),accountant=await login('accountant@example.edu');
 let booking1;
 await t.test('student isolation, safe outputs and capacity reservation',async()=>{
  await request('/bookings',{client:s1,body:{roomId:1},headers:{'X-CSRF-Token':'bad'},expected:403});
  await request('/bookings',{client:s1,body:{roomId:1},headers:{Origin:'https://evil.example'},expected:403});
  await request('/rooms',{client:s1,body:{},expected:403});await request('/reports',{client:s1,expected:403});await request('/bookings',{client:accountant,expected:403});
  assert.equal((await request('/rooms?q=single&available=1&hostelId=1',{client:s1})).data.length,1);
  booking1=(await request('/bookings',{client:s1,body:{roomId:1},expected:201})).data.id;
  await request('/bookings',{client:s1,body:{roomId:2},expected:409});
  await request(`/bookings/${booking1}/events`,{client:s2,expected:403});
  await request(`/bookings/${booking1}/approve`,{client:s1,body:{},expected:403});
  await request(`/bookings/${booking1}/pay`,{client:s1,body:{outcome:'success'},expected:409});
  const b2=(await request('/bookings',{client:s2,body:{roomId:1},expected:201})).data.id;
  const b3=(await request('/bookings',{client:s3,body:{roomId:1},expected:201})).data.id;
  await request(`/bookings/${booking1}/approve`,{client:warden,body:{}});
  const results=await Promise.all([b2,b3].map(async id=>{const r=await fetch(base+`/api/bookings/${id}/approve`,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':warden.csrf,Cookie:warden.cookie},body:'{}'});return r.status;}));
  assert.deepEqual(results,[409,409]);
  await request(`/bookings/${b2}/reject`,{client:warden,body:{reason:'Single room taken'}});await request(`/bookings/${b3}/cancel`,{client:s3,body:{}});
  const rooms=(await request('/rooms?hostelId=1',{client:s1})).data;assert.equal(rooms[0].available,0);assert.equal(rooms[0].occupancy,0);assert.equal(rooms[0].reserved,1);
  await request('/rooms/1',{client:warden,body:{number:'A101',type:'Single',capacity:1,fee:2600000}});
  assert.equal((await request('/bookings',{client:s1})).data[0].fee,2500000);
  await request('/rooms/1',{client:s1,body:{number:'hacked',type:'Single',capacity:1,fee:1},expected:403});
  const me=(await request('/me',{client:s1})).data;assert.equal(me.user.password,undefined);
 });
 await t.test('failed then verified payment, idempotent receipt and check-in',async()=>{
  await request(`/bookings/${booking1}/pay`,{client:s1,body:{outcome:'anything'},expected:400});
  assert.equal((await request(`/bookings/${booking1}/pay`,{client:s1,body:{outcome:'failed'}})).data.status,'failed');
  assert.equal((await request('/payments',{client:s1})).data.length,0);
  await request(`/bookings/${booking1}/pay`,{client:s1,body:{outcome:'success',amount:1,studentId:999}});
  assert.equal((await request(`/bookings/${booking1}/pay`,{client:s1,body:{outcome:'success'}})).data.alreadyProcessed,true);
  const payments=(await request('/payments',{client:s1})).data;assert.equal(payments.length,1);assert.equal(payments[0].amount,2500000);
  assert.equal((await request('/payments',{client:s2})).data.length,0);
  await request(`/bookings/${booking1}/cancel`,{client:s1,body:{},expected:409});
  await request(`/bookings/${booking1}/check-in`,{client:s1,body:{}});await request(`/bookings/${booking1}/check-in`,{client:s1,body:{},expected:409});
  assert.equal((await request('/rooms?hostelId=1',{client:s1})).data[0].occupancy,1);
 });
 await t.test('complaint, vacating review and released occupancy',async()=>{
  const cid=(await request('/complaints',{client:s1,body:{description:'Tap leaking <script>alert(1)</script>'},expected:201})).data.id;
  assert.equal((await request('/complaints',{client:s2})).data.length,0);
  await request(`/complaints/${cid}/resolve`,{client:s2,body:{resolution:'hack'},expected:403});
  await request(`/complaints/${cid}/resolve`,{client:warden,body:{resolution:'Tap repaired'}});
  assert.equal((await request('/complaints',{client:s1})).data[0].status,'resolved');
  await request('/vacates',{client:s1,body:{bookingId:booking1,requestedDate:'2026-02-31',reason:'Leaving'},expected:400});
  const v=(await request('/vacates',{client:s1,body:{bookingId:booking1,requestedDate:new Date(time).toISOString().slice(0,10),reason:'Semester complete'},expected:201})).data.id;
  await request('/vacates',{client:s1,body:{bookingId:booking1,requestedDate:new Date(time).toISOString().slice(0,10),reason:'Again'},expected:409});
  assert.equal((await request('/rooms?hostelId=1',{client:s1})).data[0].available,0);
  await request(`/vacates/${v}/reject`,{client:warden,body:{}});
  assert.equal((await request('/rooms?hostelId=1',{client:s1})).data[0].occupancy,1);
  const v2=(await request('/vacates',{client:s1,body:{bookingId:booking1,requestedDate:new Date(time).toISOString().slice(0,10),reason:'Approved departure'},expected:201})).data.id;
  await request(`/vacates/${v2}/approve`,{client:s1,body:{},expected:403});await request(`/vacates/${v2}/approve`,{client:warden,body:{}});
  await request(`/vacates/${v2}/approve`,{client:warden,body:{},expected:409});
  assert.equal((await request('/rooms?hostelId=1',{client:s1})).data[0].available,1);
 });
 await t.test('accountant reports and warden room maintenance',async()=>{
  const report=(await request('/reports',{client:accountant})).data;assert.equal(report.total,2500000);assert.equal(report.count,1);
  assert.equal((await request('/reports?from=2099-01-01',{client:accountant})).data.count,0);
  await request('/reports?from=bad',{client:accountant,expected:400});await request('/reports?from=2026-10-20&to=2026-10-01',{client:accountant,expected:400});
  const hostel=(await request('/hostels',{client:warden,body:{name:'North Hostel',address:'North campus'},expected:201})).data.id;
  await request('/rooms',{client:warden,body:{hostelId:hostel,number:'N1',type:'Single',capacity:1,fee:100000},expected:201});
  assert.equal((await request('/rooms?q=North',{client:s1})).data.length,1);
  await request(`/hostels/${hostel}`,{client:warden,body:{name:'North Residence',address:'Updated address'}});
  assert.equal((await request('/hostels',{client:s1})).data.find(h=>h.id===hostel).address,'Updated address');
  await request('/rooms',{client:warden,body:{hostelId:hostel,number:'N2',type:'Single',capacity:-1,fee:1000},expected:400});
 });
 await t.test('payment timeout, persistent records, session expiry and static assets',async()=>{
  const b=(await request('/bookings',{client:s1,body:{roomId:1},expected:201})).data.id;await request(`/bookings/${b}/approve`,{client:warden,body:{}});
  time+=25*3600000;
  const fresh=await login('s1@example.edu');
  assert.equal((await request('/bookings',{client:fresh})).data[0].status,'cancelled');assert.equal((await request('/rooms?hostelId=1',{client:fresh})).data[0].available,1);
  await request('/me',{client:s1,expected:401});
  const other=openDatabase(file);assert.equal(other.prepare('SELECT COUNT(*) n FROM payments').get().n,1);assert.equal(other.prepare('PRAGMA foreign_key_check').all().length,0);other.close();
  const page=await fetch(base+'/');assert.equal(page.status,200);assert.match(await page.text(),/Hostel Management System/);assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
  assert.equal((await fetch(base+'/server/index.js')).status,404);assert.equal((await fetch(base+'/.env')).status,404);
  await request('/logout',{client:fresh,body:{}});await request('/me',{client:fresh,expected:401});
 });
});

test('two server connections compete for the last bed without overbooking',async t=>{
 const folder=mkdtempSync(join(tmpdir(),'roomies-race-')),file=join(folder,'race.sqlite');
 const first=createApp({database:file}),second=createApp({database:file});
 for(const app of [first,second])await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await first.close();await second.close();rmSync(folder,{recursive:true,force:true});});
 const db=first.db;
 db.prepare("INSERT INTO users(name,email,password,role) VALUES('Warden','w@example.edu',?,'warden')").run(hashPassword('warden password 123'));
 db.prepare('INSERT INTO warden_hostels(warden_id,hostel_id) VALUES(1,1)').run();
 db.prepare("INSERT INTO sessions(token,user_id,csrf,expires) VALUES(?,1,'csrf',?)").run((await import('node:crypto')).createHash('sha256').update('token').digest('hex'),Date.now()+60000);
 for(let i=2;i<=4;i++){
  db.prepare("INSERT INTO users(id,name,email,password,role) VALUES(?,?,?,?,'student')").run(i,'Student '+i,`s${i}@example.edu`,hashPassword('student password 123'));
  db.prepare("INSERT INTO bookings(student_id,room_id,status,fee) VALUES(?,1,'under_review',2500000)").run(i);
 }
 const results=await Promise.all([1,2,3].map(async(id)=>{
  const app=id%2?first:second;
  return (await fetch(`http://127.0.0.1:${app.server.address().port}/api/bookings/${id}/approve`,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':'csrf',Cookie:'session=token'},body:'{}'})).status;
 }));
 assert.equal(results.filter(s=>s===200).length,1);assert.equal(results.filter(s=>s===409).length,2);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='payment_pending'").get().n,1);
 // The same capacity guard protects room edits from dropping assigned beds.
 db.prepare("UPDATE rooms SET capacity=2 WHERE id=1").run();
 const pending=db.prepare("SELECT id FROM bookings WHERE status='under_review' LIMIT 1").get();
 const base=`http://127.0.0.1:${first.server.address().port}`;
 const headers={'Content-Type':'application/json','X-CSRF-Token':'csrf',Cookie:'session=token'};
 assert.equal((await fetch(`${base}/api/bookings/${pending.id}/approve`,{method:'POST',headers,body:'{}'})).status,200);
 assert.equal((await fetch(`${base}/api/rooms/1`,{method:'POST',headers,body:JSON.stringify({number:'A101',type:'Double',capacity:1,fee:2000000})})).status,409);
});

test('disabled payment mode rejects payment attempts',async t=>{
 const app=createApp({database:':memory:',paymentMode:'disabled'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
 app.db.prepare("INSERT INTO users(name,email,password,role) VALUES('Student','student@example.edu',?,'student')").run(hashPassword('long password 123'));
 const base=`http://127.0.0.1:${app.server.address().port}`;const r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'student@example.edu',password:'long password 123'})});const {csrf}=await r.json(),cookie=r.headers.get('set-cookie').split(';')[0];
 app.db.prepare("INSERT INTO bookings(student_id,room_id,status,fee,deadline) VALUES(1,1,'payment_pending',2500000,?)").run(Date.now()+60000);
 const pay=await fetch(base+'/api/bookings/1/pay',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,Cookie:cookie},body:JSON.stringify({outcome:'success'})});assert.equal(pay.status,503);assert.equal(app.db.prepare('SELECT COUNT(*) n FROM payments').get().n,0);
});
