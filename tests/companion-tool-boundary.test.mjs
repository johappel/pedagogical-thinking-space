import assert from 'node:assert/strict';
import test from 'node:test';

import {
	FORBIDDEN_DIRECT_EXECUTION,
	HIDDEN_FROM_COMPANION,
	apply,
} from '../dsh-presets/pts-companion/companion-tool-boundary.mjs';

function fakeAgent(origin) {
	const calls = { restrictions: [], guards: [] };
	const agent = {
		session: { header: { origin } },
		ctx: {
			tools: {
				restrict(filter) {
					calls.restrictions.push(filter);
					return () => { calls.restrictions.push('lifted'); };
				},
				guard(guard) {
					calls.guards.push(guard);
					return () => { calls.guards.push('lifted'); };
				},
			},
		},
	};
	return { agent, calls };
}

test('root Companion hides direct research/production and rejects bypass tools', () => {
	const { agent, calls } = fakeAgent(undefined);
	const dispose = apply({ agent });
	assert.deepEqual(calls.restrictions, [{ deny: HIDDEN_FROM_COMPANION }]);
	assert.equal(calls.guards.length, 1);
	for (const name of FORBIDDEN_DIRECT_EXECUTION) {
		assert.match(calls.guards[0]({ name }), /may not execute/);
	}
	assert.equal(calls.guards[0]({ name: 'pts_research' }), undefined);
	dispose();
	assert.equal(calls.restrictions.at(-1), 'lifted');
	assert.equal(calls.guards.at(-1), 'lifted');
});

test('delegated child keeps its role-specific toolFilter', () => {
	const { agent, calls } = fakeAgent('subagent');
	assert.equal(apply({ agent }), undefined);
	assert.deepEqual(calls.restrictions, []);
	assert.deepEqual(calls.guards, []);
});
