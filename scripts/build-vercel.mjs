import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('dist/server',{recursive:true});
await mkdir('public',{recursive:true});
await writeFile('public/.gitkeep','');
await build({entryPoints:['src/worker.js'],outfile:'dist/server/vercel-worker.mjs',bundle:true,format:'esm',platform:'node',target:'node22',minify:true,loader:{'.html':'text','.css':'text'},logLevel:'info'});
