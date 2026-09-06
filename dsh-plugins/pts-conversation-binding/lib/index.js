import path from 'node:path';
import { bindConversation, findConversationBindingSync, findConversationBindingBySessionSync } from '../../../dsh-presets/pts-companion/conversation-bindings.mjs';
import { workspaceRoot } from '../../../dsh-presets/pts-companion/teaching-product.mjs';

export const inject = ['webServer'];

function json(res, status, value) { res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(value)); }
async function body(req) { const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > 128 * 1024) throw new Error('request too large'); chunks.push(Buffer.from(chunk)); } return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
function sameRoot(a, b) { return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(); }

export function apply(ctx) {
  const webServer = ctx.get('webServer');
  const sessions = ctx.get('sessions');
  if (!webServer || !sessions) return;
  const dispose = webServer.register({ kind: 'exact', path: '/api/pts-conversation-binding', handler: async (req, res) => {
    try {
      if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'method not allowed' });
      if (req.method === 'POST' && req.headers?.origin && new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: 'cross-origin mutation denied' });
      const args = req.method === 'GET' ? Object.fromEntries(new URL(req.url, 'http://pts.local').searchParams) : await body(req);
      const source = sessions.get(args.sessionId);
      if (!source?.header?.cwd) return json(res, 404, { error: 'session not found' });
      const root = await workspaceRoot(source.header.cwd);
      if (req.method === 'GET') {
        const binding = args.kind && args.id
          ? findConversationBindingSync(root, args.kind, args.id)
          : findConversationBindingBySessionSync(root, args.sessionId);
        return json(res, 200, { binding });
      }
      const target = sessions.get(args.boundSessionId);
      if (!target?.header?.cwd) return json(res, 404, { error: 'bound session not found' });
      const targetRoot = await workspaceRoot(target.header.cwd);
      if (!sameRoot(root, targetRoot)) throw new Error('bound session must use the same Denkraum');
      const binding = await bindConversation(root, { kind: args.kind, id: args.id, sessionId: args.boundSessionId });
      return json(res, 200, { binding });
    } catch (error) {
      return json(res, /already bound/.test(error.message) ? 409 : 400, { error: error.message });
    }
  } });
  ctx.effect(() => dispose, 'pts-conversation-binding: route');
}
