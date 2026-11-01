/**
 * Package each built target for a manual install or a store upload.
 * Requires the `zip` binary; the build itself does not.
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

for (const target of ['chrome', 'firefox']) {
  const source = join(root, 'dist', target);
  const archive = join(root, 'dist', `chat-sweep-${version}-${target}.zip`);
  try {
    await run('zip', ['-q', '-r', archive, '.'], { cwd: source });
    console.log(`dist/chat-sweep-${version}-${target}.zip`);
  } catch (error) {
    console.error(`could not zip ${target}:`, error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
