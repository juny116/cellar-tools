// Read-only end-to-end check. Command follows --, e.g. node check-mcp.mjs -- sh ssh-mcp.sh
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const pos=process.argv.indexOf('--');
if(pos<0||!process.argv[pos+1])throw new Error('Usage: node check-mcp.mjs -- COMMAND [ARGS]');
const transport=new StdioClientTransport({command:process.argv[pos+1],args:process.argv.slice(pos+2),stderr:'pipe'});
const client=new Client({name:'cellar-read-only-check',version:'1.0.0'});
try{
 await client.connect(transport);
 const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});if(r.isError)throw new Error(r.content[0].text);return JSON.parse(r.content[0].text);};
 const status=await call('cellar_status'),inventory=await call('list_inventory');
 const context=await call('recommendation_context',{intent:'pairing',food:'grilled fish'});
 if(inventory.length)await call('get_bottle',{bottleId:inventory[0].id});
 console.log(JSON.stringify({status,tools:(await client.listTools()).tools.map(t=>t.name),availableBottles:inventory.length,contextBottles:context.inventory.length,prompts:(await client.listPrompts()).prompts.map(p=>p.name),writesPerformed:false},null,2));
}finally{await client.close();await transport.close();}
