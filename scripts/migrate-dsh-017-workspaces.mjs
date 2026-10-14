#!/usr/bin/env node
/**
 * Migration des DSH-0.1.7-Workspace-Registers für importierte PTS-Sessions.
 *
 * Das Workspace-Register von DSH 0.1.7 ist nicht aus `SessionHeader.cwd`
 * abgeleitet. Eine Session gilt nur dann als Mitglied eines Workspace, wenn das
 * dauerhafte `sessionIds`-Konto des Workspace sie nennt UND der kanonische `cwd`
 * im Session-Header dem Workspace-Pfad entspricht. Dieses Gruppieren baut das
 * Register genau einmal auf, beim ersten erfolgreichen Start, und danach nie
 * wieder (`packages/workspace/workspace/src/index.ts`: `bootstrap()` zusammen mit
 * der `initialized`-Marke). Diese Instanz war bereits gestartet, bevor der Import
 * der PTS-Historie abgeschlossen war. Ihre importierten Sessions blieben deshalb
 * unter "Ungrouped", obwohl jede von ihnen einen gültigen `cwd` trägt.
 *
 * Diese Datei hat zwei Rollen:
 *
 * 1. Plugin-Hälfte (`export name/inject/apply`). Sie läuft innerhalb einer
 *    gebooteten Cordis-Komposition und führt die Migration ausschließlich über
 *    die amtliche Domänen-API aus: `ctx.sessionPersistence.list()` für die
 *    persistierten Header und `ctx.workspaceRegistry.{list,create}` plus
 *    `workspace.attachSession()` für die Gruppierung. Keine Speicherdatei wird
 *    direkt gelesen oder geschrieben, und kein Session-Header, kein Session-Log
 *    und kein Whiteboard-Snapshot wird angefasst.
 *
 * 2. CLI-Hälfte. Sie baut ein temporäres Overlay-Patch, das die Plugin-Zeile in
 *    einen echten `dsh --profile <name>`-Start einsetzt, führt ihn aus, sammelt
 *    den JSON-Report und gibt eine menschenlesbare Zusammenfassung aus. Das
 *    Booten des Profils ist der amtliche DSH-Mechanismus, um an diese Dienste zu
 *    kommen: die CLI hat keinen Unterbefehl zum Neuaufbau oder Migrieren von
 *    Workspaces (`apps/cli/reference/README.md`), und der Historien-Bootstrap des
 *    Registers ist ausdrücklich einmalig.
 *
 * Aufruf (die Instanz muss gestoppt sein; dieses Werkzeug schreibt nur das
 * Workspace-Register):
 *
 *   node scripts/migrate-dsh-017-workspaces.mjs --dsh-home F:/dsh-instances/pts-017/.dsh --dry-run
 *   node scripts/migrate-dsh-017-workspaces.mjs --dsh-home F:/dsh-instances/pts-017/.dsh --apply
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL = 'pts-dsh017-workspace-migration';
const REPORT_MARKER = 'PTS-WS-MIGRATION-REPORT';
const DEFAULT_RUNTIME = 'C:/dsh-labs/dsh-017';
const DEFAULT_PROFILE = 'pts';

/** Das geschlossene Aktionsvokabular dieser Migration. */
const ACTION = Object.freeze({
  alreadyCorrect: 'already-correct',
  attachToExisting: 'attach-to-existing',
  createAndAttach: 'create-and-attach',
  noCwd: 'no-cwd',
  invalidCwd: 'invalid-cwd',
  missingDirectory: 'missing-directory',
  conflict: 'conflict',
});

// ---------------------------------------------------------------------------
// Gemeinsame Hilfsfunktionen
// ---------------------------------------------------------------------------

function readEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Spiegel von `fullyQualifiedWorkspacePath` aus
 * `packages/workspace/workspace/src/paths.ts`. Bewusst doppelt: die Plugin-Hälfte
 * muss einen Header-`cwd` einordnen können, bevor irgendein Registeraufruf
 * stattfindet, und das Prädikat ist eine reine Leseprüfung. Jede Entscheidung, die
 * schreibt, geht weiterhin über das Register, das denselben Kanon über
 * `realpathNormalize` anwendet.
 */
function isFullyQualifiedPath(candidate) {
  if (process.platform !== 'win32') return posix.isAbsolute(candidate);
  const root = win32.parse(candidate).root;
  return win32.isAbsolute(candidate) && root !== '\\' && root !== '/';
}

async function writeJsonAtomic(filePath, value) {
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, payload, 'utf8');
  try {
    await rename(temporaryPath, filePath);
  } catch (error) {
    if (!['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(error?.code)) throw error;
    await writeFile(filePath, payload, 'utf8');
    await rm(temporaryPath, { force: true });
  }
}

function sha256File(filePath) {
  try {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
  } catch (error) {
    return error?.code === 'ENOENT' ? null : `error:${error?.code ?? errorMessage(error)}`;
  }
}

function sameHashMap(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) if (before[key] !== after[key]) return false;
  return true;
}

function isDirectInvocation() {
  const entry = process.argv[1];
  if (typeof entry !== 'string' || entry === '') return false;
  const normalize = (value) => {
    const absolute = resolve(value);
    return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
  };
  try {
    return normalize(entry) === normalize(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Plugin-Hälfte: läuft innerhalb der gebooteten DSH-Komposition
// ---------------------------------------------------------------------------

export const name = TOOL;

/**
 * `sessionPersistence` ist die amtliche Lesenaht für persistierte
 * `SessionHeader`. `SessionPersistence.list()` liefert je gespeicherter Session
 * einen Snapshot, ohne Event-Körper zu lesen. `workspaceRegistry` erklärt
 * `sessionPersistence` zur zwingenden Startabhängigkeit. Beide zu injizieren
 * garantiert deshalb zugleich, dass das Register seinen Header-Index über
 * kanonische cwd abgeschlossen hat, bevor dieses Plugin läuft.
 */
export const inject = ['workspaceRegistry', 'sessionPersistence'];

/** @param {import('cordis').Context} ctx - der Kontext der Host-Ebene. */
export async function apply(ctx) {
  const mode = readEnv('PTS_WS_MIGRATION_MODE');
  // Inert, solange dieser Prozess nicht von der CLI-Hälfte dieser Datei gestartet
  // wurde. Das Modul darf deshalb in jedes Profil eingesetzt werden, ohne dessen
  // Verhalten zu ändern.
  if (mode === '') return;

  const reportPath = readEnv('PTS_WS_MIGRATION_REPORT');
  let report;
  try {
    if (mode !== 'dry-run' && mode !== 'apply') {
      throw new Error(`unknown migration mode '${mode}'`);
    }
    if (reportPath === '') throw new Error('PTS_WS_MIGRATION_REPORT is not set');
    report = await runMigration(ctx, mode);
  } catch (error) {
    report = {
      tool: TOOL,
      role: 'plugin',
      mode,
      generatedAt: new Date().toISOString(),
      dshHome: process.env.DSH_HOME ?? null,
      fatal: {
        message: errorMessage(error),
        stack: error instanceof Error ? error.stack ?? null : null,
      },
    };
  }

  if (reportPath !== '') {
    // Der Report ist dauerhaft geschrieben, bevor die Marke ausgegeben wird. Der
    // Aufrufer darf den Prozess deshalb beenden, sobald er die Marke sieht.
    await writeJsonAtomic(reportPath, report);
    process.stderr.write(`${TOOL}: ${mode} report written to ${reportPath}\n`);
  }
  process.stdout.write(`${REPORT_MARKER} ${mode}\n`);
  process.exit(report.fatal ? 1 : 0);
}

async function runMigration(ctx, mode) {
  const registry = ctx.get('workspaceRegistry');
  const persistence = ctx.get('sessionPersistence');
  if (registry === undefined || persistence === undefined) {
    throw new Error('workspaceRegistry and sessionPersistence must both be available');
  }

  const snapshots = await persistence.list();
  const sessions = ctx.get('sessions');
  const liveIds = new Set();
  if (sessions !== undefined) {
    for (const session of sessions.list()) liveIds.add(String(session.id));
  }

  const index = indexRegistry(registry);
  const registryBefore = await registrySnapshot(registry);

  const rows = [];
  for (const snapshot of snapshots) {
    rows.push(await classify(snapshot.header, liveIds, index));
  }
  rows.sort((left, right) =>
    left.createdAt - right.createdAt || left.sessionId.localeCompare(right.sessionId));

  // Whiteboard-Belege: die Kandidatenmenge ist jeder kanonische Session-cwd plus
  // jeder registrierte Workspace-Pfad, und sie wird um die Migration selbst herum
  // gehasht. Der Treiber wiederholt den Nachher-Hash, sobald der Start beendet ist.
  const snapshotPaths = collectSnapshotPaths(registryBefore, rows);
  const snapshotsBefore = await hashSnapshots(snapshotPaths);

  const outcome = mode === 'apply'
    ? await applyRows(registry, index, rows)
    : { createdWorkspaces: [], attachedSessions: [], conflicts: [] };

  const registryAfter = await registrySnapshot(registry);
  const snapshotsAfter = await hashSnapshots(snapshotPaths);

  return {
    tool: TOOL,
    role: 'plugin',
    mode,
    generatedAt: new Date().toISOString(),
    dshHome: process.env.DSH_HOME ?? null,
    nodeVersion: process.version,
    registryBefore,
    registryAfter,
    sessions: rows,
    outcome,
    snapshotEvidence: {
      workspacePaths: snapshotPaths,
      targets: Object.keys(snapshotsBefore),
      before: snapshotsBefore,
      after: snapshotsAfter,
      unchanged: sameHashMap(snapshotsBefore, snapshotsAfter),
    },
    verification: verify(registry, rows, mode),
    summary: summarize(rows, outcome, mode),
    fatal: null,
  };
}

/** Kandidatorte für Snapshots: kanonische Session-cwd plus Workspace-Pfade. */
function collectSnapshotPaths(registryState, rows) {
  const paths = new Set();
  for (const row of rows) {
    if (typeof row.canonicalCwd === 'string' && row.canonicalCwd !== '') paths.add(row.canonicalCwd);
  }
  for (const workspace of registryState.workspaces) paths.add(workspace.path);
  return [...paths].sort();
}

async function hashSnapshots(workspacePaths) {
  const hashes = {};
  for (const workspacePath of workspacePaths) {
    const snapshotPath = join(workspacePath, '.dsh-whiteboard', 'snapshot.json');
    try {
      hashes[snapshotPath] = createHash('sha256')
        .update(await readFile(snapshotPath))
        .digest('hex');
    } catch (error) {
      hashes[snapshotPath] = error?.code === 'ENOENT' ? null : `error:${error?.code ?? errorMessage(error)}`;
    }
  }
  return hashes;
}

/** Index über kanonische Pfade plus die header-gefilterte Mitgliedschaft. */
function indexRegistry(registry) {
  const entityById = new Map();
  const entityByPath = new Map();
  const membership = new Map();
  for (const workspace of registry.list()) {
    const id = String(workspace.id);
    entityById.set(id, workspace);
    entityByPath.set(workspace.path, workspace);
    for (const sessionId of workspace.sessionIds) membership.set(String(sessionId), id);
  }
  return { entityById, entityByPath, membership };
}

async function registrySnapshot(registry) {
  const workspaces = [];
  for (const workspace of registry.list()) {
    workspaces.push({
      id: String(workspace.id),
      path: workspace.path,
      title: workspace.title,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      directoryStatus: await workspace.status(),
      sessionIds: workspace.sessionIds.map(String),
    });
  }
  return {
    workspaceCount: workspaces.length,
    order: workspaces.map((workspace) => workspace.id),
    archivedSessionIds: registry.archivedSessionIds.map(String),
    pinnedSessionIds: registry.pinnedSessionIds.map(String),
    workspaces,
  };
}

async function classify(header, liveIds, index) {
  const sessionId = String(header.id);
  const cwd = typeof header.cwd === 'string' ? header.cwd : null;
  const currentWorkspaceId = index.membership.get(sessionId) ?? null;
  const currentWorkspace = currentWorkspaceId === null
    ? undefined
    : index.entityById.get(currentWorkspaceId);

  const row = {
    sessionId,
    cwd,
    canonicalCwd: null,
    createdAt: header.createdAt,
    origin: header.origin === 'subagent' ? 'subagent' : 'top-level',
    delegationDepth: Number.isInteger(header.delegationDepth) ? header.delegationDepth : 0,
    parentSession: header.parentSession === undefined ? null : String(header.parentSession),
    agentPreset: header.agentPreset ?? null,
    live: liveIds.has(sessionId),
    currentWorkspaceId,
    currentWorkspacePath: currentWorkspace === undefined ? null : currentWorkspace.path,
    targetWorkspaceId: null,
    targetWorkspacePath: null,
    planned: null,
    result: null,
    detail: null,
  };

  // Invariante 1: der Header muss überhaupt einen cwd tragen.
  if (cwd === null || cwd.trim() === '') {
    row.planned = ACTION.noCwd;
    row.detail = 'header carries no cwd';
    return row;
  }
  // Invariante 2: der cwd muss absolut sein. Er wird nie gegen process.cwd(),
  // eine Sandbox-Wurzel oder einen Default-Workspace aufgelöst.
  if (!isFullyQualifiedPath(cwd)) {
    row.planned = ACTION.invalidCwd;
    row.detail = 'cwd is not a fully qualified path';
    return row;
  }
  // Invariante 3: der kanonische cwd muss auflösen.
  let canonicalCwd;
  try {
    canonicalCwd = await realpath(cwd);
  } catch (error) {
    row.planned = ACTION.invalidCwd;
    row.detail = `cwd does not resolve (${error?.code ?? errorMessage(error)})`;
    return row;
  }
  row.canonicalCwd = canonicalCwd;
  // Invariante 4: der kanonische cwd muss ein vorhandenes Verzeichnis sein.
  let isDirectory = false;
  try {
    isDirectory = (await stat(canonicalCwd)).isDirectory();
  } catch {
    isDirectory = false;
  }
  if (!isDirectory) {
    row.planned = ACTION.missingDirectory;
    row.detail = 'canonical cwd is not an existing directory';
    return row;
  }

  // Invariante 5: Ziel ist nur ein Workspace, dessen kanonischer Pfad dem
  // kanonischen cwd entspricht. Kein Titelabgleich, keine Präfixlogik, kein
  // Rückfall-Workspace.
  const target = index.entityByPath.get(canonicalCwd);
  if (target === undefined) {
    row.planned = ACTION.createAndAttach;
    row.detail = `no workspace owns '${canonicalCwd}'`;
    return row;
  }
  row.targetWorkspaceId = String(target.id);
  row.targetWorkspacePath = target.path;
  if (row.currentWorkspaceId === String(target.id)) {
    row.planned = ACTION.alreadyCorrect;
    row.detail = 'workspace account and canonical cwd already agree';
    return row;
  }
  row.planned = ACTION.attachToExisting;
  row.detail = `workspace '${target.title}' already owns '${canonicalCwd}'`;
  return row;
}

async function applyRows(registry, index, rows) {
  const createdWorkspaces = [];
  const attachedSessions = [];
  const conflicts = [];

  for (const row of rows) {
    if (row.planned !== ACTION.attachToExisting && row.planned !== ACTION.createAndAttach) {
      row.result = 'skipped';
      continue;
    }
    try {
      let workspace = index.entityByPath.get(row.canonicalCwd);
      let created = false;
      if (workspace === undefined) {
        // `create` kanonisiert erneut und liefert die bestehende Entität, wenn der
        // kanonische Pfad schon vergeben ist. Ein wiederholter Lauf kann deshalb
        // keinen Workspace doppelt anlegen.
        workspace = await registry.create(row.canonicalCwd);
        created = true;
        index.entityByPath.set(workspace.path, workspace);
        index.entityById.set(String(workspace.id), workspace);
        createdWorkspaces.push({
          id: String(workspace.id),
          path: workspace.path,
          title: workspace.title,
        });
      }
      row.targetWorkspaceId = String(workspace.id);
      row.targetWorkspacePath = workspace.path;

      // Invariante 6: das Register selbst muss die Session annehmen. Für eine
      // bereits verbuchte ID entfällt die Prüfung, deshalb wird die Mitgliedschaft
      // danach über die header-gefilterte Sicht erneut gelesen. Eine Session, die
      // weiter herausgefiltert wird, gilt als Konflikt und nie als stiller Erfolg.
      await workspace.attachSession(row.sessionId);
      if (!workspace.sessionIds.map(String).includes(row.sessionId)) {
        throw new Error(
          'attachSession resolved but the session is still filtered out of the workspace account',
        );
      }
      row.result = created ? 'created-and-attached' : 'attached';
      row.detail = `attached to '${workspace.path}'`;
      attachedSessions.push(row.sessionId);
    } catch (error) {
      row.result = ACTION.conflict;
      row.detail = errorMessage(error);
      conflicts.push({ sessionId: row.sessionId, message: errorMessage(error) });
    }
  }

  return { createdWorkspaces, attachedSessions, conflicts };
}

/** Jede migrierbare Zeile erneut gegen den gefestigten Registerstand einordnen. */
function verify(registry, rows, mode) {
  const index = indexRegistry(registry);
  const remaining = [];
  const unmigratable = [];
  for (const row of rows) {
    if (row.planned === ACTION.noCwd || row.planned === ACTION.invalidCwd
      || row.planned === ACTION.missingDirectory) {
      unmigratable.push({ sessionId: row.sessionId, reason: row.planned, detail: row.detail });
      continue;
    }
    const workspaceId = index.membership.get(row.sessionId);
    if (workspaceId === undefined) {
      remaining.push({ sessionId: row.sessionId, reason: 'not accounted by any workspace' });
      continue;
    }
    const workspace = index.entityById.get(workspaceId);
    if (workspace === undefined || workspace.path !== row.canonicalCwd) {
      remaining.push({ sessionId: row.sessionId, reason: 'workspace path differs from canonical cwd' });
    }
  }
  return {
    mode,
    // `allGroupedCorrectly` ist die Aussage über den Zustand danach und gilt nur
    // nach einem Anwenden. Ein Trockenlauf meldet dieselbe Tatsache über
    // `notYetGrouped`.
    allGroupedCorrectly: remaining.length === 0,
    notYetGrouped: remaining,
    unmigratable,
    plannedGroupingComplete: unmigratable.length === 0,
    workspaceCountAfter: index.entityById.size,
  };
}

function summarize(rows, outcome, mode) {
  const count = (action) => rows.filter((row) => row.planned === action).length;
  const performed = outcome.createdWorkspaces.length + outcome.attachedSessions.length;
  return {
    persistedSessions: rows.length,
    topLevelSessions: rows.filter((row) => row.origin === 'top-level').length,
    subagentSessions: rows.filter((row) => row.origin === 'subagent').length,
    liveSessions: rows.filter((row) => row.live).length,
    alreadyCorrect: count(ACTION.alreadyCorrect),
    attachToExisting: count(ACTION.attachToExisting),
    createAndAttach: count(ACTION.createAndAttach),
    noCwd: count(ACTION.noCwd),
    invalidCwd: count(ACTION.invalidCwd),
    missingDirectory: count(ACTION.missingDirectory),
    createdWorkspaces: outcome.createdWorkspaces.length,
    attachedSessions: outcome.attachedSessions.length,
    conflicts: outcome.conflicts.length,
    changes: mode === 'apply' ? performed : 0,
  };
}

// ---------------------------------------------------------------------------
// CLI-Hälfte: baut den Wartungsstart und berichtet das Ergebnis
// ---------------------------------------------------------------------------

const USAGE = `Usage: node scripts/migrate-dsh-017-workspaces.mjs --dsh-home <path> (--dry-run | --apply) [options]

Options:
  --dsh-home <path>   DSH home of the instance to migrate (required)
  --runtime <path>    DSH installation to boot (default: ${DEFAULT_RUNTIME})
  --profile <name>    profile to boot (default: ${DEFAULT_PROFILE})
  --pnpm <command>    pnpm command used to launch the profile (default: pnpm)
  --port <number>     port handed to the web app; 0 binds an ephemeral port (default: 0)
  --timeout <ms>      boot and migration budget (default: 600000)
  --report <path>     write the JSON report to this path
  --keep-artifacts    keep the temporary boot artifacts
  --dry-run           analyse only, never write
  --apply             perform the migration
  --json              print the raw JSON report instead of the summary
`;

function setMode(current, requested) {
  if (current !== null && current !== requested) {
    throw new Error('--dry-run and --apply are mutually exclusive');
  }
  return requested;
}

function parseArgs(argv) {
  const options = {
    dshHome: null,
    runtime: DEFAULT_RUNTIME,
    profile: DEFAULT_PROFILE,
    pnpm: 'pnpm',
    port: '0',
    timeoutMs: 600000,
    reportPath: null,
    keepArtifacts: false,
    mode: null,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${token} requires a value`);
      return argv[index];
    };
    switch (token) {
      case '--dsh-home': options.dshHome = next(); break;
      case '--runtime': options.runtime = next(); break;
      case '--profile': options.profile = next(); break;
      case '--pnpm': options.pnpm = next(); break;
      case '--port': options.port = next(); break;
      case '--timeout': options.timeoutMs = Number(next()); break;
      case '--report': options.reportPath = next(); break;
      case '--keep-artifacts': options.keepArtifacts = true; break;
      case '--dry-run': options.mode = setMode(options.mode, 'dry-run'); break;
      case '--apply': options.mode = setMode(options.mode, 'apply'); break;
      case '--json': options.json = true; break;
      case '--help':
      case '-h': process.stdout.write(USAGE); process.exit(0); break;
      default: throw new Error(`unknown argument '${token}'`);
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.dshHome === null) throw new Error('--dsh-home is required');
  if (options.mode === null) throw new Error('exactly one of --dry-run or --apply is required');
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('--timeout must be a positive number of milliseconds');
  }

  const dshHome = resolve(options.dshHome);
  const runtime = resolve(options.runtime);
  if (!existsSync(dshHome) || !statSync(dshHome).isDirectory()) {
    throw new Error(`DSH home '${dshHome}' is not a directory`);
  }
  if (!existsSync(join(runtime, 'apps', 'cli', 'src', 'bin.ts'))) {
    throw new Error(`'${runtime}' does not look like a DSH installation`);
  }

  const artifacts = join(tmpdir(), `${TOOL}-${process.pid}-${Date.now()}`);
  mkdirSync(artifacts, { recursive: true });
  const patchPath = join(artifacts, 'ws-migration.patch.yml');
  const pluginReportPath = join(artifacts, 'plugin-report.json');
  const stdoutPath = join(artifacts, 'boot.stdout.log');
  const stderrPath = join(artifacts, 'boot.stderr.log');
  const reportPath = options.reportPath === null
    ? join(artifacts, 'migration-report.json')
    : resolve(options.reportPath);

  const pluginPath = fileURLToPath(import.meta.url).split('\\').join('/');
  await writeFile(patchPath, buildPatch(pluginPath), 'utf8');

  // Belegmenge vor dem Start: die Registerdatei und jedes Session-Log, beide allein
  // aus dem DSH-Home vollständig aufzählbar. Whiteboard-Snapshots werden vom Plugin
  // um die Migration herum gehasht und hier danach erneut, weil ihr Ort aus
  // Session-cwd folgt, die nur die DSH-Domänen-API verbindlich lesen kann.
  const sessionLogs = listSessionLogs(dshHome);
  const rawRegistryBefore = readRawRegistry(dshHome);
  const hashesBefore = hashTargets(dshHome, sessionLogs);

  const startedAt = new Date().toISOString();
  const child = await runMaintenanceBoot({
    options, dshHome, runtime, patchPath, pluginReportPath, stdoutPath, stderrPath,
  });

  const pluginReport = await readJson(pluginReportPath);
  const bootStdout = await readText(stdoutPath);
  const bootStderr = await readText(stderrPath);

  const hashesAfter = hashTargets(dshHome, sessionLogs);
  const rawRegistryAfter = readRawRegistry(dshHome);

  const snapshotEvidence = pluginReport?.snapshotEvidence ?? null;
  const snapshotTargets = snapshotEvidence?.targets ?? [];
  const snapshotsAfterBoot = hashSnapshotsSync(snapshotTargets);
  const snapshotsUnchanged = snapshotEvidence === null
    ? null
    : snapshotEvidence.unchanged === true && sameHashMap(snapshotEvidence.after, snapshotsAfterBoot);

  const report = {
    schemaVersion: 1,
    tool: TOOL,
    mode: options.mode,
    startedAt,
    finishedAt: new Date().toISOString(),
    inputs: {
      dshHome,
      runtime,
      profile: options.profile,
      port: options.port,
      artifacts,
      patchPath,
      pluginPath,
    },
    child: {
      exitCode: child.code,
      signal: child.signal,
      timedOut: child.timedOut,
      reportMarkerSeen: bootStdout.includes(REPORT_MARKER),
    },
    migration: pluginReport,
    diagnostics: {
      rawRegistryBefore,
      rawRegistryAfter,
      rawRegistryChanged: JSON.stringify(rawRegistryBefore) !== JSON.stringify(rawRegistryAfter),
      sessionLockCount: countSessionLocks(dshHome),
      hashesBefore,
      hashesAfter,
      registryFileUnchanged: hashesBefore.registryFile === hashesAfter.registryFile,
      sessionLogsUnchanged: sameHashMap(hashesBefore.sessionLogs, hashesAfter.sessionLogs),
      snapshotEvidence,
      snapshotsAfterBoot,
      snapshotsUnchanged,
      snapshotBoardIds: snapshotTargets.map((snapshotPath) => diagnoseSnapshot(snapshotPath)),
      bootWarnings: bootStderr
        .split('\n')
        .filter((line) => /filtered session|is inconsistent|Missing|failed/i.test(line))
        .slice(0, 40),
      bootLogs: { stdout: stdoutPath, stderr: stderrPath },
    },
  };

  await writeJsonAtomic(reportPath, report);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printSummary(report, reportPath);
  }

  if (!options.keepArtifacts) {
    await rm(artifacts, { recursive: true, force: true }).catch(() => {});
  } else {
    process.stderr.write(`${TOOL}: artifacts kept in ${artifacts}\n`);
  }

  const failed = child.timedOut || pluginReport === null || pluginReport.fatal !== null;
  process.exitCode = failed ? 1 : 0;
}

function buildPatch(pluginPath) {
  return [
    '# Temporary overlay patch written by scripts/migrate-dsh-017-workspaces.mjs.',
    '# It inserts one maintenance row into the booted profile. It is never part of',
    '# the PTS profile and it is removed together with its artifacts directory.',
    '- insert:',
    `    - id: ${TOOL}`,
    `      name: '${pluginPath}'`,
    '',
  ].join('\n');
}

function runMaintenanceBoot(context) {
  const { options, dshHome, runtime, patchPath, pluginReportPath, stdoutPath, stderrPath } = context;
  const args = [
    'dsh',
    '--profile', options.profile,
    '--patch', patchPath,
    '--port', String(options.port),
    '--no-open',
  ];
  const commandLine = [options.pnpm, ...args].map(shellQuote).join(' ');

  return new Promise((resolvePromise) => {
    const child = spawn(commandLine, [], {
      cwd: runtime,
      shell: true,
      windowsHide: true,
      env: {
        ...process.env,
        DSH_HOME: dshHome,
        PTS_WS_MIGRATION_MODE: options.mode,
        PTS_WS_MIGRATION_REPORT: pluginReportPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => {
      stderr += `\n${TOOL}: spawn failed: ${errorMessage(error)}\n`;
    });
    child.on('close', async (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      await writeFile(stdoutPath, stdout, 'utf8').catch(() => {});
      await writeFile(stderrPath, stderr, 'utf8').catch(() => {});
      resolvePromise({ code, signal, timedOut });
    });
  });
}

function shellQuote(value) {
  return /[\s"^&|<>()]/.test(value) ? `"${value}"` : value;
}

function listSessionLogs(dshHome) {
  const found = [];
  const walk = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = join(directory, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (/^session\.v\d+\.jsonl\.zstd$/.test(entry.name)) found.push(child);
    }
  };
  walk(join(dshHome, 'sessions'));
  return found.sort();
}

function countSessionLocks(dshHome) {
  let count = 0;
  const walk = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = join(directory, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.name === 'session.lock') count += 1;
    }
  };
  walk(join(dshHome, 'sessions'));
  return count;
}

function hashTargets(dshHome, sessionLogs) {
  const sessionLogsHashes = {};
  for (const filePath of sessionLogs) sessionLogsHashes[filePath] = sha256File(filePath);
  return {
    registryFile: sha256File(join(dshHome, 'storages', 'workspace.json')),
    sessionLogs: sessionLogsHashes,
  };
}

function hashSnapshotsSync(snapshotPaths) {
  const hashes = {};
  for (const snapshotPath of snapshotPaths) hashes[snapshotPath] = sha256File(snapshotPath);
  return hashes;
}

function readRawRegistry(dshHome) {
  const filePath = join(dshHome, 'storages', 'workspace.json');
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    return {
      filePath,
      unit: parsed?.unit ?? null,
      initialized: parsed?.global?.initialized ?? null,
      defaultWorkspaceId: parsed?.global?.defaultWorkspaceId ?? null,
      workspaceIds: parsed?.global?.workspaceIds ?? null,
      archivedSessionIds: parsed?.global?.archivedSessionIds ?? null,
      pinnedSessionIds: parsed?.global?.pinnedSessionIds ?? null,
      workspaces: parsed?.tables?.workspaces ?? null,
    };
  } catch (error) {
    return { filePath, error: errorMessage(error) };
  }
}

/**
 * Lesende Diagnose eines Workspace-Snapshots. Die boardId ist eine reine Funktion
 * des Session-Workspace-Pfads. Dieser Spiegel von
 * `plugin/dsh-whiteboard/lib/snapshot-store.mjs` ist gegen den in dieser Instanz
 * beobachteten Wert geprüft. Hier wird nichts geschrieben.
 */
function diagnoseSnapshot(snapshotPath) {
  const workspacePath = dirname(snapshotPath);
  const workspaceRoot = dirname(workspacePath);
  let stored = null;
  try {
    stored = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  } catch (error) {
    return { snapshotPath, workspacePath: workspaceRoot, error: errorMessage(error) };
  }
  const expected = boardIdForWorkspace(workspaceRoot);
  return {
    workspacePath: workspaceRoot,
    snapshotPath,
    storedBoardId: stored?.boardId ?? null,
    storedVersion: stored?.version ?? null,
    storedSavedAt: stored?.savedAt ?? null,
    expectedBoardId: expected,
    matchesWorkspacePath: stored?.boardId === expected,
  };
}

function boardIdForWorkspace(workspace) {
  const resolved = resolve(workspace);
  const normalized = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const digest = createHash('sha256').update(`dsh-whiteboard\0${normalized}`).digest('hex');
  return `workspace-${digest.slice(0, 32)}`;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function readText(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function printSummary(report, reportPath) {
  const migration = report.migration ?? {};
  const summary = migration.summary ?? {};
  const lines = [];
  lines.push(`${TOOL} (${report.mode})`);
  lines.push(`  DSH home            : ${report.inputs.dshHome}`);
  lines.push(`  runtime             : ${report.inputs.runtime}`);
  lines.push(`  profile             : ${report.inputs.profile}`);
  lines.push(`  report              : ${reportPath}`);
  if (migration.fatal !== undefined && migration.fatal !== null) {
    lines.push(`  FATAL               : ${migration.fatal.message}`);
  }
  lines.push('');
  lines.push(`  persisted sessions  : ${summary.persistedSessions ?? 0}`);
  lines.push(`  top-level           : ${summary.topLevelSessions ?? 0}`);
  lines.push(`  subagent children   : ${summary.subagentSessions ?? 0}`);
  lines.push(`  already correct     : ${summary.alreadyCorrect ?? 0}`);
  lines.push(`  attach to existing  : ${summary.attachToExisting ?? 0}`);
  lines.push(`  create and attach   : ${summary.createAndAttach ?? 0}`);
  lines.push(`  no cwd              : ${summary.noCwd ?? 0}`);
  lines.push(`  invalid cwd         : ${summary.invalidCwd ?? 0}`);
  lines.push(`  missing directory   : ${summary.missingDirectory ?? 0}`);
  lines.push(`  created workspaces  : ${summary.createdWorkspaces ?? 0}`);
  lines.push(`  attached sessions   : ${summary.attachedSessions ?? 0}`);
  lines.push(`  conflicts           : ${summary.conflicts ?? 0}`);
  lines.push(`  changes             : ${summary.changes ?? 0}`);
  lines.push('');
  lines.push(`  registry file unchanged : ${report.diagnostics.registryFileUnchanged}`);
  lines.push(`  session logs unchanged  : ${report.diagnostics.sessionLogsUnchanged}`);
  lines.push(`  snapshots unchanged     : ${report.diagnostics.snapshotsUnchanged}`);
  lines.push(`  snapshot targets        : ${report.diagnostics.snapshotEvidence?.targets?.length ?? 0}`);

  const verification = migration.verification ?? {};
  if (report.mode === 'apply') {
    lines.push(`  all grouped correctly   : ${verification.allGroupedCorrectly ?? false}`);
    for (const item of verification.notYetGrouped ?? []) {
      lines.push(`    remaining: ${item.sessionId}: ${item.reason}`);
    }
  } else {
    lines.push(`  planned grouping complete : ${verification.plannedGroupingComplete ?? false}`);
    lines.push(`  not yet grouped (dry run) : ${(verification.notYetGrouped ?? []).length}`);
  }
  for (const item of verification.unmigratable ?? []) {
    lines.push(`    unmigratable: ${item.sessionId}: ${item.reason} (${item.detail})`);
  }
  for (const row of migration.sessions ?? []) {
    if (row.result === ACTION.conflict) {
      lines.push(`    conflict: ${row.sessionId}: ${row.detail}`);
    }
  }
  for (const entry of report.diagnostics.snapshotBoardIds ?? []) {
    if (entry.matchesWorkspacePath === false) {
      lines.push(`  snapshot board id mismatch:`);
      lines.push(`    ${entry.snapshotPath}`);
      lines.push(`    stored   ${entry.storedBoardId}`);
      lines.push(`    expected ${entry.expectedBoardId}`);
    }
  }
  for (const [snapshotPath, hash] of Object.entries(report.diagnostics.snapshotsAfterBoot ?? {})) {
    if (hash === null) continue;
    if (hash !== report.diagnostics.snapshotEvidence?.after?.[snapshotPath]) {
      lines.push(`  snapshot changed after the migration: ${snapshotPath}`);
    }
  }
  for (const warning of report.diagnostics.bootWarnings) {
    lines.push(`  boot note: ${warning.trim()}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

if (isDirectInvocation()) {
  main().catch((error) => {
    process.stderr.write(`${TOOL}: ${errorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
