import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, DEFAULT_CAPABILITIES, REMOVE_DATA_CONFIRMATION, serialQueue } from '../src/core.js';
import { INDEX_KEY, RETRY_WINDOW, historyKey } from '../src/history.js';

function fixture(options = {}) {
  let time = 1000000, sequence = 0;
  const data = new Map(), calls = [], approvals = [];
  const agents = [
    { id: 'ses_a', title: 'Alice', agent: 'build', projectID: 'project_a', location: { directory: '/a' }, time: {} },
    { id: 'ses_b', title: 'Bob', agent: 'review', projectID: 'project_a', location: { directory: '/a' }, time: {} },
    { id: 'ses_c', title: 'Carol', agent: 'build', projectID: 'project_c', location: { directory: '/c' }, time: {} },
  ];
  const storage = {
    get: async key => structuredClone(data.get(key)),
    set: async (key, value) => { data.set(key, structuredClone(value)); },
    remove: async key => { data.delete(key); },
    scan: async ({ prefix, after, limit = 1000 }) => {
      const keys = [...data.keys()].filter(key => key.startsWith(prefix) && (!after || key > after)).sort();
      const page = keys.slice(0, limit);
      return { entries: page.map(key => ({ key, value: structuredClone(data.get(key)) })), ...(keys.length > limit ? { next: page.at(-1) } : {}) };
    },
  };
  const session = {
    get: async ({ sessionID }) => structuredClone(agents.find(item => item.id === sessionID)),
    list: async () => ({ data: structuredClone(agents), cursor: {} }),
    synthetic: async input => { calls.push(structuredClone(input)); return { id: input.id }; },
    create: async input => { const item = { ...input, projectID: 'project_a', time: {} }; agents.push(item); return item; },
  };
  const approve = async (...args) => { approvals.push(args); };
  const dependencies = { storage, session, approve, queue: serialQueue(), now: () => time,
    uuid: () => String(++sequence), ...options };
  return { engine: createEngine(dependencies), dependencies, agents, calls, approvals, data,
    history: scope => data.get(historyKey(scope)) ?? { messages: {}, conversations: {}, audit: [] },
    advance: ms => { time += ms; } };
}
const request = (key = 'key1', extra = {}) => ({ to: 'ses_b', text: 'Review the patch', key, ...extra });
// Connection members must have joined the list.
const register = async (f, ...ids) => { for (const id of ids) await f.engine.manage(id, 'discovery.register'); };
const connect = async f => { await register(f, 'ses_a', 'ses_c'); return f.engine.manage('ses_a', 'connection.create', { members: ['ses_a', 'ses_c'], minutes: 2 }); };
async function registeredFixture(options) {
  const f = fixture(options);
  for (const id of ['ses_a', 'ses_b', 'ses_c']) await f.engine.manage(id, 'discovery.register');
  return f;
}

test('discovery includes other projects and does not authorize messages', async () => {
  const f = fixture();
  await f.engine.manage('ses_a', 'discovery.update', { mode: 'automatic' });
  assert.equal((await f.engine.snapshot()).agents.length, 3);
  await assert.rejects(f.engine.send('ses_a', request('one', { to: 'ses_c' })), /not_authorized/);
  assert.equal(f.calls.length, 0);
});
test("the user's own controls skip approvals and denials and leave the per-minute allowance alone", async () => {
  const f = await registeredFixture();
  await f.engine.manage('ses_a', 'policy.update', { capabilities: { openConnection: 'deny' } });
  const before = f.approvals.length;
  const connection = await f.engine.manage('ses_a', 'connection.create', { members: ['ses_a', 'ses_c'] }, undefined, { user: true });
  assert.ok(connection.id); assert.equal(f.approvals.length, before);
  await assert.rejects(f.engine.manage('ses_a', 'connection.create', { members: ['ses_a', 'ses_c'] }), /capability_denied/);
  await assert.rejects(f.engine.manage('ses_a', 'discovery.update', { mode: 'automatic' }, undefined, { user: true }), /unknown_action/);
  await f.engine.manage('ses_a', 'profile.update', { name: 'Ada', role: 'Lead' }, undefined, { user: true });
  const audit = (await f.engine.snapshot()).audit.filter(item => item.data?.userAction);
  assert.deepEqual(audit.map(item => item.action).sort(), ['connection.create', 'profile.update']);
  assert.equal(audit.find(item => item.action === 'profile.update').data.previousName, 'Alice');
});
test('an approval summary names the sessions and the team instead of their IDs', async () => {
  const f = await registeredFixture();
  const team = await f.engine.manage('ses_a', 'team.create', { name: 'Review', members: ['ses_a', 'ses_b'] });
  await f.engine.manage('ses_a', 'team.members', { id: team.id, members: ['ses_a', 'ses_c'] });
  await connect(f);
  const summaries = f.approvals.map(args => args[4]);
  assert.deepEqual(summaries.slice(-3), [
    ['Alice asks to create the team "Review" with 2 sessions:', 'Alice (/a)', 'Bob (/a)'],
    ['Alice asks to change the members of "Review":', 'Add: Carol (/c)', 'Remove: Bob (/a)'],
    ['Alice asks to connect 2 sessions for 2 minutes:', 'Alice (/a)', 'Carol (/c)'],
  ]);
  assert.ok(summaries.every(lines => lines === undefined || !/ses_/.test(lines.join('\n'))));
});
test('a session request names the OpenCode agent, and a session without a title is not shown by its ID', async () => {
  const f = await registeredFixture();
  f.agents.push({ id: 'ses_plain', agent: 'build', projectID: 'project_a', location: { directory: '/a' }, time: {} });
  await f.engine.manage('ses_plain', 'discovery.register');
  await f.engine.manage('ses_plain', 'connection.create', { members: ['ses_plain', 'ses_b'] });
  await f.engine.manage('ses_a', 'session.create', { name: 'Helper', role: 'Review', agent: 'build', directory: '/a',
    model: { providerID: 'prov', id: 'chat', variant: 'fast' } });
  const [connection, session] = f.approvals.slice(-2).map(args => args[4]);
  assert.equal(connection[0], 'An untitled session asks to connect 2 sessions for 60 minutes:');
  assert.deepEqual(connection.slice(1), ['an untitled session (/a)', 'Bob (/a)']);
  assert.deepEqual(session, ['Alice asks to create a session:', 'Name: "Helper"', 'Role: Review', 'Folder: /a', 'OpenCode agent: build', 'Model: prov/chat (fast)']);
});
test('connections need registered members, extending never shortens one, and a session in another project needs cross-project approval', async () => {
  const f = fixture();
  await assert.rejects(f.engine.manage('ses_a', 'connection.create', { members: ['ses_a', 'ses_c'] }), /member_not_registered/);
  const connection = await connect(f);
  const end = connection.expiresAt;
  const shorter = await f.engine.manage('ses_a', 'connection.extend', { id: connection.id, minutes: 1 });
  assert.equal(shorter.expiresAt, end);
  assert.ok((await f.engine.manage('ses_a', 'connection.extend', { id: connection.id, minutes: 30 })).expiresAt > end);
  const input = { name: 'Helper', role: 'Review', agent: 'build', model: { providerID: 'prov', id: 'chat' } };
  await f.engine.manage('ses_a', 'session.create', { ...input, directory: '/a' });
  assert.ok(!f.approvals.at(-1)[3].includes('workAcrossProjects'));
  await f.engine.manage('ses_a', 'session.create', { ...input, directory: '/c' });
  assert.ok(f.approvals.at(-1)[3].includes('workAcrossProjects'));
  // The requester's folder however it is spelled, and folders inside it, are its own project.
  const crosses = async (actor, directory) => { await f.engine.manage(actor, 'session.create', { ...input, directory }); return f.approvals.at(-1)[3].includes('workAcrossProjects'); };
  f.agents.push({ id: 'ses_w', agent: 'build', projectID: 'project_w', location: { directory: 'C:\\Projects\\Web' }, time: {} });
  for (const directory of ['/a/', '/a/sub']) assert.equal(await crosses('ses_a', directory), false, directory);
  for (const directory of ['/A', '/ab', '/a/../c', '/']) assert.equal(await crosses('ses_a', directory), true, directory);
  for (const directory of ['C:/Projects/Web', 'c:\\projects\\web\\', 'C:/Projects/Web/packages/app']) assert.equal(await crosses('ses_w', directory), false, directory);
  for (const directory of ['C:/Projects/Website', 'C:/Projects', 'C:/Projects/Web/../API']) assert.equal(await crosses('ses_w', directory), true, directory);
  // A folder inside the requester's that already holds a session of another project is that other project.
  f.agents.push({ id: 'ses_n', agent: 'build', projectID: 'project_n', location: { directory: '/a/nested' }, time: {} });
  assert.equal(await crosses('ses_a', '/a/nested/'), true);
  assert.equal(await crosses('ses_a', '/a/nested/deeper'), false);
  // A refusal names the sessions that must join.
  await assert.rejects(f.engine.manage('ses_a', 'connection.create', { members: ['ses_a', 'ses_b'] }),
    error => error.code === 'member_not_registered' && error.details.names.length === 1 && error.details.sessions[0] === 'ses_b');
});
test('agent lists leave out archived sessions and, in automatic listing, subagents, and an agent sees at most 100 peers', async () => {
  const f = fixture();
  f.agents.push({ id: 'ses_old', title: 'Old', agent: 'build', projectID: 'project_a', location: { directory: '/a' }, time: { archived: 5 } },
    { id: 'ses_child', title: 'Child', agent: 'explore', parentID: 'ses_a', projectID: 'project_a', location: { directory: '/a' }, time: {} });
  await f.engine.manage('ses_a', 'discovery.update', { mode: 'automatic' });
  assert.deepEqual((await f.engine.snapshot()).agents.map(item => item.sessionID), ['ses_a', 'ses_b', 'ses_c']);
  // Joining the list on purpose still lists a subagent.
  await f.engine.manage('ses_child', 'discovery.register');
  assert.ok((await f.engine.snapshot()).agents.some(item => item.sessionID === 'ses_child'));
  for (let index = 0; index < 120; index++) f.agents.push({ id: `ses_p${index}`, title: `Peer ${index}`, agent: 'build', projectID: 'project_a', location: { directory: '/a' }, time: {} });
  const full = await f.engine.snapshot('ses_a'), compact = await f.engine.snapshot('ses_a', undefined, { compact: true });
  // The full view includes the agent itself, the short one doesn't.
  assert.equal(full.agents.length, 100); assert.equal(full.agentsOmitted, 24);
  assert.equal(compact.agents.length, 100); assert.equal(compact.agentsOmitted, 23);
  assert.equal((await f.engine.snapshot()).agents.length, 124);
});
test('native synthetic delivery steers and resumes with correlation and identity', async () => {
  const f = fixture(), message = await f.engine.send('ses_a', request());
  assert.equal(message.status, 'accepted');
  assert.equal(message.delivery, 'steer');
  assert.equal(f.calls[0].delivery, 'steer'); assert.equal(f.calls[0].resume, true);
  assert.equal(f.calls[0].metadata.agentTeamsForOpencode.from, 'ses_a');
  assert.equal(f.calls[0].metadata.agentTeamsForOpencode.delivery, 'steer');
  assert.equal(JSON.parse(f.calls[0].text.split('\n')[1]).delivery, 'steer');
  assert.equal(JSON.parse(f.calls[0].text.split('\n')[1]).body, 'Review the patch');
});
test('accepted, delivered and processed have separate transitions', async () => {
  const f = fixture(), message = await f.engine.send('ses_a', request());
  assert.equal(message.status, 'accepted');
  await f.engine.delivered('ses_b', message.id);
  assert.equal((await f.engine.snapshot()).messages[0].status, 'delivered');
  await f.engine.acknowledge('ses_b', message.id);
  await f.engine.delivered('ses_b', message.id);
  assert.equal((await f.engine.snapshot()).messages[0].status, 'processed');
});
test('only the addressed recipient can acknowledge a message', async () => {
  const f = fixture(), message = await f.engine.send('ses_a', request());
  await assert.rejects(f.engine.acknowledge('ses_c', message.id), /not_message_recipient/);
});
test('replies preserve the conversation and reverse the peer direction', async () => {
  const f = fixture(), message = await f.engine.send('ses_a', request());
  const reply = await f.engine.send('ses_b', request('reply', { to: 'ses_a', replyTo: message.id }));
  assert.equal(reply.conversationID, message.conversationID); assert.equal(reply.hops, 1);
  assert.equal(reply.delivery, 'steer'); assert.equal(f.calls[1].delivery, 'steer');
  await assert.rejects(f.engine.send('ses_a', request('bad', { replyTo: message.id })), /invalid_reply/);
});
test('self messages are refused', async () => {
  const f = fixture(); await assert.rejects(f.engine.send('ses_a', request('self', { to: 'ses_a' })), /self_message/);
});
test('UTF-8 size is measured in bytes', async () => {
  const f = fixture();
  await f.engine.send('ses_a', request('limit', { text: '가'.repeat(10922) }));
  await assert.rejects(f.engine.send('ses_a', request('oversize', { text: '가'.repeat(10923) })), /message_size/);
});
test('concurrent retries admit exactly one native message', async () => {
  const f = fixture();
  const messages = await Promise.all(Array.from({ length: 20 }, () => f.engine.send('ses_a', request())));
  assert.equal(new Set(messages.map(item => item.id)).size, 1); assert.equal(f.calls.length, 1);
});
test('one key cannot be reused for different content', async () => {
  const f = fixture(); await f.engine.send('ses_a', request());
  await assert.rejects(f.engine.send('ses_a', request('key1', { text: 'Different' })), /idempotency_conflict/);
});
test('retry state persists across engine recreation', async () => {
  const f = fixture(); await f.engine.send('ses_a', request());
  await createEngine(f.dependencies).send('ses_a', request()); assert.equal(f.calls.length, 1);
});
test('records without a delivery field are not relabelled or readmitted as steering on retry', async () => {
  const f = fixture(), message = await f.engine.send('ses_a', request());
  // Simulate stored records that have no delivery field.
  delete f.history('none').messages[message.id].delivery;
  f.calls.length = 0;
  const retried = await createEngine(f.dependencies).send('ses_a', request());
  assert.equal(retried.id, message.id); assert.equal(retried.status, 'accepted');
  assert.equal(Object.hasOwn(retried, 'delivery'), false); assert.equal(f.calls.length, 0);
});
test('an uncertain native response is never resent silently', async () => {
  const f = fixture(); f.dependencies.session.synthetic = async input => { f.calls.push(input); throw new Error('connection lost'); };
  const message = await f.engine.send('ses_a', request());
  assert.equal(message.status, 'uncertain');
  assert.equal((await f.engine.send('ses_a', request())).status, 'uncertain');
  assert.equal(f.calls.length, 1);
  await f.engine.delivered('ses_b', message.id);
  assert.equal((await f.engine.send('ses_a', request())).status, 'delivered');
});
test('a failed storage write prevents native admission', async () => {
  const f = fixture(); f.dependencies.storage.set = async () => { throw new Error('disk unavailable'); };
  await assert.rejects(f.engine.send('ses_a', request()), /disk unavailable/); assert.equal(f.calls.length, 0);
});
test('rate limit is per sender and expires after a minute', async () => {
  const f = fixture({ limits: { messagesPerMinute: 2 } });
  await f.engine.send('ses_a', request('1')); await f.engine.send('ses_a', request('2'));
  await assert.rejects(f.engine.send('ses_a', request('3')), /rate_limit/);
  await f.engine.send('ses_b', request('b', { to: 'ses_a' }));
  f.advance(60000); await f.engine.send('ses_a', request('3'));
});
test('correlation hop limit stops reply loops', async () => {
  const f = fixture({ limits: { maxHops: 1 } });
  const one = await f.engine.send('ses_a', request());
  const two = await f.engine.send('ses_b', request('reply', { to: 'ses_a', replyTo: one.id }));
  await assert.rejects(f.engine.send('ses_a', request('reply2', { replyTo: two.id })), /hop_limit/);
});
test('teams permit direct cross-project messages in both directions', async () => {
  const f = await registeredFixture();
  await f.engine.manage('ses_a', 'team.create', { name: 'Release', members: ['ses_a', 'ses_c'] });
  assert.deepEqual(f.approvals[0][3], ['createTeam', 'changeMembers', 'workAcrossProjects']);
  await f.engine.send('ses_a', request('a', { to: 'ses_c' }));
  await f.engine.send('ses_c', request('c', { to: 'ses_a' })); assert.equal(f.calls.length, 2);
});
test('removing team membership revokes communication', async () => {
  const f = await registeredFixture(); const team = await f.engine.manage('ses_a', 'team.create', { name: 'Release', members: ['ses_a', 'ses_c'] });
  await f.engine.manage('ses_a', 'team.members', { id: team.id, members: ['ses_a', 'ses_b'] });
  await assert.rejects(f.engine.send('ses_a', request('a', { to: 'ses_c' })), /not_authorized/);
});
test('only current members can change or delete a team', async () => {
  const f = await registeredFixture(); const team = await f.engine.manage('ses_a', 'team.create', { name: 'Release', members: ['ses_a', 'ses_c'] });
  const approvals = f.approvals.length;
  await assert.rejects(f.engine.manage('ses_b', 'team.members', { id: team.id, members: ['ses_a', 'ses_b', 'ses_c'] }), /team_not_found/);
  await assert.rejects(f.engine.manage('ses_b', 'team.delete', { id: team.id }), /team_not_found/);
  assert.equal(f.approvals.length, approvals);
  assert.deepEqual((await f.engine.snapshot()).teams, [team]);
  await f.engine.manage('ses_c', 'team.members', { id: team.id, members: ['ses_a', 'ses_c', 'ses_b'] });
  await f.engine.manage('ses_b', 'team.delete', { id: team.id });
  assert.deepEqual((await f.engine.snapshot()).teams, []);
});
test('temporary connections expire at the exact deadline', async () => {
  const f = fixture(); await connect(f); await f.engine.send('ses_a', request('a', { to: 'ses_c' }));
  f.advance(120000);
  await assert.rejects(f.engine.send('ses_c', request('c', { to: 'ses_a' })), /not_authorized/);
});
test('revocation is checked even for an idempotent retry', async () => {
  const f = fixture(), connection = await connect(f);
  await f.engine.send('ses_a', request('a', { to: 'ses_c' }));
  await f.engine.manage('ses_c', 'connection.close', { id: connection.id });
  await assert.rejects(f.engine.send('ses_a', request('a', { to: 'ses_c' })), /not_authorized/);
});
test('expired connections cannot be extended', async () => {
  const f = fixture(), connection = await connect(f); f.advance(120001);
  await assert.rejects(f.engine.manage('ses_a', 'connection.extend', { id: connection.id, minutes: 1 }), /connection_expired/);
});
const allowAll = () => Object.fromEntries(Object.keys(DEFAULT_CAPABILITIES).map(key => [key, 'allow']));
test('every capability defaults to ask', async () => {
  const f = fixture(); assert.deepEqual((await f.engine.snapshot()).capabilities, DEFAULT_CAPABILITIES);
  assert.ok(Object.values(DEFAULT_CAPABILITIES).every(value => value === 'ask'));
});
test('capability changes always need approval, including when everything is allowed', async () => {
  const f = await registeredFixture();
  await f.engine.manage('ses_a', 'policy.update', { capabilities: allowAll() });
  assert.deepEqual(f.approvals[0][3], ['policy']);
  await f.engine.manage('ses_a', 'team.create', { name: 'Autonomous', members: ['ses_a', 'ses_c'] });
  assert.equal(f.approvals.length, 1);
  await f.engine.manage('ses_a', 'policy.update', { capabilities: DEFAULT_CAPABILITIES });
  assert.deepEqual(f.approvals[1][3], ['policy']);
});
test('one allowed capability leaves the other asks active', async () => {
  const f = await registeredFixture(); await f.engine.manage('ses_a', 'policy.update', { capabilities: { createTeam: 'allow' } });
  await f.engine.manage('ses_a', 'team.create', { name: 'Cross project', members: ['ses_a', 'ses_c'] });
  assert.deepEqual(f.approvals[1][3], ['changeMembers', 'workAcrossProjects']);
});
test('user settings preserve the approved agent team and capability approval rules', async () => {
  const f = await registeredFixture();
  await f.engine.configure({ capabilities: allowAll() });
  await f.engine.manage('ses_a', 'team.create', { name: 'Autonomous', members: ['ses_a', 'ses_b'] });
  assert.equal(f.approvals.length, 0);
  await f.engine.manage('ses_a', 'policy.update', { capabilities: allowAll() });
  assert.deepEqual(f.approvals[0][3], ['policy']);
  await f.engine.configure({ capabilities: { createTeam: 'ask' } });
  await f.engine.manage('ses_a', 'team.create', { name: 'Approval', members: ['ses_a', 'ses_b'] });
  assert.deepEqual(f.approvals[1][3], ['createTeam']);
});
test('a denied capability refuses before any approval prompt and names the remedy', async () => {
  const f = await registeredFixture();
  await f.engine.configure({ capabilities: { createTeam: 'deny', workAcrossProjects: 'deny' } });
  const error = await f.engine.manage('ses_a', 'team.create', { name: 'Blocked', members: ['ses_a', 'ses_c'] }).catch(value => value);
  assert.equal(error.code, 'capability_denied');
  assert.deepEqual(error.details.denied, ['createTeam', 'workAcrossProjects']);
  assert.match(error.details.remedy, /policy\.update/);
  assert.equal(f.approvals.length, 0); assert.equal((await f.engine.snapshot()).teams.length, 0);
});
test('stored capability values outside allow, ask and deny are refused unchanged', async () => {
  const f = fixture(), state = { version: 1, revision: 0, profiles: {}, teams: {}, connections: {}, rate: {},
    operations: {}, discovery: { mode: 'registered', registrations: {} }, capabilities: { ...DEFAULT_CAPABILITIES, createTeam: true } };
  f.data.set('collaboration.v1', structuredClone(state));
  await assert.rejects(f.engine.configuration(), /invalid_stored_state/);
  assert.deepEqual(f.data.get('collaboration.v1'), state);
});
test('a user settings change invalidates a pending agent approval', async () => {
  let release, entered;
  const pending = new Promise(resolve => { entered = resolve; });
  const f = await registeredFixture({ approve: async () => { entered(); await new Promise(resolve => { release = resolve; }); } });
  const team = f.engine.manage('ses_a', 'team.create', { name: 'Pending', members: ['ses_a', 'ses_b'] });
  await pending;
  await f.engine.configure({ discoveryMode: 'automatic' });
  release();
  await assert.rejects(team, /state_changed/);
  assert.equal((await f.engine.snapshot()).teams.length, 0);
});
for (const action of ['team.create', 'team.members', 'connection.create', 'connection.extend']) {
  test(`${action} refuses newly required cross-project approval after a native move`, async () => {
    const entered = Promise.withResolvers(), release = Promise.withResolvers(), approvals = [];
    let pending = false;
    const f = await registeredFixture({ approve: async (...args) => {
      approvals.push(structuredClone(args));
      if (pending) { entered.resolve(); await release.promise; }
    } });
    let input;
    if (action === 'team.members') {
      const team = await f.engine.manage('ses_a', 'team.create', { name: 'Original', members: ['ses_a'] });
      input = { id: team.id, members: ['ses_a', 'ses_b'] };
    } else if (action === 'connection.extend') {
      await register(f, 'ses_a', 'ses_b');
    const connection = await f.engine.manage('ses_a', 'connection.create', { members: ['ses_a', 'ses_b'], minutes: 1 });
      input = { id: connection.id, minutes: 2 };
    } else input = action === 'team.create' ? { name: 'Pending', members: ['ses_a', 'ses_b'] } : { members: ['ses_a', 'ses_b'] };
    const before = structuredClone(f.data.get('collaboration.v1'));
    pending = true;
    const proposal = f.engine.manage('ses_a', action, input);
    await entered.promise;
    const approvedCount = approvals.length;
    assert.ok(!approvals.at(-1)[3].includes('workAcrossProjects'));
    f.agents[1].projectID = 'project_moved';
    f.agents[1].location.directory = '/moved';
    assert.equal((await f.engine.snapshot()).revision, before.revision);
    pending = false; release.resolve();
    await assert.rejects(proposal, /^Error: state_changed_request_again$/);
    assert.deepEqual(f.data.get('collaboration.v1'), before);
    assert.equal(approvals.length, approvedCount);
    await f.engine.manage('ses_a', action, input);
    assert.ok(approvals.at(-1)[3].includes('workAcrossProjects'));
  });
}
test('concurrent user setting changes preserve unrelated approval flags', async () => {
  const f = fixture(), second = createEngine(f.dependencies);
  await Promise.all([f.engine.configure({ capabilities: { createTeam: 'allow' } }),
    second.configure({ capabilities: { workAcrossProjects: 'deny' } })]);
  const settings = await f.engine.configuration();
  assert.equal(settings.capabilities.createTeam, 'allow');
  assert.equal(settings.capabilities.workAcrossProjects, 'deny');
  assert.equal(settings.capabilities.createSession, 'ask');
});
test('denied approval leaves collaboration state unchanged', async () => {
  const f = fixture({ approve: async () => { throw new Error('rejected'); } });
  await assert.rejects(connect(f), /rejected/); assert.equal((await f.engine.snapshot()).connections.length, 0);
});
test('policy changes while approval is pending invalidate the old proposal', async () => {
  let release, entered;
  const pending = new Promise(resolve => { entered = resolve; });
  const f = await registeredFixture({ approve: async (_actor, action) => {
    if (action === 'team.create') { entered(); await new Promise(resolve => { release = resolve; }); }
  } });
  const team = f.engine.manage('ses_a', 'team.create', { name: 'Release', members: ['ses_a', 'ses_c'] });
  await pending;
  await f.engine.manage('ses_a', 'policy.update', { capabilities: DEFAULT_CAPABILITIES });
  release(); await assert.rejects(team, /state_changed/);
});
test('pending approval does not block existing same-project messages', async () => {
  let release, entered;
  const pending = new Promise(resolve => { entered = resolve; });
  const f = fixture({ approve: async () => { entered(); await new Promise(resolve => { release = resolve; }); } });
  const connection = connect(f); await pending;
  await f.engine.send('ses_a', request()); assert.equal(f.calls.length, 1);
  release(); await connection;
});
test('two location engines use the same queue without lost updates', async () => {
  const f = fixture(), second = createEngine(f.dependencies);
  await Promise.all([f.engine.send('ses_a', request('one')), second.send('ses_b', request('two', { to: 'ses_a' }))]);
  assert.equal((await f.engine.snapshot()).messages.length, 2);
});
test('global project sessions in different folders require authorization', async () => {
  const f = fixture(); f.agents[0].projectID = 'global'; f.agents[1].projectID = 'global'; f.agents[1].location.directory = '/other';
  await assert.rejects(f.engine.send('ses_a', request()), /not_authorized/);
});
test('a moved session does not retain same-project access', async () => {
  const f = fixture(); await f.engine.send('ses_a', request()); f.agents[1].projectID = 'moved';
  await assert.rejects(f.engine.send('ses_a', request('afterMove')), /not_authorized/);
});
test('registered profiles use the native title until a profile is set', async () => {
  const f = fixture(); await f.engine.manage('ses_a', 'discovery.register');
  assert.equal((await f.engine.snapshot()).agents[0].name, 'Alice');
  await f.engine.manage('ses_a', 'profile.update', { name: 'Builder', role: 'Testing' });
  assert.equal((await f.engine.snapshot()).agents[0].name, 'Builder');
});
test('snapshots expose only each session explicit model, including unlisted team members', async () => {
  const f = await registeredFixture();
  f.agents[0].model = { id: 'alias-model', providerID: 'provider-a', variant: 'high', privateSetting: 'not-public' };
  f.agents[1].model = { id: 'review-model', providerID: 'provider-b' };
  await f.engine.manage('ses_a', 'team.create', { name: 'Models', members: ['ses_a', 'ses_b'] });
  await f.engine.manage('ses_b', 'discovery.unregister');
  const snapshot = await f.engine.snapshot();
  assert.deepEqual(snapshot.agents.find(peer => peer.sessionID === 'ses_a').model,
    { id: 'alias-model', providerID: 'provider-a', variant: 'high' });
  assert.deepEqual(snapshot.people.ses_b.model, { id: 'review-model', providerID: 'provider-b' });
  assert.equal(Object.hasOwn(snapshot.agents.find(peer => peer.sessionID === 'ses_c'), 'model'), false);
  assert.equal((await f.engine.snapshot('ses_a')).people.ses_b.model.id, 'review-model');
});
test('agent snapshots omit unrelated conversation contents', async () => {
  const f = fixture(); await f.engine.send('ses_a', request());
  assert.equal((await f.engine.snapshot('ses_c')).messages.length, 0);
});
test('snapshots name unlisted collaboration members without listing them', async () => {
  const f = fixture();
  await f.engine.manage('ses_a', 'discovery.register', {});
  await f.engine.manage('ses_c', 'discovery.register', {});
  await f.engine.manage('ses_a', 'team.create', { name: 'Release', members: ['ses_a', 'ses_c'] });
  await f.engine.manage('ses_c', 'discovery.unregister', {});
  const state = await f.engine.snapshot(undefined, 'ses_b');
  assert.deepEqual(state.agents.map(peer => peer.sessionID), ['ses_a']);
  assert.deepEqual(Object.keys(state.people).sort(), ['ses_b', 'ses_c']);
  assert.equal(state.people.ses_c.name, 'Carol');
  assert.equal(state.people.ses_c.registered, false);
});
test('the user snapshot returns only the newest records', async () => {
  const f = fixture();
  for (let index = 0; index < 205; index++) { f.advance(2100); await f.engine.send('ses_a', request(`k${index}`, { text: `Message ${index}` })); }
  const state = await f.engine.snapshot();
  assert.equal(state.messages.length, 200);
  assert.equal(state.messages.at(-1).text, 'Message 204');
  assert.equal(state.audit.length, 200);
  const agent = await f.engine.snapshot('ses_a');
  assert.equal(agent.messages.length, 50); assert.equal(agent.messages.at(-1).text, 'Message 204'); assert.equal(agent.messagesOmitted, 155);
  assert.equal(agent.audit.length, 50);
  assert.equal((await f.engine.snapshot(undefined, undefined, { limit: 205 })).messages.length, 205);
});
test('message metadata carries readable sender and recipient names', async () => {
  const f = fixture(); await f.engine.send('ses_a', request());
  assert.equal(f.calls[0].metadata.agentTeamsForOpencode.senderName, 'Alice');
  assert.equal(f.calls[0].metadata.agentTeamsForOpencode.recipientName, 'Bob');
});
test('creation requires an explicit model and enforces the managed-session limit', async () => {
  const f = fixture({ limits: { managedSessions: 1 } });
  const input = { name: 'Test', role: 'Test', agent: 'build', directory: '/a', model: { id: 'chosen', providerID: 'chosen' } };
  await assert.rejects(f.engine.manage('ses_a', 'session.create', { ...input, model: undefined }),
    error => error.code === 'invalid_action_input' && error.details.missing.includes('model'));
  const result = await f.engine.manage('ses_a', 'session.create', input);
  assert.equal(result.model.id, 'chosen');
  await assert.rejects(f.engine.manage('ses_a', 'session.create', input), /session_creation_limit/);
});
test('invalid configuration and corrupt storage fail closed', async () => {
  assert.throws(() => fixture({ limits: { messageBytes: 32769 } }), /invalid_limit/);
  const f = fixture(); f.data.set('collaboration.v1', { version: 2 });
  await assert.rejects(f.engine.snapshot(), /invalid_stored_state/);
});
test('cancelled management never changes state', async () => {
  const f = fixture(), controller = new AbortController(); controller.abort();
  await assert.rejects(f.engine.manage('ses_a', 'profile.update', { name: 'A', role: 'B' }, controller.signal), /cancelled/);
});
test('cancellation while a management commit waits in the queue prevents creation', async () => {
  const held = Promise.withResolvers(), queued = Promise.withResolvers(), run = serialQueue();
  let count = 0, blocker;
  const queue = task => {
    const result = run(task);
    if (++count === 3) queued.resolve();
    return result;
  };
  const f = fixture({ queue, approve: async () => { blocker = queue(() => held.promise); } });
  const controller = new AbortController();
  const proposal = f.engine.manage('ses_a', 'session.create', { name: 'Child', role: 'Review', agent: 'build', directory: '/a',
    model: { id: 'chosen', providerID: 'chosen' } }, controller.signal);
  await queued.promise;
  controller.abort(); held.resolve();
  await blocker;
  await assert.rejects(proposal, /^Error: cancelled$/);
  assert.equal(f.agents.length, 3);
  assert.equal(f.data.size, 0);
});
for (const action of ['profile.update', 'session.create']) {
  test(`cancellation during awaited commit validation prevents ${action}`, async () => {
    const f = fixture(), entered = Promise.withResolvers(), release = Promise.withResolvers(), controller = new AbortController();
    const method = action === 'session.create' ? 'list' : 'get', original = f.dependencies.session[method];
    let validations = 0;
    f.dependencies.session[method] = async (...args) => {
      const value = await original(...args);
      if (++validations === 2) { entered.resolve(); await release.promise; }
      return value;
    };
    const input = action === 'profile.update' ? { name: 'Changed', role: 'Review' } : { name: 'Child', role: 'Review', agent: 'build',
      directory: '/a', model: { id: 'chosen', providerID: 'chosen' } };
    const proposal = f.engine.manage('ses_a', action, input, controller.signal);
    await entered.promise;
    controller.abort(); release.resolve();
    await assert.rejects(proposal, /^Error: cancelled$/);
    assert.equal(f.agents.length, 3);
    assert.equal(f.data.size, 0);
  });
}
test('cancellation after intent persistence records no native dispatch or team mutation', async () => {
  const f = await registeredFixture();
  const team = await f.engine.manage('ses_a', 'team.create', { name: 'Original', members: ['ses_a'] });
  const before = structuredClone(f.data.get('collaboration.v1'));
  const entered = Promise.withResolvers(), release = Promise.withResolvers(), controller = new AbortController();
  const original = f.dependencies.storage.set;
  f.dependencies.storage.set = async (key, value) => {
    await original(key, value);
    if (key === 'collaboration.v1' && Object.keys(value.created).length) { entered.resolve(); await release.promise; }
  };
  const proposal = f.engine.manage('ses_a', 'session.create', { name: 'Child', role: 'Review', agent: 'build', directory: '/a',
    model: { id: 'chosen', providerID: 'chosen' }, teamID: team.id }, controller.signal);
  await entered.promise;
  controller.abort(); release.resolve();
  await assert.rejects(proposal, /^Error: cancelled$/);
  assert.equal(f.agents.length, 3);
  const after = f.data.get('collaboration.v1'), [intent, cancelled] = f.history(team.id).audit.slice(-2);
  assert.equal(intent.action, 'session.create.intent');
  assert.equal(cancelled.action, 'session.create.cancelled');
  assert.deepEqual(cancelled.data, { id: intent.data.id, reason: 'cancelled_before_native_dispatch', teamID: team.id });
  assert.deepEqual({ ...after, counts: before.counts }, before);
});
test('cancellation after native creation dispatch does not pretend to undo creation', async () => {
  const f = fixture(), entered = Promise.withResolvers(), release = Promise.withResolvers(), controller = new AbortController();
  const original = f.dependencies.session.create;
  let dispatches = 0;
  f.dependencies.session.create = async input => {
    dispatches++; entered.resolve(); await release.promise;
    return original(input);
  };
  const proposal = f.engine.manage('ses_a', 'session.create', { name: 'Child', role: 'Review', agent: 'build', directory: '/a',
    model: { id: 'chosen', providerID: 'chosen' } }, controller.signal);
  await entered.promise;
  controller.abort(); release.resolve();
  const child = await proposal;
  assert.equal(dispatches, 1); assert.equal(f.agents.length, 4);
  const state = f.data.get('collaboration.v1'), activity = f.history('general').audit;
  assert.deepEqual(state.profiles[child.id], { name: 'Child', role: 'Review' });
  assert.equal(activity.at(-1).action, 'session.create');
  assert.ok(!activity.some(item => item.action === 'session.create.cancelled'));
});
test('discovery follows cursor pages and refuses a repeated cursor', async () => {
  const f = fixture(); let calls = 0;
  await f.engine.manage('ses_a', 'discovery.update', { mode: 'automatic' });
  f.dependencies.session.list = async input => {
    calls++; assert.equal(input.order, calls === 1 ? 'desc' : undefined);
    return { data: [f.agents[calls - 1]], cursor: calls === 1 ? { next: 'page2' } : {} };
  };
  assert.equal((await f.engine.snapshot()).agents.length, 2);
  f.dependencies.session.list = async () => ({ data: [f.agents[0]], cursor: { next: 'same' } });
  await assert.rejects(f.engine.snapshot(), /repeated_discovery_cursor/);
});
test('prototype property names cannot target a team', async () => {
  const f = fixture();
  await assert.rejects(f.engine.manage('ses_a', 'team.members', { id: '__proto__', members: ['ses_a', 'ses_b'] }), /invalid_action_input/);
  await assert.rejects(f.engine.manage('ses_a', 'team.members', { id: 'team___proto__', members: ['ses_a', 'ses_b'] }), /team_not_found/);
  assert.equal(Object.prototype.members, undefined);
});
test('management rejects unrecognized fields and permission overrides', async () => {
  const f = fixture();
  await assert.rejects(f.engine.manage('ses_a', 'session.create', { permissions: [{ effect: 'allow' }] }), /invalid_action_input/);
});
test('a lost final storage write recovers as uncertain and prevents a resend', async () => {
  const f = fixture();
  const original = f.dependencies.storage.set;
  f.dependencies.storage.set = async (...args) => { if (f.calls.length) throw new Error('disk failed after admission'); return original(...args); };
  await assert.rejects(f.engine.send('ses_a', request()), /disk failed/);
  f.dependencies.storage.set = original;
  assert.equal((await f.engine.send('ses_a', request())).status, 'uncertain'); assert.equal(f.calls.length, 1);
});
test('history capacity trims bodies without blocking admission or forgetting retry evidence', async () => {
  const f = fixture({ limits: { records: 1 } });
  const first = await f.engine.send('ses_a', request());
  const second = await f.engine.send('ses_a', request('two'));
  const state = f.data.get('collaboration.v1');
  assert.deepEqual(Object.keys(f.history('none').messages), [second.id]);
  assert.equal(state.receipts[first.id].historyPruned, true);
  assert.equal(Object.hasOwn(state.receipts[first.id], 'text'), false);
  const retry = await createEngine(f.dependencies).send('ses_a', request());
  assert.equal(retry.id, first.id); assert.equal(retry.status, 'accepted');
  assert.equal(retry.historyPruned, true); assert.equal(f.calls.length, 2);
  await assert.rejects(f.engine.send('ses_a', request('key1', { text: 'Changed' })), /idempotency_conflict/);
});
test('retry protection expires exactly fifteen minutes after the first attempt, not the last retry', async () => {
  const f = fixture();
  const first = await f.engine.send('ses_a', request());
  assert.equal(first.retryUntil, first.at + RETRY_WINDOW);
  f.advance(RETRY_WINDOW - 1);
  const retry = await f.engine.send('ses_a', request());
  assert.equal(retry.id, first.id); assert.equal(retry.retryUntil, first.retryUntil); assert.equal(f.calls.length, 1);
  f.advance(1);
  const fresh = await f.engine.send('ses_a', request());
  assert.notEqual(fresh.id, first.id); assert.equal(f.calls.length, 2);
  assert.equal(fresh.retryUntil, fresh.at + RETRY_WINDOW);
});
test('history reads persist expired retry cleanup, without a mutation, revision change or native resend', async () => {
  const f = fixture({ limits: { records: 1 } });
  const first = await f.engine.send('ses_a', request());
  const newest = await f.engine.send('ses_a', request('two'));
  const revision = f.data.get('collaboration.v1').revision;
  f.advance(RETRY_WINDOW);
  const snapshot = await f.engine.snapshot();
  const stored = f.data.get('collaboration.v1');
  assert.deepEqual(stored.operations, {}); assert.deepEqual(stored.receipts, {}); assert.deepEqual(stored.rate, {});
  assert.equal(stored.revision, revision); assert.equal(f.calls.length, 2);
  assert.deepEqual(snapshot.messages.map(item => item.id), [newest.id]);
  await f.engine.delivered('ses_b', first.id);
  await assert.rejects(f.engine.acknowledge('ses_b', first.id), /not_message_recipient/);
  assert.equal(Object.hasOwn(f.history('none').messages, first.id), false);
});
test('background maintenance expires uncertain receipts and keys without resending', async () => {
  const f = fixture({ limits: { records: 1 } });
  f.dependencies.session.synthetic = async input => { f.calls.push(input); throw new Error('response lost'); };
  const first = await f.engine.send('ses_a', request());
  await f.engine.send('ses_a', request('second'));
  assert.equal(f.data.get('collaboration.v1').receipts[first.id].status, 'uncertain');
  f.advance(RETRY_WINDOW);
  await createEngine(f.dependencies).maintain();
  assert.deepEqual(f.data.get('collaboration.v1').receipts, {});
  assert.deepEqual(f.data.get('collaboration.v1').operations, {}); assert.equal(f.calls.length, 2);
});
test('trimmed receipts still support delivery, acknowledgement, reply correlation and compact discovery within the window', async () => {
  const f = fixture({ limits: { records: 1 } });
  const first = await f.engine.send('ses_a', request());
  await f.engine.send('ses_a', request('second'));
  const pending = await f.engine.snapshot('ses_b', undefined, { compact: true });
  assert.ok(pending.unacknowledged.includes(first.id));
  await f.engine.delivered('ses_b', first.id);
  const handled = await f.engine.acknowledge('ses_b', first.id);
  assert.equal(handled.status, 'processed'); assert.equal(handled.historyPruned, true); assert.equal(handled.text, undefined);
  const reply = await f.engine.send('ses_b', request('reply', { to: 'ses_a', replyTo: first.id }));
  assert.equal(reply.conversationID, first.conversationID); assert.equal(reply.hops, 1);
  const retry = await f.engine.send('ses_a', request()); assert.equal(retry.status, 'processed'); assert.equal(f.calls.length, 3);
});
test('pruning and receipt expiry cannot reset a retained conversation count or bypass sender rate limits', async () => {
  const f = fixture({ limits: { records: 1, messagesPerConversation: 2 } });
  const first = await f.engine.send('ses_a', request());
  const second = await f.engine.send('ses_b', request('reply', { to: 'ses_a', replyTo: first.id }));
  f.advance(RETRY_WINDOW);
  await f.engine.snapshot();
  await assert.rejects(f.engine.send('ses_a', request('third', { replyTo: second.id })), /conversation_limit/);
  assert.equal(f.history('none').conversations[first.conversationID], 2);
  const rate = fixture({ limits: { records: 1, messagesPerMinute: 2 } });
  await rate.engine.send('ses_a', request('one')); await rate.engine.send('ses_a', request('two'));
  await assert.rejects(rate.engine.send('ses_a', request('three')), /rate_limit/);
  await rate.engine.send('ses_b', request('other', { to: 'ses_a' })); assert.equal(rate.calls.length, 3);
});
test('retry authorisation is still checked after its body has been trimmed', async () => {
  const f = fixture({ limits: { records: 1 } });
  await f.engine.send('ses_a', request()); await f.engine.send('ses_a', request('second'));
  f.agents[1].projectID = 'moved'; f.agents[1].location.directory = '/moved';
  await assert.rejects(f.engine.send('ses_a', request()), /communication_not_authorized/); assert.equal(f.calls.length, 2);
});
test('team history and Activity are filtered before the recent-page limit and stay separate from general activity', async () => {
  const f = await registeredFixture();
  const quiet = await f.engine.manage('ses_a', 'team.create', { name: 'Quiet', members: ['ses_a', 'ses_b'] });
  const busy = await f.engine.manage('ses_b', 'team.create', { name: 'Busy', members: ['ses_b', 'ses_c'] });
  const first = await f.engine.send('ses_a', request());
  for (let index = 0; index < 205; index++) {
    f.advance(2100); await f.engine.send('ses_b', request(`busy-${index}`, { to: 'ses_c' }));
  }
  await f.engine.configure({ discoveryMode: 'automatic' });
  const quietHistory = await f.engine.snapshot(undefined, undefined, { scope: quiet.id });
  assert.deepEqual(quietHistory.messages.map(item => item.id), [first.id]);
  assert.deepEqual(quietHistory.audit.map(item => item.action), ['team.create', 'message.admission']);
  assert.equal(quietHistory.scopes.teams[quiet.id].messages, 1);
  const busyHistory = await f.engine.snapshot(undefined, undefined, { scope: busy.id });
  assert.equal(busyHistory.messages.length, 200); assert.equal(busyHistory.scopes.teams[busy.id].messages, 205);
  const general = await f.engine.snapshot(undefined, undefined, { scope: 'general' });
  assert.equal(general.messages.length, 0); assert.equal(general.audit.at(-1).action, 'settings.update');
  const peer = await f.engine.snapshot('ses_a', undefined, { scope: busy.id });
  assert.deepEqual(peer.messages.map(item => item.id), [first.id]); assert.equal(peer.scopes, undefined);
});
test('history budgets are per team, and membership changes do not reclassify previous messages', async () => {
  const f = await registeredFixture({ limits: { records: 1 } });
  const quiet = await f.engine.manage('ses_a', 'team.create', { name: 'Quiet', members: ['ses_a', 'ses_b'] });
  const busy = await f.engine.manage('ses_b', 'team.create', { name: 'Busy', members: ['ses_b', 'ses_c'] });
  const retained = await f.engine.send('ses_a', request());
  for (let index = 0; index < 5; index++) await f.engine.send('ses_b', request(`busy-${index}`, { to: 'ses_c' }));
  await f.engine.manage('ses_a', 'team.members', { id: quiet.id, members: ['ses_a'] });
  assert.deepEqual((await f.engine.snapshot(undefined, undefined, { scope: quiet.id })).messages.map(item => item.id), [retained.id]);
  assert.equal((await f.engine.snapshot(undefined, undefined, { scope: busy.id })).messages.length, 1);
  assert.equal(f.calls.length, 6);
});
for (const user of [false, true]) test(`${user ? 'manual' : 'peer'} team deletion removes all its history and retry evidence, preserving other teams`, async () => {
  const f = await registeredFixture({ limits: { records: 1 } });
  const removed = await f.engine.manage('ses_a', 'team.create', { name: 'Removed', members: ['ses_a', 'ses_b'] });
  const kept = await f.engine.manage('ses_b', 'team.create', { name: 'Kept', members: ['ses_b', 'ses_c'] });
  const first = await f.engine.send('ses_a', request('first'));
  const second = await f.engine.send('ses_a', request('second'));
  const other = await f.engine.send('ses_b', request('other', { to: 'ses_c' }));
  if (user) await f.engine.teamManage('team.delete', { id: removed.id }, f.data.get('collaboration.v1').revision);
  else await f.engine.manage('ses_a', 'team.delete', { id: removed.id });
  const stored = f.data.get('collaboration.v1');
  assert.equal(f.data.has(historyKey(removed.id)), false); assert.equal(stored.counts[removed.id], undefined);
  assert.deepEqual(Object.keys(f.history(kept.id).messages), [other.id]); assert.deepEqual(stored.receipts, {});
  assert.deepEqual(Object.keys(stored.operations), ['ses_b/other']);
  assert.deepEqual(Object.keys(f.data.get(INDEX_KEY)), [other.id]);
  assert.equal(f.history('general').audit.at(-1).action, 'team.delete'); assert.equal(f.history('general').audit.at(-1).data.teamName, 'Removed');
  assert.equal(f.history(kept.id).conversations[other.conversationID], 1); assert.ok(stored.teams[kept.id]);
  await f.engine.delivered('ses_b', first.id);
  await assert.rejects(f.engine.acknowledge('ses_b', second.id), /not_message_recipient/);
  assert.equal((await f.engine.snapshot(undefined, undefined, { scope: removed.id })).messages.length, 0);
  const fresh = await f.engine.send('ses_a', request('first')); assert.notEqual(fresh.id, first.id);
});
test('deleting every member session clears the team and all associated history', async () => {
  const f = await registeredFixture({ limits: { records: 1 } });
  const team = await f.engine.manage('ses_a', 'team.create', { name: 'Release', members: ['ses_a', 'ses_b'] });
  await f.engine.send('ses_a', request('one')); await f.engine.send('ses_a', request('two'));
  await f.engine.sessionDeleted('ses_a');
  assert.ok(f.data.get('collaboration.v1').teams[team.id]);
  assert.equal(Object.keys(f.history(team.id).messages).length, 1);
  await f.engine.sessionDeleted('ses_b');
  const stored = f.data.get('collaboration.v1');
  assert.equal(stored.teams[team.id], undefined); assert.equal(f.data.has(historyKey(team.id)), false);
  assert.deepEqual(stored.receipts, {}); assert.deepEqual(stored.operations, {}); assert.deepEqual(f.data.get(INDEX_KEY), {});
});
test('reconciliation of all deleted member sessions also clears team history after missed events', async () => {
  const f = await deletionFixture({ limits: { records: 1 } });
  await f.engine.send('ses_a', request('one')); await f.engine.send('ses_a', request('two'));
  f.forget('ses_a'); f.forget('ses_b'); f.forget('ses_c');
  await f.engine.reconcile();
  const stored = f.saved();
  assert.deepEqual(stored.teams, {}); assert.equal(f.data.has(historyKey(f.team.id)), false); assert.deepEqual(stored.receipts, {});
  assert.deepEqual(stored.operations, {}); assert.deepEqual(f.data.get(INDEX_KEY), {});
});
test('inherited property names cannot replace limit or capability fields', async () => {
  assert.throws(() => fixture({ limits: { toString: 1 } }), /invalid_limit/);
  const f = fixture(), capabilities = JSON.parse('{"__proto__":"allow","toString":"allow"}');
  await assert.rejects(f.engine.manage('ses_a', 'policy.update', { capabilities }), /invalid_action_input/);
  await assert.rejects(f.engine.configure({ capabilities }), /invalid_capabilities/);
  assert.equal(Object.prototype.toString.call({}), '[object Object]');
  assert.equal(f.approvals.length, 0);
});

test('discovery requires explicit self-registration by default and survives reload', async () => {
  const f = fixture();
  assert.deepEqual((await f.engine.snapshot()).agents, []);
  assert.equal((await f.engine.snapshot()).discovery.mode, 'registered');
  await f.engine.manage('ses_b', 'discovery.register');
  const state = await createEngine(f.dependencies).snapshot();
  assert.deepEqual(state.agents.map(peer => peer.sessionID), ['ses_b']);
  assert.equal(state.agents[0].registered, true);
  assert.equal(f.approvals.length, 0);
});

test('registration is idempotent and cannot name another session', async () => {
  const f = fixture();
  await f.engine.manage('ses_a', 'discovery.register');
  await f.engine.manage('ses_a', 'discovery.register');
  assert.deepEqual((await f.engine.snapshot()).discovery.registered, ['ses_a']);
  await assert.rejects(f.engine.manage('ses_a', 'discovery.register', { sessionID: 'ses_b' }), /invalid_action_input/);
});

test('leaving discovery hides only the caller and does not change communication rights', async () => {
  const f = fixture();
  await f.engine.manage('ses_a', 'discovery.register');
  await f.engine.manage('ses_b', 'discovery.register');
  await f.engine.manage('ses_a', 'discovery.unregister');
  assert.deepEqual((await f.engine.snapshot()).agents.map(peer => peer.sessionID), ['ses_b']);
  await f.engine.send('ses_a', request());
  await assert.rejects(f.engine.send('ses_a', request('cross', { to: 'ses_c' })), /not_authorized/);
});

test('automatic discovery requires approval and preserves registrations when switched back', async () => {
  const f = fixture();
  await f.engine.manage('ses_b', 'discovery.register');
  await f.engine.manage('ses_a', 'discovery.update', { mode: 'automatic' });
  assert.deepEqual(f.approvals[0][3], ['discovery']);
  assert.equal((await createEngine(f.dependencies).snapshot()).agents.length, 3);
  await f.engine.manage('ses_a', 'discovery.update', { mode: 'registered' });
  assert.deepEqual((await f.engine.snapshot()).agents.map(peer => peer.sessionID), ['ses_b']);
  await assert.rejects(f.engine.manage('ses_a', 'discovery.update', { mode: 'anything' }), /invalid_action_input/);
});

test('denied discovery changes leave the mode and registrations unchanged', async () => {
  const f = fixture({ approve: async () => { throw new Error('denied'); } });
  await f.engine.manage('ses_a', 'discovery.register');
  await assert.rejects(f.engine.manage('ses_a', 'discovery.update', { mode: 'automatic' }), /denied/);
  assert.equal((await f.engine.snapshot()).discovery.mode, 'registered');
  assert.equal((await f.engine.snapshot()).agents.length, 1);
});

test('a created team session joins discovery and membership in one approved action', async () => {
  const f = await registeredFixture();
  const team = await f.engine.manage('ses_a', 'team.create', { name: 'Review', members: ['ses_a', 'ses_b'] });
  const child = await f.engine.manage('ses_a', 'session.create', { name: 'Child', role: 'Review', agent: 'build', directory: '/a',
    model: { id: 'chosen', providerID: 'chosen' }, teamID: team.id });
  const state = await f.engine.snapshot();
  assert.ok(state.agents.some(peer => peer.sessionID === child.id));
  assert.ok(state.teams[0].members.includes(child.id));
  assert.deepEqual(f.approvals[1][3], ['createSession', 'changeMembers']);
  await f.engine.manage(child.id, 'discovery.unregister');
  assert.ok(!(await f.engine.snapshot()).agents.some(peer => peer.sessionID === child.id));
});

test('one agent can start a team, create a teammate, and send it work', async () => {
  const f = await registeredFixture();
  const team = await f.engine.manage('ses_a', 'team.create', { name: 'Release', members: ['ses_a'] });
  assert.deepEqual(team.members, ['ses_a']);
  assert.deepEqual(f.approvals[0][3], ['createTeam', 'changeMembers']);
  const child = await f.engine.manage('ses_a', 'session.create', { name: 'Reviewer', role: 'Review', agent: 'build', directory: '/a',
    model: { id: 'chosen', providerID: 'chosen' }, teamID: team.id });
  const state = await f.engine.snapshot();
  assert.deepEqual(state.teams[0].members, ['ses_a', child.id]);
  assert.ok(state.discovery.registered.includes(child.id));
  assert.deepEqual(f.approvals[1][3], ['createSession', 'changeMembers']);
  const message = await f.engine.send('ses_a', request('review', { to: child.id }));
  assert.equal(message.status, 'accepted');
  assert.equal(f.calls[0].sessionID, child.id);
});

test('a team can shrink back to its remaining member', async () => {
  const f = await registeredFixture();
  const team = await f.engine.manage('ses_a', 'team.create', { name: 'Release', members: ['ses_a', 'ses_c'] });
  await f.engine.manage('ses_a', 'team.members', { id: team.id, members: ['ses_a'] });
  assert.deepEqual((await f.engine.snapshot()).teams[0].members, ['ses_a']);
  await assert.rejects(f.engine.send('ses_a', request('revoked', { to: 'ses_c' })), /communication_not_authorized/);
});

test('teams still require a unique member list including the caller; connections need two', async () => {
  const f = fixture();
  for (const members of [[], ['ses_b'], ['ses_a', 'ses_a'], Array(33).fill('ses_a')]) {
    await assert.rejects(f.engine.manage('ses_a', 'team.create', { name: 'Invalid', members }),
      error => error.code === 'invalid_action_input' && error.details.invalid.some(item => item.field === 'members'));
  }
  await assert.rejects(f.engine.manage('ses_a', 'connection.create', { members: ['ses_a'] }), /invalid_action_input/);
  assert.equal(f.approvals.length, 0);
});

test('team session creation refuses a team outside caller membership before native creation', async () => {
  const f = await registeredFixture();
  const team = await f.engine.manage('ses_a', 'team.create', { name: 'Review', members: ['ses_a', 'ses_b'] });
  const input = { name: 'Child', role: 'Review', agent: 'build', directory: '/c', model: { id: 'chosen', providerID: 'chosen' }, teamID: team.id };
  await assert.rejects(f.engine.manage('ses_c', 'session.create', input), /team_not_found/);
  assert.equal(f.agents.length, 3);
  await f.engine.manage('ses_a', 'session.create', input);
  assert.ok(f.approvals[1][3].includes('workAcrossProjects'));
});

test('invalid stored registration data is refused', async () => {
  const f = fixture(); await f.engine.manage('ses_a', 'discovery.register');
  f.data.get('collaboration.v1').discovery.registrations.bad = true;
  await assert.rejects(f.engine.snapshot(), /invalid_stored_state/);
  f.data.get('collaboration.v1').discovery = null;
  await assert.rejects(f.engine.snapshot(), /invalid_stored_state/);
});

test('manual team management needs no acting session and leaves peer authority unchanged', async () => {
  const f = await registeredFixture();
  let revision = (await f.engine.snapshot()).revision;
  const team = await f.engine.teamManage('team.create', { name: 'User team', members: ['ses_b', 'ses_c'] }, revision);
  assert.deepEqual(team.members, ['ses_b', 'ses_c']);
  assert.equal(f.approvals.length, 0);
  await assert.rejects(f.engine.manage('ses_a', 'team.members', { id: team.id, members: ['ses_a', 'ses_b'] }), /team_not_found/);
  revision = (await f.engine.snapshot()).revision;
  const updated = await f.engine.teamManage('team.update', { id: team.id, name: 'Renamed', members: ['ses_a', 'ses_c'] }, revision);
  assert.equal(updated.name, 'Renamed');
  assert.deepEqual(updated.members, ['ses_a', 'ses_c']);
  await assert.rejects(f.engine.send('ses_b', request('removed', { to: 'ses_c' })), /communication_not_authorized/);
  assert.equal((await f.engine.snapshot()).audit.at(-1).actor, 'user');
  await f.engine.teamManage('team.delete', { id: team.id }, (await f.engine.snapshot()).revision);
  assert.equal((await f.engine.snapshot()).teams.length, 0);
});
test('manual profile editing targets another unlisted member without changing native session or discovery', async () => {
  const f = await registeredFixture();
  await f.engine.teamManage('team.create', { name: 'Other team', members: ['ses_b', 'ses_c'] }, (await f.engine.snapshot()).revision);
  await f.engine.manage('ses_c', 'discovery.unregister');
  const before = await f.engine.snapshot(), native = structuredClone(f.agents), approvals = f.approvals.length;
  const saved = await f.engine.profileManage('ses_c', { name: '  Human name  ', role: '  Human role  ' }, before.revision);
  assert.deepEqual(saved, { name: 'Human name', role: 'Human role' });
  const after = await f.engine.snapshot();
  assert.equal(after.people.ses_c.name, 'Human name'); assert.equal(after.people.ses_c.role, 'Human role');
  assert.deepEqual(after.discovery, before.discovery); assert.deepEqual(after.teams, before.teams);
  assert.deepEqual(after.connections, before.connections); assert.deepEqual(f.agents, native);
  assert.equal(after.agents.find(peer => peer.sessionID === 'ses_a').name, 'Alice');
  assert.equal(f.approvals.length, approvals); assert.equal(after.revision, before.revision + 1);
  assert.equal(after.audit.at(-1).actor, 'user'); assert.equal(after.audit.at(-1).data.sessionID, 'ses_c');
  assert.equal(after.audit.at(-1).data.previousName, 'Carol'); assert.equal(after.audit.at(-1).data.userAction, true);
});
test('manual profile editing rejects stale revisions rather than overwriting another edit', async () => {
  const f = fixture();
  await f.engine.profileManage('ses_b', { name: 'First name', role: 'First role' }, 0);
  await assert.rejects(f.engine.profileManage('ses_b', { name: 'Old edit', role: 'Old role' }, 0), /state_changed_request_again/);
  const state = await f.engine.snapshot(undefined, 'ses_b');
  assert.equal(state.people.ses_b.name, 'First name'); assert.equal(state.revision, 1);
});
test('manual profile validation refuses unknown fields, invalid names and nonexistent targets without saving', async () => {
  const f = fixture();
  for (const input of [null, [], { name: '', role: 'Role' }, { name: 'Name', role: '  ' },
    { name: 'x'.repeat(121), role: 'Role' }, { name: 'Name', role: 'Role', registered: true },
    { name: 'Name', role: 'Role', model: { id: 'override' } }]) {
    await assert.rejects(f.engine.profileManage('ses_b', input, 0), /invalid_profile/);
  }
  await assert.rejects(f.engine.profileManage('ses_missing', { name: 'Name', role: 'Role' }, 0), /invalid_session/);
  await assert.rejects(f.engine.profileManage('__proto__', { name: 'Name', role: 'Role' }, 0), /invalid_session_id/);
  assert.equal(f.data.size, 0); assert.equal(f.approvals.length, 0);
});
test('peer profile actions remain self-only and do not gain manual profile targeting', async () => {
  const f = fixture();
  await assert.rejects(f.engine.manage('ses_a', 'profile.update', { name: 'Override', role: 'Role', sessionID: 'ses_b' }), /invalid_action_input/);
  await assert.rejects(f.engine.manage('ses_a', 'profileManage', { sessionID: 'ses_b', name: 'Override', role: 'Role' }), /unknown_action/);
  assert.equal(f.data.size, 0);
});
test('manual profile cancellation while queued does not change the target', async () => {
  const gate = Promise.withResolvers(), queue = serialQueue(), blocker = queue(() => gate.promise);
  const f = fixture({ queue }), controller = new AbortController();
  const edit = f.engine.profileManage('ses_b', { name: 'Cancelled', role: 'Cancelled' }, 0, controller.signal);
  controller.abort(); gate.resolve(); await blocker;
  await assert.rejects(edit, /cancelled/); assert.equal(f.data.size, 0);
});
test('manual profile cancellation during target validation does not save', async () => {
  const f = fixture(), entered = Promise.withResolvers(), release = Promise.withResolvers(), controller = new AbortController();
  const get = f.dependencies.session.get;
  f.dependencies.session.get = async input => { entered.resolve(); await release.promise; return get(input); };
  const edit = f.engine.profileManage('ses_b', { name: 'Cancelled', role: 'Cancelled' }, 0, controller.signal);
  await entered.promise; controller.abort(); release.resolve();
  await assert.rejects(edit, /cancelled/); assert.equal(f.data.size, 0);
});

test('manual candidates obey registration, archive filtering, search and pages of 50', async () => {
  const f = fixture();
  assert.equal((await f.engine.teamCandidates()).total, 0);
  await f.engine.manage('ses_b', 'discovery.register');
  assert.deepEqual((await f.engine.teamCandidates()).items.map(peer => peer.sessionID), ['ses_b']);
  await f.engine.configure({ discoveryMode: 'automatic' });
  for (let i = 0; i < 120; i++) f.agents.push({ ...f.agents[0], id: `ses_page_${i}`, title: `Candidate ${i}` });
  f.agents.at(-1).time = { archived: 1 };
  assert.equal((await f.engine.teamCandidates()).items.length, 50);
  assert.equal((await f.engine.teamCandidates({ page: 2 })).items.length, 22);
  assert.equal((await f.engine.teamCandidates({ query: 'ses_page_117' })).items[0].name, 'Candidate 117');
  assert.equal((await f.engine.teamCandidates({ query: 'ses_page_117', exclude: ['ses_page_117'] })).total, 0);
  assert.equal((await f.engine.teamCandidates({ query: '/c' })).total, 1);
  assert.equal((await f.engine.teamCandidates({ page: 99 })).page, 2);
  await assert.rejects(f.engine.teamCandidates({ page: -1 }), /invalid_action_input/);
  await assert.rejects(f.engine.teamCandidates({ automatic: true }), /invalid_action_input/);
});

test('both user and peer team additions require registration unless automatic listing is enabled', async () => {
  const f = fixture();
  await f.engine.manage('ses_a', 'discovery.register');
  const team = await f.engine.manage('ses_a', 'team.create', { name: 'Registered', members: ['ses_a'] });
  await assert.rejects(f.engine.manage('ses_a', 'team.members', { id: team.id, members: ['ses_a', 'ses_b'] }), /member_not_registered/);
  await assert.rejects(f.engine.manage('ses_a', 'team.create', { name: 'Other', members: ['ses_a', 'ses_c'] }), /member_not_registered/);
  let revision = (await f.engine.snapshot()).revision;
  await assert.rejects(f.engine.teamManage('team.update', { id: team.id, name: team.name, members: ['ses_a', 'ses_b'] }, revision), /member_not_registered/);
  await assert.rejects(f.engine.teamManage('team.create', { name: 'Other', members: ['ses_c'] }, revision), /member_not_registered/);
  await f.engine.configure({ discoveryMode: 'automatic' });
  revision = (await f.engine.snapshot()).revision;
  const other = await f.engine.teamManage('team.create', { name: 'Other', members: ['ses_c'] }, revision);
  assert.deepEqual(other.members, ['ses_c']);
  await f.engine.manage('ses_a', 'team.members', { id: team.id, members: ['ses_a', 'ses_b'] });
  assert.deepEqual((await f.engine.snapshot()).discovery.registered, ['ses_a']);
});

test('manual team updates reject stale proposals and invalid inputs without saving', async () => {
  const f = await registeredFixture();
  const revision = (await f.engine.snapshot()).revision;
  const team = await f.engine.teamManage('team.create', { name: 'Review', members: ['ses_b'] }, revision);
  await assert.rejects(f.engine.teamManage('team.update', { id: team.id, name: 'Stale', members: ['ses_c'] }, revision), /state_changed/);
  const next = (await f.engine.snapshot()).revision;
  for (const members of [[], ['ses_b', 'ses_b'], Array(33).fill('ses_b')]) {
    await assert.rejects(f.engine.teamManage('team.update', { id: team.id, name: 'Changed', members }, next), /invalid_members/);
  }
  await assert.rejects(f.engine.teamManage('team.update', { id: team.id, name: ' ', members: ['ses_b'] }, next), /invalid_team_name/);
  await assert.rejects(f.engine.teamManage('policy.update', { policy: {} }, next), /invalid_action_input/);
  await assert.rejects(f.engine.teamManage('team.create', { name: 'Review', members: ['ses_b'] }, next), /team_name_exists/);
  assert.deepEqual((await f.engine.snapshot()).teams, [team]);
  f.agents[2].time.archived = 1;
  await assert.rejects(f.engine.teamManage('team.update', { id: team.id, name: team.name, members: ['ses_b', 'ses_c'] }, next), /invalid_session/);
});

test('unregistering an existing team member does not silently remove it, but readding needs registration', async () => {
  const f = await registeredFixture();
  const team = await f.engine.teamManage('team.create', { name: 'Review', members: ['ses_a', 'ses_b'] }, (await f.engine.snapshot()).revision);
  await f.engine.manage('ses_b', 'discovery.unregister');
  await f.engine.teamManage('team.update', { ...team, name: 'Renamed' }, (await f.engine.snapshot()).revision);
  await f.engine.teamManage('team.update', { ...team, members: ['ses_a'] }, (await f.engine.snapshot()).revision);
  await assert.rejects(f.engine.teamManage('team.update', team, (await f.engine.snapshot()).revision), /member_not_registered/);
});

const catalog = { agents: async () => [{ id: 'build', name: 'Build' }, { id: 'plan', name: 'Plan' }, { id: 'general', name: 'General' }],
  models: async () => [{ providerID: 'prov', id: 'chat', name: 'Chat', variants: ['fast', 'deep'] }] };
const child = { name: 'Child', role: 'Review', agent: 'build', directory: '/a', model: { providerID: 'prov', id: 'chat' } };
test('each omitted required field is named, with every problem in one response', async () => {
  const f = fixture({ catalog });
  for (const field of ['name', 'role', 'agent', 'directory', 'model']) {
    const input = { ...child }; delete input[field];
    const error = await f.engine.manage('ses_a', 'session.create', input).catch(value => value);
    assert.equal(error.code, 'invalid_action_input'); assert.deepEqual(error.details.missing, [field]);
    assert.equal(error.details.action, 'session.create');
  }
  const error = await f.engine.manage('ses_a', 'session.create', { name: '', directory: 'relative', model: { id: 'x' }, extra: 1 }).catch(value => value);
  assert.deepEqual(error.details.missing.sort(), ['agent', 'role']);
  assert.deepEqual(error.details.invalid.map(item => item.field).sort(), ['directory', 'extra', 'model', 'name']);
  assert.match(error.details.hint, /agent must be one of: build, plan, general/);
  assert.deepEqual(JSON.parse(JSON.stringify(error)), { code: 'invalid_action_input', ...error.details });
  assert.equal(f.approvals.length, 0);
});
test('unknown agents, models and variants are refused against the native catalog', async () => {
  const f = fixture({ catalog });
  const error = await f.engine.manage('ses_a', 'session.create', { ...child, agent: 'missing',
    model: { providerID: 'prov', id: 'none' } }).catch(value => value);
  assert.deepEqual(error.details.invalid.map(item => item.field), ['agent', 'model']);
  assert.deepEqual(error.details.invalid[0].allowed, ['build', 'plan', 'general']);
  const variant = await f.engine.manage('ses_a', 'session.create', { ...child, model: { providerID: 'prov', id: 'chat', variant: 'max' } }).catch(value => value);
  assert.deepEqual(variant.details.invalid[0].allowed, ['fast', 'deep']);
  assert.equal((await f.engine.manage('ses_a', 'session.create', child)).agent, 'build');
});
test('an unreadable catalog does not block creation', async () => {
  const f = fixture({ catalog: { agents: async () => { throw new Error('offline'); }, models: async () => [] } });
  assert.equal((await f.engine.manage('ses_a', 'session.create', child)).agent, 'build');
});
test('shape is validated before the managed-session limit', async () => {
  const f = fixture({ limits: { managedSessions: 1 } });
  await f.engine.manage('ses_a', 'session.create', child);
  await assert.rejects(f.engine.manage('ses_a', 'session.create', { ...child, agent: undefined }), /invalid_action_input/);
});
test('the creation limit lists counted sessions, and archiving one frees a place', async () => {
  const f = fixture({ limits: { managedSessions: 1 } });
  const first = await f.engine.manage('ses_a', 'session.create', child);
  const error = await f.engine.manage('ses_a', 'session.create', child).catch(value => value);
  assert.equal(error.code, 'session_creation_limit'); assert.equal(error.details.used, 1); assert.equal(error.details.limit, 1);
  assert.deepEqual(error.details.counted.map(item => [item.sessionID, item.name, item.registered]), [[first.id, 'Child', true]]);
  assert.equal(error.details.countedUnlisted, 0);
  assert.ok(!Number.isNaN(Date.parse(error.details.counted[0].lastActive)));
  assert.match(error.details.remedy, /Archive a counted session.*managedSessions/);
  f.agents.find(item => item.id === first.id).time.archived = 1;
  assert.equal((await f.engine.manage('ses_a', 'session.create', child)).title, 'Child');
});
test('plugin-created sessions carry no tag for child sessions to inherit, and children are not counted', async () => {
  const f = fixture(); let created;
  const create = f.dependencies.session.create;
  f.dependencies.session.create = async input => { created = input; return create(input); };
  const parent = await f.engine.manage('ses_a', 'session.create', child);
  assert.equal(Object.hasOwn(created, 'metadata'), false);
  // A subagent of that session, whatever metadata the host gives it.
  f.agents.push({ id: 'ses_child', parentID: parent.id, title: 'Subagent', agent: 'general', projectID: 'project_a', location: { directory: '/a' }, time: {} });
  assert.deepEqual((await f.engine.snapshot('ses_a')).self.quota.managedSessions, { used: 1, limit: 16, unlisted: 0 });
});
test('a session created without a team is listed, and once it leaves the list agents only count it', async () => {
  const f = fixture({ limits: { managedSessions: 2 } });
  f.agents.push({ id: 'ses_x', title: 'Xavier', agent: 'build', projectID: 'project_x', location: { directory: '/x' }, time: {} });
  await f.engine.configure({ capabilities: { createSession: 'allow' } });
  const helper = await f.engine.manage('ses_x', 'session.create', { ...child, name: 'Helper' });
  const mine = await f.engine.manage('ses_a', 'session.create', child);
  assert.equal(f.data.get('collaboration.v1').discovery.registrations[helper.id], true);
  assert.ok((await f.engine.snapshot('ses_b')).agents.some(item => item.sessionID === helper.id));
  // The helper chooses not to be found.
  await f.engine.manage(helper.id, 'discovery.unregister');
  for (const options of [{}, { compact: true }]) {
    const view = await f.engine.snapshot('ses_b', undefined, options);
    assert.equal(JSON.stringify(view).includes(helper.id), false);
    assert.deepEqual(view.self.quota.managedSessions, { used: 2, limit: 2, unlisted: 1 });
  }
  const limit = await f.engine.manage('ses_b', 'session.create', child).catch(error => error);
  assert.equal(limit.code, 'session_creation_limit');
  assert.deepEqual(limit.details.counted.map(item => item.sessionID), [mine.id]); assert.equal(limit.details.countedUnlisted, 1);
  assert.equal(JSON.stringify(limit.details).includes(helper.id), false);
});
test('a deleted plugin-created session frees its place and leaves no record, including after a missed event', async () => {
  const f = fixture({ limits: { managedSessions: 2 } });
  const first = await f.engine.manage('ses_a', 'session.create', child);
  const second = await f.engine.manage('ses_a', 'session.create', child);
  const revision = f.data.get('collaboration.v1').revision;
  const notFound = f.dependencies.session.get;
  f.dependencies.session.get = async ({ sessionID }) => {
    if (f.agents.some(item => item.id === sessionID)) return notFound({ sessionID });
    throw Object.assign(new Error(''), { _tag: 'Session.NotFoundError', sessionID });
  };
  f.agents.splice(f.agents.findIndex(item => item.id === first.id), 1);
  await f.engine.sessionDeleted(first.id);
  assert.deepEqual(Object.keys(f.data.get('collaboration.v1').created), [second.id]);
  assert.equal(f.data.get('collaboration.v1').revision, revision);
  f.agents.splice(f.agents.findIndex(item => item.id === second.id), 1);
  await f.engine.reconcile();
  assert.deepEqual(f.data.get('collaboration.v1').created, {});
});
test('saved data without a record of created sessions gains one, and a malformed record is refused', async () => {
  const f = fixture(); await f.engine.send('ses_a', request());
  delete f.data.get('collaboration.v1').created;
  await f.engine.maintain();
  assert.deepEqual(f.data.get('collaboration.v1').created, {});
  f.data.get('collaboration.v1').created = [];
  await assert.rejects(f.engine.maintain(), /invalid_stored_state/);
});
test('sessions in a team do not count against the session limit, and leaving the team brings them back', async () => {
  const f = await registeredFixture({ limits: { managedSessions: 1 } });
  const team = await f.engine.manage('ses_a', 'team.create', { name: 'Big', members: ['ses_a'] });
  const members = [];
  for (let index = 0; index < 5; index++) members.push((await f.engine.manage('ses_a', 'session.create', { ...child, teamID: team.id })).id);
  assert.equal((await f.engine.snapshot('ses_a')).self.quota.managedSessions.used, 0);
  await f.engine.manage('ses_a', 'session.create', child);
  await assert.rejects(f.engine.manage('ses_a', 'session.create', child), /session_creation_limit/);
  members.push((await f.engine.manage('ses_a', 'session.create', { ...child, teamID: team.id })).id);
  await f.engine.manage('ses_a', 'team.members', { id: team.id, members: ['ses_a', ...members.slice(1)] });
  assert.equal((await f.engine.snapshot('ses_a')).self.quota.managedSessions.used, 2);
});
test('teammates can keep going past both conversation limits, and other sessions cannot', async () => {
  const limits = { maxHops: 2, messagesPerConversation: 2 };
  const chain = async (f, count) => {
    let previous = await f.engine.send('ses_a', request('turn-0'));
    for (let turn = 1; turn < count; turn++) {
      const [from, to] = turn % 2 ? ['ses_b', 'ses_a'] : ['ses_a', 'ses_b'];
      previous = await f.engine.send(from, request(`turn-${turn}`, { to, replyTo: previous.id }));
    }
    return previous;
  };
  const inTeam = await registeredFixture({ limits });
  await inTeam.engine.manage('ses_a', 'team.create', { name: 'Long job', members: ['ses_a', 'ses_b'] });
  assert.equal((await chain(inTeam, 10)).hops, 9);
  await assert.rejects(chain(fixture({ limits }), 10), /conversation_limit/);
  await assert.rejects(chain(fixture({ limits: { maxHops: 2 } }), 10), /hop_limit/);
});
test('removing saved data clears every scope and setting, and needs the exact confirmation', async () => {
  const f = await registeredFixture();
  const team = await f.engine.manage('ses_a', 'team.create', { name: 'Doomed', members: ['ses_a', 'ses_b'] });
  await f.engine.send('ses_a', request());
  await f.engine.manage('ses_a', 'profile.update', { name: 'Ada' });
  await f.engine.configure({ capabilities: { createSession: 'allow' } });
  f.data.set('collaboration.ui.v1', { command: 'squad' });
  await assert.rejects(f.engine.removeData('yes'), /invalid_action_input/);
  assert.ok(f.history(team.id).messages);
  assert.deepEqual(await f.engine.removeData(REMOVE_DATA_CONFIRMATION), { removed: true });
  assert.deepEqual([...f.data.keys()], []);
  const fresh = await f.engine.snapshot();
  assert.deepEqual(fresh.teams, []); assert.deepEqual(fresh.messages, []); assert.deepEqual(fresh.discovery.registered, []);
  assert.deepEqual(fresh.capabilities, DEFAULT_CAPABILITIES);
  assert.deepEqual([...f.data.keys()], []);
  assert.equal(f.calls.length, 1);
});
test('a long exchange is not cut off by the reply depth', async () => {
  const f = fixture({ limits: { messagesPerMinute: 1000 } });
  let previous = await f.engine.send('ses_a', request('turn-0'));
  for (let turn = 1; turn < 60; turn++) {
    const [from, to] = turn % 2 ? ['ses_b', 'ses_a'] : ['ses_a', 'ses_b'];
    previous = await f.engine.send(from, request(`turn-${turn}`, { to, replyTo: previous.id }));
  }
  assert.equal(previous.hops, 59);
  assert.equal(f.engine.limits.maxHops, 100);
});
test('agent discovery reads only its own scopes and caps what goes into its context', async () => {
  const f = await registeredFixture({ limits: { messagesPerMinute: 1000 } });
  const mine = await f.engine.manage('ses_a', 'team.create', { name: 'Mine', members: ['ses_a', 'ses_b'] });
  const other = await f.engine.manage('ses_b', 'team.create', { name: 'Other', members: ['ses_b', 'ses_c'] });
  await f.engine.send('ses_b', request('other', { to: 'ses_c' }));
  for (let index = 0; index < 4; index++) await f.engine.send('ses_a', request(`large-${index}`, { text: `${index}${'x'.repeat(30000)}` }));
  const reads = []; const get = f.dependencies.storage.get;
  f.dependencies.storage.get = async key => { reads.push(key); return get(key); };
  const view = await f.engine.snapshot('ses_a');
  assert.equal(reads.includes(historyKey(other.id)), false); assert.ok(reads.includes(historyKey(mine.id)));
  assert.equal(view.messages.length, 2); assert.equal(view.messagesOmitted, 2); assert.deepEqual(view.messages.map(item => item.text[0]), ['2', '3']);
  assert.equal((await f.engine.snapshot('ses_b', undefined, { compact: true })).unacknowledged.length, 4);
});
// A short discover, with the history reads it made.
async function short(f, id) {
  const reads = [], get = f.dependencies.storage.get;
  f.dependencies.storage.get = async key => { reads.push(key); return get(key); };
  try {
    const ids = (await f.engine.snapshot(id, undefined, { compact: true })).unacknowledged.sort();
    return { ids, historyReads: reads.filter(key => key.startsWith('collaboration.v1.history.')).length };
  } finally { f.dependencies.storage.get = get; }
}
test('a short discover answers from the saved summary, following every status change, without reading history', async () => {
  const f = await registeredFixture();
  await f.engine.manage('ses_a', 'team.create', { name: 'Busy', members: ['ses_a', 'ses_b'] });
  const one = await f.engine.send('ses_a', request('one'));
  const two = await f.engine.send('ses_a', request('two'));
  assert.deepEqual(await short(f, 'ses_b'), { ids: [one.id, two.id].sort(), historyReads: 0 });
  await f.engine.delivered('ses_b', one.id);
  assert.deepEqual(await short(f, 'ses_b'), { ids: [one.id, two.id].sort(), historyReads: 0 });
  await f.engine.acknowledge('ses_b', one.id);
  assert.deepEqual(await short(f, 'ses_b'), { ids: [two.id], historyReads: 0 });
  assert.deepEqual(await short(f, 'ses_a'), { ids: [], historyReads: 0 });
});
test('a message whose sending is unconfirmed is not waiting for acknowledgement', async () => {
  const f = await registeredFixture();
  f.dependencies.session.synthetic = async () => { throw new Error('connection reset'); };
  assert.equal((await f.engine.send('ses_a', request())).status, 'uncertain');
  assert.deepEqual((await short(f, 'ses_b')).ids, []);
});
test('a message that rolls over stays waiting while its receipt lasts, and is dropped when it expires', async () => {
  const f = await registeredFixture({ limits: { records: 1 } });
  const first = await f.engine.send('ses_a', request('one'));
  const second = await f.engine.send('ses_a', request('two'));
  assert.ok(f.data.get('collaboration.v1').receipts[first.id]);
  assert.deepEqual(await short(f, 'ses_b'), { ids: [first.id, second.id].sort(), historyReads: 0 });
  f.advance(RETRY_WINDOW);
  assert.deepEqual(await short(f, 'ses_b'), { ids: [second.id], historyReads: 0 });
});
test('deleting a team removes its summary of unacknowledged messages', async () => {
  const f = await registeredFixture();
  const team = await f.engine.manage('ses_a', 'team.create', { name: 'Gone soon', members: ['ses_a', 'ses_b'] });
  await f.engine.send('ses_a', request());
  assert.ok(f.data.get('collaboration.v1').unacknowledged[team.id].ses_b.length);
  await f.engine.manage('ses_a', 'team.delete', { id: team.id });
  assert.equal(f.data.get('collaboration.v1').unacknowledged[team.id], undefined);
  assert.deepEqual(await short(f, 'ses_b'), { ids: [], historyReads: 0 });
});
test('data saved before the summary existed is read once, then answered from the summary', async () => {
  const f = await registeredFixture();
  const team = await f.engine.manage('ses_a', 'team.create', { name: 'Older', members: ['ses_a', 'ses_b'] });
  const message = await f.engine.send('ses_a', request());
  delete f.data.get('collaboration.v1').unacknowledged;
  const first = await short(f, 'ses_b');
  assert.deepEqual(first.ids, [message.id]); assert.ok(first.historyReads > 0);
  assert.deepEqual(f.data.get('collaboration.v1').unacknowledged[team.id], { ses_b: [message.id] });
  assert.deepEqual(await short(f, 'ses_b'), { ids: [message.id], historyReads: 0 });
});
test('a save cut off after the history leaves the summary unknown, never stale', async () => {
  const f = await registeredFixture();
  // Let the message go out and its history be written, then fail the final write of the core record.
  const original = f.dependencies.storage.set;
  let failed = false, historyWritten = false;
  f.dependencies.storage.set = async (key, value) => {
    if (f.calls.length && key.startsWith('collaboration.v1.history.')) historyWritten = true;
    if (!failed && historyWritten && key === 'collaboration.v1') { failed = true; throw new Error('disk failed'); }
    return original(key, value);
  };
  await assert.rejects(f.engine.send('ses_a', request()), /disk failed/);
  f.dependencies.storage.set = original;
  assert.ok(failed);
  const sent = Object.values(f.history('none').messages)[0];
  assert.equal(sent.status, 'accepted');
  assert.equal(f.data.get('collaboration.v1').unacknowledged.none, null);
  const other = createEngine(f.dependencies);
  assert.deepEqual((await other.snapshot('ses_b', undefined, { compact: true })).unacknowledged, [sent.id]);
  assert.deepEqual(f.data.get('collaboration.v1').unacknowledged.none, { ses_b: [sent.id] });
  assert.deepEqual(await short(f, 'ses_b'), { ids: [sent.id], historyReads: 0 });
});
test('an acknowledgement cut off before the core record is saved does not leave the message waiting', async () => {
  const f = await registeredFixture();
  const message = await f.engine.send('ses_a', request());
  const original = f.dependencies.storage.set;
  let failed = false, historyWritten = false;
  f.dependencies.storage.set = async (key, value) => {
    if (key.startsWith('collaboration.v1.history.')) historyWritten = true;
    if (!failed && historyWritten && key === 'collaboration.v1') { failed = true; throw new Error('disk failed'); }
    return original(key, value);
  };
  await assert.rejects(f.engine.acknowledge('ses_b', message.id), /disk failed/);
  f.dependencies.storage.set = original;
  assert.equal(f.history('none').messages[message.id].status, 'processed');
  assert.deepEqual((await short(f, 'ses_b')).ids, []);
});
test('a save cut off before the history is written keeps the old summary, which is still true', async () => {
  const f = await registeredFixture();
  const message = await f.engine.send('ses_a', request());
  const original = f.dependencies.storage.set;
  f.dependencies.storage.set = async (key, value) => {
    if (key.startsWith('collaboration.v1.history.')) throw new Error('disk failed');
    return original(key, value);
  };
  await assert.rejects(f.engine.acknowledge('ses_b', message.id), /disk failed/);
  f.dependencies.storage.set = original;
  assert.equal(f.history('none').messages[message.id].status, 'accepted');
  assert.deepEqual((await short(f, 'ses_b')).ids, [message.id]);
});
test('start-up repair rebuilds a summary that disagrees with the history', async () => {
  const f = await registeredFixture();
  const team = await f.engine.manage('ses_a', 'team.create', { name: 'Repaired', members: ['ses_a', 'ses_b'] });
  const message = await f.engine.send('ses_a', request());
  f.data.get('collaboration.v1').unacknowledged[team.id] = { ses_b: ['msg_stale'] };
  f.data.get('collaboration.v1').unacknowledged.team_gone = { ses_b: ['msg_orphan'] };
  await createEngine(f.dependencies).reconcile();
  const saved = f.data.get('collaboration.v1').unacknowledged;
  assert.deepEqual(saved[team.id], { ses_b: [message.id] }); assert.equal(saved.team_gone, undefined);
});
test('discover says what a running peer is waiting for, and never saves it', async () => {
  const waiting = { ses_b: 'approval', ses_c: 'input' }, refreshed = [];
  const f = await registeredFixture();
  f.dependencies.attention = { of: id => waiting[id], refresh: async ids => { refreshed.push([...ids]); } };
  for (const agent of f.agents) agent.time = { busy: 2000, idle: 1000 };
  f.agents.find(agent => agent.id === 'ses_c').time = { busy: 1000, idle: 2000 };
  const engine = createEngine(f.dependencies);
  const full = await engine.snapshot('ses_a');
  const short = await engine.snapshot('ses_a', undefined, { compact: true });
  for (const view of [full, short]) {
    const of = id => view.agents.find(item => item.sessionID === id);
    assert.equal(of('ses_b').waitingFor, 'approval');
    // An idle session is waiting for nobody, whatever the tracker still holds.
    assert.equal(of('ses_c').activity, 'idle'); assert.equal(Object.hasOwn(of('ses_c'), 'waitingFor'), false);
  }
  assert.deepEqual(refreshed[0], ['ses_a', 'ses_b']);
  await engine.send('ses_a', request());
  const stored = Object.values(f.history('none').messages)[0];
  assert.equal(JSON.stringify(stored).includes('waitingFor'), false);
  assert.equal(JSON.stringify(f.data.get('collaboration.v1')).includes('waitingFor'), false);
});
test('an agent sees its own teams in full, and other teams with only their listed members', async () => {
  const f = fixture();
  f.agents.push({ id: 'ses_e', title: 'Erin', agent: 'build', projectID: 'project_a', location: { directory: '/a' }, time: {} },
    { id: 'ses_f', title: 'Finn', agent: 'build', projectID: 'project_c', location: { directory: '/secret/client' }, time: {} });
  for (const id of ['ses_a', 'ses_c', 'ses_f']) await f.engine.manage(id, 'discovery.register');
  // ses_e joins while listed, then leaves the list but stays in the team.
  await f.engine.manage('ses_e', 'discovery.register');
  const other = await f.engine.teamManage('team.create', { name: 'Client X', members: ['ses_c', 'ses_e', 'ses_f'] }, f.data.get('collaboration.v1').revision);
  await f.engine.manage('ses_e', 'discovery.unregister');
  const own = await f.engine.teamManage('team.create', { name: 'Mine', members: ['ses_a'] }, f.data.get('collaboration.v1').revision);
  await f.engine.manage('ses_a', 'connection.create', { members: ['ses_a', 'ses_c'], minutes: 5 }).catch(() => {});
  const view = await f.engine.snapshot('ses_b');
  const seen = view.teams.find(team => team.id === other.id);
  assert.deepEqual(seen, { id: other.id, name: 'Client X', members: ['ses_c', 'ses_f'], membersShown: 'listed' });
  assert.equal(Object.hasOwn(view.people, 'ses_e'), false);
  assert.equal(JSON.stringify(view).includes('ses_e'), false);
  assert.deepEqual(view.connections, []);
  // Its own team is shown in full, and so are its unlisted teammates.
  const mine = await f.engine.snapshot('ses_a');
  assert.deepEqual(mine.teams.find(team => team.id === own.id).members, ['ses_a']);
  // The user still sees everything.
  const user = await f.engine.snapshot();
  assert.deepEqual(user.teams.find(team => team.id === other.id).members, ['ses_c', 'ses_e', 'ses_f']);
  assert.equal(Object.hasOwn(user.teams.find(team => team.id === other.id), 'membersShown'), false);
});
test('an agent changing its own listing or labels does not cancel a pending approval or a user edit', async () => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const entered = [];
  const f = await registeredFixture({ approve: async (...args) => { entered.push(args); await held; } });
  const revision = f.data.get('collaboration.v1').revision;
  const pending = f.engine.manage('ses_a', 'team.create', { name: 'Pending', members: ['ses_a', 'ses_b'] });
  while (!entered.length) await new Promise(resolve => setTimeout(resolve, 1));
  await f.engine.manage('ses_c', 'discovery.unregister');
  await f.engine.manage('ses_c', 'discovery.register');
  await f.engine.manage('ses_c', 'profile.update', { name: 'Carol', role: 'Spammer' });
  assert.equal(f.data.get('collaboration.v1').revision, revision);
  release();
  assert.equal((await pending).name, 'Pending');
  // A user edit made from the earlier snapshot still goes through.
  await f.engine.teamManage('team.create', { name: 'User edit', members: ['ses_a'] }, revision + 1);
});
test('a self-only change that changes nothing saves nothing', async () => {
  const f = await registeredFixture();
  await f.engine.manage('ses_a', 'profile.update', { name: 'Ada', role: 'Lead' });
  const before = structuredClone(f.data.get('collaboration.v1'));
  const activity = f.history('general').audit.length;
  assert.deepEqual(await f.engine.manage('ses_a', 'discovery.register'), { registered: true });
  assert.deepEqual(await f.engine.manage('ses_a', 'profile.update', { name: 'Ada', role: 'Lead' }), { name: 'Ada', role: 'Lead' });
  await f.engine.manage('ses_a', 'discovery.unregister');
  await f.engine.manage('ses_a', 'discovery.unregister');
  assert.equal(f.history('general').audit.length, activity + 1);
  assert.equal(f.data.get('collaboration.v1').revision, before.revision);
});
test('an agent flipping its own listing in a loop is stopped by the rate limit', async () => {
  const f = await registeredFixture({ limits: { messagesPerMinute: 4 } });
  // Registering in the fixture counted too, so start from a fresh minute.
  f.advance(60000);
  const flip = index => f.engine.manage('ses_a', index % 2 ? 'discovery.register' : 'discovery.unregister');
  for (let index = 0; index < 4; index++) await flip(index);
  await assert.rejects(flip(4), /rate_limit/);
  f.advance(60000);
  await flip(4);
});
test('closing a connection that is already closed changes nothing', async () => {
  const f = fixture();
  const connection = await connect(f);
  await f.engine.manage('ses_a', 'connection.close', { id: connection.id });
  const before = structuredClone(f.data.get('collaboration.v1'));
  f.advance(1000);
  for (let index = 0; index < 5; index++) assert.equal((await f.engine.manage('ses_a', 'connection.close', { id: connection.id })).closed, true);
  assert.deepEqual(f.data.get('collaboration.v1'), before);
});
test('every management action counts toward the per-minute limit, checked before any approval', async () => {
  const f = await registeredFixture({ limits: { messagesPerMinute: 3 } });
  f.advance(60000);
  await f.engine.configure({ capabilities: { createTeam: 'allow', changeMembers: 'allow' } });
  for (const name of ['One', 'Two', 'Three']) await f.engine.manage('ses_a', 'team.create', { name, members: ['ses_a'] });
  const approvals = f.approvals.length;
  await f.engine.configure({ capabilities: { createTeam: 'ask' } });
  await assert.rejects(f.engine.manage('ses_a', 'team.create', { name: 'Four', members: ['ses_a'] }), /rate_limit/);
  assert.equal(f.approvals.length, approvals);
  await assert.rejects(f.engine.send('ses_a', request()), /rate_limit/);
  f.advance(60000);
  assert.equal((await f.engine.manage('ses_a', 'team.create', { name: 'Four', members: ['ses_a'] })).name, 'Four');
});
test('names refuse "You", "user", and control or invisible characters, everywhere they can be set', async () => {
  const f = await registeredFixture();
  await f.engine.configure({ capabilities: { createSession: 'allow', createTeam: 'allow' } });
  for (const name of ['You', ' you ', 'USER', 'Bob\nApproval needed', 'Ali\u202Ece', 'Zero\u200Bwidth', 'Bell\u0007']) {
    await assert.rejects(f.engine.manage('ses_a', 'profile.update', { name }), /invalid_action_input/, name);
    await assert.rejects(f.engine.manage('ses_a', 'session.create', { ...child, name }), /invalid_action_input/, name);
    await assert.rejects(f.engine.profileManage('ses_b', { name, role: 'QA' }, f.data.get('collaboration.v1').revision), /invalid_profile/, name);
  }
  await assert.rejects(f.engine.manage('ses_a', 'profile.update', { role: 'Lead\u202E' }), /invalid_action_input/);
  for (const name of ['Bad\nteam', 'Hidden\u2066team']) {
    await assert.rejects(f.engine.manage('ses_a', 'team.create', { name, members: ['ses_a'] }), /invalid_action_input/, name);
    await assert.rejects(f.engine.teamManage('team.create', { name, members: ['ses_a'] }, f.data.get('collaboration.v1').revision), /invalid_team_name/, name);
  }
  // "You" is fine inside a longer name, and ordinary names with accents and emoji still work.
  assert.equal((await f.engine.manage('ses_a', 'profile.update', { name: 'Your helper José 🙂' })).name, 'Your helper José 🙂');
});
test('a native title is cleaned, and one that reads as You is marked as an agent', async () => {
  const f = await registeredFixture();
  await f.engine.configure({ capabilities: { createTeam: 'allow' } });
  f.agents.find(item => item.id === 'ses_b').title = 'You';
  f.agents.find(item => item.id === 'ses_c').title = 'Ca\u202Erol\nApproval needed';
  const view = await f.engine.snapshot();
  const name = id => view.agents.find(item => item.sessionID === id).name;
  assert.equal(name('ses_b'), 'You (agent)'); assert.equal(name('ses_c'), 'Carol Approval needed');
  await f.engine.manage('ses_b', 'team.create', { name: 'Payroll', members: ['ses_b'] });
  const entry = (await f.engine.snapshot(undefined, undefined, { scope: 'general' })).audit.concat((await f.engine.snapshot()).audit).find(item => item.action === 'team.create');
  assert.ok(entry);
  // Look-alike letters from other scripts count too, at input and when shown.
  f.agents.find(item => item.id === 'ses_b').title = 'Y\u043Eu';
  assert.equal((await f.engine.snapshot()).agents.find(item => item.sessionID === 'ses_b').name, 'Y\u043Eu (agent)');
  await assert.rejects(f.engine.manage('ses_a', 'profile.update', { name: '\u0443\u043Eu' }), /invalid_action_input/);
  await assert.rejects(f.engine.manage('ses_a', 'profile.update', { name: 'u\u0455\u0435\u0433' }), /invalid_action_input/);
});
test('look-alike spellings of You and user are caught without touching names in other scripts', async () => {
  const { isReservedName } = await import('../src/manage-schema.js');
  for (const name of ['You', 'yOU', 'USER', 'Υou', 'ϒou', 'Ꭹou', 'Υου', 'Yоu', 'Yоü', 'Ｙｏｕ', 'ᴜѕᴇʀ', 'uѕeг',
    'Y\u034Fou', 'Yo\uFE0Fu', 'Y\uFE00ou', 'Yo\u180Bu', 'You\u3164', 'You\uFFA0', 'You\u2800', 'us\u034Fer', 'Y\u0332ou'])
    assert.equal(isReservedName(name), true, name);
  for (const name of ['李明華', 'Yuo', 'Lou', 'Your', 'Yo', 'Joé', 'Sam', 'Ура', 'User 2', 'Οδυσσέας'])
    assert.equal(isReservedName(name), false, name);
});
test('setting a team to the members it already has saves nothing', async () => {
  const f = await registeredFixture();
  await f.engine.configure({ capabilities: { createTeam: 'allow', changeMembers: 'allow' } });
  const team = await f.engine.manage('ses_a', 'team.create', { name: 'Same', members: ['ses_a', 'ses_b'] });
  const before = structuredClone(f.data.get('collaboration.v1'));
  assert.deepEqual((await f.engine.manage('ses_a', 'team.members', { id: team.id, members: ['ses_a', 'ses_b'] })).members, ['ses_a', 'ses_b']);
  await f.engine.manage('ses_a', 'team.members', { id: team.id, members: ['ses_b', 'ses_a'] });
  assert.deepEqual(f.data.get('collaboration.v1'), before);
});
test('team names that only differ by case or look-alike characters count as the same', async () => {
  const f = await registeredFixture();
  await f.engine.configure({ capabilities: { createTeam: 'allow' } });
  await f.engine.manage('ses_a', 'team.create', { name: 'Research', members: ['ses_a'] });
  for (const name of ['research', 'RESEARCH ', 'Ｒｅｓｅａｒｃｈ']) {
    await assert.rejects(f.engine.manage('ses_a', 'team.create', { name, members: ['ses_a'] }), /team_name_exists/, name);
    await assert.rejects(f.engine.teamManage('team.create', { name, members: ['ses_a'] }, f.data.get('collaboration.v1').revision), /team_name_exists/, name);
  }
});
test('the user dashboard reads one scope, and older pages come from a larger limit', async () => {
  const f = await registeredFixture();
  const quiet = await f.engine.manage('ses_a', 'team.create', { name: 'Quiet', members: ['ses_a', 'ses_b'] });
  const busy = await f.engine.manage('ses_b', 'team.create', { name: 'Busy', members: ['ses_b', 'ses_c'] });
  await f.engine.send('ses_a', request());
  for (let index = 0; index < 3; index++) { f.advance(2100); await f.engine.send('ses_b', request(`b${index}`, { to: 'ses_c' })); }
  const reads = []; const get = f.dependencies.storage.get;
  f.dependencies.storage.get = async key => { reads.push(key); return get(key); };
  const view = await f.engine.snapshot(undefined, undefined, { scope: busy.id, limit: 2 });
  assert.equal(view.messages.length, 2); assert.equal(view.scopes.teams[busy.id].messages, 3);
  assert.equal(reads.includes(historyKey(quiet.id)), false);
  assert.equal((await f.engine.snapshot(undefined, undefined, { scope: busy.id, limit: 400 })).messages.length, 3);
});
test('a read with nothing to clean up writes nothing, and cleanup writes once', async () => {
  const f = await deletionFixture(); await f.engine.send('ses_a', request());
  let writes = 0; const { set, remove } = f.dependencies.storage;
  f.dependencies.storage.set = async (...args) => { writes++; return set(...args); };
  f.dependencies.storage.remove = async (...args) => { writes++; return remove(...args); };
  for (let index = 0; index < 10; index++) await f.engine.snapshot(undefined, undefined, { scope: f.team.id });
  assert.equal(writes, 0);
  f.advance(RETRY_WINDOW);
  await f.engine.snapshot(); await f.engine.snapshot();
  assert.equal(writes, 1);
});
test('deleting a session forgets its profile and registration, and old ended connections are removed', async () => {
  const f = await deletionFixture();
  await f.engine.manage('ses_c', 'profile.update', { name: 'Cee' });
  await register(f, 'ses_a', 'ses_b');
  const open = await f.engine.manage('ses_a', 'connection.create', { members: ['ses_a', 'ses_b'], minutes: 2 });
  await f.engine.manage('ses_a', 'connection.close', { id: open.id });
  f.forget('ses_c');
  await f.engine.reconcile();
  assert.equal(f.saved().profiles.ses_c, undefined); assert.equal(f.saved().discovery.registrations.ses_c, undefined);
  assert.ok(f.saved().connections[open.id]);
  f.advance(7 * 24 * 60 * 60 * 1000);
  await f.engine.maintain();
  assert.equal(f.saved().connections[open.id], undefined);
});
test('a session whose creation response is lost still counts, until the host reports it never existed', async () => {
  const f = fixture({ limits: { managedSessions: 1 } });
  const { create, get } = f.dependencies.session;
  f.dependencies.session.create = async input => { await create(input); throw new Error('response lost'); };
  await assert.rejects(f.engine.manage('ses_a', 'session.create', child), /response lost/);
  f.dependencies.session.create = create;
  await assert.rejects(f.engine.manage('ses_a', 'session.create', child), /session_creation_limit/);
  const id = Object.keys(f.data.get('collaboration.v1').created)[0];
  f.agents.splice(f.agents.findIndex(item => item.id === id), 1);
  f.dependencies.session.get = async input => {
    if (input.sessionID === id) throw Object.assign(new Error(''), { _tag: 'Session.NotFoundError', sessionID: id });
    return get(input);
  };
  await f.engine.reconcile();
  assert.deepEqual(f.data.get('collaboration.v1').created, {});
});
// Fails each write in turn, which is also what a crash at that point leaves behind, then restarts the engine.
function failWrite(f, target) {
  const { set, remove } = f.dependencies.storage;
  let count = 0, failed = false;
  const fail = run => async (...args) => {
    if (count++ === target) { failed = true; throw new Error('disk failed'); }
    return run(...args);
  };
  f.dependencies.storage.set = fail(set); f.dependencies.storage.remove = fail(remove);
  return { restore: () => { f.dependencies.storage.set = set; f.dependencies.storage.remove = remove; return failed; } };
}
const dispatchedTwice = f => { const ids = f.calls.map(call => call.metadata.agentTeamsForOpencode.id); return new Set(ids).size !== ids.length; };
const countOf = (f, text) => f.calls.filter(call => JSON.parse(call.text.split('\n')[1]).body === text).length;
test('no failed write during a send that trims history can make a retry send anything twice', async () => {
  for (let target = 0; ; target++) {
    const f = fixture({ limits: { records: 1 } });
    await f.engine.send('ses_a', request('k0', { text: 'first' }));
    const fault = failWrite(f, target);
    await f.engine.send('ses_a', request('k1', { text: 'second' })).catch(() => {});
    if (!fault.restore()) break;
    const next = createEngine(f.dependencies);
    assert.equal((await next.send('ses_a', request('k0', { text: 'first' }))).id, f.calls[0].id, `retry after failed write ${target}`);
    await next.send('ses_a', request('k1', { text: 'second' }));
    assert.equal(countOf(f, 'first'), 1, `first message after failed write ${target}`);
    assert.equal(countOf(f, 'second'), 1, `second message after failed write ${target}`);
    assert.equal(dispatchedTwice(f), false);
  }
});
test('no failed write during team deletion can lose the history of a surviving team or resend its messages', async () => {
  for (let target = 0; ; target++) {
    const f = await registeredFixture();
    const team = await f.engine.manage('ses_a', 'team.create', { name: 'Doomed', members: ['ses_a', 'ses_b'] });
    const message = await f.engine.send('ses_a', request('k0', { text: 'kept' }));
    const fault = failWrite(f, target);
    const refused = await f.engine.teamManage('team.delete', { id: team.id }, f.data.get('collaboration.v1').revision).then(() => false, () => true);
    if (!fault.restore()) { assert.equal(refused, false); break; }
    const next = createEngine(f.dependencies);
    await next.reconcile();
    const saved = f.data.get('collaboration.v1');
    if (saved.teams[team.id]) {
      assert.ok(f.history(team.id).messages[message.id], `history kept after failed write ${target}`);
      assert.equal((await next.snapshot(undefined, undefined, { scope: team.id })).messages.length, 1);
      await next.acknowledge('ses_b', message.id);
    } else {
      assert.equal(f.data.has(historyKey(team.id)), false, `removal finished after failed write ${target}`);
      assert.equal(f.data.get(INDEX_KEY)?.[message.id], undefined);
    }
    await next.send('ses_a', request('k0', { text: 'kept' }));
    assert.equal(countOf(f, 'kept') <= 2, true);
    if (saved.teams[team.id]) assert.equal(countOf(f, 'kept'), 1, `retry after failed write ${target}`);
  }
});
test('a retry key whose message is gone reports uncertainty and never sends again', async () => {
  const f = fixture();
  const first = await f.engine.send('ses_a', request());
  delete f.history('none').messages[first.id];
  const retry = await createEngine(f.dependencies).send('ses_a', request());
  assert.equal(retry.id, first.id); assert.equal(retry.status, 'uncertain'); assert.equal(retry.error, 'message_record_lost');
  assert.equal(f.calls.length, 1);
  f.advance(RETRY_WINDOW);
  assert.notEqual((await f.engine.send('ses_a', request())).id, first.id);
});
test('a message saved before a failed first commit was never sent, so it leaves no trace', async () => {
  const f = fixture();
  const original = f.dependencies.storage.set;
  f.dependencies.storage.set = async (key, value) => { if (key === 'collaboration.v1') throw new Error('disk failed'); return original(key, value); };
  await assert.rejects(f.engine.send('ses_a', request()), /disk failed/);
  f.dependencies.storage.set = original;
  assert.equal(f.calls.length, 0);
  const next = createEngine(f.dependencies);
  assert.equal((await next.snapshot(undefined, undefined, { scope: 'none' })).messages.length, 0);
  assert.equal((await next.send('ses_a', request())).status, 'accepted'); assert.equal(f.calls.length, 1);
  assert.equal(Object.keys(f.history('none').messages).length, 1);
});
test('a sent message whose final save failed is still shown as uncertain after its retry key expires', async () => {
  const f = fixture();
  const original = f.dependencies.storage.set;
  f.dependencies.storage.set = async (key, value) => { if (f.calls.length) throw new Error('disk failed'); return original(key, value); };
  await f.engine.send('ses_a', request()).catch(() => {});
  f.dependencies.storage.set = original;
  assert.equal(f.calls.length, 1);
  assert.equal(Object.values(f.history('none').messages)[0].status, 'sending');
  f.advance(RETRY_WINDOW);
  const next = createEngine(f.dependencies);
  await next.maintain();
  const shown = (await next.snapshot(undefined, undefined, { scope: 'none' })).messages;
  assert.equal(shown.length, 1); assert.equal(shown[0].status, 'uncertain');
  await next.send('ses_a', request('later'));
  assert.equal(Object.keys(f.history('none').messages).length, 2); assert.equal(f.calls.length, 2);
});
test('startup repairs what an interruption left: orphan files, the index and counts', async () => {
  const f = await registeredFixture();
  const team = await f.engine.manage('ses_a', 'team.create', { name: 'Live', members: ['ses_a', 'ses_b'] });
  const message = await f.engine.send('ses_a', request());
  f.data.set(historyKey('team_gone'), { messages: { msg_orphan: { id: 'msg_orphan' } }, conversations: {}, audit: [] });
  f.data.set(INDEX_KEY, { msg_stale: team.id, msg_orphan: 'team_gone' });
  f.data.get('collaboration.v1').counts[team.id].messages = 9;
  f.data.get('collaboration.v1').counts.team_gone = { messages: 1, activity: 0 };
  await createEngine(f.dependencies).reconcile();
  assert.equal(f.data.has(historyKey('team_gone')), false);
  assert.deepEqual(f.data.get(INDEX_KEY), { [message.id]: team.id });
  const saved = f.data.get('collaboration.v1');
  assert.equal(saved.counts[team.id].messages, 1); assert.equal(saved.counts.team_gone, undefined);
  await f.engine.acknowledge('ses_b', message.id);
});
test('a message that has aged out gets a refusal that says so', async () => {
  const f = fixture({ limits: { records: 1 } });
  const first = await f.engine.send('ses_a', request());
  await f.engine.send('ses_a', request('two'));
  f.advance(RETRY_WINDOW);
  const reply = await f.engine.send('ses_b', request('late', { to: 'ses_a', replyTo: first.id })).catch(error => error);
  assert.equal(reply.code, 'invalid_reply'); assert.match(reply.details.remedy, /aged out/);
  const ack = await f.engine.acknowledge('ses_b', first.id).catch(error => error);
  assert.equal(ack.code, 'not_message_recipient'); assert.match(ack.details.remedy, /aged out/);
});
test('an unlisted member is named in the Activity it appears in', async () => {
  const f = fixture();
  await f.engine.manage('ses_a', 'profile.update', { name: 'Ada' });
  assert.equal((await f.engine.snapshot(undefined, undefined, { scope: 'general' })).people.ses_a.name, 'Ada');
});
test('profile.update accepts name or role alone for the acting session', async () => {
  const f = fixture(); await f.engine.manage('ses_a', 'discovery.register');
  await f.engine.manage('ses_a', 'profile.update', { role: 'Lead' });
  assert.deepEqual((({ name, role }) => ({ name, role }))((await f.engine.snapshot()).agents[0]), { name: 'Alice', role: 'Lead' });
  await f.engine.manage('ses_a', 'profile.update', { name: 'Ada' });
  const state = await f.engine.snapshot();
  assert.equal(state.agents[0].name, 'Ada'); assert.equal(state.agents[0].role, 'Lead');
  assert.deepEqual(state.audit.at(-1).data.profile, { name: 'Ada', role: 'Lead' });
  await assert.rejects(f.engine.manage('ses_a', 'profile.update', {}), error => error.details.missing.length === 1);
  const message = await f.engine.send('ses_a', request());
  assert.equal(message.sender.name, 'Ada'); assert.equal(f.calls[0].metadata.agentTeamsForOpencode.senderName, 'Ada');
});
test('discover reports self capabilities, quota and remaining messages', async () => {
  const f = fixture({ catalog, limits: { messagesPerMinute: 5 } });
  await f.engine.configure({ capabilities: { createSession: 'allow', createTeam: 'deny' } });
  const created = await f.engine.manage('ses_a', 'session.create', child);
  await f.engine.send('ses_a', request());
  const view = await f.engine.snapshot('ses_a');
  assert.ok(view.agents.some(item => item.sessionID === created.id));
  assert.equal(view.self.sessionID, 'ses_a');
  assert.deepEqual(view.self.capabilities, { ...DEFAULT_CAPABILITIES, createSession: 'allow', createTeam: 'deny' });
  assert.deepEqual(view.self.quota.managedSessions, { used: 1, limit: 16, unlisted: 0 });
  // The session creation and the message both count.
  assert.equal(view.self.messages.perMinuteRemaining, 3);
  assert.equal(Object.hasOwn(view.self, 'catalog'), false);
  const compact = await f.engine.snapshot('ses_a', undefined, { compact: true, catalog: true });
  assert.deepEqual(Object.keys(compact).sort(), ['agents', 'connections', 'discovery', 'revision', 'self', 'teams', 'unacknowledged']);
  assert.deepEqual(compact.self.catalog.agents.map(item => item.id), ['build', 'plan', 'general']);
  assert.equal((await f.engine.snapshot()).self, undefined);
});

test('connections have no kind and an agent-supplied kind is refused', async () => {
  const f = fixture();
  const connection = await connect(f);
  assert.equal(Object.hasOwn(connection, 'kind'), false);
  await assert.rejects(f.engine.manage('ses_a', 'connection.create', { members: ['ses_a', 'ses_c'], kind: 'exchange' }), /invalid_action_input/);
});

// The plugin context's answer for a session that does not exist.
const notFound = sessionID => Object.assign(new Error(''), { _tag: 'Session.NotFoundError', sessionID });
async function deletionFixture(options) {
  const f = await registeredFixture(options);
  f.dependencies.session.get = async ({ sessionID }) => {
    const item = f.agents.find(agent => agent.id === sessionID);
    if (!item) throw notFound(sessionID);
    return structuredClone(item);
  };
  const team = await f.engine.manage('ses_a', 'team.create', { name: 'Release', members: ['ses_a', 'ses_b', 'ses_c'] });
  const forget = id => f.agents.splice(f.agents.findIndex(agent => agent.id === id), 1);
  return { ...f, team, forget, saved: () => f.data.get('collaboration.v1'), counts: () => [f.approvals.length, f.calls.length] };
}
test('a deleted session event removes the member with one revision and a system audit entry', async () => {
  const f = await deletionFixture(); await f.engine.snapshot();
  const before = f.saved().revision, counts = f.counts();
  f.forget('ses_b'); await f.engine.sessionDeleted('ses_b');
  const saved = f.saved();
  assert.deepEqual(saved.teams[f.team.id].members, ['ses_a', 'ses_c']);
  assert.equal(saved.revision, before + 1);
  assert.deepEqual(f.history(f.team.id).audit.at(-1), { at: 1000000, actor: 'system', action: 'team.member.removed',
    data: { teamID: f.team.id, teamName: 'Release', sessionID: 'ses_b', name: 'Bob' } });
  assert.deepEqual(f.counts(), counts);
});
test('a repeated event from another location instance and an event for a non-member change nothing', async () => {
  const f = await deletionFixture();
  await f.engine.sessionDeleted('ses_b');
  const saved = structuredClone(f.saved());
  let writes = 0; const set = f.dependencies.storage.set;
  f.dependencies.storage.set = async (...args) => { writes++; return set(...args); };
  await f.engine.sessionDeleted('ses_b'); await f.engine.sessionDeleted('ses_other');
  assert.equal(writes, 0); assert.deepEqual(f.saved(), saved);
});
test('concurrent events for different members both apply through the queue', async () => {
  const f = await deletionFixture();
  await Promise.all([f.engine.sessionDeleted('ses_b'), f.engine.sessionDeleted('ses_c')]);
  assert.deepEqual(f.saved().teams[f.team.id].members, ['ses_a']);
});
test('a deleted session leaves every team it belonged to in a single revision', async () => {
  const f = await deletionFixture();
  const other = await f.engine.manage('ses_a', 'team.create', { name: 'Other', members: ['ses_a', 'ses_b'] });
  const before = f.saved().revision;
  await f.engine.sessionDeleted('ses_b');
  assert.deepEqual(f.saved().teams[f.team.id].members, ['ses_a', 'ses_c']);
  assert.deepEqual(f.saved().teams[other.id].members, ['ses_a']);
  assert.equal(f.saved().revision, before + 1);
  assert.equal(f.history(f.team.id).audit.at(-1).data.teamName, 'Release');
  assert.equal(f.history(other.id).audit.at(-1).data.teamName, 'Other');
});
test('removal invalidates a stale user write', async () => {
  const f = await deletionFixture();
  const { revision } = await f.engine.snapshot();
  await f.engine.sessionDeleted('ses_c');
  await assert.rejects(f.engine.teamManage('team.update', { id: f.team.id, name: 'Renamed', members: ['ses_a', 'ses_b'] }, revision), /state_changed_request_again/);
  assert.equal(f.saved().teams[f.team.id].name, 'Release');
});
test('an agent request waiting for approval is refused when a member is deleted meanwhile', async () => {
  let engine;
  const f = await deletionFixture({ approve: async (actor, action) => {
    if (action === 'team.members') await engine.sessionDeleted('ses_c');
  } });
  engine = f.engine;
  await assert.rejects(f.engine.manage('ses_a', 'team.members', { id: f.team.id, members: ['ses_a', 'ses_b', 'ses_c'] }), /state_changed_request_again/);
  assert.deepEqual(f.saved().teams[f.team.id].members, ['ses_a', 'ses_b']);
});
test('reconciliation removes a member after a missed event, at startup and on a read', async () => {
  const f = await deletionFixture();
  f.forget('ses_c');
  const before = f.saved().revision;
  await createEngine(f.dependencies).reconcile();
  assert.deepEqual(f.saved().teams[f.team.id].members, ['ses_a', 'ses_b']);
  assert.equal(f.saved().revision, before + 1);
  f.forget('ses_b');
  const view = await f.engine.snapshot();
  assert.deepEqual(view.teams[0].members, ['ses_a']);
  assert.equal(view.revision, before + 2); assert.equal(view.audit.at(-1).action, 'team.member.removed');
  await f.engine.reconcile(); await f.engine.snapshot();
  assert.equal(f.saved().revision, before + 2);
});
test('an agent read also reconciles, without showing the system entry in its own audit', async () => {
  const f = await deletionFixture();
  f.forget('ses_c');
  const view = await f.engine.snapshot('ses_a');
  assert.deepEqual(view.teams[0].members, ['ses_a', 'ses_b']);
  assert.ok(!view.audit.some(item => item.actor === 'system'));
  assert.equal(f.history(f.team.id).audit.at(-1).action, 'team.member.removed');
});
test('a failed or malformed listing removes nobody, even when sessions are really gone', async () => {
  const f = await deletionFixture();
  f.forget('ses_c');
  const saved = structuredClone(f.saved()), list = f.dependencies.session.list;
  for (const failure of [async () => { throw new Error('host offline'); }, async () => ({ data: 'bad', cursor: {} }), async () => ({ data: [] }),
    async () => ({ data: f.agents.slice(0, 1), cursor: { next: 'same' } })]) {
    f.dependencies.session.list = failure;
    await assert.rejects(f.engine.reconcile());
    await assert.rejects(f.engine.snapshot());
    assert.deepEqual(f.saved(), saved);
  }
  f.dependencies.session.list = list;
  await f.engine.reconcile();
  assert.deepEqual(f.saved().teams[f.team.id].members, ['ses_a', 'ses_b']);
});
test('a partial listing removes nobody while the sessions still exist', async () => {
  const f = await deletionFixture();
  const saved = structuredClone(f.saved());
  f.dependencies.session.list = async () => ({ data: [], cursor: {} });
  await f.engine.reconcile(); await f.engine.snapshot();
  assert.deepEqual(f.saved(), saved);
});
test('only a not-found answer for that exact session confirms deletion', async () => {
  const f = await deletionFixture();
  f.dependencies.session.list = async () => ({ data: [], cursor: {} });
  const saved = structuredClone(f.saved());
  for (const answer of [() => { throw new Error('Session not found'); }, () => { throw Object.assign(new Error(''), { _tag: 'SchemaError' }); },
    () => { throw notFound('ses_someone_else'); }, () => { throw Object.assign(new Error(''), { _tag: 'Session.NotFoundError' }); },
    () => { throw undefined; }, () => undefined]) {
    f.dependencies.session.get = async () => answer();
    await f.engine.reconcile();
    assert.deepEqual(f.saved(), saved);
  }
  f.dependencies.session.get = async ({ sessionID }) => { throw Object.assign(new Error('gone'), { _tag: 'SessionNotFoundError', sessionID }); };
  await f.engine.reconcile();
  assert.deepEqual(f.saved().teams, {});
});
test('a failed confirmation for one member does not block a confirmed removal of another', async () => {
  const f = await deletionFixture();
  f.dependencies.session.list = async () => ({ data: f.agents.filter(agent => agent.id === 'ses_a'), cursor: {} });
  f.dependencies.session.get = async ({ sessionID }) => { if (sessionID === 'ses_b') throw new Error('timeout'); throw notFound(sessionID); };
  await f.engine.reconcile();
  assert.deepEqual(f.saved().teams[f.team.id].members, ['ses_a', 'ses_b']);
});
test('an archived session keeps its membership, listed or not', async () => {
  const f = await deletionFixture();
  f.agents.find(agent => agent.id === 'ses_b').time = { archived: 2000 };
  const saved = structuredClone(f.saved());
  await f.engine.reconcile(); await f.engine.snapshot();
  assert.deepEqual(f.saved(), saved);
  f.dependencies.session.list = async () => ({ data: f.agents.filter(agent => !agent.time.archived), cursor: {} });
  await f.engine.reconcile(); await f.engine.snapshot();
  assert.deepEqual(f.saved(), saved);
});
test('deleting the last member clears team history and leaves one removal notice outside teams', async () => {
  const f = await registeredFixture();
  const solo = await f.engine.manage('ses_a', 'team.create', { name: 'Solo', members: ['ses_a'] });
  const pair = await f.engine.manage('ses_b', 'team.create', { name: 'Pair', members: ['ses_b', 'ses_a'] });
  const before = f.data.get('collaboration.v1').revision;
  await f.engine.sessionDeleted('ses_a');
  const saved = f.data.get('collaboration.v1');
  assert.equal(Object.hasOwn(saved.teams, solo.id), false);
  assert.deepEqual(saved.teams[pair.id].members, ['ses_b']);
  assert.equal(saved.revision, before + 1);
  assert.deepEqual((({ actor, action, data }) => [actor, action, data.teamName])(f.history('general').audit.at(-1)), ['system', 'team.removed', 'Solo']);
  assert.deepEqual((({ actor, action, data }) => [actor, action, data.teamName])(f.history(pair.id).audit.at(-1)), ['system', 'team.member.removed', 'Pair']);
  assert.equal(f.data.has(historyKey(solo.id)), false);
  assert.deepEqual((await f.engine.snapshot()).teams.map(team => team.id), [pair.id]);
  await f.engine.manage('ses_b', 'team.create', { name: 'Solo', members: ['ses_b'] });
});
test('removal needs no capability, even when every capability is denied', async () => {
  const f = await deletionFixture();
  await f.engine.configure({ capabilities: Object.fromEntries(Object.keys(DEFAULT_CAPABILITIES).map(key => [key, 'deny'])) });
  const counts = f.counts();
  await f.engine.sessionDeleted('ses_b');
  f.forget('ses_c'); await f.engine.reconcile();
  assert.deepEqual(f.saved().teams[f.team.id].members, ['ses_a']);
  assert.deepEqual(f.counts(), counts);
});
test('connections and message records keep a deleted session', async () => {
  const f = await deletionFixture();
  const connection = await connect(f), message = await f.engine.send('ses_a', request());
  const { connections } = structuredClone(f.saved()), messages = structuredClone(f.history(f.team.id).messages);
  f.forget('ses_b'); f.forget('ses_c'); await f.engine.reconcile();
  assert.deepEqual(f.saved().teams[f.team.id].members, ['ses_a']);
  assert.deepEqual(f.saved().connections, connections); assert.deepEqual(f.history(f.team.id).messages, messages);
  assert.ok(f.saved().connections[connection.id].members.includes('ses_c'));
  assert.equal(f.history(f.team.id).messages[message.id].to, 'ses_b');
});
test('saved data naming a session that has since been deleted reconciles at startup', async () => {
  const f = fixture();
  f.data.set('collaboration.v1', { version: 1, revision: 7, operations: {}, profiles: { ses_gone: { name: 'Gone', role: 'Old' } }, rate: {}, connections: {},
    capabilities: { ...DEFAULT_CAPABILITIES }, discovery: { mode: 'registered', registrations: {} },
    teams: { team_old: { id: 'team_old', name: 'Old', members: ['ses_a', 'ses_gone'] } } });
  f.dependencies.session.get = async ({ sessionID }) => {
    if (sessionID === 'ses_gone') throw notFound(sessionID);
    return structuredClone(f.agents.find(agent => agent.id === sessionID));
  };
  await f.engine.reconcile();
  const saved = f.data.get('collaboration.v1');
  assert.deepEqual(saved.teams.team_old.members, ['ses_a']); assert.equal(saved.revision, 8);
  assert.equal(f.history('team_old').audit.at(-1).data.name, 'Gone');
  assert.equal(saved.profiles.ses_gone, undefined);
});
test('a member with no known name is audited without one', async () => {
  const f = await deletionFixture();
  await createEngine(f.dependencies).sessionDeleted('ses_b');
  assert.equal(Object.hasOwn(f.history(f.team.id).audit.at(-1).data, 'name'), false);
});
test('a failed save during removal leaves the saved membership unchanged', async () => {
  const f = await deletionFixture();
  const saved = structuredClone(f.saved()), set = f.dependencies.storage.set;
  f.dependencies.storage.set = async () => { throw new Error('disk unavailable'); };
  await assert.rejects(f.engine.sessionDeleted('ses_b'), /disk unavailable/);
  assert.deepEqual(f.saved(), saved);
  f.dependencies.storage.set = set;
  await f.engine.sessionDeleted('ses_b');
  assert.deepEqual(f.saved().teams[f.team.id].members, ['ses_a', 'ses_c']);
});

test('naming a deleted session gets a clear refusal, while other host failures still surface', async () => {
  const f = await registeredFixture();
  const team = await f.engine.manage('ses_a', 'team.create', { name: 'Review', members: ['ses_a'] });
  const connection = await connect(f);
  const real = f.dependencies.session.get;
  const failing = (id, failure) => { f.dependencies.session.get = async input => { if (input.sessionID === id) throw failure; return real(input); }; };
  failing('ses_b', notFound('ses_b'));
  await assert.rejects(f.engine.send('ses_a', request()), /invalid_session/);
  await assert.rejects(f.engine.manage('ses_a', 'team.members', { id: team.id, members: ['ses_a', 'ses_b'] }), /invalid_session/);
  failing('ses_c', notFound('ses_c'));
  await assert.rejects(f.engine.manage('ses_a', 'connection.extend', { id: connection.id }), /invalid_session/);
  await f.engine.manage('ses_a', 'connection.close', { id: connection.id });
  failing('ses_b', new Error('timeout'));
  await assert.rejects(f.engine.send('ses_a', request('key2')), /timeout/);
  failing('ses_b', notFound('ses_other'));
  await assert.rejects(f.engine.send('ses_a', request('key3')), error => error._tag === 'Session.NotFoundError');
});
