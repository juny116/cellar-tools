// Compatibility entry point; preserve the original local .env setup.
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const envPath=fileURLToPath(new URL('../.env',import.meta.url));
if (!process.env.NOTION_TOKEN && existsSync(envPath)) {
  if (!process.loadEnvFile) throw new Error('Use Node 20.12+ or export NOTION_TOKEN');
  process.loadEnvFile(envPath);
}
await import('../bin/upload-image.mjs');
