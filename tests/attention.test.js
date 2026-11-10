import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttention } from '../src/attention.js';

// A tracker with one instance following events, as a loaded plugin has.
const listening = () => { const a = createAttention(); a.listen(); return a; };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('approvals and questions are followed through native events', () => {
  const a = listening();
  a.event({ type: 'permission.asked', data: { id: 'per_1', sessionID: 'ses_a', action: 'bash', resources: [] } });
  a.event({ type: 'form.created', data: { form: { id: 'frm_1', sessionID: 'ses_b' } } });
  assert.equal(a.of('ses_a'), 'approval'); assert.equal(a.of('ses_b'), 'input'); assert.equal(a.of('ses_c'), undefined);
  a.event({ type: 'permission.replied', data: { sessionID: 'ses_a', requestID: 'per_1', reply: 'once' } });
  a.event({ type: 'form.replied', data: { id: 'frm_1', sessionID: 'ses_b' } });
  assert.equal(a.of('ses_a'), undefined); assert.equal(a.of('ses_b'), undefined);
  a.event({ type: 'form.created', data: { form: { id: 'frm_2', sessionID: 'ses_b' } } });
  a.event({ type: 'form.cancelled', data: { id: 'frm_2', sessionID: 'ses_b' } });
  assert.equal(a.of('ses_b'), undefined);
});
test('a session waits until its last request is answered, and an approval outranks a question', () => {
  const a = listening();
  a.event({ type: 'permission.asked', data: { id: 'per_1', sessionID: 'ses_a' } });
  a.event({ type: 'permission.asked', data: { id: 'per_2', sessionID: 'ses_a' } });
  a.event({ type: 'form.created', data: { form: { id: 'frm_1', sessionID: 'ses_a' } } });
  a.event({ type: 'permission.replied', data: { sessionID: 'ses_a', requestID: 'per_1' } });
  assert.equal(a.of('ses_a'), 'approval');
  a.event({ type: 'permission.replied', data: { sessionID: 'ses_a', requestID: 'per_2' } });
  assert.equal(a.of('ses_a'), 'input');
});
test('an idle or deleted session waits for nobody, even after a missed event', () => {
  const a = listening();
  a.event({ type: 'permission.asked', data: { id: 'per_1', sessionID: 'ses_a' } });
  a.event({ type: 'form.created', data: { form: { id: 'frm_1', sessionID: 'ses_b' } } });
  a.event({ type: 'session.idle', data: { sessionID: 'ses_a' } });
  a.event({ type: 'session.deleted', data: { sessionID: 'ses_b' } });
  assert.equal(a.of('ses_a'), undefined); assert.equal(a.of('ses_b'), undefined);
});
test('pending approvals are looked up once per session, and a failed lookup is tried again', async () => {
  const a = listening(), looked = [];
  let fail = true;
  const list = async id => {
    looked.push(id);
    if (id === 'ses_c' && fail) throw new Error('unavailable');
    return id === 'ses_a' ? [{ id: 'per_old' }] : [];
  };
  await a.refresh(['ses_a', 'ses_b', 'ses_c'], list);
  assert.equal(a.of('ses_a'), 'approval'); assert.equal(a.of('ses_c'), undefined);
  fail = false;
  await a.refresh(['ses_a', 'ses_b', 'ses_c'], list);
  assert.deepEqual(looked.sort(), ['ses_a', 'ses_b', 'ses_c', 'ses_c']);
  a.event({ type: 'permission.replied', data: { sessionID: 'ses_a', requestID: 'per_old' } });
  await a.refresh(['ses_a'], list);
  assert.equal(a.of('ses_a'), undefined);
  a.event({ type: 'session.deleted', data: { sessionID: 'ses_a' } });
  await a.refresh(['ses_a'], list);
  assert.equal(looked.filter(id => id === 'ses_a').length, 2);
});
for (const [name, during] of [
  ['an answer', { type: 'permission.replied', data: { sessionID: 'ses_a', requestID: 'per_1' } }],
  ['the session going idle', { type: 'session.idle', data: { sessionID: 'ses_a' } }],
  ['the session being deleted', { type: 'session.deleted', data: { sessionID: 'ses_a' } }],
]) {
  test(`a lookup that overlaps ${name} is dropped, and the session is looked up again`, async () => {
    const a = listening(), slow = deferred(), calls = [];
    const list = id => { calls.push(id); return calls.length === 1 ? slow.promise : Promise.resolve([]); };
    const pending = a.refresh(['ses_a'], list);
    a.event(during);
    slow.resolve([{ id: 'per_1' }]);
    await pending;
    assert.equal(a.of('ses_a'), undefined);
    await a.refresh(['ses_a'], list);
    assert.equal(calls.length, 2); assert.equal(a.of('ses_a'), undefined);
  });
}
test('an approval asked while a lookup runs is kept, and the lookup is repeated', async () => {
  const a = listening(), slow = deferred();
  const pending = a.refresh(['ses_a'], () => slow.promise);
  a.event({ type: 'permission.asked', data: { id: 'per_new', sessionID: 'ses_a' } });
  slow.resolve([]);
  await pending;
  assert.equal(a.of('ses_a'), 'approval');
});
test('when the last instance stops following events, the tracker starts again and looks approvals up afresh', async () => {
  const a = createAttention(), first = a.listen(), second = a.listen(), calls = [];
  let pendingNow = [{ id: 'per_1' }];
  const list = async id => { calls.push(id); return pendingNow; };
  await a.refresh(['ses_a'], list);
  a.event({ type: 'form.created', data: { form: { id: 'frm_1', sessionID: 'ses_b' } } });
  first();
  first();
  assert.equal(a.of('ses_a'), 'approval', 'another instance still follows events');
  second();
  assert.equal(a.of('ses_a'), undefined); assert.equal(a.of('ses_b'), undefined);
  // Answered while nothing was listening.
  pendingNow = [];
  a.listen();
  await a.refresh(['ses_a'], list);
  assert.equal(calls.length, 2); assert.equal(a.of('ses_a'), undefined);
});
test('nothing is looked up or reported while no instance follows events, and a lookup across a restart is dropped', async () => {
  const a = createAttention(), calls = [];
  await a.refresh(['ses_a'], async id => { calls.push(id); return [{ id: 'per_1' }]; });
  assert.deepEqual(calls, []);
  const stop = a.listen(), slow = deferred();
  const pending = a.refresh(['ses_a'], () => slow.promise);
  stop();
  a.listen();
  slow.resolve([{ id: 'per_1' }]);
  await pending;
  assert.equal(a.of('ses_a'), undefined);
});
test('without a lookup, refresh changes nothing, and malformed events are ignored', async () => {
  const a = listening();
  await a.refresh(['ses_a'], undefined);
  for (const event of [undefined, {}, { type: 'permission.asked' }, { type: 'form.created', data: {} }, { type: 'permission.replied', data: { sessionID: 'ses_x' } }]) a.event(/** @type {any} */ (event));
  assert.equal(a.of('ses_a'), undefined);
});
