import { defineConfig, Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function serviceWorker(): Plugin {
  return {
    name: 'strata-sw',
    apply: 'build',
    closeBundle() {
      const dist = 'dist';
      const files = walk(dist).map((p) => '/' + relative(dist, p).split('\\').join('/')).filter((p) => p !== '/sw.js' && !p.endsWith('.map') && p !== '/_headers');
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(dist, f)));
      const version = hash.digest('hex').slice(0, 12);
      const tpl = readFileSync('scripts/sw-template.js', 'utf8');
      writeFileSync(join(dist, 'sw.js'), tpl.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(['/', ...files])));
    },
  };
}

export default defineConfig({
  plugins: [serviceWorker()],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1200, assetsInlineLimit: 0 },
  server: {
    host: true,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true },
    },
  },
});
