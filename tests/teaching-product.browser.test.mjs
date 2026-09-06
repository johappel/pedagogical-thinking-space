// Real browser + real PTS client/HTTP/store/tool path. The DSH shell and LLM
// are explicit deterministic fixtures, not a claim about autonomous LLM use.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { fixture, candidateSeries } from './support/product-fixture.mjs';
import { buildSnapshot } from '../dsh-presets/pts-companion/workspace-snapshot.mjs';

const repo = path.resolve(import.meta.dirname, '..');
const html = `<!doctype html><html lang="de"><meta charset="utf-8"><title>PTS Product E2E</title>
<style>body{font:16px system-ui;margin:20px;background:#fafafa;color:#202020}button{cursor:pointer}nav{display:flex;gap:12px;margin:50px 0 20px}textarea{width:80%;min-height:60px}.shell{max-width:1100px;margin:auto}</style>
<div id="app"></div><script src="/react.js"></script><script src="/react-dom.js"></script><script>
const h=React.createElement, views={}, overlays=[];
const empty={order:[],nodes:{get:()=>undefined}}, source={getSnapshot:()=>empty,subscribe:()=>()=>{}};
const listSnapshot={current:'test-session'};
const ctx={sessions:{list:{getSnapshot:()=>listSnapshot,subscribe:()=>()=>{}},binding:()=>({})},uiConversation:{binding:()=>({target:()=>source})},slots:{inject:(name,fn)=>fn(),register:(meta,component)=>{if(meta.name==='conversation.view')views[meta.id]={meta,component};if(meta.name==='shell.overlay')overlays.push(component);return ()=>{};}}};
window.__ModuleLoader__={load:entry=>entry.factory(name=>{if(name==='react')return React;throw Error(name)}).apply(ctx)};
</script><script src="/client.js"></script><script>
function App(){const [view,setView]=React.useState('landscape'),[draft,setDraft]=React.useState(''),[messages,setMessages]=React.useState([]),[request,setRequest]=React.useState(null);
const props={sessionId:'test-session',inputActions:{setDraft},openView:(v,f)=>{setView(v);setRequest({view:v,focus:f})},viewRequest:request,completeViewRequest:()=>setRequest(null)};
async function send(){const text=draft;setDraft('');setMessages(m=>m.concat([{who:'teacher',text}]));const response=await fetch('/test/companion',{method:'POST',body:JSON.stringify({text})});const result=await response.json();setMessages(m=>m.concat([{who:'companion',text:result.text}]));window.dispatchEvent(new CustomEvent('pts:product-changed'));}
return h('div',{className:'shell'},h('nav',null,h('button',{role:'tab','aria-selected':view==='chat',onClick:()=>setView('chat')},'Thinking Space'),...Object.values(views).sort((a,b)=>a.meta.order-b.meta.order).map(v=>h('button',{key:v.meta.id,role:'tab','aria-selected':view===v.meta.id,onClick:()=>setView(v.meta.id)},v.meta.label))),view==='chat'?h('section',{'aria-label':'Gemeinsames Gespräch'},messages.map((m,i)=>h('p',{key:i},m.who+': '+m.text))):h(views[view].component,props),h('label',null,'Nachricht',h('textarea',{'aria-label':'Nachricht','data-composer-input':true,value:draft,onChange:e=>setDraft(e.target.value)})),h('button',{onClick:send},'Senden'),...overlays.map((Component,i)=>h(Component,{key:i})));}
ReactDOM.createRoot(document.getElementById('app')).render(h(App));
</script></html>`;

async function browserFixture(t, legacy = false) {
  const f = await fixture(t, { legacy });
  f.extra(async (req, res) => {
    const files = { '/react.js': 'node_modules/react/umd/react.development.js', '/react-dom.js': 'node_modules/react-dom/umd/react-dom.development.js', '/client.js': 'dsh-plugins/pts-landscape/lib/client.js' };
    if (req.url === '/') { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html); return true; }
    if (files[req.url]) { res.setHeader('content-type', 'text/javascript; charset=utf-8'); res.end(await readFile(path.join(repo, files[req.url]))); return true; }
    if (req.url === '/test/companion') {
      let body = ''; for await (const c of req) body += c;
      const { text } = JSON.parse(body);
      assert.match(text, /begründen/);
      // Deterministic specialist edit through the real, existing PTS route.
      const edited = await f.request('/api/pts-landscape/moment', { momentId: 'lm-perspektive', fields: { learning_activity: 'Zwei Aussagen vergleichen und begruenden' } });
      assert.equal(edited.status, 200);
      const current = await f.execute({ operation: 'read_product' });
      await f.execute({ operation: 'propose_product', expectedRevision: current.result.product.revision, series: candidateSeries(), reason: 'Den weiterentwickelten Vergleich in Stunde 1 verwenden.' });
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ text: 'Ich schlage den Vergleich als Phase in Stunde 1 vor. Der Vorschlag steht zur Prüfung bereit.' })); return true;
    }
    return false;
  });
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1360, height: 960 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(f.baseURL);
  return { ...f, browser, page, errors };
}
test('5-8 browser E2E: conversation -> proposal -> explicit adoption -> status -> phase -> same conversation/focus', async (t) => {
  const f = await browserFixture(t);
  const page = f.page;
  await page.getByRole('button', { name: 'Werkstatt', exact: true }).click();
  await page.getByRole('complementary', { name: 'Focus Context' }).waitFor();
  assert.match(await page.locator('.pts-focus-banner').innerText(), /Perspektiven vergleichen/);
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  assert.equal(await page.getByText('Stunden-Zuordnung', { exact: true }).count(), 0);
  await page.getByRole('textbox', { name: 'Nachricht' }).fill('Bitte sollen die Lernenden ihre Sichtweisen begründen.');
  await page.getByRole('button', { name: '💬 Chat', exact: true }).click();
  await page.getByRole('region', { name: 'Gemeinsames Gespräch' }).waitFor({ state: 'attached' });
  assert.match(await page.getByRole('textbox', { name: 'Nachricht' }).inputValue(), /begründen/);
  await page.getByRole('button', { name: 'Senden', exact: true }).click();
  await page.getByText(/Der Vorschlag steht zur Prüfung bereit/).waitFor();
  await page.getByRole('tab', { name: 'Product Status', exact: true }).click();
  await page.getByText(/Noch keine Unterrichtseinheiten/).waitFor();
  await page.locator('summary').click();
  await page.getByRole('button', { name: 'Diesen Vorschlag übernehmen', exact: true }).click();
  await page.locator('[data-lesson="lesson-1"]').waitFor();
  assert.match(await page.locator('.pts-product').innerText(), /In Ausarbeitung/);
  assert.match(await page.locator('.pts-product').innerText(), /Unterrichtsbereitschaft noch nicht entschieden/);
  await page.getByRole('tab', { name: 'Unterrichtsreihe', exact: true }).click();
  await page.locator('[data-lesson="lesson-1"]').click();
  await page.locator('[data-phase="phase-1"]').click();
  await page.getByRole('region', { name: 'Gemeinsames Gespräch' }).waitFor();
  await page.waitForFunction(() => document.querySelector('.pts-focus-banner')?.textContent.includes('Vergleich'));
  assert.match(buildSnapshot(f.root, 'test-session'), /"kind"\s*:\s*"phase"[\s\S]*"id"\s*:\s*"phase-1"/);
  assert.match(await page.getByRole('region', { name: 'Gemeinsames Gespräch' }).innerText(), /begründen/);
  await page.getByRole('button', { name: 'Zum Gegenstand', exact: true }).click();
  await page.locator('[data-phase="phase-1"]').waitFor();
  await page.reload();
  await page.getByRole('tab', { name: 'Unterrichtsreihe', exact: true }).click();
  await page.locator('[data-lesson="lesson-1"]').click();
  await mkdir(path.join(repo, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(repo, 'test-results', 'teaching-product-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(repo, 'test-results', 'teaching-product-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Fokus beenden', exact: true }).click();
  assert.equal((await f.request('/api/pts-focus')).body.focus, null);
  assert.deepEqual(f.errors, []);
});
test('2+5 browser migration preview and rejected proposal leave the product empty', async (t) => {
  const f = await browserFixture(t, true);
  await f.page.getByRole('tab', { name: 'Unterrichtsreihe', exact: true }).click();
  await f.page.getByRole('button', { name: 'Migration vorbereiten', exact: true }).click();
  await f.page.locator('summary').click();
  await f.page.getByRole('button', { name: 'Vorschlag verwerfen', exact: true }).click();
  await f.page.waitForFunction(() => !document.querySelector('summary'));
  const view = (await f.request('/api/pts-product')).body;
  assert.equal(view.product.series.lessons.length, 0);
  assert.equal(view.product.proposals[0].status, 'rejected');
  assert.deepEqual(f.errors, []);
});

const threadHtml = `<!doctype html><html lang="de"><meta charset="utf-8"><title>PTS Thread E2E</title>
<style>body{font:16px system-ui;margin:20px}nav{display:flex;gap:8px;margin:20px 0}button{cursor:pointer}textarea{display:block;width:80%;min-height:55px}.thread{border:1px solid #bbb;padding:10px;margin:10px 0}</style>
<div id="app"></div><script src="/react.js"></script><script src="/react-dom.js"></script><script>
const h=React.createElement, views={}, overlays=[], sessionState={current:'test-session',sessions:['test-session'],listeners:new Set(),snapshot:{current:'test-session'}};
const empty={order:[],nodes:{get:()=>undefined}}, source={getSnapshot:()=>empty,subscribe:()=>()=>{}};
const notify=()=>sessionState.listeners.forEach(fn=>fn());
const ctx={
 sessions:{list:{getSnapshot:()=>sessionState.snapshot,subscribe:(fn)=>{sessionState.listeners.add(fn);return()=>sessionState.listeners.delete(fn)}},
   binding:(id)=>({session:{rename:async()=>{}}}),
   create:async()=>{const r=await fetch('/test/session',{method:'POST'});const id=(await r.json()).id;sessionState.sessions.push(id);return id},
   open:(id)=>{sessionState.current=id;sessionState.snapshot={current:id};notify()}},
 workspaces:{list:{getSnapshot:()=>({items:[{id:'workspace-demo',sessionIds:[...sessionState.sessions||[],'test-session']}]}),subscribe:()=>()=>{}}},
 uiConversation:{binding:()=>({target:()=>source})},effect:(fn)=>fn(),
 slots:{inject:(name,fn)=>fn(),register:(meta,component)=>{const old=views[meta.id];if(meta.name==='conversation.view'&&(!old||(meta.priority||0)<(old.meta.priority||0)))views[meta.id]={meta,component};if(meta.name==='shell.overlay')overlays.push(component);return()=>{}}}
};
window.__ModuleLoader__={load:entry=>{const mod=entry.factory(name=>{if(name==='react')return React;throw Error(name)});mod.apply(ctx)}};
</script><script src="/landscape.js"></script><script src="/workshop.js"></script><script src="/binding.js"></script><script>
function App(){const current=React.useSyncExternalStore(ctx.sessions.list.subscribe,ctx.sessions.list.getSnapshot,ctx.sessions.list.getSnapshot).current;const [view,setView]=React.useState('landscape'),[history,setHistory]=React.useState([]),[draft,setDraft]=React.useState('');
React.useEffect(()=>{fetch('/test/chat?sessionId='+encodeURIComponent(current)).then(r=>r.json()).then(v=>setHistory(v.history||[]))},[current]);
const props={sessionId:current,inputActions:{setDraft},openView:(v)=>setView(v),viewRequest:null,completeViewRequest:()=>{}};
async function send(){const text=draft;setDraft('');await fetch('/test/chat?sessionId='+encodeURIComponent(current),{method:'POST',body:JSON.stringify({text})});const v=await fetch('/test/chat?sessionId='+encodeURIComponent(current)).then(r=>r.json());setHistory(v.history||[])}
return h('div',{'data-session-id':current},h('button',{onClick:()=>ctx.sessions.open('test-session')},'Hauptgespräch'),h('nav',null,...Object.values(views).sort((a,b)=>a.meta.order-b.meta.order).map(v=>h('button',{key:v.meta.id,onClick:()=>setView(v.meta.id)},v.meta.label))),h('div',{className:'thread','aria-label':'Aktiver Thread'},'Aktiver Thread: '+current,h('div',{'aria-label':'Thread History'},history.map((m,i)=>h('p',{key:i},m)))),view==='chat'?h('p',null,'Hauptgespräch'):h(views[view].component,props),h('textarea',{'aria-label':'Nachricht',value:draft,onChange:e=>setDraft(e.target.value)}),h('button',{onClick:send},'Senden'),overlays.map((Component,i)=>h(Component,{key:i,sessionId:current})));}
ReactDOM.createRoot(document.getElementById('app')).render(h(App));
</script></html>`;

async function threadBrowserFixture(t) {
  const f = await browserFixture(t);
  const histories = new Map([['test-session', ['Main Nachricht A', 'Main Nachricht B']]]);
  f.extra(async (req, res) => {
    const url = new URL(req.url, f.baseURL);
    if (url.pathname === '/') { res.setHeader('content-type','text/html; charset=utf-8'); res.end(threadHtml); return true; }
    const files = {'/react.js':'node_modules/react/umd/react.development.js','/react-dom.js':'node_modules/react-dom/umd/react-dom.development.js','/landscape.js':'dsh-plugins/pts-landscape/lib/client.js','/workshop.js':'dsh-plugins/pts-moment-workshop/lib/client.js','/binding.js':'dsh-plugins/pts-conversation-binding/lib/client.js'};
    if (files[url.pathname]) { res.setHeader('content-type','text/javascript; charset=utf-8'); res.end(await readFile(path.join(repo, files[url.pathname]))); return true; }
    if (url.pathname === '/test/session' && req.method === 'POST') { const id = `moment-thread-${histories.size}`; histories.set(id, []); f.sessions.set(id, { id, header: { cwd: f.root } }); res.setHeader('content-type','application/json'); res.end(JSON.stringify({id})); return true; }
    if (url.pathname === '/test/chat') {
      const id = url.searchParams.get('sessionId'); if (!histories.has(id)) { res.statusCode=404; res.end('{}'); return true; }
      if (req.method === 'POST') { let raw=''; for await (const c of req) raw += c; const value=JSON.parse(raw||'{}'); histories.get(id).push(value.text); }
      res.setHeader('content-type','application/json'); res.end(JSON.stringify({history:histories.get(id)})); return true;
    }
    return false;
  });
  await f.page.goto(f.baseURL);
  return { ...f, histories };
}

test('persistent object thread E2E: main and moment histories stay separate and reopen', async (t) => {
  const f = await threadBrowserFixture(t); const page = f.page;
  await page.getByRole('button', { name: 'Darüber sprechen', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-session-id]')?.dataset.sessionId?.startsWith('moment-thread-'));
  const threadId = await page.locator('[data-session-id]').getAttribute('data-session-id');
  assert.match(threadId, /^moment-thread-/);
  await page.getByRole('textbox', { name: 'Nachricht' }).fill('Moment Nachricht C');
  await page.getByRole('button', { name: 'Senden', exact: true }).click();
  await page.getByText('Moment Nachricht C', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Hauptgespräch', exact: true }).click();
  await page.getByText('Main Nachricht A', { exact: true }).waitFor();
  assert.equal(await page.getByText('Moment Nachricht C', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Darüber sprechen', exact: true }).click();
  await page.getByText('Moment Nachricht C', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-session-id]').getAttribute('data-session-id'), threadId);
  assert.equal(await page.getByText('Main Nachricht A', { exact: true }).count(), 0);
  const bindingFile = JSON.parse(await readFile(path.join(f.root, '.pts', 'conversation-bindings.json'), 'utf8'));
  assert.deepEqual(bindingFile.bindings.map(({ kind, id }) => ({ kind, id })), [{ kind: 'moment', id: 'lm-perspektive' }]);
  const snapshot = buildSnapshot(f.root, threadId);
  assert.match(snapshot, /persistente Conversation Binding/);
  assert.match(snapshot, /Lernmoment/);
  assert.deepEqual(f.errors, []);
});
