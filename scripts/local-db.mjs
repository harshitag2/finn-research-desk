import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile} from 'node:fs/promises';
export async function localDatabase(file='.local/finn.sqlite'){
 await mkdir('.local',{recursive:true});const db=new DatabaseSync(file);
 const schema=await readFile(new URL('../drizzle/0000_monitor.sql',import.meta.url),'utf8');
 for(const statement of schema.split('--> statement-breakpoint')){const table=statement.match(/CREATE TABLE (\w+)/);if(table&&!db.prepare('SELECT name FROM sqlite_master WHERE name=?').get(table[1]))db.exec(statement);else if(/CREATE INDEX/.test(statement))db.exec(statement.replace('CREATE INDEX','CREATE INDEX IF NOT EXISTS'))}
 return {prepare(sql){const statement=db.prepare(sql);return {bind(...values){return {async run(){const r=statement.run(...values);return {meta:{changes:Number(r.changes)}}},async all(){return {results:statement.all(...values)}},async first(){return statement.get(...values)||null}}}}},close(){db.close()}};
}
