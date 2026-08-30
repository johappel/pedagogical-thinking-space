// Logic smoke test for pts-landscape (vm-based, no browser).
// Verifies the host half loads, the landscape markdown parser, layout
// parsing, path-boundary rules for the artifact save and the atomic writer.
import { promises as fs } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as pls from 'file:///F:/code/pedagogical-thinking-space/dsh-plugins/pts-landscape/lib/index.js';

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log('  ok  ' + name); }
  else { fail += 1; console.log('  FAIL ' + name); }
}

// 1. Host module shape
check('host inject has webServer', Array.isArray(pls.inject) && pls.inject.includes('webServer'));
check('host apply is function', typeof pls.apply === 'function');

// 2. Landscape parser against the real backfilled workspace file
const rawReal = await fs.readFile('F:/code/pedagogical-thinking-space/workspace/hoffnung/learning-landscape.md', 'utf8');
const real = pls.parseLandscape(rawReal);
check('real landscape parses moments', Array.isArray(real.moments) && real.moments.length >= 1);
check('real moment has title', real.moments.length >= 1 && typeof real.moments[0].title === 'string' && real.moments[0].title.length > 0);
check('real moment has status draft', real.moments.every((m) => m.status === 'draft' || m.status === 'stable'));
check('real frontmatter title', real.front.title === 'Hoffnung');

// 3. Synthetic landscape: frontmatter, materials flow list, open questions,
//    transitions
const sample = `---
schema: ptspace.learning-landscape/v1
title: KI und Gottesbild
structure: hybrid
---

# Lernlandschaft

## Lernmomente

### lm-impuls

- Titel: KI begegnet Menschenbildern
- Typ: impulse
- Funktion: Irritation und persönlicher Zugang
- Lernaktivität: Lernende reagieren auf Impulse.
- Erwartete Lernerfahrung: Menschenbilder sind nicht neutral.
- Materialbedarfe:
  - Impulsbilder
  - Thesenkarten
- Materialien: [mat-a, mat-b]
- Offene Fragen:
  - Wie viel Vorwissen hat die Klasse?
- Status: draft

## Übergänge

### tr-impuls-positionieren

- Von: lm-impuls
- Zu: lm-positionieren
- Typ: required
- Begründung: Die Irritation wird in eine Position überführt.
`;
const s = pls.parseLandscape(sample);
check('synthetic moments', s.moments.length === 1);
check('synthetic moment fields', s.moments[0].title === 'KI begegnet Menschenbildern' && s.moments[0].type === 'impulse');
check('synthetic material needs list', Array.isArray(s.moments[0].material_needs) && s.moments[0].material_needs.length === 2);
check('synthetic materials flow list', Array.isArray(s.moments[0].materials) && s.moments[0].materials.join(',') === 'mat-a,mat-b');
check('synthetic open questions', Array.isArray(s.moments[0].open_questions) && s.moments[0].open_questions[0].includes('Vorwissen'));
check('synthetic transition', s.transitions.length === 1 && s.transitions[0].from === 'lm-impuls' && s.transitions[0].to === 'lm-positionieren' && s.transitions[0].type === 'required');
check('synthetic frontmatter structure', s.front.structure === 'hybrid');

// 4. Layout parsing
const layoutOk = pls.parseLayout('{"schema":"ptspace.learning-landscape.layout/v1","positions":{"lm-impuls":{"x":10,"y":20}}}');
check('layout positions parsed', layoutOk.positions['lm-impuls'] && layoutOk.positions['lm-impuls'].x === 10);
const layoutBad = pls.parseLayout('kein json');
check('invalid layout tolerated', Object.keys(layoutBad.positions).length === 0);

// 5. Path boundary for the artifact save
const root = await mkdtemp(path.join(tmpdir(), 'pts-landscape-test-'));
try {
  await fs.writeFile(path.join(root, 'learning-landscape.md'), '# x\n', 'utf8');
  const ok = await pls.resolveWorkspaceFile(root, 'learning-landscape.md', 10);
  check('inside file resolves', ok.ok === true && path.basename(ok.target) === 'learning-landscape.md');
  const traversal = await pls.resolveWorkspaceFile(root, '../learning-landscape.md', 10);
  check('traversal rejected', traversal.ok === false && traversal.reason === 'outside');
  const abs = await pls.resolveWorkspaceFile(root, 'C:/Windows/win.ini', 10);
  check('absolute path rejected', abs.ok === false);
  const ext = await pls.resolveWorkspaceFile(root, 'learning-landscape.exe', 10);
  check('extension not allowed', ext.ok === false && ext.reason === 'extension-not-allowed');
  const missingParent = await pls.resolveWorkspaceFile(root, 'nested/datei.md', 10);
  check('missing parent rejected', missingParent.ok === false && missingParent.reason === 'outside');

  // 6. Atomic write + read-back
  await pls.atomicWriteFile(root, 'temporal-plan.yml', 'schema: ptspace.temporal-plan/v1\nwindows: []\nplacements: []\n');
  const written = await fs.readFile(path.join(root, 'temporal-plan.yml'), 'utf8');
  check('atomic write persists', written.includes('ptspace.temporal-plan/v1'));
  const rest = await fs.readdir(root);
  check('no temp leftovers', rest.every((f) => !f.endsWith('.tmp')));
} finally {
  await rm(root, { recursive: true, force: true });
}

// 7. Temporal + decisions parse (proposed status flows through)
const tp = pls.parseTemporal('schema: ptspace.temporal-plan/v1\nwindows:\n  - id: tw-01\n    title: Stunde 1\n    kind: lesson\n    duration_minutes: 45\n    status: proposed\nplacements: []\n');
check('temporal parses proposed window', tp.windows.length === 1 && tp.windows[0].status === 'proposed');
const dec = pls.parseDecisions('decisions:\n  - id: d-1\n    title: Einzelstunde\n    evidence: m3\n');
check('decisions parsed', dec.decisions.length === 1 && dec.decisions[0].title === 'Einzelstunde');

// 8. serializeTemporal round-trip
const st = pls.serializeTemporal({
  title: 'Vier Stunden',
  windows: [{ id: 'tw-01', title: 'Stunde 1 – Irritation', kind: 'lesson', duration_minutes: 45, note: '', status: 'binding' }],
  placements: [{ id: 'tp-01', moment_id: 'lm-a', window_id: 'tw-01', start_minute: 0, duration_minutes: 40, dramaturgical_role: 'opening', mode: 'common', note: '', status: 'proposed' }],
});
check('serialize has schema', st.includes('schema: ptspace.temporal-plan/v1'));
check('serialize window binding', st.includes('status: binding'));
check('serialize placement proposed', st.includes('status: proposed'));
const reparsed = pls.parseTemporal(st);
check('round-trip windows', reparsed.windows.length === 1 && reparsed.windows[0].title === 'Stunde 1 – Irritation');
check('round-trip placement', reparsed.windows[0].placements.length === 1 && reparsed.windows[0].placements[0].dramaturgical_role === 'opening' && reparsed.windows[0].placements[0].status === 'proposed');
check('round-trip flat placements', reparsed.placements.length === 1 && reparsed.placements[0].moment_id === 'lm-a');
const stEmpty = pls.serializeTemporal({ windows: [], placements: [] });
check('serialize empty lists', stEmpty.includes('windows: []') && stEmpty.includes('placements: []'));

// 9. validateTemporalInput
check('valid input passes', pls.validateTemporalInput({ windows: [{ id: 'tw-01', title: 'x', kind: 'lesson', duration_minutes: '45' }], placements: [] }).length === 0);
const bad = pls.validateTemporalInput({
  windows: [{ id: 'tw-01', title: 'x', kind: 'chaos', duration_minutes: 45 }],
  placements: [{ id: 'tp-1', moment_id: 'lm-a', window_id: 'tw-99', start_minute: -1, duration_minutes: 0, dramaturgical_role: 'nope', mode: 'nope' }],
});
check('invalid input flagged', bad.length >= 5);

// 10. setMomentMaterials
const withMaterials = pls.setMomentMaterials(sample, 'lm-impuls', ['materials/a.md', 'rendered/b.html']);
check('materials line set', withMaterials.ok && withMaterials.content.includes("- Materialien: ['materials/a.md', 'rendered/b.html']"));
const cleared = pls.setMomentMaterials(withMaterials.content, 'lm-impuls', []);
check('materials cleared', cleared.ok && cleared.content.includes('- Materialien: []'));
const missing = pls.setMomentMaterials(sample, 'lm-gibt-es-nicht', ['a']);
check('unknown moment rejected', missing.ok === false && missing.reason === 'unknown-moment-id');

// 11. setMomentEstimate + Zeitbedarf parsing
const estSet = pls.setMomentEstimate(sample, 'lm-impuls', 45);
check('estimate set', estSet.ok && estSet.content.includes('- Zeitbedarf: 45'));
const estParsed = pls.parseLandscape(estSet.content);
check('estimate parsed as number', estParsed.moments[0].time_estimate === 45);
const estReplace = pls.setMomentEstimate(estSet.content, 'lm-impuls', 60);
check('estimate replaced', estReplace.ok && estReplace.content.includes('- Zeitbedarf: 60'));
const estClear = pls.setMomentEstimate(estReplace.content, 'lm-impuls', null);
check('estimate cleared', estClear.ok && !estClear.content.includes('Zeitbedarf'));
const estMissing = pls.setMomentEstimate(sample, 'lm-weg', 45);
check('estimate unknown moment', estMissing.ok === false && estMissing.reason === 'unknown-moment-id');

// 12. parseTemporal returns a flat placements list (client dependency for
//     assignment status + full-timeline saves)
const tpFlat = pls.parseTemporal(`schema: ptspace.temporal-plan/v1
windows:
  - id: tw-01
    title: S1
    kind: lesson
    duration_minutes: 45
placements:
  - id: tp-01
    moment_id: lm-a
    window_id: tw-01
    start_minute: 0
    duration_minutes: 20
    dramaturgical_role: opening
    mode: common
  - id: tp-02
    moment_id: lm-b
    window_id: tw-01
    start_minute: 20
    duration_minutes: 25
    dramaturgical_role: deepening
    mode: group
`);
check('flat placements list', Array.isArray(tpFlat.placements) && tpFlat.placements.length === 2);
check('flat placement fields', tpFlat.placements[0].moment_id === 'lm-a' && tpFlat.placements[0].status === 'binding');
check('nested placements still grouped', tpFlat.windows[0].placements.length === 2);

// 13. parseLayout with group bands
const layoutWithGroups = pls.parseLayout('{"schema":"ptspace.learning-landscape.layout/v1","positions":{"lm-a":{"x":10,"y":20}},"groups":[{"id":"grp-1","title":"Erkundung","y":30,"height":130}]}');
check('layout groups parsed', layoutWithGroups.groups.length === 1 && layoutWithGroups.groups[0].title === 'Erkundung');
check('layout positions still parsed', layoutWithGroups.positions['lm-a'].x === 10);

// 14. addTransition / removeTransition
const noSection = '# Lernlandschaft\n\n## Lernmomente\n\n### lm-a\n\n- Titel: A\n- Status: draft\n';
const trAdd = pls.addTransition(noSection, { from: 'lm-a', to: 'lm-b', type: 'choice', rationale: 'Zwei Einstiege je Gruppe.' });
check('transition creates section', trAdd.ok && trAdd.content.includes('## Übergänge') && trAdd.content.includes('### tr-lm-a-lm-b'));
check('transition fields', trAdd.content.includes('- Von: lm-a') && trAdd.content.includes('- Zu: lm-b') && trAdd.content.includes('- Typ: choice'));
const parsedTr = pls.parseLandscape(trAdd.content);
check('transition parsed back', parsedTr.transitions.length === 1 && parsedTr.transitions[0].from === 'lm-a' && parsedTr.transitions[0].type === 'choice');

const withPlaceholder = '# Lernlandschaft\n\n## Lernmomente\n\n### lm-a\n\n- Titel: A\n- Status: draft\n\n## Übergänge\n\nKeine Übergänge festgelegt.\n';
const trAdd2 = pls.addTransition(withPlaceholder, { from: 'lm-a', to: 'lm-b', type: 'required' });
check('placeholder removed on first transition', trAdd2.ok && !trAdd2.content.includes('Keine Übergänge festgelegt.'));
const trAdd3 = pls.addTransition(trAdd2.content, { from: 'lm-b', to: 'lm-c', type: 'parallel' });
check('second transition appended', trAdd3.ok && trAdd3.content.includes('### tr-lm-b-lm-c'));
const trDup = pls.addTransition(trAdd3.content, { from: 'lm-a', to: 'lm-b', type: 'choice' });
check('duplicate from-to gets unique id', trDup.ok && trDup.content.includes('### tr-lm-a-lm-b-2'));
check('self transition rejected', pls.addTransition(noSection, { from: 'lm-a', to: 'lm-a' }).ok === false);
check('bad type rejected', pls.addTransition(noSection, { from: 'lm-a', to: 'lm-b', type: 'chaos' }).ok === false);
const trRem = pls.removeTransition(trDup.content, 'tr-lm-b-lm-c');
check('transition removed', trRem.ok && !trRem.content.includes('### tr-lm-b-lm-c') && trRem.content.includes('### tr-lm-a-lm-b'));
check('remove unknown id', pls.removeTransition(noSection, 'tr-xyz').ok === false);

// 15. updateMoment (structured single-moment edit, preserves other fields)
const upd = pls.updateMoment(sample, 'lm-impuls', { title: 'KI begegnet Menschenbildern (neu)', type: 'positioning', function: 'Neue Funktion', learning_activity: 'Neu', expected_experience: 'Neu', material_needs: ['A', 'B'], open_questions: ['Q1'] });
check('updateMoment ok', upd.ok);
const um = pls.parseLandscape(upd.content).moments[0];
check('updateMoment fields', um.title === 'KI begegnet Menschenbildern (neu)' && um.type === 'positioning' && um.material_needs.join(',') === 'A,B' && um.open_questions[0] === 'Q1');
check('updateMoment preserves materials', um.materials.join(',') === 'mat-a,mat-b');
const updPartial = pls.updateMoment(upd.content, 'lm-impuls', { title: 'Nur der Titel' });
const up2 = pls.parseLandscape(updPartial.content).moments[0];
check('updateMoment partial keeps others', up2.title === 'Nur der Titel' && up2.type === 'positioning');
check('updateMoment unknown moment', pls.updateMoment(sample, 'lm-nix', { title: 'x' }).ok === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
