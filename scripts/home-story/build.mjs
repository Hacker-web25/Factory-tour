// Bundles src/story.ts into public/home-story/story.js. Run from this folder:
//   npm install && npm run build
import { build } from 'esbuild';
import path from 'node:path';
const repo = path.resolve('../..');
await build({ entryPoints: ['src/story.ts'], bundle: true, format: 'esm', minify: true, target: 'es2020', loader: { '.css': 'text' }, alias: { '@': repo }, outfile: path.join(repo, 'public/home-story/story.js'), legalComments: 'none' });
console.log('built public/home-story/story.js');
