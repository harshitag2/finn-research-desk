import {readFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
const sql=neon(process.env.DATABASE_URL);
const schema=await readFile(new URL('../deploy/postgres.sql',import.meta.url),'utf8');
const statements=schema.split(';').map(s=>s.trim()).filter(Boolean);
await sql.transaction(statements.map(statement=>sql.query(statement,[])));
console.log('FINN PostgreSQL schema ready. Existing records were preserved.');
