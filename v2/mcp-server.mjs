import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {createStore} from './store-factory.mjs';
import {changeSchema,requestIdSchema} from './schema.mjs';
import {assistantRules,filterInventory,recommendationContext} from './assistant-context.mjs';
import {searchSake} from '../src/sake-search.mjs';
const store=await createStore();
const server=new McpServer({name:'cellar-assistant',version:'0.3.0'},{instructions:assistantRules.join('\n')});
const result=x=>({content:[{type:'text',text:JSON.stringify(x)}]});
const call=fn=>async args=>{try{return result(await fn(args));}catch(e){return {...result({error:e.message}),isError:true};}};
const read={readOnlyHint:true,destructiveHint:false};
server.registerTool('cellar_status',{description:'Report active storage and supported operations.',inputSchema:{},annotations:read},call(()=>store.capabilities));
server.registerTool('list_inventory',{description:'Read physical bottles and their product facts. Excludes consumed bottles by default.',inputSchema:{includeConsumed:z.boolean().default(false),query:z.string().max(500).default(''),kind:z.enum(['sake','wine','whisky','beer','spirits','other']).optional(),location:z.string().max(500).optional()},annotations:read},call(async a=>filterInventory(await store.listInventory(a),a)));
server.registerTool('get_bottle',{description:'Read a specific physical bottle, including consumed status. Fails if the ID is not in this cellar.',inputSchema:{bottleId:z.string().min(1).max(500)},annotations:read},call(async a=>{const bottle=(await store.listInventory({includeConsumed:true})).find(b=>b.id===a.bottleId);if(!bottle)throw new Error('Unknown bottle in this cellar');return bottle;}));
server.registerTool('search_catalog',{description:'Find existing products, including products with no available bottles, before registering a new bottle. Select an exact variant explicitly.',inputSchema:{query:z.string().trim().min(1).max(500)},annotations:read},call(a=>store.searchCatalog(a.query)));
server.registerTool('recommendation_context',{description:'Gather current inventory, explicit preferences and optional consumption history for pairing or purchase advice. Calling AI supplies reasoning; no extra model API cost. Live retail search must use the client web search.',inputSchema:{intent:z.enum(['pairing','purchase','general']).default('general'),food:z.string().max(2000).optional(),occasion:z.string().max(1000).optional(),budget:z.number().nonnegative().optional(),currency:z.string().regex(/^[A-Z]{3}$/).optional(),bottleIds:z.array(z.string().max(500)).max(100).optional(),includeHistory:z.boolean().default(false)},annotations:read},call(a=>recommendationContext(store,a)));
server.registerResource('cellar-workflow','cellar://workflow',{description:'Cellar evidence, recommendation and confirmed-write workflow',mimeType:'text/plain'},async uri=>({contents:[{uri:uri.href,text:assistantRules.join('\n')}]}));
for(const intent of ['pairing','purchase']) server.registerPrompt('cellar_'+intent,{description:intent==='pairing'?'Pair food with bottles actually in the cellar':'Compare a potential purchase against stock and preferences',argsSchema:{request:z.string()}},({request})=>({messages:[{role:'user',content:{type:'text',text:assistantRules.join('\n')+'\nTask ('+intent+'): '+request}}]}));
server.registerTool('search_sake',{description:'Sakenowa candidates and brand-level aggregate flavor data. Never assume exact bottle identity.',inputSchema:{brewery:z.string().trim().min(1),brand:z.string().default('')},annotations:{...read,openWorldHint:true}},call(a=>searchSake(a.brewery,a.brand,fetch,{cacheDir:process.env.CELLAR_CACHE_DIR})));
if(store.capabilities.write){
 server.registerTool('get_operation',{description:'Inspect a draft or previous commit after a timeout. Reuse its draftId; never create a duplicate retry.',inputSchema:{draftId:requestIdSchema},annotations:read},call(a=>store.getOperation(a.draftId)));
 if(store.reconcile)server.registerTool('reconcile_change',{description:'Reconcile a failed Notion operation by finding exact operation markers or verifying intended fields. Does not write inventory. Missing/ambiguous evidence remains blocked. Resuming remaining steps requires commit_change after user review.',inputSchema:{draftId:requestIdSchema},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true}},call(a=>store.reconcile(a.draftId)));
 server.registerTool('prepare_change',{description:'Persist an immutable proposed add/edit/consume/preferences change. Does not modify inventory. Use a stable requestId for retries; show the returned draft to the user before committing. Existing variants require explicit productId selection.',inputSchema:{requestId:requestIdSchema,change:changeSchema},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true}},call(a=>store.prepare(a.requestId,a.change)));
 server.registerTool('commit_change',{description:'Commit exactly the reviewed draft after explicit user authorization. Repeating the same draft ID returns the original result without duplicating bottles. confirmed is an intent guard, not user authentication.',inputSchema:{draftId:requestIdSchema,confirmed:z.literal(true)},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true}},call(a=>store.commit(a.draftId,a.confirmed)));
}
server.onclose=()=>store.close();
await server.connect(new StdioServerTransport());
