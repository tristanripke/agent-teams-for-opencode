import test from 'node:test';
import assert from 'node:assert/strict';
import { Tool } from '@opencode/schema/tool';
import plugin, { toolError, verifyContext } from '../src/server.js';
import { Collaboration } from '../src/rpc.js';
import { DEFAULT_CAPABILITIES } from '../src/core.js';

function host(state = new Map()) {
  const tools = new Map(), hooks = [], registered = [], pending = [], synthetic = [];
  let handlers, count = 0, wake = () => {};
  const peer = id => ({ id, title: id, projectID: 'a', location: { directory: '/a' }, time: {} });
  const context = {
    app: { version: '2.2.5' }, options: {}, location: { directory: '/a' },
    storage: { get: async key => structuredClone(state.get(key)), set: async (key, value) => state.set(key, structuredClone(value)), remove: async key => { state.delete(key); },
      scan: async ({ prefix }) => ({ entries: [...state.keys()].filter(key => key.startsWith(prefix)).sort().map(key => ({ key, value: structuredClone(state.get(key)) })) }) },
    agent: { list: async () => ({ data: [{ id: 'build', name: 'Build', mode: 'primary', hidden: false },
      { id: 'plan', name: 'Plan', mode: 'all', hidden: false }, { id: 'explore', name: 'Explore', mode: 'subagent', hidden: false },
      { id: 'secret', name: 'Secret', mode: 'primary', hidden: true }] }) },
    model: { list: async () => ({ data: [{ providerID: 'prov', id: 'chat', name: 'Chat', enabled: true, type: 'chat', variants: [{ id: 'fast' }] },
      { providerID: 'prov', id: 'off', name: 'Off', enabled: false, type: 'chat', variants: [] }] }) },
    session: {
      list: async () => ({ data: [peer('ses_a'), peer('ses_b')], cursor: {} }),
      get: async ({ sessionID }) => peer(sessionID),
      create: async input => ({ ...peer(input.id), ...input }),
      synthetic: async input => { synthetic.push(input); return { id: input.id }; },
    },
    permission: {
      hook: async (_event, handler) => { hooks.push(handler); return registration(); },
      assert: async input => {
        const evaluation = { ...input, effect: 'allow' };
        for (const hook of hooks) await hook(evaluation);
        assert.equal(evaluation.effect, 'ask'); count++;
      },
    },
    tool: { transform: async run => {
      let namespace;
      run({ namespace: item => { namespace = item.name; }, add: tool => tools.set(`${namespace}_${tool.name}`, tool) });
      return registration();
    } },
    rpc: { register: async (definition, implementation) => {
      assert.equal(definition.id, Collaboration.id); handlers = implementation; return registration();
    } },
    event: { async *subscribe({ signal }) {
      signal.addEventListener('abort', () => wake(), { once: true });
      while (!signal.aborted) {
        if (pending.length) yield pending.shift();
        else await new Promise(resolve => { wake = resolve; });
      }
    } },
  };
  function registration() {
    const item = { disposed: false, dispose: async () => { item.disposed = true; } }; registered.push(item); return item;
  }
  return { context, tools, hooks, registered, state, synthetic, emit: event => { pending.push(event); wake(); },
    drained: () => pending.length === 0, get handlers() { return handlers; }, get approvals() { return count; } };
}
const saved = f => f.state.get('collaboration.v1');
const missing = sessionID => Object.assign(new Error(''), { _tag: 'Session.NotFoundError', sessionID });
test('the package name and plugin ID are the same', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(manifest.name, 'agent-teams-for-opencode');
  assert.equal(lock.name, manifest.name); assert.equal(lock.packages[''].name, manifest.name);
  assert.equal(plugin.id, 'agent-teams-for-opencode');
  // Published to npm, so only the plugin itself ships, without the tests and scripts.
  assert.equal(manifest.private, undefined);
  assert.deepEqual([...manifest.files].sort(), ['LICENSE', 'README.md', 'THIRD_PARTY_LICENSES', 'dist', 'docs', 'src']);
});
async function until(predicate) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('condition was not reached');
}
async function seedTeam(f, members) {
  for (const sessionID of members) await f.tools.get('peers_manage').execute({ action: 'discovery.register', input: {} }, { sessionID });
  const { revision } = await f.handlers.snapshot();
  return f.handlers.teamManage({ action: 'team.create', input: { name: 'Release', members }, revision });
}

test('plugin registers native tools and RPC, then disposes all registrations', async () => {
  const f = host(), cleanup = await plugin.setup(f.context);
  assert.deepEqual([...f.tools.keys()], ['peers_discover', 'peers_send', 'peers_acknowledge', 'peers_manage']);
  assert.equal((await f.handlers.snapshot()).agents.length, 0);
  await f.tools.get('peers_manage').execute({ action: 'discovery.register', input: {} }, { sessionID: 'ses_a' });
  assert.deepEqual((await f.handlers.snapshot()).discovery.registered, ['ses_a']);
  await cleanup(); assert.ok(f.registered.every(item => item.disposed));
});
test('approval hook forces ask for collaboration approvals and preserves deny', async () => {
  const f = host(), cleanup = await plugin.setup(f.context);
  const hook = f.hooks[0];
  const allowed = { action: 'agentTeamsForOpencode.approve.policy', effect: 'allow' };
  const denied = { action: 'agentTeamsForOpencode.approve.policy', effect: 'deny' };
  const unrelated = { action: 'read', effect: 'allow' };
  hook(allowed); hook(denied); hook(unrelated);
  assert.equal(allowed.effect, 'ask'); assert.equal(denied.effect, 'deny'); assert.equal(unrelated.effect, 'allow');
  await cleanup();
});
test('agent tool binds sender identity to the native execution context', async () => {
  const f = host(), cleanup = await plugin.setup(f.context);
  const result = await f.tools.get('peers_send').execute({ to: 'ses_b', key: 'identity', text: 'Hello', from: 'ses_c' }, { sessionID: 'ses_a' });
  const message = JSON.parse(result.content);
  assert.equal(message.from, 'ses_a'); assert.match(message.id, /^msg_/);
  await cleanup();
});
test('send tool tells agents that messages steer without claiming delivery or acknowledgement', async () => {
  const f = host(), cleanup = await plugin.setup(f.context);
  try {
    const tool = f.tools.get('peers_send');
    assert.match(tool.description, /steering synthetic peer message/);
    assert.match(tool.description, /next step boundary/);
    assert.match(tool.description, /wakes idle recipients/);
    assert.match(tool.description, /does not cancel an in-flight model or tool call/);
    assert.match(tool.description, /admission status, not delivery or recipient acknowledgement/);
    assert.match(tool.description, /15 minutes from the first attempt/);
    assert.match(tool.description, /until its team is deleted/);
    assert.match(tool.description, /same key is a new send/);
    const result = await tool.execute({ to: 'ses_b', key: 'steering', text: 'Please adjust the plan.' }, { sessionID: 'ses_a' });
    const message = JSON.parse(result.content);
    assert.equal(message.delivery, 'steer'); assert.equal(message.status, 'accepted');
    assert.equal(message.retryUntil - message.at, 15 * 60 * 1000);
  } finally { await cleanup(); }
});
test('snapshot RPC forwards history scope without restricting the viewer to team membership', async () => {
  const f = host(), cleanup = await plugin.setup(f.context);
  try {
    const team = await seedTeam(f, ['ses_a', 'ses_b']);
    const send = f.tools.get('peers_send');
    await send.execute({ to: 'ses_b', key: 'team', text: 'Team history' }, { sessionID: 'ses_a' });
    await send.execute({ to: 'ses_c', key: 'connection', text: 'Outside-team history' }, { sessionID: 'ses_a' });
    await f.handlers.configure({ discoveryMode: 'automatic' });
    const teamView = await f.handlers.snapshot({ sessionID: 'ses_c', scope: team.id });
    assert.deepEqual(teamView.messages.map(item => item.text), ['Team history']);
    assert.equal(teamView.scopes.teams[team.id].messages, 1);
    const connections = await f.handlers.snapshot({ scope: 'none' });
    assert.deepEqual(connections.messages.map(item => item.text), ['Outside-team history']);
    const general = await f.handlers.snapshot({ scope: 'general' });
    assert.equal(general.messages.length, 0); assert.equal(general.audit.at(-1).action, 'settings.update');
  } finally { await cleanup(); }
});
test('location instances share one maintenance timer, which is disposed after the last instance', async () => {
  const first = host(), second = host(first.state);
  const closeFirst = await plugin.setup(first.context), closeSecond = await plugin.setup(second.context);
  const shared = globalThis[Symbol.for('agent-teams-for-opencode.maintenance.v1')];
  try {
    assert.equal(shared.members.size, 2); assert.ok(shared.timer); assert.equal(shared.timer.hasRef(), false);
    await first.tools.get('peers_send').execute({ to: 'ses_b', key: 'old', text: 'A recent body' }, { sessionID: 'ses_a' });
    const stored = saved(first), id = Object.keys(first.state.get('collaboration.v1.history.none').messages)[0];
    stored.operations['ses_a/old'].at = Date.now() - 15 * 60 * 1000;
    await shared.members.values().next().value();
    assert.deepEqual(saved(first).operations, {}); assert.ok(first.state.get('collaboration.v1.history.none').messages[id]);
    assert.equal(first.synthetic.length + second.synthetic.length, 1);
    const timer = shared.timer;
    await closeFirst();
    assert.equal(shared.members.size, 1); assert.equal(shared.timer, timer);
  } finally {
    await closeSecond();
  }
  assert.equal(shared.members.size, 0); assert.equal(shared.timer, undefined);
});
test('capability requests use the native approval check even when allowing everything', async () => {
  const f = host(), cleanup = await plugin.setup(f.context);
  try {
    const result = await f.tools.get('peers_manage').execute({ action: 'policy.update', input: {
      capabilities: Object.fromEntries(Object.keys(DEFAULT_CAPABILITIES).map(key => [key, 'allow'])),
    } }, { sessionID: 'ses_a' });
    assert.equal(JSON.parse(result.content).error, undefined);
    assert.equal(f.approvals, 1);
  } finally { await cleanup(); }
});
test('approval prompts describe the request with names and folders, never session IDs', async () => {
  const f = host(), asked = [], cleanup = await plugin.setup(f.context);
  const assertNative = f.context.permission.assert;
  f.context.permission.assert = async input => { asked.push(input); return assertNative(input); };
  try {
    for (const id of ['ses_a', 'ses_b']) await f.tools.get('peers_manage').execute({ action: 'discovery.register', input: {} }, { sessionID: id });
    await f.tools.get('peers_manage').execute({ action: 'team.create', input: { name: 'Review', members: ['ses_a', 'ses_b'] } }, { sessionID: 'ses_a' });
    assert.equal(asked.length, 1);
    assert.deepEqual(asked[0].resources, ['An untitled session asks to create the team "Review" with 2 sessions:', 'an untitled session (/a)', 'an untitled session (/a)']);
    assert.ok(!JSON.stringify(asked[0].resources).includes('ses_'));
    assert.equal(asked[0].metadata.input, undefined);
  } finally { await cleanup(); }
});
test("the user's own controls act as the session without an approval prompt, and refuse permission changes", async () => {
  const f = host(), cleanup = await plugin.setup(f.context), signal = new AbortController().signal;
  try {
    for (const id of ['ses_a', 'ses_b']) await f.handlers.manage({ sessionID: id, action: 'discovery.register', input: {} }, { signal });
    await f.handlers.manage({ sessionID: 'ses_a', action: 'connection.create', input: { members: ['ses_a', 'ses_b'] } }, { signal });
    assert.equal(f.approvals, 0);
    await assert.rejects(f.handlers.manage({ sessionID: 'ses_a', action: 'policy.update', input: { capabilities: { createTeam: 'allow' } } }, { signal }), /unknown_action/);
    const { audit } = await f.handlers.snapshot({});
    const entry = audit.find(item => item.action === 'connection.create');
    assert.equal(entry.data.userAction, true); assert.equal(entry.data.approvalCategories, undefined);
  } finally { await cleanup(); }
});
test('tool refusals return a structured error with fields and remedy, never an untyped defect', async () => {
  const f = host(), cleanup = await plugin.setup(f.context);
  try {
    const result = await f.tools.get('peers_manage').execute({ action: 'session.create', input: { name: 'Child', role: 'Review' } },
      { sessionID: 'ses_a' });
    const { error } = JSON.parse(result.content);
    assert.equal(error.code, 'invalid_action_input'); assert.deepEqual(error.missing.sort(), ['agent', 'directory', 'model']);
    assert.match(error.hint, /agent must be one of: build, plan/); assert.ok(error.remedy);
    assert.deepEqual(result.metadata.error, error);
    const denied = JSON.parse((await f.tools.get('peers_send').execute({ to: 'ses_a', key: 'self', text: 'Hi' }, { sessionID: 'ses_a' })).content);
    assert.equal(denied.error.code, 'self_message'); assert.ok(denied.error.remedy);
    const ack = JSON.parse((await f.tools.get('peers_acknowledge').execute({ id: 'msg_none' }, { sessionID: 'ses_a' })).content);
    assert.deepEqual(ack.error, { code: 'not_message_recipient', id: 'msg_none', remedy: 'Acknowledge only messages addressed to this session. A message that has aged out of history needs no acknowledgement.' });
    const unexpected = toolError(new Error('host offline'));
    assert.ok(unexpected instanceof Tool.Error); assert.equal(unexpected.error, undefined);
    assert.equal(JSON.parse(unexpected.message).code, 'unexpected_error');
  } finally { await cleanup(); }
});
test('manage schema declares every action with its fields, and the description has an example per action', async () => {
  const f = host(), cleanup = await plugin.setup(f.context);
  try {
    const tool = f.tools.get('peers_manage'), schema = tool.input;
    assert.equal(schema.type, 'object'); assert.equal(Object.hasOwn(schema, 'oneOf'), false);
    const branches = Object.fromEntries(schema.properties.input.anyOf.map(branch => [branch.title, branch]));
    assert.deepEqual(Object.keys(branches), schema.properties.action.enum);
    assert.deepEqual(branches['session.create'].required, ['name', 'role', 'agent', 'directory', 'model']);
    assert.deepEqual(Object.keys(branches['profile.update'].properties), ['name', 'role']);
    assert.equal(branches['profile.update'].minProperties, 1);
    assert.deepEqual(branches['policy.update'].properties.capabilities.properties.createSession.enum, ['allow', 'ask', 'deny']);
    for (const action of schema.properties.action.enum) assert.match(tool.description, new RegExp(`"action":"${action.replace('.', '\\.')}"`));
    const discover = f.tools.get('peers_discover');
    assert.deepEqual(Object.keys(discover.input.properties), ['compact', 'catalog']);
    const view = JSON.parse((await discover.execute({ compact: true, catalog: true }, { sessionID: 'ses_a' })).content);
    assert.deepEqual(view.self.catalog.agents.map(agent => agent.id), ['build', 'plan']);
    assert.deepEqual(view.self.catalog.models, [{ providerID: 'prov', id: 'chat', name: 'Chat', variants: ['fast'] }]);
  } finally { await cleanup(); }
});
test('user settings work without a session or session enumeration and keep agent approval', async () => {
  const f = host(), cleanup = await plugin.setup(f.context);
  f.context.session.list = async () => { throw new Error('must not enumerate sessions'); };
  f.context.session.get = async () => { throw new Error('must not require a session'); };
  const initial = await f.handlers.settings();
  assert.equal(initial.command, 'team');
  assert.equal(initial.discoveryMode, 'registered');
  assert.deepEqual(initial.capabilities, DEFAULT_CAPABILITIES);
  const capabilities = { createTeam: 'allow' };
  assert.equal((await f.handlers.configure({ capabilities })).capabilities.createTeam, 'allow');
  assert.equal((await f.handlers.configure({ discoveryMode: 'automatic' })).discoveryMode, 'automatic');
  assert.equal(f.approvals, 0);
  assert.ok(!f.tools.get('peers_manage').input.properties.action.enum.includes('configure'));
  await assert.rejects(f.handlers.configure({ capabilities, command: 'team' }), /invalid_setting/);
  await assert.rejects(f.handlers.configure({ capabilities: { unknownFlag: 'allow' } }), /invalid_capabilities/);
  await assert.rejects(f.handlers.configure({ capabilities: { createTeam: true } }), /invalid_capabilities/);
  await cleanup();
});
test('unsupported host version is refused before any registration', async () => {
  const f = host(); f.context.app.version = '2.0.26';
  await assert.rejects(plugin.setup(f.context), /2.2.5/); assert.equal(f.registered.length, 0);
});
test('missing required native API is refused explicitly', () => {
  const f = host(); delete f.context.permission.assert;
  assert.throws(() => verifyContext(f.context), /permission.assert/);
});
test('setup failure disposes earlier registrations', async () => {
  const f = host(); f.context.tool.transform = async () => { throw new Error('registration failed'); };
  await assert.rejects(plugin.setup(f.context), /registration failed/);
  assert.ok(f.registered.every(item => item.disposed));
});
test('RPC contracts declare input and output schemas required by 2.2.5', () => {
  for (const method of Object.values(Collaboration.methods)) {
    assert.ok(method.input); assert.ok(method.output);
  }
  assert.deepEqual(Collaboration.events, {});
});

test('removing saved data is a user RPC, not something an agent tool can do', async () => {
  const f = host(), cleanup = await plugin.setup(f.context);
  try {
    assert.deepEqual([...f.tools.keys()].filter(name => /remove/i.test(name)), []);
    assert.equal(Object.hasOwn(Collaboration.methods, 'removeData'), true);
    await f.tools.get('peers_manage').execute({ action: 'discovery.register', input: {} }, { sessionID: 'ses_a' });
    const refused = JSON.parse((await f.tools.get('peers_manage').execute({ action: 'removeData', input: {} }, { sessionID: 'ses_a' })).content);
    assert.ok(refused.error); assert.ok(saved(f));
    await f.handlers.removeData({ confirm: 'remove-all-saved-data' });
    assert.equal(f.state.size, 0);
  } finally { await cleanup(); }
});
test('manual teams use user RPCs, not peer tools or approval bypass flags', async () => {
  const f = host(), cleanup = await plugin.setup(f.context);
  assert.equal((await f.handlers.teamCandidates({})).total, 0);
  await f.tools.get('peers_manage').execute({ action: 'discovery.register', input: {} }, { sessionID: 'ses_b' });
  const state = await f.handlers.snapshot();
  const team = await f.handlers.teamManage({ action: 'team.create', input: { name: 'Manual', members: ['ses_b'] }, revision: state.revision });
  assert.deepEqual(team.members, ['ses_b']);
  assert.equal(f.approvals, 0);
  assert.ok(!f.tools.get('peers_manage').input.properties.action.enum.includes('team.update'));
  const refused = JSON.parse((await f.tools.get('peers_manage').execute({ action: 'team.update', input: { id: team.id } }, { sessionID: 'ses_a' })).content);
  assert.equal(refused.error.code, 'unknown_action'); assert.ok(!refused.error.allowed.includes('team.update'));
  await cleanup();
});
test('manual profiles use authenticated user RPC without an acting session or discovery side effect', async () => {
  const f = host(), cleanup = await plugin.setup(f.context);
  try {
    const saved = await f.handlers.profileManage({ sessionID: 'ses_b', input: { name: 'Human label', role: 'Human role' }, revision: 0 });
    assert.deepEqual(saved, { name: 'Human label', role: 'Human role' });
    const snapshot = await f.handlers.snapshot({ sessionID: 'ses_b' });
    assert.equal(snapshot.people.ses_b.name, 'Human label'); assert.deepEqual(snapshot.agents, []);
    assert.deepEqual(snapshot.discovery.registered, []); assert.equal(f.approvals, 0);
    assert.ok(!f.tools.get('peers_manage').input.properties.action.enum.includes('profileManage'));
    assert.equal(f.tools.size, 4);
  } finally { await cleanup(); }
});
test('the native session.deleted event removes a member without approval or messages', async () => {
  const f = host(), cleanup = await plugin.setup(f.context);
  try {
    const team = await seedTeam(f, ['ses_a', 'ses_b']), revision = saved(f).revision;
    f.emit({ type: 'session.deleted', data: { sessionID: 'ses_b' } });
    await until(() => saved(f).teams[team.id].members.length === 1);
    assert.deepEqual(saved(f).teams[team.id].members, ['ses_a']);
    assert.equal(saved(f).revision, revision + 1);
    assert.equal(f.state.get(`collaboration.v1.history.${team.id}`).audit.at(-1).action, 'team.member.removed');
    assert.equal(f.approvals, 0); assert.equal(f.synthetic.length, 0);
  } finally { await cleanup(); }
});
test('a location that never listed a session can still name it when it handles the deletion first', async () => {
  const state = new Map(), first = host(state), second = host(state);
  const closeFirst = await plugin.setup(first.context), closeSecond = await plugin.setup(second.context);
  try {
    const team = await seedTeam(first, ['ses_a', 'ses_b']);
    await first.handlers.snapshot();
    second.emit({ type: 'session.deleted', data: { sessionID: 'ses_b' } });
    await until(() => saved(second).teams[team.id].members.length === 1);
    assert.equal(state.get(`collaboration.v1.history.${team.id}`).audit.at(-1).data.name, 'ses_b');
  } finally { await closeFirst(); await closeSecond(); }
});
test('discover reports peers waiting for approval or input, from native events and one lookup each', async () => {
  const f = host();
  const ids = ['ses_a', 'ses_wait_approval', 'ses_wait_input', 'ses_wait_seeded'];
  const running = id => ({ id, title: id, projectID: 'a', location: { directory: '/a' }, time: { busy: 2000, idle: 1000 } });
  f.context.session.list = async () => ({ data: ids.map(running), cursor: {} });
  f.context.session.get = async ({ sessionID }) => running(sessionID);
  const looked = [];
  f.context.permission.list = async ({ sessionID }) => { looked.push(sessionID); return sessionID === 'ses_wait_seeded' ? [{ id: 'per_old' }] : []; };
  const cleanup = await plugin.setup(f.context);
  try {
    for (const id of ids) await f.tools.get('peers_manage').execute({ action: 'discovery.register', input: {} }, { sessionID: id });
    const settle = async () => { await until(f.drained); await new Promise(resolve => setTimeout(resolve, 10)); };
    f.emit({ type: 'permission.asked', data: { id: 'per_1', sessionID: 'ses_wait_approval', action: 'bash', resources: [] } });
    f.emit({ type: 'form.created', data: { form: { id: 'frm_1', sessionID: 'ses_wait_input' } } });
    await settle();
    const view = async () => JSON.parse((await f.tools.get('peers_discover').execute({ compact: true }, { sessionID: 'ses_a' })).content);
    const of = (value, id) => value.agents.find(item => item.sessionID === id)?.waitingFor;
    const first = await view();
    assert.equal(of(first, 'ses_wait_approval'), 'approval'); assert.equal(of(first, 'ses_wait_input'), 'input');
    assert.equal(of(first, 'ses_wait_seeded'), 'approval');
    f.emit({ type: 'permission.replied', data: { sessionID: 'ses_wait_approval', requestID: 'per_1', reply: 'once' } });
    f.emit({ type: 'form.cancelled', data: { id: 'frm_1', sessionID: 'ses_wait_input' } });
    f.emit({ type: 'permission.replied', data: { sessionID: 'ses_wait_seeded', requestID: 'per_old', reply: 'reject' } });
    await settle();
    const second = await view();
    assert.deepEqual(ids.slice(1).map(id => of(second, id)), [undefined, undefined, undefined]);
    assert.deepEqual([...new Set(looked)].sort(), [...ids].sort()); assert.equal(looked.length, ids.length);
    assert.match(f.tools.get('peers_discover').description, /waitingFor/);
  } finally {
    for (const id of ids) f.emit({ type: 'session.idle', data: { sessionID: id } });
    await until(f.drained);
    await cleanup();
  }
});
test('after the last instance unloads, a new one looks approvals up again instead of trusting old state', async () => {
  const state = new Map();
  const running = id => ({ id, title: id, projectID: 'a', location: { directory: '/a' }, time: { busy: 2000, idle: 1000 } });
  let pendingNow = [{ id: 'per_reload' }];
  const looked = [];
  const start = async () => {
    const f = host(state);
    f.context.session.list = async () => ({ data: ['ses_a', 'ses_reload'].map(running), cursor: {} });
    f.context.session.get = async ({ sessionID }) => running(sessionID);
    f.context.permission.list = async ({ sessionID }) => { looked.push(sessionID); return sessionID === 'ses_reload' ? pendingNow : []; };
    return { f, cleanup: await plugin.setup(f.context) };
  };
  const waitingOf = async f => JSON.parse((await f.tools.get('peers_discover').execute({ compact: true }, { sessionID: 'ses_a' })).content)
    .agents.find(item => item.sessionID === 'ses_reload')?.waitingFor;
  const first = await start();
  for (const id of ['ses_a', 'ses_reload']) await first.f.tools.get('peers_manage').execute({ action: 'discovery.register', input: {} }, { sessionID: id });
  assert.equal(await waitingOf(first.f), 'approval');
  await first.cleanup();
  // Answered while no instance was following events.
  pendingNow = [];
  const second = await start();
  try {
    await until(() => true);
    assert.equal(await waitingOf(second.f), undefined);
    assert.equal(looked.filter(id => id === 'ses_reload').length, 2);
  } finally { await second.cleanup(); }
});
test('the native session.archived event leaves membership and revision alone', async () => {
  const f = host(), cleanup = await plugin.setup(f.context);
  try {
    const team = await seedTeam(f, ['ses_a', 'ses_b']), before = structuredClone(saved(f));
    f.emit({ type: 'session.archived', data: { sessionID: 'ses_b' } });
    f.emit({ type: 'session.unarchived', data: { sessionID: 'ses_b' } });
    await until(f.drained);
    await f.handlers.snapshot();
    assert.deepEqual(saved(f).teams[team.id].members, ['ses_a', 'ses_b']);
    assert.deepEqual(saved(f), before);
  } finally { await cleanup(); }
});
test('startup reconciles deletions made while the plugin was not running', async () => {
  const first = host(), stop = await plugin.setup(first.context);
  const team = await seedTeam(first, ['ses_a', 'ses_b']);
  await stop();
  const f = host(first.state);
  f.context.session.list = async () => ({ data: [{ id: 'ses_a', title: 'ses_a', projectID: 'a', location: { directory: '/a' }, time: {} }], cursor: {} });
  f.context.session.get = async ({ sessionID }) => { throw missing(sessionID); };
  const cleanup = await plugin.setup(f.context);
  try {
    await until(() => saved(f).teams[team.id].members.length === 1);
    assert.deepEqual(saved(f).teams[team.id].members, ['ses_a']);
    assert.equal(f.approvals, 0); assert.equal(f.synthetic.length, 0);
  } finally { await cleanup(); }
});
test('a failed startup listing neither blocks setup nor removes anyone', async t => {
  const logged = t.mock.method(console, 'error', () => {});
  const first = host(), stop = await plugin.setup(first.context);
  const team = await seedTeam(first, ['ses_a', 'ses_b']), before = structuredClone(saved(first));
  await stop();
  const f = host(first.state);
  f.context.session.list = async () => { throw new Error('host offline'); };
  f.context.session.get = async ({ sessionID }) => { throw missing(sessionID); };
  const cleanup = await plugin.setup(f.context);
  try {
    await until(() => logged.mock.callCount() === 1);
    assert.match(logged.mock.calls[0].arguments[0], /reconciliation failed/);
    assert.deepEqual(saved(f), before); assert.ok(saved(f).teams[team.id]);
  } finally { await cleanup(); }
});
test('a failed save during removal does not end the event subscription', async t => {
  const logged = t.mock.method(console, 'error', () => {});
  const f = host(), cleanup = await plugin.setup(f.context);
  try {
    const team = await seedTeam(f, ['ses_a', 'ses_b']), set = f.context.storage.set;
    let failures = 0;
    f.context.storage.set = async (...args) => { if (!failures++) throw new Error('disk unavailable'); return set(...args); };
    f.emit({ type: 'session.deleted', data: { sessionID: 'ses_b' } });
    await until(() => logged.mock.callCount() === 1);
    assert.deepEqual(saved(f).teams[team.id].members, ['ses_a', 'ses_b']);
    f.emit({ type: 'session.deleted', data: { sessionID: 'ses_b' } });
    await until(() => saved(f).teams[team.id].members.length === 1);
  } finally { await cleanup(); }
});
test('agent profile tool cannot impersonate the target of the manual user API', async () => {
  const f = host(), cleanup = await plugin.setup(f.context);
  try {
    await f.tools.get('peers_manage').execute({ sessionID: 'ses_b', action: 'profile.update', input: { name: 'Own name', role: 'Own role' } }, { sessionID: 'ses_a' });
    assert.equal((await f.handlers.snapshot({ sessionID: 'ses_a' })).people.ses_a.name, 'Own name');
    assert.equal((await f.handlers.snapshot({ sessionID: 'ses_b' })).people.ses_b.name, 'ses_b');
  } finally { await cleanup(); }
});
