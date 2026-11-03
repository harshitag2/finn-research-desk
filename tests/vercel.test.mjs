import test from 'node:test';
import assert from 'node:assert/strict';
import {postgresDatabase,postgresStatement} from '../deploy/postgres.js';
import {sessionCookie,authenticated,authorize} from '../deploy/vercel-auth.js';
const env={FINN_ACCESS_PASSWORD:'a-long-test-only-password',FINN_SESSION_SECRET:'test-only-session-secret-at-least-32-characters'};
test('Postgres translation preserves quoted question marks and binds all actual parameters',()=>{
 assert.equal(postgresStatement("SELECT '?' AS literal, 'it''s ?' AS escaped FROM t WHERE a=? AND b=?"),"SELECT '?' AS literal, 'it''s ?' AS escaped FROM t WHERE a=$1 AND b=$2");
 assert.equal(postgresStatement('INSERT OR IGNORE INTO t (a,b) VALUES (?,?)'),'INSERT INTO t (a,b) VALUES ($1,$2) ON CONFLICT DO NOTHING');
 assert.match(postgresStatement('INSERT INTO t (a) VALUES (?) ON CONFLICT(a) DO UPDATE SET a=excluded.a'),/VALUES \(\$1\) ON CONFLICT\(a\) DO UPDATE/);
});
test('D1 adapter returns rows, nullable first row and affected row count',async()=>{
 const seen=[];const db=postgresDatabase(async(sql,args)=>{seen.push({sql,args});return {rows:sql.includes('empty')?[]:[{owner:args[0]}],rowCount:2}});
 assert.deepEqual(await db.prepare('SELECT owner FROM t WHERE owner=?').bind('one').all(),{results:[{owner:'one'}]});
 assert.equal(await db.prepare('SELECT empty').bind().first(),null);
 assert.equal((await db.prepare('DELETE FROM t WHERE owner=?').bind('one').run()).meta.changes,2);
 assert.deepEqual(seen[0],{sql:'SELECT owner FROM t WHERE owner=$1',args:['one']});
});
test('private gate fails closed without configuration and never trusts OAI identity',async()=>{
 const request=new Request('https://finn.test/api/library',{headers:{'oai-authenticated-user-id':'attacker'}});
 assert.equal((await authorize(request,{})).status,503);
 assert.equal((await authorize(request,env)).status,401);
});
test('session cookies are signed, expire, and cannot be forged or reused after secret rotation',()=>{
 const now=Date.now();const cookie=sessionCookie(env,now).split(';')[0];
 const request=new Request('https://finn.test/',{headers:{cookie}});
 assert.equal(authenticated(request,env,now),true);
 assert.equal(authenticated(request,env,now+8*86400000),false);
 assert.equal(authenticated(request,{...env,FINN_SESSION_SECRET:'rotated'},now),false);
 assert.equal(authenticated(new Request('https://finn.test/',{headers:{cookie:cookie+'x'}}),env,now),false);
 assert.match(sessionCookie(env),/HttpOnly; Secure; SameSite=Lax/);
});
test('login rejects foreign origins and incorrect password and sets a private session on success',async()=>{
 const login=(password,origin='https://finn.test')=>new Request('https://finn.test/auth/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password})});
 assert.equal((await authorize(login(env.FINN_ACCESS_PASSWORD,'https://evil.test'),env)).status,403);
 assert.equal((await authorize(login('wrong'),env)).status,401);
 const response=await authorize(login(env.FINN_ACCESS_PASSWORD),env);
 assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/');
 const cookie=response.headers.get('set-cookie').split(';')[0];
 assert.equal(await authorize(new Request('https://finn.test/',{headers:{cookie}}),env),null);
});
