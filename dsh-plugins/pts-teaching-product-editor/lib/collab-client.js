// Phase 2B collaboration client (Classic Script). Binds one Quill editor to a
// Yjs document via the official y-quill QuillBinding, and syncs through a tiny
// WebSocket provider to the collaboration hub. It knows nothing about PTS
// domain semantics: it only edits live text and shows the domain's `committed`
// events. editorDelta (Quill/Yjs) and semanticDelta (PTS) never mix here.
(function () {
	var cfg = window.__COLLAB__;
	var Y = window.Y;
	var Quill = window.Quill;
	var QuillBinding = window.QuillBinding;
	if (!Y || !Quill || !QuillBinding) { console.error('[collab] Yjs/Quill/Binding fehlen'); return; }

	var quill = new Quill(document.getElementById('editor'), {
		theme: 'snow',
		modules: { toolbar: [['bold', 'italic', 'code'], [{ header: 1 }, { header: 2 }], ['link'], [{ list: 'bullet' }]] },
	});
	var doc = new Y.Doc();
	var ytext = doc.getText('quill');
	// eslint-disable-next-line no-new
	new QuillBinding(ytext, quill);

	var state = { role: cfg.role, connected: false, sent: 0, received: 0, get updateCount() { return this.sent + this.received; }, lastCommitted: null };
	window.__collab = state;

	function b64e(u8) { var s = ''; for (var i = 0; i < u8.length; i += 1) s += String.fromCharCode(u8[i]); return btoa(s); }
	function b64d(str) { var bin = atob(str); var u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i); return u8; }

	var proto = location.protocol === 'https:' ? 'wss' : 'ws';
	var url = proto + '://' + location.host + cfg.wsPath +
		'?session=' + encodeURIComponent(cfg.sessionId) + '&lesson=' + encodeURIComponent(cfg.lessonId) +
		'&phase=' + encodeURIComponent(cfg.phaseId) + '&block=' + encodeURIComponent(cfg.blockId) + '&role=' + encodeURIComponent(cfg.role);
	var ws = new WebSocket(url);

	// Local edits (origin !== 'remote') are the ONLY thing we push; remote
	// applications are tagged 'remote' so they are never echoed back.
	doc.on('update', function (update, origin) {
		if (origin !== 'remote' && ws.readyState === 1) {
			ws.send(JSON.stringify({ type: 'update', role: cfg.role, update: b64e(update) }));
			state.sent += 1;
		}
	});

	ws.onopen = function () { state.connected = true; };
	ws.onmessage = function (ev) {
		var m = JSON.parse(ev.data);
		if (m.type === 'sync' || m.type === 'update') {
			Y.applyUpdate(doc, b64d(m.update), 'remote');
			state.received += 1;
		} else if (m.type === 'committed') {
			state.lastCommitted = m;
			var log = document.getElementById('log');
			if (log) log.textContent = 'PTS-Revision ' + m.revision + ' · ' + (m.classification || '') + ' · contributors: ' + (m.contributors || []).join(', ');
		}
	};

	var settle = document.getElementById('settle');
	if (settle) settle.onclick = function () { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'settle' })); };

	window.__collabReady = true;
})();
