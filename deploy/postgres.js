// D1-compatible subset used by FINN's monitoring and delivery stores.
// Parameters remain bound, including when SQLite placeholders are translated.
export function postgresStatement(sql){
 let index=0,quoted=false;
 const ignore=/^\s*INSERT OR IGNORE INTO /i.test(sql);
 sql=sql.replace(/^\s*INSERT OR IGNORE INTO /i,'INSERT INTO ');
 let result='';
 for(let i=0;i<sql.length;i++){
  const c=sql[i];
  if(c==="'"){if(quoted&&sql[i+1]==="'"){result+="''";i++;continue}quoted=!quoted}
  result+=c==='?'&&!quoted?'$'+(++index):c;
 }
 if(ignore)result=result.replace(/;\s*$/,'')+' ON CONFLICT DO NOTHING';
 return result;
}
export function postgresDatabase(query){
 return {prepare(sql){return {bind(...args){
  const execute=()=>query(postgresStatement(sql),args);
  return {
   async run(){const r=await execute();return {meta:{changes:r.rowCount||0}}},
   async all(){const r=await execute();return {results:r.rows}},
   async first(){const r=await execute();return r.rows[0]||null}
  };
 }}}};
}
