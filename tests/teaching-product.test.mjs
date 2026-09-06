import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fixture, candidateSeries, momentText } from './support/product-fixture.mjs';
import { validateSeries, readProduct, approvalToken, digest } from '../dsh-presets/pts-companion/teaching-product.mjs';
import { buildSnapshot } from '../dsh-presets/pts-companion/workspace-snapshot.mjs';

test('1 domain: independent phases, many-to-many references, invalid IDs/paths rejected', () => {
  const series = candidateSeries();
  series.lessons[0].phases.push({ ...structuredClone(series.lessons[0].phases[0]), id: 'phase-2' });
  assert.equal(validateSeries(series).lessons[0].phases.length, 2);
  series.lessons[0].phases[1].id = 'phase-1';
  assert.throws(() => validateSeries(series), /duplicate/);
  const bad = candidateSeries(); bad.lessons[0].phases[0].materials = ['materials/../../secret'];
  assert.throws(() => validateSeries(bad), /material/);
});
test('2 migration E2E: legacy preserved, canonical file initialized, no automatic adoption, idempotent', async (t) => {
  const f = await fixture(t, { legacy: true });
  const old = await readFile(path.join(f.root, 'temporal-plan.yml'), 'utf8');
  const initial = await f.request('/api/pts-product');
  assert.equal(initial.body.migration.series.lessons[0].id, 'tw-1');
  assert.equal(initial.body.migration.series.lessons[0].phases[0].id, 'tp-1');
  assert.equal(initial.body.migration.series.lessons[0].kind, 'double_lesson');
  const args = { operation: 'migrate_product', sourceRevision: initial.body.migration.sourceRevision };
  assert.equal((await f.request('/api/pts-product', args)).status, 200);
  const product = await readProduct(f.root);
  assert.equal(product.series.lessons.length, 0); assert.equal(product.proposals.length, 1);
  assert.deepEqual(product.proposals[0].series.lessons[0].phases[0].materials, ['materials/impuls.md']);
  await f.request('/api/pts-product', args);
  assert.deepEqual(await readProduct(f.root), product);
  assert.equal(await readFile(path.join(f.root, 'temporal-plan.yml'), 'utf8'), old);
  assert.equal((await f.request('/api/pts-landscape/temporal', { windows: [], placements: [] })).status, 409);
  assert.equal((await f.request('/api/pts-artifact/save', { file: './temporal-plan.yml', content: old })).status, 409);
  assert.equal((await f.request('/api/pts-artifact/save', { file: './teaching-product.json', content: '{}' })).status, 403);
});
test('3+4 tool -> proposal -> teacher decision -> product/status/snapshot; no implicit readiness', async (t) => {
  const f = await fixture(t);
  const result = await f.execute({ operation: 'propose_product', expectedRevision: 0, series: candidateSeries(), reason: 'Vergleich als erste Stunde pruefen' });
  assert.equal(result.childAgentStarted, false);
  const proposal = result.result.product.proposals[0];
  assert.equal((await readProduct(f.root)).series.lessons.length, 0);
  await assert.rejects(() => f.execute({ operation: 'accept_product', expectedRevision: 1, proposalId: proposal.id, decisionId: 'invented' }), /confirmed teacher/);
  const decision = await f.execute({ operation: 'record_decision', title: 'Vergleich uebernehmen', decision: approvalToken(proposal), teacher_confirmed: true });
  await f.execute({ operation: 'accept_product', expectedRevision: 1, proposalId: proposal.id, decisionId: decision.id });
  const view = (await f.request('/api/pts-product')).body;
  assert.equal(view.status.lessons.length, 1);
  assert.equal(view.status.lessons[0].teacherReadiness, null);
  assert.match(view.status.lessons[0].gaps.join(), /Ergebnissicherung/);
  assert.match(buildSnapshot(f.root), /Vergleich uebernehmen|PTS product/);
  await f.execute({ operation: 'assess_product', expectedRevision: 2, lessonId: 'lesson-1', assessment: 'ready_candidate', note: 'Aus Companion-Sicht pruefbar' });
  const assessed = (await f.request('/api/pts-product')).body.status.lessons[0];
  assert.equal(assessed.teacherReadiness, null); assert.equal(assessed.companionAssessment.value, 'ready_candidate');
  const ready = await f.request('/api/pts-product', { operation: 'confirm_readiness', expectedRevision: 3, lessonId: 'lesson-1', ready: true, note: 'Fuer diese Lerngruppe passend' });
  assert.equal(ready.status, 200); assert.equal(ready.body.status.lessons[0].teacherReadiness.ready, true);
});
test('source changes invalidate proposals, preserve adopted phases and surface gaps', async (t) => {
  const f = await fixture(t);
  let proposed = await f.execute({ operation: 'propose_product', expectedRevision: 0, series: candidateSeries(), reason: 'Pruefen' });
  await writeFile(path.join(f.root, 'learning-landscape.md'), momentText.replace('Zwei Aussagen vergleichen', 'Drei Aussagen vergleichen'));
  let response = await f.request('/api/pts-product', { operation: 'confirm_proposal', expectedRevision: 1, proposalId: proposed.id });
  assert.equal(response.status, 409);
  assert.equal((await readProduct(f.root)).series.lessons.length, 0);
  proposed = await f.execute({ operation: 'propose_product', expectedRevision: 1, series: candidateSeries(), reason: 'Erneut geprueft' });
  response = await f.request('/api/pts-product', { operation: 'confirm_proposal', expectedRevision: 2, proposalId: proposed.id });
  assert.equal(response.status, 200);
  const before = response.body.product.series;
  await writeFile(path.join(f.root, 'learning-landscape.md'), momentText.replace('Zwei Aussagen vergleichen', 'Vier Aussagen vergleichen'));
  response = await f.request('/api/pts-product');
  assert.deepEqual(response.body.product.series, before);
  assert.match(response.body.status.lessons[0].gaps.join(), /weiterentwickelt/);
});
test('6 Focus E2E: generic subjects, current data, same workspace, session isolation, clear', async (t) => {
  const f = await fixture(t);
  const proposed = await f.execute({ operation: 'propose_product', expectedRevision: 0, series: candidateSeries(), reason: 'Pruefen' });
  await f.request('/api/pts-product', { operation: 'confirm_proposal', expectedRevision: 1, proposalId: proposed.id });
  for (const [kind, id] of [['moment', 'lm-perspektive'], ['lesson', 'lesson-1'], ['phase', 'phase-1'], ['material', 'materials/impuls.md'], ['question', 'question-1']]) {
    const response = await f.request('/api/pts-focus', { focus: { kind, id, returnView: 'teaching-product' } });
    assert.equal(response.status, 200, JSON.stringify(response.body)); assert.equal(response.body.focus.subject.id, id);
    assert.match(buildSnapshot(f.root, 'test-session'), /PRIMARY FOCUS|Aktueller Focus Context/);
    assert.doesNotMatch(buildSnapshot(f.root, 'other-session'), /PRIMARY FOCUS|Aktueller Focus Context/);
  }
  assert.equal((await f.request('/api/pts-focus', { focus: { kind: 'phase', id: 'absent', returnView: 'chat' } })).status, 400);
  await f.request('/api/pts-focus', { focus: null });
  assert.equal((await f.request('/api/pts-focus')).body.focus, null);
});
test('persistence rejects corruption, unknown sessions, invalid revisions and concurrent writes', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/pts-product', null, 'unknown')).status, 404);
  const args = { operation: 'propose_product', expectedRevision: 0, series: candidateSeries(), reason: 'Pruefen' };
  const results = await Promise.all([f.request('/api/pts-product', args), f.request('/api/pts-product', args)]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 1);
  await writeFile(path.join(f.root, 'teaching-product.json'), '{bad');
  assert.equal((await f.request('/api/pts-product')).status, 400);
  assert.equal((await f.request('/api/pts-product', args)).status, 400);
  assert.equal(await readFile(path.join(f.root, 'teaching-product.json'), 'utf8'), '{bad');
});
test('8 legacy landscape read projects adopted product, not stale temporal file', async (t) => {
  const f = await fixture(t);
  const p = await f.execute({ operation: 'propose_product', expectedRevision: 0, series: candidateSeries(), reason: 'Pruefen' });
  await f.request('/api/pts-product', { operation: 'confirm_proposal', expectedRevision: 1, proposalId: p.id });
  const landscape = (await f.request('/api/pts-landscape')).body;
  assert.equal(landscape.productRevision, 2);
  assert.equal(landscape.temporal.windows[0].id, 'lesson-1');
  assert.equal(landscape.temporal.placements[0].moment_id, 'lm-perspektive');
});
