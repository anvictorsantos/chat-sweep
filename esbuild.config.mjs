/**
 * Build both targets from one source tree. Chrome and Firefox share the same
 * MV3 manifest except for the Gecko identity block, so the difference lives in
 * this file rather than in two hand-maintained manifests.
 */

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url));
const targets = ['chrome', 'firefox'];

const entries = [
  { in: join(root, 'src/content/main.ts'), out: 'content' },
  { in: join(root, 'src/popup/popup.ts'), out: 'popup' },
];

function firefoxManifest(base) {
  const manifest = { ...base };
  delete manifest.minimum_chrome_version;
  manifest.browser_specific_settings = {
    gecko: {
      id: 'chat-sweep@pontes.dev',
      strict_min_version: '121.0',
    },
  };
  return manifest;
}

for (const target of targets) {
  const outdir = join(root, 'dist', target);
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  await build({
    entryPoints: entries,
    outdir,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: target === 'firefox' ? ['firefox121'] : ['chrome116'],
    legalComments: 'none',
    logLevel: 'warning',
    banner: {
      js: '/* Chat Sweep — local-only chat selection. No network, no telemetry. */',
    },
  });

  await cp(join(root, 'public/popup.html'), join(outdir, 'popup.html'));
  await cp(join(root, 'public/icons'), join(outdir, 'icons'), { recursive: true });

  const base = JSON.parse(await readFile(join(root, 'public/manifest.base.json'), 'utf8'));
  const manifest = target === 'firefox' ? firefoxManifest(base) : base;
  await writeFile(join(outdir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`built dist/${target}`);
}
