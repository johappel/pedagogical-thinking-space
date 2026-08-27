import test from 'node:test';
import assert from 'node:assert/strict';

import {
	findForbiddenApprovalPhrases,
	isCompliantVisibleResponse,
} from './support/companion-response-guard.mjs';

// The exact real case: the teacher order is already an authorization.
const ORDER = 'Kannst du die Quellen verifizieren und im Knowledge speichern?';

// A compliant first response: confirms the background start, names the
// provisional storage target, no second approval, no blocking denomination
// question, no premature file-saved claim, no internal process dump.
const COMPLIANT_RESPONSE = [
	'Ja. Ich lasse die offiziellen NRW-Lehrplanquellen jetzt im Hintergrund prüfen.',
	'Da die Konfession noch offen ist, werden evangelische und katholische',
	'Religionslehre berücksichtigt. Das Ergebnis lege ich zunächst als überprüfbares',
	'Knowledge Proposal im Denkraum ab. Nach Abschluss bringe ich den',
	'quellenbasierten Befund zurück; erst danach geht es um die Übernahme ins',
	'kuratierte Knowledge.',
].join(' ');

// The observed wrong behavior from the bug report.
const NON_COMPLIANT_RESPONSE = [
	'Hier ist eine Kurzfassung des geplanten Ablaufs: ...',
	'Möchte ich jetzt die Recherche starten?',
	'Und soll ich evangelisch oder katholisch prüfen? Wenn ja, dann ...',
].join(' ');

test('order is treated as context, not re-asked', () => {
	// The order text itself is a question; the guard only judges the RESPONSE.
	assert.equal(typeof ORDER, 'string');
});

test('compliant visible response passes the guard', () => {
	assert.deepEqual(findForbiddenApprovalPhrases(COMPLIANT_RESPONSE), []);
	assert.equal(isCompliantVisibleResponse(COMPLIANT_RESPONSE), true);
});

test('a second-approval or blocking response fails the guard', () => {
	const hits = findForbiddenApprovalPhrases(NON_COMPLIANT_RESPONSE);
	assert.ok(hits.length > 0, 'expected the guard to flag forbidden phrasings');
	assert.equal(isCompliantVisibleResponse(NON_COMPLIANT_RESPONSE), false);
});

test('each forbidden phrasing is detected individually', () => {
	assert.ok(findForbiddenApprovalPhrases('Soll ich recherchieren?').length > 0);
	assert.ok(findForbiddenApprovalPhrases('Möchte ich jetzt die Recherche starten?').length > 0);
	assert.ok(findForbiddenApprovalPhrases('Wenn ja, starte ich den Lauf.').length > 0);
	assert.ok(findForbiddenApprovalPhrases('Soll ich evangelisch oder katholisch prüfen?').length > 0);
});

test('line-wrapped forbidden phrasing is still detected', () => {
	const wrapped = 'Möchte ich jetzt die\nRecherche starten?';
	assert.ok(findForbiddenApprovalPhrases(wrapped).length > 0);
});
