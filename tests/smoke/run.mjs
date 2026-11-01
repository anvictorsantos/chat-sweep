/**
 * Headless smoke test: serves the repo over TLS, maps chatgpt.com to it, loads
 * the built bundle in a fixture that mimics the real DOM, and asserts the
 * result the page reports.
 *
 * This is the only check that proves the bundle actually runs — typechecking
 * cannot catch a shadow-DOM listener that never fires.
 */

import { execFile, execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, connect } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function onPath(command) {
  try {
    return execFileSync('which', [command], { encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const bundle = join(root, 'dist', 'chrome', 'content.js');

const CANDIDATES = [
  process.env['CHROME_PATH'],
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  onPath('chrome'),
  onPath('google-chrome'),
  onPath('chromium'),
].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);

const chrome = CANDIDATES.find((candidate) => existsSync(candidate));
if (chrome === undefined) {
  console.error('smoke: no Chrome binary found; set CHROME_PATH to run this check');
  process.exit(2);
}

if (!existsSync(bundle)) {
  console.error('smoke: dist/chrome/content.js is missing; run npm run build first');
  process.exit(2);
}

const port = await freePort();
const workspace = await mkdtemp(join(tmpdir(), 'chat-sweep-smoke-'));
const certFile = join(workspace, 'cert.pem');
const keyFile = join(workspace, 'key.pem');

await run('openssl', [
  'req',
  '-x509',
  '-newkey',
  'rsa:2048',
  '-nodes',
  '-days',
  '1',
  '-subj',
  '/CN=chatgpt.com',
  '-keyout',
  keyFile,
  '-out',
  certFile,
]);

const server = spawn(
  'python3',
  [join(root, 'tests', 'smoke', 'serve.py'), String(port), root, certFile, keyFile],
  { stdio: 'ignore' },
);

for (let attempt = 0; attempt < 50; attempt += 1) {
  if (await probe(port)) break;
  await sleep(100);
}

const child = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--ignore-certificate-errors',
    `--user-data-dir=${join(workspace, 'profile')}`,
    `--host-resolver-rules=MAP chatgpt.com 127.0.0.1:${port}`,
    '--virtual-time-budget=45000',
    '--dump-dom',
    'https://chatgpt.com/tests/smoke/fixture.html',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => {
  stdout += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

const timeout = setTimeout(() => {
  console.error('smoke: chrome timed out');
  child.kill('SIGKILL');
}, 120_000);

child.on('close', async () => {
  clearTimeout(timeout);

  const passed = stdout.includes('data-smoke="pass"');
  const summary =
    /PASS \d+ checks/u.exec(stdout)?.[0] ?? /FAIL[^<]*/u.exec(stdout)?.[0] ?? 'no result in DOM';

  if (passed) console.log(`smoke: ${summary}`);
  else {
    console.error(`smoke: ${summary}`);
    if (stderr.trim().length > 0) {
      const lines = stderr.trim().split('\n');
      console.error([...lines.slice(0, 15), ...lines.slice(-10)].join('\n'));
    }
  }

  server.kill('SIGTERM');
  await rm(workspace, { recursive: true, force: true });
  process.exit(passed ? 0 : 1);
});

function freePort() {
  return new Promise((resolve, reject) => {
    const probeServer = createServer();
    probeServer.once('error', reject);
    probeServer.listen(0, '127.0.0.1', () => {
      const address = probeServer.address();
      const value = typeof address === 'object' && address !== null ? address.port : 0;
      probeServer.close(() => resolve(value));
    });
  });
}

function probe(targetPort) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port: targetPort });
    socket.setTimeout(400);
    const done = (ready) => {
      socket.destroy();
      resolve(ready);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });
}
