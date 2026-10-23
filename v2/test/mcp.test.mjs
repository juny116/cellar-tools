import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('real stdio client discovers and executes an entire draft/commit/consume flow',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cellar-mcp-'));
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../mcp-server.mjs',import.meta.url))],env:{CELLAR_BACKEND:'sqlite',CELLAR_DB:join(dir,'test.sqlite')},stderr:'pipe'});
 const client=new Client({name:'cellar-test',version:'1.0.0'});
 try{
 await client.connect(transport);const tools=await client.listTools();assert.equal(tools.tools.length,6);
 const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify(r));return JSON.parse(r.content[0].text);};
 assert.equal((await call('cellar_status')).backend,'sqlite');
 await call('prepare_change',{requestId:'mcp-purchase-001',change:{action:'add',product:{kind:'sake',name:'Test',producer:'Test brewery',sources:[{kind:'user',reference:'synthetic fixture'}]},bottle:{volumeMl:720},count:1}});
 assert.equal((await call('list_inventory')).length,0);
 const done=await call('commit_change',{draftId:'mcp-purchase-001',confirmed:true});
 assert.deepEqual(await call('commit_change',{draftId:'mcp-purchase-001',confirmed:true}),done);
 assert.equal((await call('recommendation_context')).inventory.length,1);
 await call('prepare_change',{requestId:'mcp-consume-001',change:{action:'consume',bottleId:done.bottleIds[0],date:'2026-10-23'}});
 await call('commit_change',{draftId:'mcp-consume-001',confirmed:true});
 assert.equal((await call('list_inventory')).length,0);
 const invalid=await client.callTool({name:'commit_change',arguments:{draftId:'mcp-consume-001',confirmed:false}});assert.equal(invalid.isError,true);
 }finally{await client.close();await transport.close();await rm(dir,{recursive:true,force:true});}
});
