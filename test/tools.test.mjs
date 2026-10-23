import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchBrands, searchSake } from '../src/sake-search.mjs';
import { uploadImage } from '../src/notion-images.mjs';

test('brand filtering preserves a missing flavor profile', () => {
  const result = matchBrands([{id:1,name:'Example'}], [{id:2,breweryId:1,name:'Dry'}], [], 'Example', 'Dry');
  assert.equal(result.found,true); assert.equal(result.brands[0].flavor,null);
});
test('missing queries do not call the network', async () => {
  await assert.rejects(searchSake('', '', () => {throw new Error('network called')}), /brewery query/);
});
test('upstream errors are surfaced without reading payloads', async () => {
  await assert.rejects(searchSake('Example', '', async () => ({ok:false,status:503})), /503/);
});
test('upload appends an image and retains existing attachments', async () => {
  const dir=await mkdtemp(join(tmpdir(),'cellar-test-'));
  try {
    const path=join(dir,'image.png'); await writeFile(path,'synthetic-image');
    const calls=[];
    const fetchImpl=async (url,options) => {
      calls.push({url,...options});
      let data={};
      if (url.endsWith('/file_uploads')) data={id:'upload-test'};
      if (options.method==='GET') data={properties:{Bottle:{type:'files',files:[{name:'old',type:'external',external:{url:'https://example.com/image.png'}}]}}};
      return {ok:true,json:async()=>data};
    };
    await uploadImage(path,'00000000000000000000000000000000','Bottle',{token:'dummy-test-key',fetchImpl});
    const update=JSON.parse(calls.at(-1).body).properties.Bottle.files;
    assert.equal(update.length,2); assert.equal(update[0].name,'old'); assert.equal(update[1].file_upload.id,'upload-test');
    assert.deepEqual(calls.map(c=>c.method),['GET','POST','POST','GET','PATCH']);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('missing token fails before reading a file or sending a request', async () => {
  await assert.rejects(uploadImage('missing.png','00000000000000000000000000000000','Bottle',{token:''}), /NOTION_TOKEN/);
});
