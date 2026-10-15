import { uploadImage } from '../src/notion-images.mjs';
const [image, page, property = 'Bottle'] = process.argv.slice(2);
if (!image || !page || image === '--help') { console.log('Usage: node bin/upload-image.mjs IMAGE PAGE_ID [PROPERTY]'); process.exit(image === '--help' ? 0 : 2); }
try { console.log(JSON.stringify(await uploadImage(image,page,property),null,2)); } catch(e) { console.error(e.message); process.exitCode=1; }
