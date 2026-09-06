import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
test('profile installer covers both new DSH-native plugins idempotently', async () => {
  const script = await readFile(path.join(root, 'scripts/install-pts-web-plugins.ps1'), 'utf8');
  for (const name of ['pts-conversation-binding', 'pts-moment-workshop']) {
    assert.match(script, new RegExp(name));
    assert.match(script, new RegExp(`Name = '${name}'`));
  }
  assert.match(script, /LinkType -ne 'Junction'/);
  assert.match(script, /points elsewhere/);
  assert.match(script, /patch\.yml/);
});
