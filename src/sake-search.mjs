import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
const BASE = 'https://muro.sakenowa.com/sakenowa-data/api';
const AXES = [['f1','華やか(화려함)'],['f2','芳醇(방순)'],['f3','重厚(중후함)'],['f4','穏やか(온화함)'],['f5','ドライ(드라이)'],['f6','軽快(경쾌함)']];
const normalize = s => String(s ?? '').normalize('NFKC').trim().toLowerCase();
function validate(data, name) {
  if (!Array.isArray(data) || data.some(row => !row || typeof row !== 'object' || Array.isArray(row)))
    throw new Error(`Invalid Sakenowa ${name} response`);
  return data;
}
export function matchBrands(breweries, brands, flavorCharts, breweryQuery, brandQuery = '') {
  if (!normalize(breweryQuery)) throw new Error('Provide a brewery query');
  validate(breweries,'breweries'); validate(brands,'brands'); validate(flavorCharts,'flavor-charts');
  const matched = breweries.filter(b => normalize(b.name).includes(normalize(breweryQuery)));
  const ids = new Set(matched.map(b => b.id));
  const charts = new Map(flavorCharts.map(f => [f.brandId, f]));
  const found = brands.filter(b => ids.has(b.breweryId) && normalize(b.name).includes(normalize(brandQuery)));
  return {found: found.length > 0, ambiguous: found.length > 1, breweries: matched, brands: found.map(b => {
    const f = charts.get(b.id);
    return {...b, flavorScope:'brand-aggregate-not-bottle', flavor: f ? Object.fromEntries(AXES.map(([k,label]) => [label, Number.isFinite(f[k]) ? Number(f[k].toFixed(3)) : null])) : null};
  })};
}
export async function searchSake(breweryQuery, brandQuery = '', fetchImpl = fetch, {cacheDir, ttlMs=86400000} = {}) {
  if (!normalize(breweryQuery)) throw new Error('Provide a brewery query');
  async function load(name, key) {
    const path = cacheDir && join(cacheDir,`${name}.json`);
    if (path) {
      try {
        const saved=JSON.parse(await readFile(path,'utf8'));
        if (Date.now()-saved.fetchedAt < ttlMs && saved.fetchedAt <= Date.now()) return validate(saved.data,name);
      } catch { /* Missing or corrupt caches are refetched. */ }
    }
    const response = await fetchImpl(`${BASE}/${name}`, {signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error(`Sakenowa request failed (${response.status})`);
    const raw=await response.json(); const data=validate(raw[key] ?? raw,name);
    if (path) {
      await mkdir(cacheDir,{recursive:true}); const temp=`${path}.${randomUUID()}.tmp`;
      await writeFile(temp,JSON.stringify({fetchedAt:Date.now(),data})); await rename(temp,path);
    }
    return data;
  }
  const [B, Br, F] = await Promise.all([load('breweries','breweries'),load('brands','brands'),load('flavor-charts','flavorCharts')]);
  return {...matchBrands(B,Br,F,breweryQuery,brandQuery),source:BASE,cacheTtlHours:cacheDir ? ttlMs/3600000 : 0};
}
