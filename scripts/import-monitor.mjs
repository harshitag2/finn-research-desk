import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {postgresDatabase} from '../deploy/postgres.js';
const input=JSON.parse(await readFile('.local/d1-migration.json','utf8'));
const sql=neon(process.env.DATABASE_URL),db=postgresDatabase((text,args)=>sql.query(text,args,{fullResults:true}));
for(const row of input.configs){
 const owner=row.owner==='shared'?'shared':'vercel-owner';
 await db.prepare('INSERT INTO finn_monitor_config (owner,config_json,enabled,updated_at) VALUES (?,?,?,?) ON CONFLICT(owner) DO NOTHING').bind(owner,row.config_json,row.enabled,row.updated_at).run();
}
for(const row of input.events){
 const owner=row.owner==='shared'?'shared':'vercel-owner';const payload=JSON.parse(row.payload_json);
 const id=createHash('sha256').update(owner+'|'+payload.key).digest('hex');
 await db.prepare('INSERT OR IGNORE INTO finn_monitor_events (id,owner,ticker,kind,payload_json,first_seen_at,state) VALUES (?,?,?,?,?,?,?)').bind(id,owner,row.ticker,row.kind,row.payload_json,row.first_seen_at,row.state).run();
}
const row=await db.prepare('SELECT COUNT(*) AS count FROM finn_monitor_events').bind().first();
console.log('PostgreSQL import verified: '+row.count+' persistent alerts; '+input.configs.length+' profiles imported.');
