// Bundles src/guide.ts into public/hiw-guide/guide.js. Run from this folder:
//   npm install && npm run build
import { build } from 'esbuild';
import path from 'node:path';
const repo = path.resolve(process.env.REPO_ROOT || '../..');
const out = process.env.OUT || path.join(repo, 'public/hiw-guide/guide.js');
await build({ entryPoints: ['src/guide.ts'], bundle: true, format: 'esm', minify: true, target: 'es2020', loader: { '.css': 'text' }, alias: { '@': repo }, outfile: out, legalComments: 'none' });
console.log('built', out);
