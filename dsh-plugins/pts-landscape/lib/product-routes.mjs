import { productView, mutateProduct, approvalToken, digest, gapDecisionToken } from '../../../dsh-presets/pts-companion/teaching-product.mjs';
import { focusContext } from '../../../dsh-presets/pts-companion/focus-context.mjs';
import { applyDirectEdit } from '../../../dsh-presets/pts-companion/direct-pts-edit.mjs';

function json(res, status, data) { res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(data)); }
async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 512 * 1024) throw new Error('request too large'); chunks.push(Buffer.from(chunk)); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
export function registerProductRoutes(ctx) {
  for (const route of ['/api/pts-product', '/api/pts-focus']) {
    const dispose = ctx.get('webServer').register({ kind: 'exact', path: route, handler: async (req, res) => {
      try {
        if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'method not allowed' });
        if (req.method === 'POST' && req.headers?.origin && new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: 'cross-origin mutation denied' });
        const args = req.method === 'GET' ? Object.fromEntries(new URL(req.url, 'http://pts.local').searchParams) : await body(req);
        const session = ctx.get('sessions')?.get(args.sessionId);
        if (!session?.header?.cwd) return json(res, 404, { error: 'session not found' });
        const root = session.header.cwd;
        if (route === '/api/pts-focus') return json(res, 200, { focus: await focusContext(args.sessionId, root, req.method === 'POST' ? args.focus : undefined) });
        if (req.method === 'GET') return json(res, 200, await productView(root));
        if (args.operation === 'resolve_gap') {
          const view = await productView(root);
          if (view.product?.revision !== args.expectedRevision) throw new Error('product revision conflict; reload');
          if (!['resolved'].includes(args.resolution)) throw new Error('unsupported gap resolution');
          const gap = view.status.lessons.flatMap((lesson) => lesson.gapItems || []).find((item) => item.id === args.gapId && item.state === 'open');
          if (!gap) throw new Error('open gap not found; reload');
          await applyDirectEdit({ session }, {
            operation: 'record_decision',
            title: 'Klärung erledigt oder nicht erforderlich',
            decision: `${gapDecisionToken(gap.id, args.resolution)} ${gap.text}`,
            teacher_confirmed: true,
          });
          return json(res, 200, await productView(root));
        }
        // Explicit UI actions record a teacher decision through the existing
        // structured writer. Tools themselves must supply a matching decision.
        if (args.operation === 'confirm_proposal' || args.operation === 'confirm_readiness') {
          const view = await productView(root);
          if (view.product?.revision !== args.expectedRevision) throw new Error('product revision conflict; reload');
          let token, title, note;
          if (args.operation === 'confirm_proposal') {
            const proposal = view.product.proposals.find((p) => p.id === args.proposalId);
            if (!proposal || proposal.status !== 'pending' || view.status.pending.find((p) => p.id === proposal.id)?.stale) throw new Error('proposal stale or missing; review again');
            token = approvalToken(proposal); title = 'Unterrichtsreihe: Vorschlag uebernommen'; note = proposal.reason.slice(0, 300);
          } else {
            const lesson = view.product.series.lessons.find((l) => l.id === args.lessonId);
            if (!lesson || typeof args.ready !== 'boolean') throw new Error('lesson and explicit readiness required');
            token = `[PTS readiness ${lesson.id} ${digest(lesson)} ${args.ready}]`; title = 'Verwendbarkeit: ' + lesson.title.slice(0, 100); note = args.note;
          }
          const decision = await applyDirectEdit({ session }, { operation: 'record_decision', title, decision: `${token} ${String(note || '').replace(/[\r\n]/g, ' ').slice(0, 400)}`, teacher_confirmed: true });
          args.decisionId = decision.id;
          args.operation = args.operation === 'confirm_proposal' ? 'accept_product' : 'mark_ready';
        }
        await mutateProduct(root, args);
        return json(res, 200, await productView(root));
      } catch (e) { json(res, /conflict|stale|changed|busy/.test(e.message) ? 409 : 400, { error: e.message }); }
    } });
    ctx.effect(() => dispose, `pts-landscape: ${route}`);
  }
}
