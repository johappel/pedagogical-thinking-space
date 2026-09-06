import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspaceRoot } from '../../../dsh-presets/pts-companion/teaching-product.mjs';

export const inject = ['webServer'];
const DEFAULT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../config/moment-workshop.json');
const WORKSPACE_OVERRIDE = path.join('.pts', 'moment-workshop.json');

function validate(value) {
  if (!value || value.schema !== 'ptspace.moment-workshop-config/v1') throw new Error('unsupported moment workshop config');
  if (!Array.isArray(value.functions) || !value.functions.length || value.functions.length > 16) throw new Error('invalid moment workshop functions');
  const functions = value.functions.map((v) => String(v).trim());
  if (functions.some((v) => !v || v.length > 80) || new Set(functions.map((v) => v.toLowerCase())).size !== functions.length) throw new Error('invalid or duplicate moment workshop function');
  const unassignedLabel = String(value.unassignedLabel || 'Noch nicht eingeordnet').trim();
  if (!unassignedLabel || unassignedLabel.length > 80) throw new Error('invalid unassigned label');
  return { schema: value.schema, functions, unassignedLabel };
}
async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
async function configFor(root) {
  const override = path.join(root, WORKSPACE_OVERRIDE);
  try { return { config: validate(await readJson(override)), source: WORKSPACE_OVERRIDE }; }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  return { config: validate(await readJson(DEFAULT_PATH)), source: 'config/moment-workshop.json' };
}
function send(res, status, value) { res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(value)); }

export function apply(ctx) {
  const webServer = ctx.get('webServer'); const sessions = ctx.get('sessions');
  if (!webServer || !sessions) return;
  const dispose = webServer.register({ kind: 'exact', path: '/api/pts-moment-workshop/config', handler: async (req, res) => {
    try {
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
      const args = Object.fromEntries(new URL(req.url, 'http://pts.local').searchParams);
      const session = sessions.get(args.sessionId); if (!session?.header?.cwd) return send(res, 404, { error: 'session not found' });
      const root = await workspaceRoot(session.header.cwd);
      return send(res, 200, await configFor(root));
    } catch (error) { return send(res, 400, { error: error.message }); }
  } });
  ctx.effect(() => dispose, 'pts-moment-workshop: config route');
}
