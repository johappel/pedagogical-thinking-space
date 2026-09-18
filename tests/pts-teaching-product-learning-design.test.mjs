// Named-moment extraction from a free-form learning-design.md (Denkstand prose).
// Locks in: ordinal headings, Einstieg→1, material/mapping-heading exclusion,
// and gap-filling of referenced-but-unsectioned moments.
//
// Run: node --test tests/pts-teaching-product-learning-design.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import { extractNamedMoments } from '../dsh-plugins/pts-teaching-product-editor/lib/learning-design-moments.mjs';

test('extracts named moment sections, Einstieg as 1, excludes material headings', () => {
	const raw = [
		'# Denkstand',
		'## Vorgeschlagener Lernmoment (Einstieg)',
		'text',
		'## Vorgeschlagener Lernmoment 2 (noch nicht ausgearbeitet)',
		'## Lernmoment 3 – ausgearbeitete Methode',
		'## Neuer Materialentwurf für Lernmoment 1',
		'### 3. Zuordnung der vier Lernmomente',
		'## Lernmoment 5 – Tausch gegen Gabe',
	].join('\n');

	const moments = extractNamedMoments(raw);
	assert.deepEqual(moments.map((m) => m.domainId), ['lm-1', 'lm-2', 'lm-3', 'lm-4', 'lm-5']);
	assert.equal(moments[0].title, 'Lernmoment (Einstieg)'); // "Vorgeschlagener " stripped
	assert.match(moments[3].title, /nur erwähnt/); // lm-4 has no own section but is referenced
	assert.equal(moments.every((m) => m.version === 1), true);
});

test('no learning moments → empty list', () => {
	assert.deepEqual(extractNamedMoments('# Nur Prosa\n## Offene Punkte\n- nichts'), []);
	assert.deepEqual(extractNamedMoments(''), []);
});

test('duplicate ordinal headings are collapsed to one moment', () => {
	const raw = '## Lernmoment 1 – A\n## Lernmoment 1 – B (Neufassung)';
	const moments = extractNamedMoments(raw);
	assert.deepEqual(moments.map((m) => m.domainId), ['lm-1']);
	assert.equal(moments[0].title, 'Lernmoment 1 – A'); // first heading wins
});
