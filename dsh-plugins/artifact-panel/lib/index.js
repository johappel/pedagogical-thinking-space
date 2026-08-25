// pts-artifact-panel — host half (node half).
//
// Ordinary Cordis host plugin: full Node access, no sandbox. Registers one
// webServer prefix route serving three endpoints over the CURRENT session
// workspace:
//
//   GET /artifacts/v2/list?sessionId=<id>   -> JSON { root, items[] }
//   GET /artifacts/v2/text?p=<rel>&cwd=<abs> -> JSON { text }
//   GET /artifacts/v2/file?p=<rel>&cwd=<abs> -> bytes (md/pdf/img/html/svg)
//
// The workspace root is resolved per request from the session header cwd
// (sessions store), never from a process global. A background scan keeps the
// registry warm for the active root; write-tool results record immediately.

import { promises as fsp } from 'node:fs';
import path from 'node:path';

const ARTIFACT_EXTS = ['.md', '.markdown', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.html', '.htm'];
const TEXT_EXTS = ['.md', '.markdown', '.html', '.htm', '.svg', '.txt'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage', '.venv', 'venv', '__pycache__', '.opencode']);
const MIME = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
};
const MAX_BYTES = 30 * 1024 * 1024;
const SCAN_INTERVAL_MS = 10000;
const SCAN_FRESH_MS = 4000;

/**
 * Hard dependency on the route carrier: the loader sequences this entry
 * AFTER webServer is provided, so ctx.get('webServer') below always resolves.
 */
export const inject = ['webServer'];

/** Plugin body. Exported as a named `apply`, mirroring pure-UI node halves. */
export function apply(ctx) {
  const webServer = ctx.get('webServer');
  if (webServer === undefined) {
    console.error('[pts-artifact-panel] webServer service missing - plugin inactive');
    return;
  }
  const policy = ctx.get('sandboxPolicy');
  const sessionsStore = ctx.get('sessions');
  const fallbackRoot = policy !== undefined && typeof policy.workspaceRoot === 'string'
    ? policy.workspaceRoot
    : process.cwd();

  /** Registry of the ACTIVE root: relPath (posix, root-relative) -> entry. */
  const artifacts = new Map();
  let activeRootAbs = null; // realpath'd absolute, posix slashes
  let scanSeq = 0;
  let lastScanAt = 0;

  const toPosix = (p) => String(p).split(path.sep).join('/');
  const extOf = (p) => {
    const i = p.lastIndexOf('.');
    return i >= 0 ? p.slice(i).toLowerCase() : '';
  };
  const kindOf = (ext) => {
    if (ext === '.pdf') return 'pdf';
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) return 'image';
    if (ext === '.html' || ext === '.htm') return 'html';
    return 'markdown';
  };

  async function realKey(p) {
    const abs = path.resolve(p);
    try {
      return toPosix(await fsp.realpath(abs));
    } catch {
      // Missing final component: anchor on nearest existing ancestor.
      const parent = path.dirname(abs);
      try {
        return toPosix(path.join(await fsp.realpath(parent), path.basename(abs)));
      } catch {
        return null;
      }
    }
  }

  function containedUnder(rootKey, childKey) {
    if (typeof rootKey !== 'string' || typeof childKey !== 'string') return false;
    const rel = path.relative(rootKey.toLowerCase(), childKey.toLowerCase());
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
  }

  function setActiveRoot(rootKey) {
    if (rootKey === null) return false;
    if (activeRootAbs !== null && activeRootAbs.toLowerCase() === rootKey.toLowerCase()) return false;
    artifacts.clear();
    activeRootAbs = rootKey;
    lastScanAt = 0;
    return true;
  }

  function relOf(absPosix) {
    if (containedUnder(activeRootAbs, absPosix)) {
      const base = activeRootAbs.endsWith('/') ? activeRootAbs : activeRootAbs + '/';
      return absPosix.slice(base.length);
    }
    return absPosix.slice(absPosix.lastIndexOf('/') + 1);
  }

  function record(absPosix, size, origin) {
    const ext = extOf(absPosix);
    if (!ARTIFACT_EXTS.includes(ext)) return;
    const rel = relOf(absPosix);
    const prev = artifacts.get(rel);
    if (prev !== undefined) {
      if (prev.size !== size) {
        prev.size = size;
        prev.revision += 1;
      }
      return;
    }
    artifacts.set(rel, {
      path: rel,
      name: rel.slice(rel.lastIndexOf('/') + 1),
      ext,
      kind: kindOf(ext),
      size: typeof size === 'number' ? size : null,
      revision: 0,
      origin: origin || 'scan',
    });
  }

  async function walk(dirAbs, depth, mySeq) {
    if (mySeq !== scanSeq) return;
    let dirents;
    try {
      dirents = await fsp.readdir(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      if (mySeq !== scanSeq) return;
      const child = path.join(dirAbs, dirent.name);
      if (dirent.isDirectory()) {
        if (depth < 6 && !SKIP_DIRS.has(dirent.name)) await walk(child, depth + 1, mySeq);
      } else if (dirent.isFile()) {
        const posix = toPosix(child);
        if (!ARTIFACT_EXTS.includes(extOf(posix))) continue;
        let size = null;
        try {
          size = (await fsp.stat(child)).size;
        } catch {}
        record(posix, size, 'scan');
      }
    }
  }

  async function scanActive() {
    if (activeRootAbs === null) return;
    const mySeq = ++scanSeq;
    try {
      await walk(activeRootAbs, 0, mySeq);
      lastScanAt = Date.now();
    } catch (error) {
      console.error('[pts-artifact-panel] scan failed', error);
    }
  }

  async function ensureScanned() {
    if (activeRootAbs === null) return;
    if (lastScanAt !== 0 && Date.now() - lastScanAt < SCAN_FRESH_MS) return;
    await scanActive();
  }

  function sessionWorkspace(sessionId) {
    if (typeof sessionId !== 'string' || sessionId === '' || sessionsStore === undefined) return null;
    try {
      const session = sessionsStore.get(sessionId);
      const header = session !== undefined && session !== null ? session.header : undefined;
      if (header !== undefined && header !== null && typeof header.cwd === 'string' && header.cwd.trim() !== '') {
        return header.cwd;
      }
    } catch {
      // live data guard
    }
    return null;
  }

  function agentWorkspace(exec) {
    try {
      const agent = exec !== undefined && exec !== null ? exec.agent : undefined;
      if (agent !== undefined && agent !== null && agent.session !== undefined && agent.session !== null) {
        const header = agent.session.header;
        if (header !== undefined && header !== null && typeof header.cwd === 'string' && header.cwd.trim() !== '') {
          return header.cwd;
        }
      }
    } catch {
      // live data guard
    }
    return null;
  }

  ctx.on('tools/result', (exec, result) => {
    const isError = result !== undefined && result !== null && result.isError === true;
    const name = exec !== undefined && exec !== null ? exec.name : '';
    const args = exec !== undefined && exec !== null ? exec.arguments : null;
    let p = null;
    if (args !== null && typeof args === 'object') {
      if (typeof args.file_path === 'string') p = args.file_path;
      else if (typeof args.path === 'string') p = args.path;
    }
    if (!isError && p !== null) {
      const base = agentWorkspace(exec) ?? activeRootAbs ?? fallbackRoot;
      void (async () => {
        try {
          setActiveRoot(await realKey(base));
          const key = await realKey(path.resolve(base, String(p)));
          if (key === null || !containedUnder(activeRootAbs, key)) return;
          const info = await fsp.stat(key);
          if (info.isFile()) record(key, info.size, `tool:${name}`);
        } catch {
          // ignore transient resolution failures
        }
      })();
    }
    if (!isError && name === 'bash') void scanActive();
  });

  const scanTimer = setInterval(() => void scanActive(), SCAN_INTERVAL_MS);
  if (scanTimer.unref !== undefined) scanTimer.unref();

  /**
   * Resolve a request path under an explicit or active base directory.
   * Returns { target, key } or { reason }.
   */
  async function resolveContained(rawP, baseDir) {
    const base = typeof baseDir === 'string' && baseDir.trim() !== '' ? baseDir : (activeRootAbs ?? fallbackRoot);
    if (base === undefined || base === null) return { reason: 'no-root' };
    const baseKey = await realKey(base);
    if (baseKey === null) return { reason: 'bad-base' };
    const candidate = toPosix(String(rawP).trim());
    if (candidate === '') return { reason: 'empty' };

    const direct = path.resolve(base, candidate);
    let key = await realKey(direct);
    if (key !== null && containedUnder(baseKey, key)) return { target: key, key };

    // Absolute candidates naming the base as prefix: strip and retry relative.
    const looksAbsolute = /^[A-Za-z]:\//.test(candidate) || candidate.startsWith('/');
    const baseNorm = toPosix(path.resolve(base));
    if (looksAbsolute && candidate.toLowerCase().startsWith(baseNorm.toLowerCase() + '/')) {
      const stripped = candidate.slice(baseNorm.length + 1);
      key = await realKey(path.resolve(base, stripped));
      if (key !== null && containedUnder(baseKey, key)) return { target: key, key };
    }
    return { reason: 'outside', candidate };
  }

  function sendJson(res, status, value) {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(value));
  }

  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: '/artifacts/v2',
    handler: async (req, res) => {
      try {
        const rawUrl = typeof req.url === 'string' ? req.url : '/';
        const qIndex = rawUrl.indexOf('?');
        const sub = qIndex >= 0 ? rawUrl.slice(0, qIndex) : rawUrl;
        const query = qIndex >= 0 ? rawUrl.slice(qIndex + 1) : '';
        let action = '';
        if (sub === '/artifacts/v2/list') action = 'list';
        else if (sub === '/artifacts/v2/file') action = 'file';
        else if (sub === '/artifacts/v2/text') action = 'text';
        if (action === '') {
          res.statusCode = 404;
          res.end('unknown artifact endpoint');
          return;
        }

        let p = null;
        let cwdParam = null;
        let sessionId = null;
        for (const part of query.split('&')) {
          const eq = part.indexOf('=');
          if (eq <= 0) continue;
          const key = part.slice(0, eq);
          const value = decodeURIComponent(part.slice(eq + 1));
          if (key === 'p') p = value;
          else if (key === 'cwd') cwdParam = value;
          else if (key === 'sessionId') sessionId = value;
        }

        if (action === 'list') {
          const base = sessionWorkspace(sessionId) ?? fallbackRoot;
          const rootKey = await realKey(base);
          if (rootKey === null) {
            sendJson(res, 500, { error: 'bad-root' });
            return;
          }
          setActiveRoot(rootKey);
          await ensureScanned();
          const items = Array.from(artifacts.values());
          items.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
          sendJson(res, 200, { root: activeRootAbs, items });
          return;
        }

        if (p === null) {
          res.statusCode = 400;
          res.end('missing path parameter');
          return;
        }
        const found = await resolveContained(p, cwdParam);
        if (found.reason !== undefined) {
          res.statusCode = found.reason === 'outside' ? 403 : 400;
          res.end(`rejected: ${found.reason}${found.candidate !== undefined ? ` [${found.candidate}]` : ''}`);
          return;
        }
        const info = await fsp.stat(found.target).catch(() => undefined);
        if (info === undefined || !info.isFile()) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        const ext = extOf(found.key.split('?')[0]);

        if (action === 'text') {
          if (!TEXT_EXTS.includes(ext)) {
            res.statusCode = 415;
            res.end('unsupported type');
            return;
          }
          const text = await fsp.readFile(found.target, 'utf8');
          sendJson(res, 200, { text: text.slice(0, 2 * 1024 * 1024) });
          return;
        }

        if (MIME[ext] === undefined) {
          res.statusCode = 415;
          res.end('unsupported type');
          return;
        }
        const bytes = await fsp.readFile(found.target);
        if (bytes.length > MAX_BYTES) {
          res.statusCode = 413;
          res.end('too large');
          return;
        }
        res.statusCode = 200;
        res.setHeader('content-type', MIME[ext]);
        res.setHeader('cache-control', 'no-store');
        res.setHeader('x-content-type-options', 'nosniff');
        if (ext === '.html' || ext === '.htm' || ext === '.svg') {
          res.setHeader('content-security-policy', 'sandbox');
        }
        res.end(bytes);
      } catch (error) {
        try {
          res.statusCode = 500;
          res.end('internal error');
        } catch {}
      }
    },
  }), 'artifact-panel-route');

  console.log('[pts-artifact-panel] host half active; route /artifacts/v2/* registered');
}
