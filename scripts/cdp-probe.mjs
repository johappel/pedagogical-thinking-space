// cdp-probe.mjs — DOM-Zustand der 3081-Seite inspizieren.
const PORT = 9222;
const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const tab = tabs.find((t) => t.url.includes("3081"));
if (!tab) {
	console.log("kein 3081-Tab offen");
	process.exit(1);
}
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res, rej) => {
	ws.addEventListener("open", res, { once: true });
	ws.addEventListener("error", rej, { once: true });
});
let id = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
	const m = JSON.parse(ev.data);
	if (m.id && pending.has(m.id)) {
		const p = pending.get(m.id);
		pending.delete(m.id);
		m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
	}
});
const send = (method, params = {}) =>
	new Promise((resolve, reject) => {
		const i = ++id;
		pending.set(i, { resolve, reject });
		ws.send(JSON.stringify({ id: i, method, params }));
	});
const ev = async (expression) => {
	const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
	return r.exceptionDetails ? "JSERR " + JSON.stringify(r.exceptionDetails).slice(0, 500) : r.result?.value;
};

const expression = `(() => {
  const q=(s)=>document.querySelector(s);
  const qa=(s)=>[...document.querySelectorAll(s)];
  return {
    rows: qa('.ptsw-wsrow').map(e=>e.innerText.replace(/\\n/g,' | ')),
    listText: (q('.ptsw-list')||{}).innerText || null,
    noteText: (q('.ptsw-note')||{}).textContent || null,
    noteErrorText: (q('.ptsw-note-error')||{}).textContent || null,
    chipLabel: (q('button[aria-label="Denkraum wählen"]')||{textContent:null}).textContent,
    slotErrors: qa('[data-slot-error]').map(e=>e.getAttribute('data-slot-error')),
  };
})()`;
console.log(JSON.stringify(await ev(expression), null, 2));
process.exit(0);
