const BASE = 'https://muro.sakenowa.com/sakenowa-data/api';
const AXES = [['f1','華やか(화려함)'],['f2','芳醇(방순)'],['f3','重厚(중후함)'],['f4','穏やか(온화함)'],['f5','ドライ(드라이)'],['f6','軽快(경쾌함)']];

export function matchBrands(breweries, brands, flavorCharts, breweryQuery, brandQuery = '') {
  if (!breweryQuery?.trim()) throw new Error('Provide a brewery query');
  const matched = breweries.filter(b => (b.name ?? '').includes(breweryQuery));
  const ids = new Set(matched.map(b => b.id));
  const charts = new Map(flavorCharts.map(f => [f.brandId, f]));
  const found = brands.filter(b => ids.has(b.breweryId) && (b.name ?? '').includes(brandQuery));
  return {found: found.length > 0, breweries: matched, brands: found.map(b => {
    const f = charts.get(b.id);
    return {...b, flavor: f ? Object.fromEntries(AXES.map(([k,label]) => [label, Number.isFinite(f[k]) ? Number(f[k].toFixed(3)) : null])) : null};
  })};
}

export async function searchSake(breweryQuery, brandQuery = '', fetchImpl = fetch) {
  if (!breweryQuery?.trim()) throw new Error('Provide a brewery query');
  async function load(name) {
    const response = await fetchImpl(`${BASE}/${name}`);
    if (!response.ok) throw new Error(`Sakenowa request failed (${response.status})`);
    return response.json();
  }
  const [B, Br, F] = await Promise.all(['breweries','brands','flavor-charts'].map(load));
  return matchBrands(B.breweries ?? B, Br.brands ?? Br, F.flavorCharts ?? F, breweryQuery, brandQuery);
}
