import {build} from 'esbuild';
import {mkdir,copyFile,readFile} from 'node:fs/promises';
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
await build({entryPoints:['src/worker.js'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,loader:{'.html':'text','.css':'text'},external:['node:*'],logLevel:'info'});
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
const manifest=JSON.parse(await readFile('dist/.openai/hosting.json','utf8'));
if(!manifest.project_id)throw new Error('Site identity missing');
console.log('FINN Worker built. Source corpus is bundled; no keys are included.');
