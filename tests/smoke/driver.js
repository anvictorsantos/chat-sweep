/**
 * Drives the built Chrome bundle inside a fixture that mimics ChatGPT's DOM.
 * It exercises the real code paths: runtime messages from the popup, badge
 * clicks, shift ranges, select all, the confirmation dialog, hiding, undo and
 * the scripted conversation delete. No network, no helpers from src.
 */

const result = document.getElementById('smoke-result');
const checks = [];

function check(name, condition) {
  checks.push(name);
  if (!condition) throw new Error(`failed check: ${name}`);
  return true;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForValue(probe, timeout = 5000) {
  const started = Date.now();
  for (;;) {
    const value = probe();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error('timed out waiting for value');
    await sleep(50);
  }
}

function send(type, mode) {
  return new Promise((resolve) => {
    window.__listener({ type, mode }, {}, resolve);
  });
}

function clickWithShift(element) {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, shiftKey: true }));
}

async function main() {
  const host = await waitForValue(() => document.querySelector('[data-threadsweep-root]'));
  const shadow = host.shadowRoot;
  check('overlay mounted a shadow root', shadow !== null);

  // ---- message selection ------------------------------------------------
  let status = await send('threadsweep:open', 'thread');
  check('thread mode opens', status.active === true && status.mode === 'thread');
  check('three messages are selectable', shadow.querySelectorAll('.badge').length === 3);

  let badges = shadow.querySelectorAll('.badge');
  badges[0].click();
  check('clicking a badge selects one message', (await send('threadsweep:status')).count === 1);
  check('badge exposes pressed state', badges[0].getAttribute('aria-pressed') === 'true');

  clickWithShift(badges[2]);
  check('shift-click selects the range', (await send('threadsweep:status')).count === 3);

  await send('threadsweep:clear');
  check('clear empties the selection', (await send('threadsweep:status')).count === 0);

  status = await send('threadsweep:select-all');
  check('select all selects every message', status.count === 3);

  // ---- hide confirmation ------------------------------------------------
  shadow.querySelector('[data-act="apply"]').click();
  const dialog = await waitForValue(() => shadow.querySelector('[data-el="dialog"]'));
  check('a confirmation dialog is shown', dialog !== null);
  check(
    'the dialog says hiding is not deleting',
    dialog.textContent.includes('no per-message delete'),
  );

  const confirm = shadow.querySelector('[data-act="confirm"]');
  check('confirm starts disabled', confirm.disabled === true);

  shadow.querySelector('[data-el="ack"]').click();
  check('acknowledgement unlocks confirm', confirm.disabled === false);

  confirm.click();
  await waitForValue(() => shadow.querySelector('[data-act="undo"]'));

  const articles = [...document.querySelectorAll('article')];
  check(
    'every selected message is hidden',
    articles.every((article) => article.style.display === 'none'),
  );
  check(
    'the toast says nothing was deleted',
    shadow.querySelector('.toast').textContent.includes('Nothing was deleted'),
  );

  shadow.querySelector('[data-act="undo"]').click();
  check(
    'undo restores the messages',
    articles.every((article) => article.style.display !== 'none'),
  );

  // ---- conversation deletion -------------------------------------------
  await send('threadsweep:open', 'history');
  status = await send('threadsweep:status');
  check('history mode lists the sidebar conversations', status.count === 0);
  check('three conversations are selectable', shadow.querySelectorAll('.badge').length === 3);

  await send('threadsweep:select-all');
  check('select all selects every conversation', (await send('threadsweep:status')).count === 3);

  shadow.querySelector('[data-act="apply"]').click();
  const dialogDelete = await waitForValue(() => shadow.querySelector('[data-el="dialog"]'));
  check('the delete dialog is permanent', dialogDelete.textContent.includes('permanently deleted'));

  const deleteConfirm = shadow.querySelector('[data-act="confirm"]');
  check('delete confirm starts disabled', deleteConfirm.disabled === true);

  const phrase = shadow.querySelector('[data-el="phrase"]');
  phrase.value = 'DELETE';
  phrase.dispatchEvent(new Event('input', { bubbles: true }));
  check('the typed phrase alone is not enough', deleteConfirm.disabled === true);

  shadow.querySelector('[data-el="ack"]').click();
  check('phrase plus acknowledgement unlocks delete', deleteConfirm.disabled === false);

  deleteConfirm.click();
  await waitForValue(() => document.querySelectorAll('#rows li').length === 0, 20000);

  check('all conversations were removed through the site menu', document.querySelectorAll('#rows li').length === 0);
  check(
    'the toast reports the delete count',
    (await waitForValue(() => shadow.querySelector('.toast')))?.textContent.includes('Deleted 3 conversations'),
  );

  result.dataset.smoke = 'pass';
  result.textContent = `PASS ${checks.length} checks`;
}

main().catch((error) => {
  result.dataset.smoke = 'fail';
  result.textContent = `FAIL after ${checks.length} checks: ${error instanceof Error ? error.message : String(error)}`;
});
