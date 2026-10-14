// Browser-Abnahme fuer die DSH-0.1.7-Workspace-Migration (Phase 8).
//
// Aufruf (Instanz vorher starten, Token-URL aus der Startmeldung nehmen):
//   node scripts/check-dsh-017-workspace-acceptance.mjs \
//     "http://127.0.0.1:<port>/?token=<token>" \
//     "<migrationsreport.json>" "<ausgabe.json>"
//
// Zweck: messen, nicht behaupten.
//   1. Workspace-Sidebar lesen: welche Session haengt unter welcher Gruppe.
//   2. wb-board je Session aufrufen: boardId + Version.
//   3. boardId unabhaengig gegen den kanonischen cwd nachrechnen.
//   4. Ein Board echt oeffnen und auf Identitaetsfehler pruefen.
//
// Der Report stammt aus migrate-dsh-017-workspaces.mjs (Feld migration.sessions);
// er liefert die autoritative Zuordnung sessionId -> kanonischer cwd.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(
  'C:/Users/Joachim/AppData/Local/nvm/v24.19.0/node_modules/@playwright/cli/node_modules/playwright-core'
);

const [url, reportPath, outPath] = process.argv.slice(2);
if (!url || !reportPath || !outPath) {
  throw new Error('usage: node tmp-ws-acceptance.mjs <url-with-token> <report.json> <out.json>');
}

/** Byte-genaues Spiegelbild von snapshot-store.mjs:boardIdForWorkspace. */
function boardIdForWorkspace(workspace) {
  const resolved = resolve(String(workspace || process.cwd()));
  const normalized = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const digest = createHash('sha256').update(`dsh-whiteboard\0${normalized}`).digest('hex');
  return `workspace-${digest.slice(0, 32)}`;
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const rows = report.migration.sessions;
const expectedBySession = new Map(rows.map((row) => [row.sessionId, {
  cwd: row.canonicalCwd,
  expectedBoardId: boardIdForWorkspace(row.canonicalCwd),
  planned: row.planned,
  result: row.result,
}]));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
const consoleLines = [];
page.on('console', (message) => consoleLines.push(`${message.type()}: ${message.text()}`));
page.on('pageerror', (error) => consoleLines.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => consoleLines.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`));

const steps = [];
const note = (label, value) => steps.push({ label, value });

await page.goto(url, { waitUntil: 'domcontentloaded' });
note('goto', { url: page.url() });

/** Warte auf die Sidebar-Baumzeilen; die Shell startet moeglicherweise in der Leiste. */
async function treeRowCount() {
  return page.evaluate(() => document.querySelectorAll('[data-row-key]').length);
}

let waited = 0;
while ((await treeRowCount()) === 0 && waited < 20000) {
  await page.waitForTimeout(500);
  waited += 500;
}
// Die Gruppenliste erscheint vor der Session-Liste; ohne diese Pause liest man
// einen halb gefuellten Baum und haelt fehlende Zeilen fuer fehlende Zuordnung.
await page.waitForTimeout(6000);
note('tree rows after wait', { count: await treeRowCount(), waitedMs: waited });

/** Steuerelemente der Shell, damit ein Zusammenklappen sichtbar wird statt zu raten. */
const controls = await page.evaluate(() => [...document.querySelectorAll('button,[role="button"]')]
  .map((node) => ({
    aria: node.getAttribute('aria-label'),
    title: node.getAttribute('title'),
    text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    cls: typeof node.className === 'string' ? node.className.slice(0, 60) : null,
  }))
  .filter((entry) => entry.aria || entry.title || entry.text));
note('controls', controls);

/** Sidebar-Baum: Gruppenzuordnung ueber die direkte Gruppen-Sektion. */
async function readTree() {
  return page.evaluate(() => {
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    // Die Workspace-Zeile liegt in einem HoverCard-Wrapper, ist also kein
    // direktes Kind der Gruppen-Sektion. Deshalb ueber die Dokumentreihenfolge
    // gehen: die letzte Workspace-Zeile, die VOR dieser Session-Zeile steht.
    const groupOf = (el) => {
      for (let cursor = el.parentElement; cursor; cursor = cursor.parentElement) {
        const heads = [...cursor.querySelectorAll('[data-row-key^="workspace:"]')]
          .filter((head) => head.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
        if (heads.length === 0) continue;
        const head = heads[heads.length - 1];
        return {
          key: head.getAttribute('data-row-key'),
          label: clean(head.querySelector('span[class*="title"]')?.textContent || head.textContent),
        };
      }
      return null;
    };
    return [...document.querySelectorAll('[data-row-key]')].map((el) => {
      const key = el.getAttribute('data-row-key') || '';
      const own = clean(el.querySelector('span[class*="title"]')?.textContent || '');
      if (key.startsWith('workspace:')) {
        return { kind: 'workspace', key, label: own, expanded: el.getAttribute('aria-expanded') };
      }
      if (key.startsWith('session:')) {
        const group = groupOf(el);
        return {
          kind: 'session',
          key,
          sessionId: key.slice('session:'.length),
          label: own,
          groupKey: group?.key ?? null,
          groupLabel: group?.label ?? null,
        };
      }
      return { kind: 'other', key };
    });
  });
}

let tree = await readTree();
note('tree (initial, collapsed)', tree);

/** Alle eingeklappten Workspace-Gruppen oeffnen, damit die Session-Zeilen sichtbar werden. */
const collapsedKeys = tree
  .filter((entry) => entry.kind === 'workspace' && entry.expanded === 'false')
  .map((entry) => entry.key);
for (const key of collapsedKeys) {
  await page.locator(`[data-row-key="${key}"]`).first().click();
  await page.waitForTimeout(900);
}
await page.waitForTimeout(1500);
tree = await readTree();
note('expanded workspace groups', collapsedKeys);
note('tree (expanded)', tree);

// Die Baumzeilen sind der einzige belastbare Ort, an dem die Gruppierung sichtbar wird.
// Wenn die Sidebar zusammengeklappt startet, hier abbrechen und den Befund auswerten.
if (!tree.some((entry) => entry.kind === 'session')) {
  await page.screenshot({ path: outPath.replace(/\.json$/, '-collapsed.png') });
  note('abort', 'keine Session-Zeilen sichtbar; Sidebar vermutlich eingeklappt');
  writeFileSync(outPath, JSON.stringify({ url, steps, consoleLines: consoleLines.slice(-80) }, null, 2));
  await browser.close();
  console.log('written (collapsed)', outPath);
  process.exit(0);
}

/** wb-board aus der Seite heraus: traegt das Auth-Cookie mit. */
async function wbBoard(sessionId) {
  return page.evaluate(async (id) => {
    try {
      const response = await fetch('/dsh-whiteboard/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'wb-board', args: { sessionId: id } }),
      });
      const text = await response.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { /* HTML-Fehlerseite */ }
      return { httpStatus: response.status, body: parsed, rawHead: parsed ? null : text.slice(0, 300) };
    } catch (error) {
      return { httpStatus: 0, body: null, error: String(error?.message || error) };
    }
  }, sessionId);
}

const sessionIds = [...new Set([
  ...tree.filter((entry) => entry.kind === 'session').map((entry) => entry.sessionId),
  ...rows.map((row) => row.sessionId),
])];

const boardProbes = [];
for (const sessionId of sessionIds) {
  const probe = await wbBoard(sessionId);
  const expected = expectedBySession.get(sessionId) ?? null;
  boardProbes.push({
    sessionId,
    inTree: tree.some((entry) => entry.kind === 'session' && entry.sessionId === sessionId),
    expectedCwd: expected?.cwd ?? null,
    expectedBoardId: expected?.expectedBoardId ?? null,
    httpStatus: probe.httpStatus,
    ok: probe.body?.ok ?? null,
    boardId: probe.body?.boardId ?? null,
    version: probe.body?.version ?? null,
    savedAt: probe.body?.savedAt ?? null,
    error: probe.body?.error ?? probe.error ?? probe.rawHead ?? null,
    boardIdMatchesCwd: probe.body?.boardId ? probe.body.boardId === expected?.expectedBoardId : null,
  });
}
note('boardProbes', boardProbes);

/** Board oeffnen: Session-Zeile klicken, dann den schwebenden Oeffner. */
async function openBoardFor(sessionId) {
  const selector = `[data-row-key="session:${sessionId}"]`;
  const before = consoleLines.length;
  const rowFound = await page.locator(selector).count();
  if (rowFound === 0) return { sessionId, opened: false, reason: 'Session-Zeile nicht sichtbar' };
  await page.locator(selector).first().click();
  await page.waitForTimeout(4000);
  const openerFound = await page.locator('button.wb-opener').count();
  if (openerFound === 0) return { sessionId, opened: false, reason: 'kein Board-Oeffner im DOM' };
  await page.locator('button.wb-opener').first().click();
  // tldraw braucht sichtbare Groesse; bis zu 20s auf Canvas oder Fehler warten.
  let elapsed = 0;
  let canvas = 0;
  let errorText = null;
  while (elapsed < 20000) {
    await page.waitForTimeout(500);
    elapsed += 500;
    canvas = await page.locator('.wb-mount .tl-container').count();
    errorText = await page.evaluate(() => {
      const node = document.querySelector('.wb-error');
      return node ? node.textContent.replace(/\s+/g, ' ').trim().slice(0, 300) : null;
    });
    if (canvas > 0 || errorText) break;
  }
  const panelText = await page.evaluate(() => {
    const node = document.querySelector('.wb-view');
    return node ? node.textContent.replace(/\s+/g, ' ').trim().slice(0, 600) : null;
  });
  const mounted = await page.evaluate(() => document.querySelectorAll('.wb-mount .tl-container').length);
  return {
    sessionId,
    opened: true,
    tldrawCanvasMounted: mounted,
    waitMs: elapsed,
    boardErrorVisible: errorText !== null,
    boardErrorText: errorText,
    panelTextHead: panelText,
    newConsoleLines: consoleLines.slice(before),
  };
}

// Ein Board mit erwarteter Identitaet oeffnen (Test1) und eines mit dem bekannten
// Snapshot-Artefakt (KI und Gott), damit der Unterschied messbar wird.
const openTargets = ['session-4be2290a-ef6f-42b9-98a9-2132f020d270', 'session-b1ecce35-3c71-4269-91bf-5c5d8d14a620'];
const boardOpens = [];
for (const sessionId of openTargets) {
  boardOpens.push(await openBoardFor(sessionId));
  await page.screenshot({ path: outPath.replace(/\.json$/, `-board-${sessionId.slice(8, 16)}.png`) });
}
note('boardOpens', boardOpens);

note('tree (final)', await readTree());
note('bodyText', await page.evaluate(() => (document.body.innerText || '').slice(0, 3000)));

writeFileSync(outPath, JSON.stringify({ url, steps, consoleLines: consoleLines.slice(-120) }, null, 2));
await browser.close();
console.log('written', outPath);
