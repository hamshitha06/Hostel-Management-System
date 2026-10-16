import { readdirSync,readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for(const folder of ['server','public','tests','scripts'])for(const f of readdirSync(folder).filter(x=>x.endsWith('.js'))){const r=spawnSync(process.execPath,['--check',`${folder}/${f}`],{stdio:'inherit'});if(r.status)process.exit(r.status);}
for(const f of ['public/index.html','public/app.css','server/schema.sql'])if(!readFileSync(f).length)throw Error(`Empty asset: ${f}`);
console.log('Build checks passed. Static client and server run directly; no compilation or dependencies required.');
