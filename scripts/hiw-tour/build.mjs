// Bundles src/ into public/hiw-tour/tour.js (three.js included, so the site CSP's 'self' covers it).
import { build } from 'esbuild';
await build({ entryPoints: ['src/tour.js'], bundle: true, format: 'esm', minify: true, target: 'es2020', loader: { '.css': 'text' }, outfile: '../../public/hiw-tour/tour.js', legalComments: 'none' });
console.log('built ../../public/hiw-tour/tour.js');
