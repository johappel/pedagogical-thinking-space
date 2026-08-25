// Realtest for active workspace stewardship and the generic DSH question UI.
// Usage: node scripts/pts-companion-question-test.mjs selection|free-text|skip|close
// Requires a running pts-web on 3081, standard DSH on 3080, and Chrome CDP 9222.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const mode = process.argv[2] ?? 'selection';
if (!['selection', 'free-text', 'skip', 'close'].includes(mode)) throw new Error(`unknown mode: ${mode}`);
const wsRequire = createRequire('C:/Users/Joachim/AppData/Local/nvm/v24.19.0/node_modules/@deepseek-ai/dsh/node_modules/ws/package.json');
const WebSocket = wsRequire('ws').WebSocket;
const root = path.resolve(import.meta.dirname, '..');
const port = 9222;
const name = `PTS Stewardship ${mode} ${Date.now()}`;
const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const workspace = path.join(root, 'workspace', slug);

class CDP {
	constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
	static async connect(url) {
		const ws = new WebSocket(url, { perMessageDeflate: false });
		await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
		const c = new CDP(ws);
		ws.on('message', (data) => {
			const msg = JSON.parse(data.toString());
			if (msg.id !== undefined && c.pending.has(msg.id)) {
				const p = c.pending.get(msg.id); c.pending.delete(msg.id);
				msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
			}
		});
		return c;
	}
	send(method, params = {}) {
		const id = ++this.id;
		return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
	}
	async evaluate(expression) {
		const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
		if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
		return r.result?.value?.value ?? r.result?.value;
	}
	close() { this.ws.close(); }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(cdp, expression, timeout = 180000) {
	const end = Date.now() + timeout;
	while (Date.now() < end) {
		if (await cdp.evaluate(expression)) return true;
		await sleep(1000);
	}
	return false;
}

const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' }).then((r) => r.json());
const cdp = await CDP.connect(target.webSocketDebuggerUrl);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1050, deviceScaleFactor: 1, mobile: false });
await cdp.send('Page.navigate', { url: 'http://127.0.0.1:3081/' });
await waitFor(cdp, `!!document.querySelector('.ptsw-root') || !!document.querySelector('[data-composer-card]')`, 30000);
await sleep(3000);

async function clickCreate() {
	await cdp.evaluate(`document.querySelector('button[aria-label="Neuen Denkraum anlegen"]').click()`);
	await waitFor(cdp, `!!document.querySelector('input.ptsw-input')`, 10000);
	await cdp.evaluate(`(() => { const i=document.querySelector('input.ptsw-input'); const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(i,${JSON.stringify(name)}); i.dispatchEvent(new Event('input',{bubbles:true})); const b=[...document.querySelectorAll('.ptsw-dialog .ptsw-btn-primary')].find(x=>!x.disabled); b.click(); return true; })()`);
	if (!await waitFor(cdp, `(document.querySelector('.ptsw-list')||{innerText:''}).innerText.includes(${JSON.stringify(name)})`, 20000)) throw new Error('workspace was not shown in PTS list');
	await sleep(2500);
}

async function newSession() {
	const clicked = await cdp.evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>['Neue Sitzung','New Session'].includes(x.innerText.trim())); if(!b)return false; b.click(); return true; })()`);
	if (!clicked) throw new Error('new-session button not found');
	await sleep(1200);
}

const prompt = mode === 'selection'
	? `Wir planen eine Unterrichtsstunde für Klasse 10 im Religionsunterricht (45 Minuten). Der didaktische Kern lautet: "Warum lügt er? Motive und Risiken". Die vorläufige Lernbewegung ist: Verstehen -> Abwägen -> Position beziehen. Der Schwerpunkt ist noch offen. Halte den bisherigen Denkstand selbstständig und transparent im aktuellen Workspace fest, ohne nach einer technischen Schreibfreigabe zu fragen. Lege keine pädagogische Entscheidung in decisions.yml an, solange der Schwerpunkt offen ist. Stelle danach genau eine echte pädagogische Schwerpunktfrage über ask_user_question mit diesen drei Richtungen: Motive verstehen, Folgen abwägen, Position beziehen. Jede Option soll ihre didaktische Folge kurz beschreiben und Freitext soll möglich sein.`
	: `Rufe jetzt ask_user_question auf. Stelle genau eine pädagogische Frage: Welcher Lernschritt soll im Zentrum stehen? Biete die drei Optionen Motive verstehen, Folgen abwägen und Position beziehen an, jeweils mit einer kurzen didaktischen Folge. Erlaube zusätzlich eine Freitextantwort. Warte auf die Antwort in der Weboberfläche und erfinde keine Entscheidung.`;

async function sendPrompt(text) {
	const sent = await cdp.evaluate(`(() => { const ta=document.querySelector('[data-composer-card] textarea'); if(!ta)return false; const s=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; s.call(ta,${JSON.stringify(text)}); ta.dispatchEvent(new Event('input',{bubbles:true})); ta.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true})); return true; })()`);
	if (!sent) throw new Error('composer not found');
}

async function questionSnapshot() {
	return cdp.evaluate(`(() => { const q=document.querySelector('[data-question-key]'); if(!q)return null; return { text:q.innerText, options:[...q.querySelectorAll('button[role="radio"]')].map(x=>x.getAttribute('aria-label')), buttons:[...q.querySelectorAll('button')].map(x=>({text:x.innerText.trim(),aria:x.getAttribute('aria-label'),title:x.title})), custom:!!q.querySelector('textarea') }; })()`);
}

try {
	await clickCreate();
	await newSession();
	await sendPrompt(prompt);
	if (!await waitFor(cdp, `!!document.querySelector('[data-question-key]')`, 180000)) throw new Error('ask_user_question card did not appear');
	const before = await questionSnapshot();
	let action = null;
	if (mode === 'selection') {
		action = await cdp.evaluate(`(() => { const b=[...document.querySelectorAll('[data-question-key] button[role="radio"]')].find(x=>/Motive verstehen/i.test(x.getAttribute('aria-label')||'')); if(!b)return false; b.click(); return true; })()`);
	} else if (mode === 'free-text') {
		action = await cdp.evaluate(`(() => { const t=document.querySelector('[data-question-key] textarea'); if(!t)return false; const s=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; s.call(t,'Ich möchte zuerst die Motive verstehen und danach die Risiken abwägen.'); t.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
	} else if (mode === 'skip') {
		action = await cdp.evaluate(`(() => { const b=[...document.querySelectorAll('[data-question-key] button')].find(x=>/Überspringen|Skip this question/i.test(x.innerText)); if(!b)return false; b.click(); return true; })()`);
	} else {
		action = await cdp.evaluate(`(() => { const q=document.querySelector('[data-question-key]'); const b=[...q.querySelectorAll('button')].find(x=>/Frage|question|dismiss|close|schließen|verwerfen/i.test((x.getAttribute('aria-label')||'')+' '+x.title)); if(!b)return false; b.click(); return true; })()`);
	}
	if (!action) throw new Error(`could not perform ${mode} action`);
	if (mode === 'selection' || mode === 'free-text') {
		await sleep(500);
		const submitted = await cdp.evaluate(`(() => { const q=document.querySelector('[data-question-key]'); if(!q)return false; const b=[...q.querySelectorAll('button')].find(x=>/Absenden|Submit|Senden/i.test(x.innerText)); if(!b||b.disabled)return false; b.click(); return true; })()`);
		if (!submitted) throw new Error('answer submit button not found');
	}
	await sleep(4000);
	const after = await questionSnapshot();
	const design = fs.existsSync(path.join(workspace, 'learning-design.md')) ? fs.readFileSync(path.join(workspace, 'learning-design.md'), 'utf8') : '';
	const decisions = fs.existsSync(path.join(workspace, 'decisions.yml')) ? fs.readFileSync(path.join(workspace, 'decisions.yml'), 'utf8') : '';
	const landscape = fs.existsSync(path.join(workspace, 'learning-landscape.md')) ? fs.readFileSync(path.join(workspace, 'learning-landscape.md'), 'utf8') : '';
	console.log(JSON.stringify({ mode, workspace, before, action, after, files: { designBytes: design.length, hasOpenQuestions: /Open Questions|Offene Fragen/i.test(design), hasDraftLanguage: /draft|vorläufig/i.test(design+landscape), decisions }, note: 'The final delete is intentionally left to the UI cleanup below.' }, null, 2));
} finally {
	// Use the recoverable PTS delete route. The UI test itself verifies registry cleanup.
	await fetch('http://127.0.0.1:3081/api/pts-workspaces/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: workspace }) }).catch(() => {});
	cdp.close();
}
