import http from 'node:http';
import { randomBytes,createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve,extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase,hashPassword,verifyPassword,transaction } from './db.js';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
function text(v,label,max=200) {if(typeof v!=='string'||!v.trim()||v.trim().length>max) fail(400,`${label} is required (maximum ${max} characters)`); return v.trim();}
function integer(v,label,min=1,max=2147483647) {if(!Number.isSafeInteger(v)||v<min||v>max) fail(400,`Invalid ${label}`);return v;}
const digest=t=>createHash('sha256').update(t).digest('hex');
const dummyPassword=hashPassword('invalid password placeholder');
const publicUser=u=>({id:u.id,name:u.name,email:u.email,role:u.role,studentId:u.student_id,department:u.department,academicYear:u.academic_year,phone:u.phone});
export function createApp({database=process.env.DATABASE_PATH||'data/hostel.sqlite',paymentMode=process.env.PAYMENT_MODE||'demo',secure=process.env.COOKIE_SECURE==='true',now=()=>Date.now()}={}) {
 const db=openDatabase(database), limits=new Map();
 const root=fileURLToPath(new URL('../public/',import.meta.url));
 const get=(sql,...args)=>db.prepare(sql).get(...args), all=(sql,...args)=>db.prepare(sql).all(...args), run=(sql,...args)=>db.prepare(sql).run(...args);
 const event=(id,actor,status,note)=>run('INSERT INTO events(booking_id,actor_id,status,note) VALUES(?,?,?,?)',id,actor,status,note);
 function expire(){transaction(db,()=>{for(const b of all("SELECT id FROM bookings WHERE status='payment_pending' AND deadline<=?",now())) {run("UPDATE bookings SET status='cancelled',reason='Payment deadline expired' WHERE id=?",b.id);event(b.id,null,'cancelled','Payment deadline expired');} run('DELETE FROM sessions WHERE expires<=?',now());});}
 function roomRows(){return all(`SELECT r.*,h.name hostel,h.address,h.campus,h.amenities,
 (SELECT COUNT(*) FROM bookings b WHERE b.room_id=r.id AND b.status='occupied') occupancy,
 (SELECT COUNT(*) FROM bookings b WHERE b.room_id=r.id AND b.status IN ('payment_pending','confirmed')) reserved,
 r.capacity-(SELECT COUNT(*) FROM bookings b WHERE b.room_id=r.id AND b.status IN ('payment_pending','confirmed','occupied')) available
 FROM rooms r JOIN hostels h ON h.id=r.hostel_id ORDER BY h.name,r.number`);}
 function hostelAccess(user,id){if(user.role==='warden'&&!get('SELECT 1 FROM warden_hostels WHERE warden_id=? AND hostel_id=?',user.id,id))fail(403,'This hostel is not assigned to your warden account');}
 function visibleHostels(user){return all(`SELECT h.*, (SELECT GROUP_CONCAT(u.name, ', ') FROM warden_hostels wh JOIN users u ON u.id=wh.warden_id WHERE wh.hostel_id=h.id) wardens FROM hostels h ${user.role==='warden'?'WHERE h.id IN (SELECT hostel_id FROM warden_hostels WHERE warden_id=?)':''}`, ...(user.role==='warden'?[user.id]:[]));}
 function booking(id,user){const b=get('SELECT * FROM bookings WHERE id=?',integer(id,'booking ID'));if(!b)fail(404,'Booking not found');if(user.role==='student'&&b.student_id!==user.id)fail(403,'Access denied');hostelAccess(user,get('SELECT hostel_id FROM rooms WHERE id=?',b.room_id).hostel_id);return b;}
 function role(user,...roles){if(!roles.includes(user.role))fail(403,'Access denied');}
 const server=http.createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
   const url=new URL(req.url,'http://localhost'),path=url.pathname,method=req.method;
   if(!path.startsWith('/api/')) {
    res.setHeader('Cache-Control','no-store');
    if(method!=='GET'&&method!=='HEAD')fail(405,'Method not allowed');
    let target=path==='/'?'/index.html':decodeURIComponent(path);
    if(target.includes('\0')||target.includes('\\'))fail(404,'Not found');
    const file=resolve(root,'.'+target);
    if(!file.startsWith(resolve(root)+'/')&&!file.startsWith(resolve(root)+'\\'))fail(404,'Not found');
    let data;try{data=readFileSync(file);}catch{fail(404,'Not found');}
    res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.jpeg':'image/jpeg'})[extname(file)]||'application/octet-stream'});res.end(method==='HEAD'?undefined:data);return;
   }
   res.setHeader('Cache-Control','no-store');
   if(path==='/api/health'&&method==='GET')return send(200,{status:'ok',database:get('PRAGMA user_version').user_version});
   expire();
   let body={};
   if(!['GET','HEAD'].includes(method)) {
    if(req.headers.origin) {let origin;try{origin=new URL(req.headers.origin);}catch{fail(403,'Invalid origin');}if(origin.host!==req.headers.host||!['http:','https:'].includes(origin.protocol))fail(403,'Invalid origin');}
    if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'Use application/json');
    let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16384)fail(413,'Request too large');}
    try{body=JSON.parse(raw||'{}');}catch{fail(400,'Invalid JSON');}
    if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Invalid JSON object');
   }
   if(['/api/register','/api/login'].includes(path)&&method==='POST') {
    const key=req.socket.remoteAddress,previous=limits.get(key);
    const limit=previous&&previous.until>now()?previous:{count:0,until:now()+60000};
    limits.set(key,limit);if(++limit.count>30)fail(429,'Too many attempts; try again in one minute');
    if(limits.size>10000)for(const [k,v]of limits)if(v.until<=now())limits.delete(k);
    const email=text(body.email,'Email').toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Invalid email');
    if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)fail(400,'Password must contain 12 to 128 characters');
    if(path==='/api/register') {
     if(body.role&&body.role!=='student')fail(403,'Only student self-registration is allowed');
     const name=text(body.name,'Name'),sid=text(body.studentId,'Student ID',50),department=text(body.department,'Department',100),phone=text(body.phone,'Phone',30),year=integer(body.academicYear,'academic year',1,8);
     if(get('SELECT id FROM users WHERE email=? OR student_id=?',email,sid))fail(409,'Email or student ID already registered');
     const result=run("INSERT INTO users(name,email,password,role,student_id,department,academic_year,phone) VALUES(?,?,?,'student',?,?,?,?)",name,email,hashPassword(body.password),sid,department,year,phone);
     return send(201,{user:publicUser(get('SELECT * FROM users WHERE id=?',Number(result.lastInsertRowid)))});
    }
    const user=get('SELECT * FROM users WHERE email=?',email);
    // Do comparable password work for unknown accounts.
    const valid=verifyPassword(body.password,user?.password||dummyPassword);
    if(!user||!valid)fail(401,'Invalid email or password');
    const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
    run('INSERT INTO sessions(token,user_id,csrf,expires) VALUES(?,?,?,?)',digest(token),user.id,csrf,now()+8*3600000);
    res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure?'; Secure':''}`);
    return send(200,{user:publicUser(user),csrf});
   }
   const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('session='))?.slice(8)||'';
   const session=get('SELECT * FROM sessions WHERE token=? AND expires>?',digest(token),now());
   if(!session)fail(401,'Please log in');
   const user=get('SELECT * FROM users WHERE id=?',session.user_id);
   if(!['GET','HEAD'].includes(method)&&req.headers['x-csrf-token']!==session.csrf)fail(403,'Invalid security token; refresh and try again');
   if(path==='/api/me'&&method==='GET')return send(200,{user:publicUser(user),csrf:session.csrf,paymentMode,hostels:visibleHostels(user)});
   if(path==='/api/logout'&&method==='POST'){run('DELETE FROM sessions WHERE token=?',digest(token));res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(200,{ok:true});}
   if(path==='/api/rooms'&&method==='GET') {
    const q=(url.searchParams.get('q')||'').toLowerCase();return send(200,roomRows().filter(r=>(user.role!=='warden'||get('SELECT 1 FROM warden_hostels WHERE warden_id=? AND hostel_id=?',user.id,r.hostel_id))&&(r.number+' '+r.hostel+' '+r.type).toLowerCase().includes(q)&&(!url.searchParams.has('available')||r.available>0)&&(!url.searchParams.get('hostelId')||r.hostel_id===Number(url.searchParams.get('hostelId')))&&(!url.searchParams.get('campus')||r.campus===url.searchParams.get('campus'))&&(!url.searchParams.get('type')||r.type===url.searchParams.get('type'))).map(r=>{
     if(user.role!=='warden')return r;
     const allocations=all("SELECT b.id booking_id,b.status,u.name,u.student_id student_number,u.department,u.academic_year FROM bookings b JOIN users u ON u.id=b.student_id WHERE b.room_id=? AND b.status IN ('occupied','confirmed','payment_pending') ORDER BY u.name",r.id);
     return {...r,residents:allocations.filter(a=>a.status==='occupied'),reservations:allocations.filter(a=>a.status!=='occupied')};
    }));
   }
   if(path==='/api/hostels'&&method==='POST') {role(user,'warden');return send(201,transaction(db,()=>{const r=run('INSERT INTO hostels(name,address,campus,description,amenities) VALUES(?,?,?,?,?)',text(body.name,'Name'),text(body.address,'Address',500),text(body.campus||'Main Campus','Campus',100),text(body.description||'Campus residence','Description',1000),text(body.amenities||'Wi-Fi, Study room','Amenities',500));const id=Number(r.lastInsertRowid);run('INSERT INTO warden_hostels(warden_id,hostel_id) VALUES(?,?)',user.id,id);return {id};}));}
   const editHostel=path.match(/^\/api\/hostels\/(\d+)$/);
   if(editHostel&&method==='POST'){role(user,'warden');hostelAccess(user,Number(editHostel[1]));if(!get('SELECT id FROM hostels WHERE id=?',Number(editHostel[1])))fail(404,'Hostel not found');const h=get('SELECT * FROM hostels WHERE id=?',Number(editHostel[1]));run('UPDATE hostels SET name=?,address=?,campus=?,description=?,amenities=? WHERE id=?',text(body.name,'Name'),text(body.address,'Address',500),text(body.campus||h.campus,'Campus',100),text(body.description||h.description||'Campus residence','Description',1000),text(body.amenities||h.amenities,'Amenities',500),h.id);return send(200,{ok:true});}
   const editRoom=path.match(/^\/api\/rooms\/(\d+)$/);
   if(editRoom&&method==='POST'){role(user,'warden');return send(200,transaction(db,()=>{const room=roomRows().find(r=>r.id===Number(editRoom[1]));if(!room)fail(404,'Room not found');hostelAccess(user,room.hostel_id);const capacity=integer(body.capacity,'capacity',1,20);if(capacity<room.occupancy+room.reserved)fail(409,'Capacity cannot be below occupied and reserved beds');run('UPDATE rooms SET number=?,type=?,capacity=?,fee=? WHERE id=?',text(body.number,'Room number',30),text(body.type,'Room type',50),capacity,integer(body.fee,'fee in paise',1,100000000),room.id);return {ok:true};}));}
   if(path==='/api/rooms'&&method==='POST') {
    role(user,'warden');const hostelId=integer(body.hostelId,'hostel'),capacity=integer(body.capacity,'capacity',1,20),fee=integer(body.fee,'fee in paise',1,100000000);
    if(!get('SELECT id FROM hostels WHERE id=?',hostelId))fail(404,'Hostel not found');hostelAccess(user,hostelId);
    const r=run('INSERT INTO rooms(hostel_id,number,type,capacity,fee) VALUES(?,?,?,?,?)',hostelId,text(body.number,'Room number',30),text(body.type,'Room type',50),capacity,fee);return send(201,{id:Number(r.lastInsertRowid)});
   }
   if(path==='/api/hostels'&&method==='GET'){const rooms=roomRows();return send(200,visibleHostels(user).map(h=>{const rs=rooms.filter(r=>r.hostel_id===h.id);return {...h,total_rooms:rs.length,capacity:rs.reduce((s,r)=>s+r.capacity,0),available:rs.reduce((s,r)=>s+r.available,0),occupancy:rs.reduce((s,r)=>s+r.occupancy,0),min_fee:rs.length?Math.min(...rs.map(r=>r.fee)):null};}));}
   if(path==='/api/bookings'&&method==='GET') {
    role(user,'student','warden');return send(200,all(`SELECT b.*,u.name student_name,u.student_id student_number,u.department,r.number room_number,h.name hostel FROM bookings b JOIN users u ON u.id=b.student_id JOIN rooms r ON r.id=b.room_id JOIN hostels h ON h.id=r.hostel_id ${user.role==='student'?'WHERE b.student_id=?':'WHERE r.hostel_id IN (SELECT hostel_id FROM warden_hostels WHERE warden_id=?)'} ORDER BY b.id DESC`,user.id));
   }
   if(path==='/api/bookings'&&method==='POST') {
    role(user,'student');return send(201,transaction(db,()=>{
     const room=roomRows().find(r=>r.id===integer(body.roomId,'room'));
     if(!room)fail(404,'Room not found');if(room.available<1)fail(409,'Room is full');
     if(get("SELECT id FROM bookings WHERE student_id=? AND status IN ('under_review','payment_pending','confirmed','occupied')",user.id))fail(409,'You already have an active booking');
     const r=run("INSERT INTO bookings(student_id,room_id,status,fee) VALUES(?,?,'under_review',?)",user.id,room.id,room.fee),id=Number(r.lastInsertRowid);
     event(id,user.id,'requested','Student requested room');event(id,user.id,'under_review','Application submitted; awaiting warden review');return {id,status:'under_review'};
    }));
   }
   const action=path.match(/^\/api\/bookings\/(\d+)\/(approve|reject|cancel|check-in|pay|events)$/);
   if(action) {
    const id=Number(action[1]),op=action[2],b=booking(id,user);
    if(op==='events'&&method==='GET'){role(user,'student','warden');return send(200,all('SELECT status,note,created_at FROM events WHERE booking_id=? ORDER BY id',id));}
    if(method!=='POST')fail(405,'Method not allowed');
    if(['approve','reject'].includes(op))role(user,'warden');else role(user,'student');
    return send(200,transaction(db,()=>{
     if(op==='approve') {
      if(b.status!=='under_review')fail(409,'Only applications under review can be approved');
      if(roomRows().find(r=>r.id===b.room_id).available<1)fail(409,'Room is full');
      run("UPDATE bookings SET status='payment_pending',deadline=?,decision_by=? WHERE id=?",now()+24*3600000,user.id,id);
      event(id,user.id,'approved','Warden approved application');event(id,user.id,'payment_pending','Pay within 24 hours; bed reserved');
     } else if(op==='reject') {
      if(b.status!=='under_review')fail(409,'Only applications under review can be rejected');
      const reason=text(body.reason,'Rejection reason',1000);run("UPDATE bookings SET status='rejected',reason=?,decision_by=? WHERE id=?",reason,user.id,id);event(id,user.id,'rejected',reason);
     } else if(op==='cancel') {
      if(!['under_review','payment_pending'].includes(b.status))fail(409,'This booking cannot be cancelled');
      run("UPDATE bookings SET status='cancelled' WHERE id=?",id);event(id,user.id,'cancelled','Student cancelled application');
     } else if(op==='check-in') {
      if(b.status!=='confirmed')fail(409,'Only a confirmed booking can check in');
      run("UPDATE bookings SET status='occupied' WHERE id=?",id);event(id,user.id,'occupied','Student checked in');
     } else if(op==='pay') {
      if(paymentMode!=='demo')fail(503,'Payments are disabled until a payment provider is configured');
      if(!['success','failed'].includes(body.outcome))fail(400,'Select a demonstration payment outcome');
      const method=body.method||'upi';if(!['upi','card','netbanking'].includes(method))fail(400,'Choose UPI, card or net banking');if(['cardNumber','cvv','pin','upiPin','password'].some(k=>k in body))fail(400,'Do not submit real payment credentials to the demonstration service');
      const prior=get('SELECT * FROM payments WHERE booking_id=?',id);if(prior)return {payment:prior,alreadyProcessed:true};
      if(b.status!=='payment_pending')fail(409,'Booking must be approved before payment');
      if(body.outcome==='failed'){event(id,user.id,'payment_failed',`Demonstration ${method} payment failed; retry before deadline`);return {status:'failed',message:'Payment failed; no money was transferred'};}
      const reference='DEMO-'+randomBytes(12).toString('hex');
      run("INSERT INTO payments(booking_id,student_id,amount,mode,reference,method) VALUES(?,?,?,'demo',?,?)",id,user.id,b.fee,reference,method);
      run("UPDATE bookings SET status='confirmed' WHERE id=?",id);event(id,user.id,'confirmed','Demonstration payment verified; allocation confirmed');
     }
     return {booking:get('SELECT * FROM bookings WHERE id=?',id)};
    }));
   }
   if(path==='/api/payments'&&method==='GET') {role(user,'student','accountant');return send(200,all(`SELECT p.*,u.name student_name,r.number room_number,h.name hostel FROM payments p JOIN users u ON u.id=p.student_id JOIN bookings b ON b.id=p.booking_id JOIN rooms r ON r.id=b.room_id JOIN hostels h ON h.id=r.hostel_id ${user.role==='student'?'WHERE p.student_id=?':''} ORDER BY p.id DESC`,...(user.role==='student'?[user.id]:[])));}
   if(path==='/api/complaints'&&method==='GET') {role(user,'student','warden');return send(200,all(`SELECT c.*,u.name student_name,u.student_id student_number,u.email student_email,u.phone student_phone,u.department,u.academic_year,r.number room_number,h.name hostel FROM complaints c JOIN users u ON u.id=c.student_id LEFT JOIN rooms r ON r.id=c.room_id LEFT JOIN hostels h ON h.id=c.hostel_id ${user.role==='student'?'WHERE c.student_id=?':'WHERE c.hostel_id IN (SELECT hostel_id FROM warden_hostels WHERE warden_id=?)'} ORDER BY c.id DESC`,user.id));}
   if(path==='/api/complaints'&&method==='POST') {role(user,'student');const b=get("SELECT room_id FROM bookings WHERE student_id=? AND status IN ('confirmed','occupied')",user.id);const hostelId=b?get('SELECT hostel_id FROM rooms WHERE id=?',b.room_id).hostel_id:integer(body.hostelId,'hostel');if(!get('SELECT id FROM hostels WHERE id=?',hostelId))fail(404,'Hostel not found');const r=run('INSERT INTO complaints(student_id,room_id,hostel_id,description) VALUES(?,?,?,?)',user.id,b?.room_id||null,hostelId,text(body.description,'Complaint',2000));return send(201,{id:Number(r.lastInsertRowid)});}
   const complaintStatus=path.match(/^\/api\/complaints\/(\d+)\/status$/);
   if(complaintStatus&&method==='POST'){
    role(user,'warden');const c=get('SELECT * FROM complaints WHERE id=?',Number(complaintStatus[1]));
    if(!c)fail(404,'Complaint not found');hostelAccess(user,c.hostel_id);
    if(!['open','resolved'].includes(body.status))fail(400,'Choose Open or Resolved');
    const note=body.status==='resolved'?text(body.resolution,'Resolution',2000):(typeof body.resolution==='string'?body.resolution.trim().slice(0,2000):null);
    run('UPDATE complaints SET status=?,resolution=?,resolved_by=? WHERE id=?',body.status,note,body.status==='resolved'?user.id:null,c.id);
    return send(200,{ok:true});
   }
   const complaint=path.match(/^\/api\/complaints\/(\d+)\/resolve$/);
   if(complaint&&method==='POST'){role(user,'warden');const c=get('SELECT * FROM complaints WHERE id=?',Number(complaint[1]));if(!c)fail(404,'Complaint not found');hostelAccess(user,c.hostel_id);if(c.status!=='open')fail(409,'Complaint already resolved');run("UPDATE complaints SET status='resolved',resolution=?,resolved_by=? WHERE id=?",text(body.resolution,'Resolution',2000),user.id,c.id);return send(200,{ok:true});}
   if(path==='/api/vacates'&&method==='GET'){role(user,'student','warden');return send(200,all(`SELECT v.*,u.name student_name,u.student_id student_number,u.email student_email,u.phone student_phone,u.department,u.academic_year,b.status booking_status,r.number room_number,h.name hostel,(SELECT MAX(e.created_at) FROM events e WHERE e.booking_id=b.id AND e.status='vacated') vacated_at FROM vacates v JOIN bookings b ON b.id=v.booking_id JOIN users u ON u.id=b.student_id JOIN rooms r ON r.id=b.room_id JOIN hostels h ON h.id=r.hostel_id ${user.role==='student'?'WHERE b.student_id=?':'WHERE r.hostel_id IN (SELECT hostel_id FROM warden_hostels WHERE warden_id=?)'} ORDER BY v.id DESC`,user.id));}
   if(path==='/api/vacates'&&method==='POST') {
    role(user,'student');const b=booking(body.bookingId,user);if(!['confirmed','occupied'].includes(b.status))fail(409,'A confirmed room allocation is required before requesting to vacate');
    const date=text(body.requestedDate,'Requested date',10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<new Date(now()).toISOString().slice(0,10))fail(400,'Choose a valid date today or later');
    if(get("SELECT id FROM vacates WHERE booking_id=? AND status='pending'",b.id))fail(409,'Vacating request already pending');
    const r=run('INSERT INTO vacates(booking_id,reason,requested_date) VALUES(?,?,?)',b.id,text(body.reason,'Reason',1000),date);event(b.id,user.id,'vacate_requested',`Requested departure: ${date}`);return send(201,{id:Number(r.lastInsertRowid)});
   }
   const vacate=path.match(/^\/api\/vacates\/(\d+)\/(approve|reject)$/);
   if(vacate&&method==='POST'){role(user,'warden');return send(200,transaction(db,()=>{const v=get('SELECT * FROM vacates WHERE id=?',Number(vacate[1]));if(!v)fail(404,'Request not found');if(v.status!=='pending')fail(409,'Request already decided');const b=booking(v.booking_id,user);if(!['confirmed','occupied'].includes(b.status))fail(409,'Room allocation is no longer active');const approved=vacate[2]==='approve';run('UPDATE vacates SET status=?,decision_by=? WHERE id=?',approved?'approved':'rejected',user.id,v.id);if(approved)run("UPDATE bookings SET status='vacated' WHERE id=?",b.id);event(b.id,user.id,approved?'vacated':'vacate_rejected',approved?'Warden approved departure and released bed':'Vacating request rejected');return {ok:true};}));}
   if(path==='/api/reports'&&method==='GET') {
    role(user,'accountant');let where='';const args=[];
    for(const [key,operator]of [['from','>='],['to','<=']])if(url.searchParams.has(key)){const d=url.searchParams.get(key);if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)fail(400,'Invalid date filter');where+=(where?' AND ':' WHERE ')+`date(p.created_at) ${operator} ?`;args.push(d);}
    if(url.searchParams.get('from')>url.searchParams.get('to')&&url.searchParams.has('to'))fail(400,'From date must precede to date');
    const hostelId=url.searchParams.get('hostelId')?integer(Number(url.searchParams.get('hostelId')),'hostel'):null;
    if(hostelId){where+=(where?' AND ':' WHERE ')+'r.hostel_id=?';args.push(hostelId);}
    const payments=all(`SELECT p.*,u.name student_name,u.student_id student_number,h.name hostel FROM payments p JOIN users u ON u.id=p.student_id JOIN bookings b ON b.id=p.booking_id JOIN rooms r ON r.id=b.room_id JOIN hostels h ON h.id=r.hostel_id${where} ORDER BY p.id DESC`,...args);
    const outstanding=all("SELECT b.id booking_id,u.name student_name,b.fee,b.deadline,h.name hostel FROM bookings b JOIN users u ON u.id=b.student_id JOIN rooms r ON r.id=b.room_id JOIN hostels h ON h.id=r.hostel_id WHERE b.status='payment_pending' AND (? IS NULL OR r.hostel_id=?)",hostelId,hostelId);
    return send(200,{currency:'INR',unit:'paise',payments,total:payments.reduce((s,p)=>s+p.amount,0),count:payments.length,outstanding,outstandingTotal:outstanding.reduce((s,b)=>s+b.fee,0),note:'Demonstration ledger; no real money transferred. Date filter applies to received payments; outstanding is current.'});
   }
   if(path==='/api/notices'&&method==='GET'){
    const hostelId=url.searchParams.get('hostelId');
    return send(200,all(`SELECT n.*,h.name hostel,u.name author FROM notices n JOIN hostels h ON h.id=n.hostel_id JOIN users u ON u.id=n.author_id WHERE (? IS NULL OR n.hostel_id=?) ${user.role==='warden'?'AND n.hostel_id IN (SELECT hostel_id FROM warden_hostels WHERE warden_id=?)':''} ORDER BY n.id DESC LIMIT 100`,hostelId,hostelId,...(user.role==='warden'?[user.id]:[])));
   }
   if(path==='/api/notices'&&method==='POST'){
    role(user,'warden');const hostelId=integer(body.hostelId,'hostel');hostelAccess(user,hostelId);
    const r=run('INSERT INTO notices(hostel_id,author_id,title,body) VALUES(?,?,?,?)',hostelId,user.id,text(body.title,'Title',150),text(body.body,'Notice',3000));return send(201,{id:Number(r.lastInsertRowid)});
   }
   if(path==='/api/profile'&&method==='POST'){
    role(user,'student');run('UPDATE users SET name=?,phone=?,department=?,academic_year=? WHERE id=?',text(body.name,'Name'),text(body.phone,'Phone',30),text(body.department,'Department',100),integer(body.academicYear,'academic year',1,8),user.id);
    return send(200,{user:publicUser(get('SELECT * FROM users WHERE id=?',user.id))});
   }
   if(path==='/api/dashboard'&&method==='GET'){
    if(user.role==='student'){
     const bookings=all(`SELECT b.*,r.number room_number,h.name hostel,h.id hostel_id FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN hostels h ON h.id=r.hostel_id WHERE b.student_id=? ORDER BY b.id DESC`,user.id);
     const current=bookings.find(b=>['under_review','payment_pending','confirmed','occupied'].includes(b.status))||null;
     return send(200,{current,bookingCount:bookings.length,paid:get('SELECT COALESCE(SUM(amount),0) amount FROM payments WHERE student_id=?',user.id).amount,openComplaints:get("SELECT COUNT(*) n FROM complaints WHERE student_id=? AND status='open'",user.id).n,pendingVacates:get("SELECT COUNT(*) n FROM vacates v JOIN bookings b ON b.id=v.booking_id WHERE b.student_id=? AND v.status='pending'",user.id).n});
    }
    if(user.role==='warden'){
     const rooms=roomRows().filter(r=>get('SELECT 1 FROM warden_hostels WHERE warden_id=? AND hostel_id=?',user.id,r.hostel_id));
     return send(200,{hostelCount:visibleHostels(user).length,roomCount:rooms.length,occupancy:rooms.reduce((s,r)=>s+r.occupancy,0),available:rooms.reduce((s,r)=>s+r.available,0),pendingBookings:get("SELECT COUNT(*) n FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN warden_hostels wh ON wh.hostel_id=r.hostel_id WHERE wh.warden_id=? AND b.status='under_review'",user.id).n,openComplaints:get("SELECT COUNT(*) n FROM complaints c JOIN warden_hostels wh ON wh.hostel_id=c.hostel_id WHERE wh.warden_id=? AND c.status='open'",user.id).n});
    }
    return send(200,{paid:get('SELECT COALESCE(SUM(amount),0) n FROM payments').n,receiptCount:get('SELECT COUNT(*) n FROM payments').n,outstanding:get("SELECT COALESCE(SUM(fee),0) n FROM bookings WHERE status='payment_pending'").n,hostelCount:get('SELECT COUNT(*) n FROM hostels').n});
   }
   fail(404,'Endpoint not found');
  }catch(e){if(!e.status)console.error(e);send(e.status|| (e.code?.startsWith('ERR_SQLITE')?409:500),{error:e.status?e.message:e.code?.startsWith('ERR_SQLITE')?'Record conflicts with existing data':'Internal server error'});}
 });
 return {server,db,close:()=>new Promise((resolve,reject)=>server.close(e=>{db.close();e?reject(e):resolve();}))};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const app=createApp();const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||3000);
 app.server.on('error',error=>{if(error.code==='EADDRINUSE')console.error(`Port ${port} is already in use. Stop the previous server, or set PORT to another number (Command Prompt: set PORT=3001).`);else console.error(error.message);app.db.close();process.exitCode=1;});
 app.server.listen(port,host,()=>console.log(`Roomies: http://${host}:${port} (payments: ${process.env.PAYMENT_MODE||'demo'})`));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
}
