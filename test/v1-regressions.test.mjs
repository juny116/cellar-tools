import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {matchBrands,searchSake} from '../src/sake-search.mjs';
import {uploadImage} from '../src/notion-images.mjs';
test('ambiguous matching and missing flavor axes remain explicit',()=>{
 const r=matchBrands([{id:1,name:'EXAMPLE'}],[{id:1,breweryId:1,name:'Dry A'},{id:2,breweryId:1,name:'Dry B'}],[{brandId:1,f1:'bad'}],' example ','dry');
 assert.equal(r.ambiguous,true); assert.equal(r.brands[0].flavorScope,'brand-aggregate-not-bottle'); assert.equal(Object.values(r.brands[0].flavor)[0],null);
});
test('malformed source payload is rejected',async()=>{
 await assert.rejects(searchSake('Example','',async()=>({ok:true,json:async()=>({unexpected:true})})),/Invalid Sakenowa/);
});
test('cache prevents repeated requests and repairs corrupt data',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cellar-cache-'));let calls=0;
 const fake=async url=>{calls++;return {ok:true,json:async()=>url.endsWith('/breweries')?[{id:1,name:'Example'}]:[]}};
 try{await searchSake('Example','',fake,{cacheDir:dir});await searchSake('Example','',fake,{cacheDir:dir});assert.equal(calls,3);
 await writeFile(join(dir,'brands.json'),'broken');await searchSake('Example','',fake,{cacheDir:dir});assert.equal(calls,4);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('upload validates target first and detects intervening attachment changes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cellar-upload-'));const path=join(dir,'i.png');await writeFile(path,'test');
 try{let methods=[];
 await assert.rejects(uploadImage(path,'0'.repeat(32),'Bottle',{token:'test',fetchImpl:async(url,o)=>{methods.push(o.method);return {ok:true,json:async()=>({properties:{}})}}}),/files property/);assert.deepEqual(methods,['GET']);
 methods=[];let reads=0;
 await assert.rejects(uploadImage(path,'0'.repeat(32),'Bottle',{token:'test',fetchImpl:async(url,o)=>{methods.push(o.method);return {ok:true,json:async()=>o.method==='GET'?{properties:{Bottle:{type:'files',files:++reads===1?[]:[{type:'external',name:'new',external:{url:'https://example.com/a'}}]}}}:{id:'upload'}}}}),/changed during upload/);
 assert.ok(!methods.includes('PATCH'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
