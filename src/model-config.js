export const DEFAULT_GEMINI_MODEL='gemini-3.1-flash-lite';
export function modelConfig(env={}){
 const provider=env.FINN_PROVIDER||'gemini';
 const key=provider==='gemini'?(env.GEMINI_API_KEY||env.GOOGLE_API_KEY||env.FINN_API_KEY||''):(env.FINN_API_KEY||'');
 const model=env.FINN_MODEL||(provider==='gemini'?DEFAULT_GEMINI_MODEL:'');
 return {provider,model,key,configured:!!model&&!!(key||provider==='ollama'),url:env.FINN_API_URL||''};
}
