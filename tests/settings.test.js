import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettings } from '../src/settings.js';
import { serialQueue } from '../src/core.js';

function fixture() {
  const data = new Map();
  const storage = { get: async key => structuredClone(data.get(key)),
    set: async (key, value) => { data.set(key, structuredClone(value)); } };
  const queue = serialQueue();
  return { data, storage, queue, settings: createSettings(storage, queue) };
}

test('missing command setting defaults to team without rewriting storage', async () => {
  const f = fixture();
  assert.deepEqual(await f.settings.get(), { command: 'team' });
  assert.equal(f.data.size, 0);
});
test('command setting normalizes input and survives a new settings instance', async () => {
  const f = fixture();
  assert.deepEqual(await f.settings.set({ command: ' /Squad-2 ' }), { command: 'squad-2' });
  assert.deepEqual(await createSettings(f.storage, f.queue).get(), { command: 'squad-2' });
});
test('invalid command settings preserve the saved command', async () => {
  const f = fixture(); await f.settings.set({ command: 'squad' });
  for (const command of ['', 'two words', '//team', '1team', 'peers', 'x'.repeat(33), '../team', null]) {
    await assert.rejects(f.settings.set({ command }), /Use 1-32/);
  }
  await assert.rejects(f.settings.set({ command: 'team', other: true }), /Use 1-32/);
  assert.deepEqual(await f.settings.get(), { command: 'squad' });
});
test('corrupt saved command fails without overwriting the stored value', async () => {
  const f = fixture(); f.data.set('collaboration.ui.v1', { command: 'bad command' });
  await assert.rejects(f.settings.get(), /Invalid stored/);
  assert.deepEqual(f.data.get('collaboration.ui.v1'), { command: 'bad command' });
});
test('failed command storage write is reported', async () => {
  const f = fixture(); f.storage.set = async () => { throw new Error('disk unavailable'); };
  await assert.rejects(f.settings.set({ command: 'squad' }), /disk unavailable/);
});
test('command changes share the backend queue and preserve collaboration state', async () => {
  const f = fixture(); f.data.set('collaboration.v1', { revision: 42 });
  const second = createSettings(f.storage, f.queue);
  await Promise.all([f.settings.set({ command: 'squad' }), second.set({ command: 'review-team' })]);
  assert.deepEqual(await f.settings.get(), { command: 'review-team' });
  assert.deepEqual(f.data.get('collaboration.v1'), { revision: 42 });
});
