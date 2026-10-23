// Compatibility entry point for the original cellar-logger command.
import {fileURLToPath} from 'node:url';
process.env.CELLAR_CACHE_DIR ??= fileURLToPath(new URL('../.cache',import.meta.url));
await import('../bin/search-sake.mjs');
