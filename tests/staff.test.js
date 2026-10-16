import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {openDatabase} from '../server/db.js';

test('operator provisions, assigns and revokes hostel access without public role changes',()=>{
 const folder=mkdtempSync(join(tmpdir(),'roomies-staff-')),database=join(folder,'staff.sqlite');
 const env={...process.env,DATABASE_PATH:database,STAFF_PASSWORD:'Strong staff password 123!'};
 function execute(script,args){return spawnSync(process.execPath,[script,...args],{env,encoding:'utf8'});}
 try{
  assert.equal(execute('server/staff.js',['warden','first@example.edu','First Warden','1']).status,0);
  let db=openDatabase(database);const id=db.prepare('SELECT id FROM users').get().id;assert.equal(db.prepare('SELECT hostel_id FROM warden_hostels WHERE warden_id=?').get(id).hostel_id,1);db.close();
  assert.equal(execute('server/assign.js',['first@example.edu','2']).status,0);
  assert.equal(execute('server/assign.js',['first@example.edu','1','remove']).status,0);
  db=openDatabase(database);assert.deepEqual(db.prepare('SELECT hostel_id FROM warden_hostels WHERE warden_id=?').all(id).map(r=>r.hostel_id),[2]);db.close();
  assert.notEqual(execute('server/staff.js',['warden','bad@example.edu','Invalid Warden','99999']).status,0);
  db=openDatabase(database);assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE email='bad@example.edu'").get().n,0);db.close();
 }finally{rmSync(folder,{recursive:true,force:true});}
});
