import {createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
const COOKIE='__Host-finn-session';
const same=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)};
const sign=(value,secret)=>createHmac('sha256',secret).update(value).digest('base64url');
export function sessionCookie(env,now=Date.now()){
 const value=Buffer.from(JSON.stringify({exp:now+7*86400000,nonce:randomBytes(16).toString('hex')})).toString('base64url');
 return COOKIE+'='+value+'.'+sign(value,env.FINN_SESSION_SECRET)+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800';
}
export function authenticated(request,env,now=Date.now()){
 if(!env.FINN_SESSION_SECRET||!env.FINN_ACCESS_PASSWORD)return false;
 const cookie=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!cookie)return false;
 const [value,signature,...extra]=cookie.split('.');
 if(!value||!signature||extra.length||!same(signature,sign(value,env.FINN_SESSION_SECRET)))return false;
 try{return JSON.parse(Buffer.from(value,'base64url')).exp>now}catch{return false}
}
const headers={'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",'x-content-type-options':'nosniff'};
function loginPage(error=''){
 return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · FINN</title><style>*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#f5f7fa;color:#18212b;font:16px system-ui}main{margin:24px;padding:32px;width:min(400px,calc(100% - 48px));background:white;border:1px solid #e0e5eb;border-radius:16px}h1{margin:0 0 12px}p{color:#657185;line-height:1.6}input,button{width:100%;padding:14px;border-radius:8px;font:inherit;margin-top:12px}input{border:1px solid #d5dce5}button{border:0;background:#1d5bda;color:white;cursor:pointer}.error{color:#ad2020}</style><main><h1>FINN</h1><p>Your private research desk.</p>${error?'<p class="error">'+error+'</p>':''}<form action="/auth/login" method="post"><label for="password">Access password</label><input id="password" type="password" name="password" autocomplete="current-password" required maxlength="256"><button>Sign in</button></form></main></html>`,{status:error?401:200,headers});
}
export async function authorize(request,env){
 const url=new URL(request.url);
 if(!env.FINN_SESSION_SECRET||!env.FINN_ACCESS_PASSWORD)return new Response('Private workspace setup is incomplete.',{status:503,headers:{'cache-control':'no-store'}});
 if(url.pathname==='/auth/login'&&request.method==='POST'){
  if(request.headers.get('origin')!==url.origin)return new Response('Use the FINN sign-in page.',{status:403});
  if(Number(request.headers.get('content-length')||0)>2048)return new Response('Request too large',{status:413});
  const form=await request.text();if(form.length>2048)return new Response('Request too large',{status:413});
  const password=new URLSearchParams(form).get('password');
  if(!same(password||'',env.FINN_ACCESS_PASSWORD))return loginPage('Incorrect password.');
  return new Response(null,{status:303,headers:{location:'/', 'set-cookie':sessionCookie(env),'cache-control':'no-store'}});
 }
 if(authenticated(request,env))return null;
 if(url.pathname.startsWith('/api/'))return Response.json({error:'Sign in to FINN.',code:'AUTH_REQUIRED'},{status:401,headers:{'cache-control':'no-store'}});
 return loginPage();
}
