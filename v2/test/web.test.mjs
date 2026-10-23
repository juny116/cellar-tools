import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../web-server.mjs';
import {SqliteStore} from '../sqlite-store.mjs';
test('local HTTP boundary rejects foreign origins and permits reviewed writes',async()=>{
 const store=new SqliteStore(':memory:'),server=createApp(store);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 try{const state=await(await fetch(base+'/api/state')).json();assert.equal(state.inventory.length,0);
 const change={action:'add',product:{kind:'whisky',name:'Test',producer:'Test',sources:[{kind:'user',reference:'fixture'}]},bottle:{},count:1};
 const send=(path,body,origin=base)=>fetch(base+'/api/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Cellar-CSRF':state.csrf},body:JSON.stringify(body)});
 assert.equal((await send('prepare',{requestId:'web-add-001',change},'https://evil.example')).status,403);
 assert.equal((await send('prepare',{requestId:'web-add-001',change})).status,200);assert.equal(store.listInventory().length,0);
 assert.equal((await send('commit',{draftId:'web-add-001',confirmed:true})).status,200);assert.equal(store.listInventory().length,1);
 assert.match(await(await fetch(base)).text(),/내 셀러/);
 }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});
