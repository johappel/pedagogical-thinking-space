import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMomentImpact } from '../dsh-presets/pts-companion/moment-impact.mjs';

const moment = {
  id: 'lm-faktencheck',
  title: 'Faktencheck',
  function: 'Erkunden',
  learning_activity: 'Aussagen prüfen',
  expected_experience: 'Lernende unterscheiden Behauptung und Beleg',
  open_questions: ['Welche Quellen?'],
};

test('moment impact lists dependent lesson phases before a change is saved', () => {
  const impact = buildMomentImpact({
    moment,
    fields: { learning_activity: 'Aussagen und Quellen prüfen' },
    product: { series: { lessons: [{ id: 'lesson-1', title: 'Nachrichten', phases: [{ id: 'phase-2', title: 'Faktencheck', momentIds: ['lm-faktencheck'] }] }] } },
  });
  assert.equal(impact.requiresReview, true);
  assert.deepEqual(impact.changedFields.map((field) => field.label), ['Lernaktivität']);
  assert.deepEqual(impact.usages.map((use) => `${use.lessonTitle} -> ${use.phaseTitle}`), ['Nachrichten -> Faktencheck']);
  assert.equal(impact.redThreadCheck, true);
});

test('moment impact does not block an unused moment', () => {
  const impact = buildMomentImpact({ moment, fields: { type: 'reflection' }, product: { series: { lessons: [] } } });
  assert.equal(impact.requiresReview, false);
  assert.equal(impact.usages.length, 0);
  assert.equal(impact.changedFields[0].label, 'Typ');
});

