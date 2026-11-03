import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceFallback} from '../src/research.js';
test('a provider failure retains evidence and does not falsely claim no model is connected',()=>{
 const evidence=[{id:'passage-1',text:'Original source text'}];
 const result=evidenceFallback('question',evidence,[{tool:'provider_error'}],'Model request failed (HTTP 503).');
 assert.match(result.summary,/synthesis is unavailable/);assert.doesNotMatch(result.summary,/Connect a model/);assert.deepEqual(result.evidence,evidence);assert.match(result.gaps[0],/503/);
 const keyless=evidenceFallback('question',evidence,[]);assert.match(keyless.summary,/Connect a model/);
});
