import test from 'node:test';
import assert from 'node:assert/strict';
import tui from '../src/tui.js';
import { collectAction, joinFirst } from '../src/actions.js';
test('a connection names the sessions that must join the list, and does not start from an unlisted session', async () => {
  const snapshot = { discovery: { mode: 'registered', registered: ['ses_a'] }, teams: [{ id: 'team_x', members: ['ses_a', 'ses_c'] }], limits: { connectionMinutes: 60 },
    agents: [{ sessionID: 'ses_a', name: 'Alice' }], people: { ses_b: { sessionID: 'ses_b', name: 'Bob' }, ses_c: { sessionID: 'ses_c', name: 'Carol' } } };
  assert.equal(joinFirst(snapshot, 'connection.create', { members: ['ses_a', 'ses_b', 'ses_c'] }), 'Bob and Carol must join the agent list first.');
  assert.equal(joinFirst(snapshot, 'team.members', { id: 'team_x', members: ['ses_a', 'ses_b', 'ses_c'] }), 'Bob must join the agent list first.');
  assert.equal(joinFirst(snapshot, 'connection.create', { members: ['ses_a'] }), undefined);
  assert.equal(joinFirst({ ...snapshot, discovery: { mode: 'automatic', registered: [] } }, 'connection.create', { members: ['ses_b'] }), undefined);
  await assert.rejects(collectAction({ select: async () => assert.fail('asked') }, 'connection.create', snapshot, 'ses_b'), /Bob must join the agent list first/);
});
import { sessionStatus } from '../src/format.js';
import { createEngine } from '../src/core.js';

function host(answers = [], overrides = {}) {
  const calls = [], toasts = [], navigation = [], prompts = [], listeners = new Map();
  const state = { agents: [{ sessionID: 'ses_a', name: 'Alice', role: 'Developer', activity: 'idle', directory: '/a' }],
    teams: [], connections: [], messages: [], audit: [], revision: 7, discovery: { mode: 'registered', registered: [] },
    capabilities: { createTeam: 'ask' }, limits: { connectionMinutes: 60 } };
  let commandLayer, command = 'team', stopped = false;
  const context = {
    location: { directory: '/a' },
    client: { rpc: () => ({ snapshot: async (input, options) => { calls.push(['snapshot', input, options]); return overrides.snapshot ? overrides.snapshot(input) : state; },
      manage: async (input, options) => { calls.push(['manage', input, options]); return overrides.manage?.(input); },
      teamManage: async (input, options) => { calls.push(['teamManage', input, options]); },
      removeData: async (input, options) => { calls.push(['removeData', input, options]); },
      settings: async () => ({ command }), configure: async (input, options) => {
        calls.push(['configure', input, options]);
        if (input.command) command = input.command;
        return { command };
      } }) },
    ui: {
      dialog: { select: async () => answers.shift(), prompt: async input => { prompts.push(input); return answers.shift(); }, alert: async value => calls.push(['alert', value]) },
      toast: { show: value => toasts.push(value) },
      router: { current: () => overrides.route ?? { type: 'session', sessionID: 'ses_a' }, navigate: value => navigation.push(value) },
    },
    keymap: { layer: run => { assert.equal(run().mode, 'global'); commandLayer = run; } },
    data: { on: (name, run) => { listeners.set(name, run); return () => { stopped = true; }; } },
  };
  const cleanup = tui.setup(context);
  return { calls, toasts, navigation, prompts, listeners, cleanup, get stopped() { return stopped; },
    run: id => commandLayer().commands.find(item => item.id === id).run(),
    commands: () => commandLayer().commands, state };
}

test('TUI defaults to /team and applies the saved command name', async () => {
  const f = host(['Settings', 'slashCommand', 'squad']);
  assert.equal(f.commands().find(item => item.id === 'peers.dashboard').slash.name, 'team');
  await f.run('peers.dashboard');
  assert.equal(f.commands().find(item => item.id === 'peers.dashboard').slash.name, 'squad');
  f.cleanup();
});

test('TUI overview scopes RPC to the current location and opens the selected session', async () => {
  const f = host(['ses_a']); await f.run('peers.overview');
  assert.deepEqual(f.calls[0], ['snapshot', { sessionID: 'ses_a' }, { location: { directory: '/a' } }]);
  assert.deepEqual(f.navigation, [{ type: 'session', sessionID: 'ses_a' }]);
  f.cleanup(); assert.equal(f.stopped, true);
});

test('TUI includes an unlisted routed viewer and prefills its saved profile through snapshot RPC', async () => {
  const saved = new Map(), peer = { id: 'ses_a', title: 'Native title', agent: 'build', projectID: 'a', location: { directory: '/a' }, time: {} };
  const engine = createEngine({
    storage: { get: async key => structuredClone(saved.get(key)), set: async (key, value) => saved.set(key, structuredClone(value)), remove: async key => { saved.delete(key); } },
    session: { get: async () => peer, list: async () => ({ data: [peer], cursor: {} }) }, approve: async () => assert.fail('profile needs no approval'),
  });
  await engine.manage('ses_a', 'profile.update', { name: 'Saved name', role: 'Saved role' });
  // Named for its Activity entry, without being listed.
  assert.deepEqual(Object.keys((await engine.snapshot()).people), ['ses_a']);
  assert.deepEqual((await engine.snapshot()).agents, []);
  let snapshot;
  const f = host(['Actions', 'profile.update', 'Saved name', 'Saved role'], {
    snapshot: async input => snapshot = await engine.snapshot(undefined, input.sessionID),
    manage: input => engine.manage(input.sessionID, input.action, input.input),
  });
  try {
    await f.run('peers.dashboard');
    assert.deepEqual(f.calls[0], ['snapshot', { sessionID: 'ses_a' }, { location: { directory: '/a' } }]);
    assert.deepEqual(f.prompts, [{ title: 'Name', value: 'Saved name' }, { title: 'Role', value: 'Saved role' }]);
    assert.deepEqual(snapshot.agents, []);
    assert.equal(snapshot.people.ses_a.registered, false);
    assert.deepEqual(snapshot.teams, []); assert.deepEqual(snapshot.connections, []); assert.deepEqual(snapshot.messages, []);
    assert.deepEqual(f.calls[1][1], { sessionID: 'ses_a', action: 'profile.update', input: { name: 'Saved name', role: 'Saved role' } });
    const after = await engine.snapshot();
    assert.deepEqual(after.agents, []); assert.equal(after.people.ses_a.registered, false); assert.deepEqual(after.discovery.registered, []);
    assert.deepEqual(f.toasts.map(item => item.variant), ['success']);
  } finally { f.cleanup(); }
});

test('TUI overview and settings omit viewer input when no session is open', async () => {
  const overview = host(['ses_a'], { route: { type: 'home' } });
  try {
    await overview.run('peers.overview');
    assert.deepEqual(overview.calls[0], ['snapshot', {}, { location: { directory: '/a' } }]);
    assert.deepEqual(overview.navigation, [{ type: 'session', sessionID: 'ses_a' }]);
    assert.deepEqual(overview.toasts, []);
  } finally { overview.cleanup(); }
  const settings = host(['Settings', 'createTeam'], { route: { type: 'home' } });
  try {
    await settings.run('peers.dashboard');
    assert.deepEqual(settings.calls, [['snapshot', {}, { location: { directory: '/a' } }],
      ['configure', { capabilities: { createTeam: 'allow' } }, { location: { directory: '/a' } }]]);
    assert.deepEqual(settings.toasts.map(item => item.variant), ['success']);
  } finally { settings.cleanup(); }
});

test('TUI user approval settings save through the settings RPC', async () => {
  const f = host(['Settings', 'createTeam']); await f.run('peers.dashboard');
  assert.deepEqual(f.calls[1], ['configure', { capabilities: { createTeam: 'allow' } },
    { location: { directory: '/a' } }]); f.cleanup();
});

test('TUI removes saved data only after confirmation', async () => {
  const cancelled = host(['Settings', 'removeData', 'cancel']); await cancelled.run('peers.dashboard');
  assert.ok(!cancelled.calls.some(call => call[0] === 'removeData')); cancelled.cleanup();
  const f = host(['Settings', 'removeData', 'remove']); await f.run('peers.dashboard');
  assert.deepEqual(f.calls.at(-1), ['removeData', { confirm: 'remove-all-saved-data' }, { location: { directory: '/a' } }]);
  assert.deepEqual(f.toasts.map(item => item.variant), ['success']); f.cleanup();
});
test('TUI user discovery setting saves directly', async () => {
  const f = host(['Settings', 'discoveryMode', 'automatic']); await f.run('peers.dashboard');
  assert.deepEqual(f.calls[1], ['configure', { discoveryMode: 'automatic' },
    { location: { directory: '/a' } }]); f.cleanup();
});

test('team session dialog includes the selected team', async () => {
  const answers = ['Child', 'Reviewer', '/a', 'build', 'provider', 'model', ''];
  const input = await collectAction({ prompt: async () => answers.shift(), select: async () => 'team_review' }, 'session.create',
    { agents: [], teams: [{ id: 'team_review', name: 'Review', members: ['ses_a', 'ses_b'] }], limits: { connectionMinutes: 60 } }, 'ses_a');
  assert.equal(input.teamID, 'team_review');
});

test('TUI reads message status and opens its recipient', async () => {
  const f = host(['Messages', 'msg_a']);
  f.state.messages.push({ id: 'msg_a', sender: { name: 'Alice' }, recipient: { name: 'Bob' }, status: 'accepted', text: 'Question', to: 'ses_b' });
  await f.run('peers.dashboard');
  assert.match(f.calls[1][1].title, /Sent/);
  assert.deepEqual(f.navigation[0], { type: 'session', sessionID: 'ses_b' }); f.cleanup();
});

test('TUI notifies only on peer synthetic inbox entries', () => {
  const f = host(), notify = f.listeners.get('session.inbox.enqueued');
  notify({ data: { item: { type: 'user' } } });
  notify({ data: { item: { type: 'synthetic', payload: { metadata: {} } } } });
  notify({ data: { item: { type: 'synthetic', payload: { metadata: { agentTeamsForOpencode: { id: 'msg_a' } } } } } });
  assert.equal(f.toasts.length, 1); f.cleanup();
});

test('team and connection pickers list only collaborations that include the session', async () => {
  let offered;
  const snapshot = { agents: [], limits: { connectionMinutes: 60 },
    teams: [{ id: 'team_own', name: 'Own', members: ['ses_a', 'ses_b'] }, { id: 'team_other', name: 'Other', members: ['ses_b', 'ses_c'] }],
    connections: [{ id: 'connection_own', members: ['ses_a', 'ses_c'], active: true }, { id: 'connection_other', members: ['ses_b', 'ses_c'], active: true }] };
  const ui = { select: async (_title, options) => { offered = options.map(item => item.value); return options[0]?.value; } };
  assert.deepEqual(await collectAction(ui, 'team.delete', snapshot, 'ses_a'), { id: 'team_own' });
  assert.deepEqual(offered, ['team_own']);
  assert.deepEqual(await collectAction(ui, 'connection.close', snapshot, 'ses_a'), { id: 'connection_own' });
  assert.deepEqual(offered, ['connection_own']);
});

// The Desktop panel's source: its entry point and every file under src/gui/.
async function desktopSource() {
  const { readFile, readdir } = await import('node:fs/promises');
  const folder = new URL('../src/gui/', import.meta.url);
  const files = [new URL('../src/gui.tsx', import.meta.url), ...(await readdir(folder)).sort().map(name => new URL(name, folder))];
  return (await Promise.all(files.map(file => readFile(file, 'utf8')))).join('\n');
}

test('Desktop polling does not use resources that re-enter loading', async () => {
  // A refetching createResource re-enters loading and suspends the host UI.
  assert.doesNotMatch(await desktopSource(), /import[^;]*\bcreateResource\b|createResource\s*\(/);
});

test('Desktop relies on automatic refresh without a redundant manual button', async () => {
  const source = await desktopSource();
  assert.doesNotMatch(source, /label="Refresh"|setRefreshing|async function refresh\(/);
  assert.match(source, /if \(visible\(\) && !busy\(\) && !refreshing\) void refetch\(\); }, 5000/);
  assert.match(source, /createEffect\(on\(visible, shown => \{ if \(shown\) void refetch\(\)/);
});

test('Desktop team expansion uses native per-session persistence with queued draft updates', async () => {
  const source = await desktopSource();
  assert.match(source, /teamExpansion: Store\.session\(Schema\.Struct/);
  assert.match(source, /ctx\.stores\.teamExpansion\(session\)/);
  assert.match(source, /props\.expansion\(\)\?\.update\(draft =>/);
  assert.doesNotMatch(source, /setExpandedTeams|localStorage/);
});

test('Desktop buttons consistently use normal native sizing', async () => {
  assert.doesNotMatch(await desktopSource(), /<ui\.(?:Icon)?Button\b[^>]*\bsize="small"/);
});

test('Desktop history selection is native, independent by section and scoped by server', async () => {
  const source = await desktopSource();
  assert.match(source, /historySelection: Store\.global\(Schema\.Struct\(\{ messages: Schema\.Record/);
  assert.match(source, /activity: Schema\.Record/);
  assert.match(source, /draft\[historySection\(\)\]\[serverID\(\)\] = scope/);
  assert.match(source, /props\.historySelection\.value\?\.\[historySection\(\)\]\[serverID\(\)\]/);
  assert.match(source, /label=\{scopeLabel\(activeScope\(\)\)\}/);
  assert.doesNotMatch(source, /Connections: active\(\)\.length, Messages:/);
  assert.match(source, /id === NO_TEAM \? 'Connections'/);
  assert.doesNotMatch(source, /localStorage/);
});

test('native action collection cancels without a partial mutation', async () => {
  const input = await collectAction({ prompt: async () => undefined }, 'profile.update', { agents: [], limits: { connectionMinutes: 60 } }, 'ses_a');
  assert.equal(input, undefined);
});

test('native name and role prompts are prefilled with the existing profile', async () => {
  const seen = [];
  const input = await collectAction({ prompt: async (title, value) => { seen.push([title, value]); return value; } }, 'profile.update',
    { agents: [], people: { ses_a: { name: 'Alice', role: 'Developer' } }, limits: { connectionMinutes: 60 } }, 'ses_a');
  assert.deepEqual(seen, [['Name', 'Alice'], ['Role', 'Developer']]);
  assert.deepEqual(input, { name: 'Alice', role: 'Developer' });
});

test('the native team picker can finish with only the current session', async () => {
  const input = await collectAction({ prompt: async () => 'Release', select: async () => 'done' }, 'team.create',
    { agents: [], limits: { connectionMinutes: 60 } }, 'ses_a');
  assert.deepEqual(input, { name: 'Release', members: ['ses_a'] });
});

test('session creation dialog builds an explicit model without privilege fields', async () => {
  const answers = ['Bob', 'Reviewer', '/b', 'build', 'provider', 'model', ''];
  const input = await collectAction({ prompt: async () => answers.shift() }, 'session.create',
    { agents: [], limits: { connectionMinutes: 60 } }, 'ses_a');
  assert.deepEqual(input, { name: 'Bob', role: 'Reviewer', directory: '/b', agent: 'build', model: { id: 'model', providerID: 'provider' } });
});

test('attention priority is approval, question, native running state, then idle', () => {
  const peer = { sessionID: 'ses_a', activity: 'running' };
  let permission = [], forms = [], activity = 'running';
  const data = { session: { permission: { list: () => permission }, form: { list: () => forms }, get: () => ({}), status: () => activity } };
  assert.equal(sessionStatus(peer, data).kind, 'running');
  forms = [{}]; assert.equal(sessionStatus(peer, data).kind, 'question');
  permission = [{}]; assert.equal(sessionStatus(peer, data).kind, 'approval');
  forms = []; assert.equal(sessionStatus(peer, data).kind, 'approval');
  permission = []; activity = 'idle'; assert.equal(sessionStatus(peer, data).kind, 'idle');
  assert.equal(sessionStatus(peer).kind, 'running');
  assert.equal(sessionStatus({ sessionID: 'missing' }).kind, 'idle');
});

test('TUI manually manages another team without adding the current session', async () => {
  const f = host(['Teams', 'team_other', 'manage', 'Renamed', 'ses_c', 'done']);
  f.state.agents.push({ sessionID: 'ses_b', name: 'Bob', role: 'Reviewer' });
  f.state.agents.push({ sessionID: 'ses_c', name: 'Carol', role: 'Developer' });
  f.state.teams.push({ id: 'team_other', name: 'Other', members: ['ses_b'] });
  await f.run('peers.dashboard');
  assert.deepEqual(f.calls.at(-1), ['teamManage', { action: 'team.update', input: { id: 'team_other', name: 'Renamed', members: ['ses_b', 'ses_c'] }, revision: 7 }, { location: { directory: '/a' } }]);
  assert.ok(!f.calls.some(call => call[0] === 'manage'));
  f.cleanup();
});

test('TUI team navigation and cancelled deletion never change membership', async () => {
  const f = host(['Teams', 'team_other', 'ses_b']);
  f.state.agents.push({ sessionID: 'ses_b', name: 'Bob' });
  f.state.teams.push({ id: 'team_other', name: 'Other', members: ['ses_b'] });
  await f.run('peers.dashboard');
  assert.deepEqual(f.navigation, [{ type: 'session', sessionID: 'ses_b' }]);
  assert.ok(!f.calls.some(call => call[0] === 'teamManage'));
  f.cleanup();
  const cancelled = host(['Teams', 'team_other', 'delete', 'cancel']);
  cancelled.state.teams.push({ id: 'team_other', name: 'Other', members: ['ses_a'] });
  await cancelled.run('peers.dashboard');
  assert.ok(!cancelled.calls.some(call => call[0] === 'teamManage'));
  cancelled.cleanup();
});
