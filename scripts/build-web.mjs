import { build } from 'esbuild';
import { cp, mkdir, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const out = resolve('dist');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp('studio', out, { recursive: true });
const scripts = (await readdir('studio')).filter(file => file.endsWith('.js')).sort();
const hash = createHash('sha256');
for (const file of [...scripts.map(name => `studio/${name}`), 'studio/style.css', 'studio/index.html', 'web/export-worker.js', 'package-lock.json']) hash.update(await readFile(file));
const version = hash.digest('hex').slice(0, 12);
// Version the full module graph so Pages/browser caches cannot retain a fixed bug.
for (const script of scripts) {
  const path = resolve(out, script);
  const source = (await readFile(path, 'utf8'))
    .replace(/(from\s+['"])(\.\/[^'"]+\.js)(['"])/g, `$1$2?v=${version}$3`)
    .replace("'./export-worker.bundle.js'", `'./export-worker.bundle.js?v=${version}'`);
  await writeFile(path, source);
}
const html = await readFile(resolve(out, 'index.html'), 'utf8');
await writeFile(resolve(out, 'index.html'), html
  .replace('./app.js', `./app.js?v=${version}`)
  .replace('./style.css', `./style.css?v=${version}`)
  .replace('</head>', '<meta name="sosan-export-mode" content="browser">\n</head>'));
await build({ entryPoints: ['web/export-worker.js'], outfile: resolve(out, 'export-worker.bundle.js'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'inline' });
await mkdir(resolve(out, 'licenses'), { recursive: true });
await cp('node_modules/mediabunny/LICENSE', resolve(out, 'licenses/mediabunny.txt'));
await cp('node_modules/@mediabunny/aac-encoder/LICENSE', resolve(out, 'licenses/aac-encoder.txt'));
await writeFile(resolve(out, '.nojekyll'), '');
await cp('LICENSE', resolve(out, 'licenses/sosan.txt'));
await cp('THIRD_PARTY_NOTICES.md', resolve(out, 'licenses/notices.md'));
console.log(`Built GitHub Pages site ${version} in ${out}`);
