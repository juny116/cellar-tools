import { searchSake } from '../src/sake-search.mjs';
const [brewery, brand = ''] = process.argv.slice(2);
if (!brewery || brewery === '--help') { console.log('Usage: node bin/search-sake.mjs BREWERY [BRAND]'); process.exit(brewery ? 0 : 2); }
try { console.log(JSON.stringify(await searchSake(brewery,brand), null,2)); } catch(e) { console.error(e.message); process.exitCode=1; }
