import { build } from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const out = resolve('dist');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp('studio', out, { recursive: true });
const html = await readFile(resolve(out, 'index.html'), 'utf8');
await writeFile(resolve(out, 'index.html'), html.replace('</head>', '<meta name="sosan-export-mode" content="browser">\n</head>'));
await build({ entryPoints: ['web/export-worker.js'], outfile: resolve(out, 'export-worker.bundle.js'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'inline' });
await mkdir(resolve(out, 'licenses'), { recursive: true });
await cp('node_modules/mediabunny/LICENSE', resolve(out, 'licenses/mediabunny.txt'));
await cp('node_modules/@mediabunny/aac-encoder/LICENSE', resolve(out, 'licenses/aac-encoder.txt'));
await writeFile(resolve(out, '.nojekyll'), '');
console.log(`Built GitHub Pages site in ${out}`);
await cp('LICENSE', resolve(out, 'licenses/sosan.txt'));
await cp('THIRD_PARTY_NOTICES.md', resolve(out, 'licenses/notices.md'));
