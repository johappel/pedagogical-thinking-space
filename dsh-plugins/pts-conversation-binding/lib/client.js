// PTS object conversation binding. DSH remains owner of session creation,
// persistence and history; this layer stores only subject -> session metadata.
window.__ModuleLoader__.load({
  id: 'pts-conversation-binding',
  factory: () => {
    const inject = ['sessions', 'workspaces'];
    async function request(path, init) {
      const res = await fetch(path, init);
      const value = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(value.error || `HTTP ${res.status}`);
      return value;
    }
    function workspaceForSession(ctx, sessionId) {
      const snapshot = ctx.workspaces.list.getSnapshot();
      const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
      return items.find((item) => Array.isArray(item.sessionIds) && item.sessionIds.includes(sessionId))?.id || null;
    }
    async function setFocus(sessionId, focus) {
      await request('/api/pts-focus', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, focus: { kind: focus.kind, id: focus.id, returnView: focus.returnView || 'landscape' } }) });
    }
    function apply(ctx) {
      let switching = false;
      const discuss = async () => {
        if (switching) return;
        const sourceId = ctx.sessions.list.getSnapshot()?.current;
        if (!sourceId) return;
        switching = true;
        try {
          const current = await request(`/api/pts-focus?sessionId=${encodeURIComponent(sourceId)}`);
          const focus = current.focus;
          if (!focus?.kind || !focus?.id) return; // generic Companion toggle, not object discussion
          const found = await request(`/api/pts-conversation-binding?sessionId=${encodeURIComponent(sourceId)}&kind=${encodeURIComponent(focus.kind)}&id=${encodeURIComponent(focus.id)}`);
          let targetId = found.binding?.sessionId || null;
          if (!targetId) {
            const workspaceId = workspaceForSession(ctx, sourceId);
            if (!workspaceId) throw new Error('Denkraum der aktuellen Sitzung nicht gefunden');
            targetId = await ctx.sessions.create({ workspaceId, agentPreset: 'pts-companion' });
            await request('/api/pts-conversation-binding', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: sourceId, kind: focus.kind, id: focus.id, boundSessionId: targetId }) });
            try {
              const session = ctx.sessions.binding(targetId)?.session;
              if (session && typeof session.rename === 'function') await session.rename(`${focus.subject?.title || focus.id} · Gespräch`);
            } catch { /* title is convenience only */ }
          }
          await setFocus(targetId, focus);
          ctx.sessions.open(targetId);
          window.dispatchEvent(new CustomEvent('pts:focus-changed'));
        } catch (error) {
          console.warn('[pts-conversation-binding] discussion thread not opened:', error);
          window.dispatchEvent(new CustomEvent('pts:conversation-binding-error', { detail: { message: String(error?.message || error) } }));
        } finally { switching = false; }
      };
      window.addEventListener('pts:open-companion', discuss);
      ctx.effect(() => () => window.removeEventListener('pts:open-companion', discuss), 'pts-conversation-binding: discuss navigation');
    }
    return { inject, apply };
  },
});
