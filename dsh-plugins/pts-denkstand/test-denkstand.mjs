// Logic smoke test for pts-denkstand (vm-based, no browser).
// Verifies the host half loads and the YAML parser/board grouping works
// against the real workspace files and a synthetic schema sample.
import { promises as fs } from 'node:fs';
import * as denk from 'file:///F:/code/pedagogical-thinking-space/dsh-plugins/pts-denkstand/lib/index.js';

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log('  ok  ' + name); }
  else { fail += 1; console.log('  FAIL ' + name); }
}

// 1. Host module shape
check('host inject has webServer', Array.isArray(denk.inject) && denk.inject.includes('webServer'));
check('host apply is function', typeof denk.apply === 'function');

// 2. Board parser against the real planning-board.yml
const raw = await fs.readFile('F:/code/pedagogical-thinking-space/workspace/hoffnung/planning-board.yml', 'utf8');
const b = denk._parseBoard(raw);
const clarify = b.columns['clarify'] || [];
check('board has clarify column', clarify.length >= 1);
check('clarify items carry title', clarify.length >= 1 && typeof clarify[0].title === 'string' && clarify[0].title.length > 0);
check('clarify items carry kind label', clarify.every((x) => x.kind_label === 'Klärung'));
// Offene Klärungen sind "Vorschlag", beantwortete sind "Beantwortet"
// (settle-board-item des Stewards); nie ein roher unbekannter Status.
check('clarify items carry status', clarify.every((x) => x.status_label === 'Vorschlag' || x.status_label === 'Beantwortet'));
check('clarify resolved items labeled not raw', clarify.every((x) => !/resolved/i.test(x.status_label)));

// 3. Temporal plan parser (backfilled timeline from the workspace)
const traw = await fs.readFile('F:/code/pedagogical-thinking-space/workspace/hoffnung/temporal-plan.yml', 'utf8');
const t = denk._parseTemporal(traw);
check('temporal parses backfilled timeline', t.empty === false && t.windows.length >= 1);

// 4. Synthetic temporal sample with a window + placement
const sampleTp = `schema: ptspace.temporal-plan/v1
title: Standardplanung
landscape: learning-landscape.md
windows:
  - id: tw-01
    title: Stunde 1
    kind: lesson
    duration_minutes: 60
placements:
  - id: tp-01
    moment_id: lm-impuls
    window_id: tw-01
    start_minute: 0
    duration_minutes: 8
    dramaturgical_role: opening
    mode: common
`;
const t2 = denk._parseTemporal(sampleTp);
check('synthetic temporal parses windows', t2.windows.length === 1);
check('window title', t2.windows[0].title === 'Stunde 1');
check('window has placement', t2.windows[0].placements.length === 1);
check('placement role label', t2.windows[0].placements[0].role_label === 'Einstieg');

// 5. Synthetic board with mixed columns
const sampleBd = `schema: ptspace.planning-board/v1
items:
  - id: pb-1
    title: Dramaturgie entwickeln
    kind: design
    column: prepare
    status: proposed
    requires_teacher_approval: true
  - id: pb-2
    title: Quelle prüfen
    kind: research
    column: review
    status: review
`;
const b2 = denk._parseBoard(sampleBd);
check('synthetic board columns', Object.keys(b2.columns).sort().join(',') === 'prepare,review');
check('synthetic prepare item', b2.columns['prepare'][0].title === 'Dramaturgie entwickeln');
check('synthetic approval flag', b2.columns['prepare'][0].requires_teacher_approval === true);
check('raw payload attached', b2.columns['prepare'][0].raw && b2.columns['prepare'][0].raw.kind === 'design');
check('raw payload keeps fields', b2.columns['prepare'][0].raw.status === 'proposed');

// 5b. description passthrough on the real file (enriched items)
const clarifyItems = b.columns['clarify'] || [];
check('real clarify item carries description', clarifyItems.length > 0 && typeof clarifyItems[0].description === 'string' && clarifyItems[0].description.length > 0);
const arrItem = clarifyItems.find((x) => String(x.title).indexOf('Arrangementstiefe') >= 0);
check('arrangement item description mentions Reihe', arrItem !== undefined && typeof arrItem.description === 'string' && arrItem.description.indexOf('Reihe') >= 0);

// 6. decisions parser
const sampleDec = `decisions:
  - id: d-1
    title: Einzelstunde gewählt
`;
const d2 = denk._parseDecisions(sampleDec);
check('synthetic decision parsed', d2.decisions.length === 1 && d2.decisions[0].title === 'Einzelstunde gewählt');

// 6b. Real decisions.yml uses folded scalars (`>-`); they must parse as clean
// entries (not the fragmented phantom rows the old parser produced).
const dReal = await fs.readFile('F:/code/pedagogical-thinking-space/workspace/hoffnung/decisions.yml', 'utf8');
const dr = denk._parseDecisions(dReal);
check('real decisions preserved as entries', dr.decisions.length >= 4);
check('no auto-recorded E00N questions remain', !dr.decisions.some((x) => /^E\d+$/.test(x.id)));
const kd = dr.decisions.find((x) => x.id === 'dec-ki-konstruktions-approach');
check('real decision text folded correctly', kd !== undefined && kd.detail.length > 20 && kd.detail.indexOf('>-') < 0);
check('real decision rationale parsed', kd !== undefined && kd.rationale.length > 20);
check('real decision references parsed', kd !== undefined && kd.references.length >= 2);

// 7. Decision → Leitidee upsert (Educational Intention accents)
const mdReal = await fs.readFile('F:/code/pedagogical-thinking-space/workspace/hoffnung/learning-design.md', 'utf8');
const a1 = denk._upsertAccent(mdReal, 'Test-Leitidee', 'Testtext der Leitidee.');
check('accent added to design section', a1.added === true);
check('accent placeholder replaced', a1.content.indexOf('Noch nicht entschieden') < 0 || mdReal.indexOf('Noch nicht entschieden') < 0);
const a2 = denk._upsertAccent(a1.content, 'Test-Leitidee', 'anderer Text');
check('accent duplicate blocked', a2.added === false && a2.reason === 'bereits Leitidee');
const a3 = denk._upsertAccent(a1.content, 'Zweite Leitidee', 'weiterer Text');
check('accent numbering continues', /\d+\. \*\*Zweite Leitidee\*\*/.test(a3.content));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
