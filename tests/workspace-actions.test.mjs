import test from 'node:test';
import assert from 'node:assert/strict';
import createWorkspaceActions from '../src/workspace-actions.js';
import {parseCommand,planCommand} from '../src/commands.js';
const controls=createWorkspaceActions(),companies=[{ticker:'INFY',name:'Infosys'},{ticker:'TCS',name:'Tata Consultancy Services'}];
const current={prefs:{priceThreshold:4,volumeThreshold:2,categories:['results','dividend']},display:{density:'comfortable',showIndices:true},terminalSource:'auto',terminalExtra:[],watchlist:['INFY','TCS']};
test('a compound prompt prepares actual validated preferences and display changes',()=>{
 const plan=controls.parse('Set price alert to 5% and volume alert to 3x and use compact layout');
 const r=controls.prepare(plan,current);assert.equal(r.next.prefs.priceThreshold,5);assert.equal(r.next.prefs.volumeThreshold,3);assert.equal(r.next.display.density,'compact');assert.equal(r.changes.length,3);assert.equal(current.prefs.priceThreshold,4);
});
test('alert category focus supports replace, add and remove',()=>{
 assert.deepEqual(controls.prepare(controls.parse('Only alert me about management changes'),current).next.prefs.categories,['management_change']);
 assert.deepEqual(controls.prepare(controls.parse('Turn off dividend alerts'),current).next.prefs.categories,['results']);
 assert.ok(controls.prepare(controls.parse('Enable credit rating alerts'),current).next.prefs.categories.includes('credit_rating'));
});
test('terminal and contextual refresh operations do not need model routing',async()=>{
 const plan=await planCommand({prompt:'Use Yahoo as the terminal source',context:{view:'terminal'},companies,env:{GEMINI_API_KEY:'unused-test-key'}});assert.equal(plan.action,'workspace');assert.deepEqual(plan.workspace.operations,[{type:'terminal_source',value:'yahoo'}]);
 assert.deepEqual(controls.parse('Pause price updates',{view:'research'}).operations,[{type:'auto_refresh',value:false,view:'research'}]);
 assert.equal(controls.parse('Add Infosys to terminal',{},companies).operations[0].ticker,'INFY');
 assert.equal(controls.prepare(controls.parse('Add NESTLEIND to terminal'),current).next.terminalExtra[0],'NESTLEIND');
 assert.throws(()=>controls.prepare(controls.parse('Remove INFY from terminal'),current),/Portfolio symbols/);
});
test('chart, digest and index commands map to native app controls',()=>{
 assert.equal(controls.parse('Set chart to 3 months').operations[0].value,'3M');
 assert.equal(controls.parse('Set announcements window to 7 days').operations[0].value,'7d');
 assert.equal(controls.parse('Hide market indices').operations[0].value,false);
 assert.equal(controls.parse('Clear screener filters').operations[0].type,'clear_filters');
 assert.equal(controls.parse('Open settings').operations[0].type,'open_preferences');
});
test('invalid settings are rejected without a model call or partial state change',async()=>{
 const p=await planCommand({prompt:'Set price alert to 500%',context:{view:'briefing'},companies,env:{GEMINI_API_KEY:'unused-test-key'}});assert.equal(p.action,'clarify');assert.equal(p.reason,'workspace_control');
 assert.throws(()=>controls.prepare({operations:[{type:'threshold',key:'priceThreshold',value:5},{type:'execute',code:'deleteAll()'}]},current),/cannot change application code/);assert.equal(current.prefs.priceThreshold,4);
 assert.throws(()=>controls.validate({operations:[{type:'terminal_source',value:'https://evil.example'}]}),/Choose/);
 assert.equal(controls.parse('What did management say about price and volume alerts?'),null);
 assert.equal(controls.parse('Execute javascript to change price alerts'),null);
});
test('an in-detail follow-up retains the prior comparison instead of becoming a single-company lookup',()=>{
 const p=parseCommand('in detail',{view:'research',ticker:'INFY',tickers:['INFY','TCS'],previousQuery:'Compare Infosys and TCS'},companies);assert.equal(p.action,'compare');assert.deepEqual(p.tickers,['INFY','TCS']);assert.match(p.query,/Explain in detail/);
});
