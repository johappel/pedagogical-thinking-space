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
  assert.match(buildSnapshot(f.root, 'test-session'), /"kind":"phase","id":"phase-1"/);
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
