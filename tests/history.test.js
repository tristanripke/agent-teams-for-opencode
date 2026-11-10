import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERAL, HISTORY_BYTES, INDEX_KEY, NO_TEAM, RETRY_WINDOW, expireRetries, historyCounts, historyKey, openHistory, scopeForMessage, scopesForAudit } from '../src/history.js';

const message = (id, scope = 'team_a', at = 1, extra = {}) => ({ id, scope, at, from: 'ses_a', to: 'ses_b',
  conversationID: 'conversation_test', hops: 0, delivery: 'steer', text: 'Body', status: 'accepted', ...extra });
const core = () => ({ teams: { team_a: { id: 'team_a', name: 'A', members: ['ses_a', 'ses_b'] },
  team_b: { id: 'team_b', name: 'B', members: ['ses_b', 'ses_c'] } }, receipts: {}, operations: {}, counts: {} });
function fixture(records = 10, time = 100) {
  const data = new Map(), writes = [], state = core();
  const storage = {
    get: async key => structuredClone(data.get(key)),
    set: async (key, value) => { writes.push(key); data.set(key, structuredClone(value)); },
    remove: async key => { writes.push(`remove ${key}`); data.delete(key); },
  };
  const open = () => openHistory(storage, state, JSON.stringify(state), { records, now: () => time, invalid: () => { throw new Error('invalid_stored_state'); } });
  return { data, writes, state, open, history: scope => data.get(historyKey(scope)) };
}
async function add(f, ...records) {
  const history = f.open();
  for (const record of records) await history.add(record);
  await history.commit();
}

test('message attribution is deterministic across team order and follows a shared parent team', () => {
  const saved = core(); saved.teams.team_z = { id: 'team_z', members: ['ses_a', 'ses_b'] };
  assert.equal(scopeForMessage(saved, 'ses_a', 'ses_b'), 'team_a');
  assert.equal(scopeForMessage(saved, 'ses_a', 'ses_b', { scope: 'team_z' }), 'team_z');
  assert.equal(scopeForMessage(saved, 'ses_a', 'ses_c'), NO_TEAM);
  assert.equal(scopeForMessage(saved, 'ses_a', 'ses_b', { scope: 'deleted' }), 'team_a');
});
test('a message writes only its own scope, and the core record stays free of history', async () => {
  const f = fixture();
  await add(f, message('quiet', 'team_b'));
  f.writes.length = 0;
  await add(f, message('busy', 'team_a'));
  // The first write marks team_a's summary unknown, because a message is now waiting there.
  assert.deepEqual(f.writes, ['collaboration.v1', historyKey('team_a'), INDEX_KEY, 'collaboration.v1']);
  const saved = f.data.get('collaboration.v1');
  assert.equal(saved.messages, undefined); assert.equal(saved.audit, undefined);
  assert.deepEqual(saved.counts.team_a, { messages: 1, activity: 0 });
});
test('the summary is marked unknown in the previously saved record before its history is written', async () => {
  const f = fixture();
  await add(f, message('first', 'team_a'));
  const previous = structuredClone(f.data.get('collaboration.v1'));
  const marks = [];
  const history = f.open();
  f.state.operations['ses_a/new'] = { id: 'second', at: 1, scope: 'team_a' };
  await history.add(message('second', 'team_a'));
  const set = f.data.set.bind(f.data);
  f.data.set = (key, value) => { if (key === 'collaboration.v1') marks.push(structuredClone(value)); return set(key, value); };
  await history.commit();
  // The mark is the old record with only the summary changed, so no retry key is saved before its message.
  assert.deepEqual(marks[0], { ...previous, unacknowledged: { ...previous.unacknowledged, team_a: null } });
  assert.deepEqual(marks.at(-1).unacknowledged.team_a, { ses_b: ['first', 'second'] });
});
test('a commit that leaves every summary unchanged writes no mark', async () => {
  const f = fixture();
  await add(f, message('first', 'team_a', 1, { status: 'processed' }));
  f.writes.length = 0;
  await add(f, message('second', 'team_a', 2, { status: 'processed' }));
  assert.deepEqual(f.writes, [historyKey('team_a'), INDEX_KEY, 'collaboration.v1']);
});
test('an update to one message does not rewrite other scopes, the index or an unchanged core record', async () => {
  const f = fixture();
  await add(f, message('one', 'team_a'), message('two', 'team_b'));
  f.writes.length = 0;
  const history = f.open(), record = await history.find('one');
  record.status = 'delivered'; history.touched(record);
  await history.commit();
  assert.deepEqual(f.writes, [historyKey('team_a')]);
});
test('a commit with nothing changed writes nothing', async () => {
  const f = fixture();
  await add(f, message('one'));
  f.writes.length = 0;
  const history = f.open();
  await history.scope('team_a'); await history.find('one'); await history.commit();
  assert.deepEqual(f.writes, []);
});
test('a busy team trims its own oldest history, never a quiet team or the connections', async () => {
  const f = fixture(2);
  await add(f, message('quiet', 'team_b'), message('none', NO_TEAM), ...Array.from({ length: 8 }, (_, i) => message(`busy_${i}`, 'team_a', i)));
  assert.deepEqual(Object.keys(f.history('team_a').messages), ['busy_6', 'busy_7']);
  assert.deepEqual(Object.keys(f.history('team_b').messages), ['quiet']);
  assert.deepEqual(Object.keys(f.history(NO_TEAM).messages), ['none']);
  assert.deepEqual(Object.keys(f.data.get(INDEX_KEY)).sort(), ['busy_6', 'busy_7', 'none', 'quiet']);
});
test('trimmed bodies leave a receipt without text only within the retry window', async () => {
  const f = fixture(1, RETRY_WINDOW + 50);
  await add(f, message('old', 'team_a', 10), message('recent', 'team_a', RETRY_WINDOW + 40), message('newest', 'team_a', RETRY_WINDOW + 50));
  assert.deepEqual(Object.keys(f.state.receipts), ['recent']);
  assert.equal(f.state.receipts.recent.historyPruned, true);
  assert.equal(Object.hasOwn(f.state.receipts.recent, 'text'), false);
});
test('insertion order decides what is newest, so timestamps and IDs cannot trim the latest message', async () => {
  const f = fixture(1);
  await add(f, message('msg_z', 'team_a', 50), message('msg_a', 'team_a', 5));
  assert.deepEqual(Object.keys(f.history('team_a').messages), ['msg_a']);
});
test('once a scope is full everything older goes, with no small messages left behind a large one', async () => {
  const f = fixture(2000);
  const big = { text: 'x'.repeat(HISTORY_BYTES - 1024) };
  await add(f, message('small_old', 'team_a', 1), message('big', 'team_a', 2, big), message('new', 'team_a', 3, { text: 'y'.repeat(2048) }));
  assert.deepEqual(Object.keys(f.history('team_a').messages), ['new']);
});
test('full history has a per-scope byte budget even with maximum-sized bodies', async () => {
  const f = fixture(2000);
  await add(f, ...Array.from({ length: 270 }, (_, i) => message(`msg_${i}`, 'team_a', i, { text: '가'.repeat(10922) })));
  const kept = f.history('team_a').messages;
  assert.ok(Buffer.byteLength(JSON.stringify(Object.values(kept))) <= HISTORY_BYTES + 1024);
  assert.ok(kept.msg_269); assert.ok(Object.keys(kept).length < 270);
});
test('an in-flight intent keeps its body until the native result is known', async () => {
  const f = fixture(1);
  await add(f, message('sending', 'team_a', 1, { status: 'sending' }), message('newer', 'team_a', 2));
  assert.ok(f.history('team_a').messages.sending); assert.ok(f.history('team_a').messages.newer);
});
test('a stored intent found on a later read is reported as uncertain, and that is saved', async () => {
  const f = fixture();
  await add(f, message('sending', 'team_a', 1, { status: 'sending' }));
  f.state.operations['ses_a/key'] = { id: 'sending', at: 1, scope: 'team_a' };
  const history = f.open();
  assert.equal((await history.find('sending')).status, 'uncertain');
  await history.commit();
  assert.equal(f.history('team_a').messages.sending.error, 'recovered_admission_unconfirmed');
});
test('a stored intent with no retry key was never sent, so it is dropped with its count', async () => {
  const f = fixture();
  await add(f, message('sending', 'team_a', 1, { status: 'sending' }));
  const history = f.open();
  assert.equal((await history.find('sending')), undefined);
  await history.commit();
  assert.deepEqual(f.history('team_a').messages, {}); assert.deepEqual(f.history('team_a').conversations, {});
  assert.equal(f.state.counts.team_a.messages, 0);
});
test('a stored intent whose retry key could have expired may have been sent, so it is kept as uncertain', async () => {
  const f = fixture(10, 1 + RETRY_WINDOW);
  await add(f, message('sending', 'team_a', 1, { status: 'sending' }));
  const history = f.open();
  assert.equal((await history.find('sending')).status, 'uncertain');
  await history.commit();
  assert.equal(f.history('team_a').messages.sending.error, 'recovered_admission_unconfirmed');
  assert.equal(f.state.counts.team_a.messages, 1);
});
test('removing a team writes the core record first, so a failure cannot destroy a surviving team', async () => {
  const f = fixture();
  await add(f, message('one', 'team_a'));
  f.writes.length = 0;
  const history = f.open();
  history.forget('team_a');
  await history.commit();
  assert.deepEqual(f.writes, ['collaboration.v1', INDEX_KEY, `remove ${historyKey('team_a')}`]);
});
test('Activity is kept per scope, and an entry about two teams survives in each', async () => {
  const f = fixture(2), history = f.open();
  history.audit({ at: 0, action: 'profile.update' }, ['team_a', 'team_b']);
  for (let at = 1; at <= 5; at++) history.audit({ at, action: 'noise' }, ['team_a']);
  await history.commit();
  assert.deepEqual(f.history('team_a').audit.map(item => item.at), [4, 5]);
  assert.deepEqual(f.history('team_b').audit.map(item => item.at), [0]);
});
test('forgetting a team removes its key, index entries, receipts, retry keys and counts, and no other team', async () => {
  const f = fixture(1);
  await add(f, message('one', 'team_a', 100), message('two', 'team_a', 100), message('other', 'team_b', 100));
  f.state.operations = { 'ses_a/one': { id: 'one', at: 100, scope: 'team_a' }, 'ses_b/other': { id: 'other', at: 100, scope: 'team_b' } };
  const history = f.open();
  history.audit({ at: 1, action: 'team.member.removed' }, ['team_a']);
  history.forget('team_a');
  await history.commit();
  assert.equal(f.data.has(historyKey('team_a')), false);
  assert.deepEqual(f.data.get(INDEX_KEY), { other: 'team_b' });
  assert.deepEqual(f.state.receipts, {}); assert.deepEqual(Object.keys(f.state.operations), ['ses_b/other']);
  assert.equal(f.state.counts.team_a, undefined); assert.ok(f.history('team_b').messages.other);
});
test('conversation counts outlive trimmed bodies only while something still references them', async () => {
  const f = fixture(1);
  await add(f, message('one', 'team_a', 100, { conversationID: 'kept' }), message('two', 'team_a', 100, { conversationID: 'kept' }));
  assert.equal(f.history('team_a').conversations.kept, 2);
  await add(f, message('three', 'team_a', 100, { conversationID: 'other' }));
  f.state.receipts = {};
  await add(f, message('four', 'team_a', 100, { conversationID: 'other' }));
  assert.deepEqual(f.history('team_a').conversations, { other: 2 });
});
test('retry evidence expires at exactly fifteen minutes, even for uncertain admissions', () => {
  const saved = core();
  saved.receipts.pending = message('pending', 'team_a', 100, { status: 'uncertain' });
  saved.operations['ses_a/key'] = { id: 'pending', at: 100, digest: 'hash' };
  expireRetries(saved, 100 + RETRY_WINDOW - 1);
  assert.ok(saved.receipts.pending); assert.ok(saved.operations['ses_a/key']);
  expireRetries(saved, 100 + RETRY_WINDOW);
  assert.deepEqual(saved.receipts, {}); assert.deepEqual(saved.operations, {});
});
test('connection activity and general settings activity are not mixed', () => {
  const saved = core();
  assert.deepEqual(scopesForAudit(saved, 'ses_a', 'connection.create', { proposal: {} }), [NO_TEAM]);
  assert.deepEqual(scopesForAudit(saved, 'user', 'settings.update', { proposal: {} }), [GENERAL]);
  assert.deepEqual(scopesForAudit(saved, 'ses_c', 'profile.update', { proposal: {} }), ['team_b']);
  assert.deepEqual(scopesForAudit(saved, 'ses_new', 'profile.update', { proposal: {} }), [GENERAL]);
});
test('history counts come from the core record, for current teams only', () => {
  const saved = core();
  saved.counts = { team_a: { messages: 2, activity: 1 }, none: { messages: 1, activity: 0 }, team_gone: { messages: 9, activity: 9 } };
  assert.deepEqual(historyCounts(saved), { teams: { team_a: { messages: 2, activity: 1 }, team_b: { messages: 0, activity: 0 } },
    none: { messages: 1, activity: 0 }, general: { messages: 0, activity: 0 } });
});
test('a saved history that is not in the expected shape is refused', async () => {
  const f = fixture();
  f.data.set(historyKey('team_a'), { messages: [] , audit: 'wrong' });
  await assert.rejects(f.open().scope('team_a'), /invalid_stored_state/);
});
