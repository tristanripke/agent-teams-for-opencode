import { createRoot, createEffect, createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { Panel, Style, Command, MenuItem, SettingsPage } from '@opencode/plugin/gui';
import plugin from '../../src/gui.tsx';
import { createSettings } from '../../src/settings.js';
import { NO_TEAM, GENERAL, scopeForMessage, scopesForAudit } from '../../src/history.js';
import { ui, dialogs } from './ui.tsx';
import { PreviewToolbar } from './toolbar.tsx';

const now = Date.now();
const agents = [
  { sessionID: 'ses_alice', name: 'Alice', role: 'Developer', projectID: 'project-a', directory: 'C:/Projects/Engine', activity: 'running', model: { id: 'gpt-6.1-sol', providerID: 'openai', variant: 'high' } },
  { sessionID: 'ses_bob', name: 'Bob', role: 'Reviewer', projectID: 'project-a', directory: 'C:/Projects/Engine', activity: 'idle', model: { id: 'claude-sonnet-5-5', providerID: 'anthropic' } },
  { sessionID: 'ses_carol', name: 'Carol', role: 'Researcher', projectID: 'project-b', directory: 'C:/Projects/Research', activity: 'idle', model: { id: 'gpt-6-luna', providerID: 'openai', variant: 'medium' } },
];
const dana = { sessionID: 'ses_dana', name: 'Dana', role: 'Writer', projectID: 'project-c', directory: 'C:/Projects/Docs', activity: 'idle' };
const state = { agents, people: { ses_dana: dana },
  teams: [{ id: 'team_review', name: 'Release review', members: ['ses_alice', 'ses_bob', 'ses_carol'] },
    { id: 'team_docs', name: 'Docs pass', members: ['ses_bob', 'ses_dana'] }],
  connections: [{ id: 'connection_question', members: ['ses_alice', 'ses_carol'], active: true, expiresAt: now + 42 * 60000 },
    { id: 'connection_old', members: ['ses_alice', 'ses_dana'], active: false, expiresAt: now - 26 * 3600000 }],
  messages: [
    { id: 'msg_docs_two', from: 'ses_dana', to: 'ses_bob', sender: dana, recipient: agents[1], text: 'The configuration page is rebuilt. Could you check the anchors?', status: 'processed', at: now - 3 * 3600000 },
    { id: 'msg_docs_one', from: 'ses_bob', to: 'ses_dana', sender: agents[1], recipient: dana, text: 'The link checker fails on the configuration page. Can you take a look?', status: 'delivered', at: now - 5 * 3600000 },
    { id: 'msg_old', from: 'ses_alice', to: 'ses_dana', sender: agents[0], recipient: dana, text: 'Can you check the docs build? The last three runs failed on the link checker after the configuration page moved, and I cannot tell whether the broken anchors come from the generated reference or from the hand-written guides. If it is the generated reference, the fix belongs in the template rather than in each page, so please look there first and tell me what you find.', status: 'uncertain', at: now - 26 * 3600000 },
    { id: 'msg_carol', from: 'ses_carol', to: 'ses_alice', sender: agents[2], recipient: agents[0], text: 'Found the cursor bug. The list query sorts by creation time, but the cursor it returns is built from the update time, so any row edited between two pages is either skipped or returned twice.\n\nI reproduced it with two sessions paging at the same time and added a failing test in the pagination suite. The fix is small: build the cursor from the same column the query sorts by.\n\nTwo questions before I open the change:\n1. Do existing clients ever store a cursor between runs? If so, old cursors need a one-release fallback.\n2. Dana owns the API docs and they describe the old behaviour. Want me to open a connection with Dana so the docs ship with the fix?', status: 'delivered', at: now - 40 * 60000 },
    { id: 'msg_fixture', from: 'ses_alice', to: 'ses_bob', sender: agents[0], recipient: agents[1], text: 'Please review the retry handling in the admission path.\nAcknowledge once done.', status: 'accepted', at: now - 2 * 60000 },
  ],
  discovery: { mode: 'registered', registered: ['ses_alice', 'ses_bob', 'ses_carol'] },
  capabilities: { createSession: 'ask', createTeam: 'ask', changeMembers: 'ask', workAcrossProjects: 'ask', openConnection: 'ask', extendConnection: 'ask' },
  audit: [
    { actor: 'ses_alice', action: 'message.admission', at: now - 2 * 60000, data: { id: 'msg_fixture', status: 'accepted' } },
    { actor: 'user', action: 'settings.update', at: now - 10 * 60000, data: { proposal: { capabilities: { extendConnection: 'allow' } } } },
    { actor: 'ses_dana', action: 'message.admission', at: now - 3 * 3600000, data: { id: 'msg_docs_two', status: 'accepted' } },
    { actor: 'ses_bob', action: 'team.create', at: now - 6 * 3600000, data: { proposal: { id: 'team_docs', name: 'Docs pass' }, approvalCategories: ['createTeam', 'changeMembers'] } },
    { actor: 'ses_alice', action: 'team.create', at: now - 20 * 60000, data: { proposal: { id: 'team_review', name: 'Release review' },
      approvalCategories: ['createTeam', 'changeMembers', 'workAcrossProjects'] } },
  ].reverse(),
  limits: { connectionMinutes: 60 }, revision: 0 };
const calls = [], commands = [], menus = [], listeners = new Map();
let heldSnapshot;
let panel, disposeView, commandUpdates = 0;
const [panelOpen, setPanelOpen] = createSignal(false);
const [previewView, setPreviewView] = createSignal('dashboard');
const report = value => { calls.push(value); document.querySelector('#result').textContent = JSON.stringify(value); };
const providers = [
  { id: 'fixture-provider', name: 'Fixture Provider', activation: 'enabled' },
  { id: 'other-provider', name: 'Other Provider', activation: 'auto' },
  { id: 'disabled-provider', name: 'Disabled Provider', activation: 'disabled' },
];
const models = [
  { id: 'fixture-model', modelID: 'fixture-model', providerID: 'fixture-provider', name: 'Fixture Model', enabled: true, type: 'chat', variants: [{ id: 'fast' }, { id: 'deep' }] },
  { id: 'other-model', modelID: 'upstream-model', providerID: 'other-provider', name: 'Other Model', enabled: true, type: 'chat', variants: [{ id: 'high' }] },
  { id: 'hidden-model', providerID: 'fixture-provider', name: 'Hidden Model', enabled: false, type: 'chat', variants: [] },
  { id: 'disabled-model', providerID: 'disabled-provider', name: 'Disabled Provider Model', enabled: true, type: 'chat', variants: [] },
  { id: 'image-model', providerID: 'fixture-provider', name: 'Image Model', enabled: true, type: 'image', variants: [] },
  // Display-only fixture entries do not add options to the available-model picker.
  { id: 'gpt-6.1-sol', providerID: 'openai', name: 'GPT-6.1 Sol', enabled: false },
  { id: 'claude-sonnet-5-5', providerID: 'anthropic', name: 'Claude Sonnet 5.5', enabled: false },
  { id: 'gpt-6-luna', providerID: 'openai', name: 'GPT-6 Luna', enabled: false },
];
const [modelList, setModelList] = createSignal(models);
const [providerList, setProviderList] = createSignal();
const openCodeAgents = [
  { id: 'build', name: 'Build', description: 'Build and edit code', mode: 'primary', hidden: false },
  { id: 'review', name: 'Reviewer', description: 'Review changes', mode: 'all', hidden: false },
  { id: 'explore', name: 'Explore', mode: 'subagent', hidden: false },
  { id: 'hidden', name: 'Hidden agent', mode: 'primary', hidden: true },
];
const [agentList, setAgentList] = createSignal(openCodeAgents);
const projects = [
  { id: 'project-a', canonical: 'C:/Projects/Engine', name: 'Engine', vcs: 'git' },
  { id: 'project-b', canonical: 'C:/Projects/Research', name: 'Research' },
];
const [approvals, setApprovals] = createSignal({});
const [questions, setQuestions] = createSignal({});
const [nativeActivity, setNativeActivity] = createSignal({});
const [nativeModels, setNativeModels] = createSignal({});
let failCatalog = false;
let profileFailure;
const data = { on(name, handler) { listeners.set(name, handler); return () => listeners.delete(name); },
  session: {
    get: id => {
      const peer = state.agents.find(peer => peer.sessionID === id) ?? state.people[id];
      return nativeModels()[id] ? { ...peer, model: nativeModels()[id] } : peer;
    },
    status: id => nativeActivity()[id] ?? state.agents.find(peer => peer.sessionID === id)?.activity ?? state.people[id]?.activity ?? 'idle',
    permission: { list: id => approvals()[id] ?? [], sync: async id => { report({ permissionSync: id }); } },
    form: { list: id => questions()[id] ?? [], sync: async id => { report({ formSync: id }); } },
  }, location: {
  agent: { list: () => agentList(), sync: async location => { report({ catalog: 'agent', location }); } },
  model: { list: () => modelList(), sync: async location => {
    report({ catalog: 'model', location }); if (failCatalog) throw new Error('Catalog unavailable');
    if (modelList() === undefined) setModelList(models);
  } },
  provider: { list: () => providerList(), sync: async location => {
    report({ catalog: 'provider', location }); if (failCatalog) throw new Error('Catalog unavailable');
    if (providerList() === undefined) setProviderList(providers);
  } },
} };
const composerModel = { providerID: 'fixture-provider', modelID: 'fixture-model', variant: 'deep' };
const [composerChoice, setComposerChoice] = createSignal(composerModel);
const settingData = new Map();
const preferences = createSettings({ get: async key => settingData.get(key),
  set: async (key, value) => { settingData.set(key, structuredClone(value)); } }, task => task());
const readSettings = async () => ({ ...await preferences.get(), discoveryMode: state.discovery.mode, capabilities: structuredClone(state.capabilities) });
// Gives fixture records the scopes the engine would have stored them under.
function labelHistory() {
  const core = { teams: Object.fromEntries(state.teams.map(team => [team.id, team])) };
  for (const message of state.messages) message.scope ??= scopeForMessage(core, message.from, message.to);
  for (const item of state.audit) item.scopes ??= item.action === 'message.admission'
    ? [state.messages.find(message => message.id === item.data?.id)?.scope ?? NO_TEAM] : scopesForAudit(core, item.actor, item.action, item.data ?? {});
}
const client = {
  project: { list: async () => structuredClone(projects) },
  worktree: { list: async () => [{ directory: 'C:/Projects/Engine-review', strategy: 'branch' }] },
  rpc: () => ({ settings: readSettings,
  teamCandidates: async input => {
    report({ teamCandidates: input });
    const query = input.query.toLowerCase();
    const rows = [...state.agents, ...Object.values(state.people)].filter(peer => !peer.archived && !input.exclude?.includes(peer.sessionID) &&
      (state.discovery.mode === 'automatic' || state.discovery.registered.includes(peer.sessionID)) &&
      [peer.name, peer.role, peer.directory, peer.sessionID].some(value => value.toLowerCase().includes(query)));
    const page = Math.min(input.page, Math.max(0, Math.ceil(rows.length / 50) - 1));
    return { items: structuredClone(rows.slice(page * 50, (page + 1) * 50)), total: rows.length, page };
  },
  teamManage: async value => {
    report({ ...value, userTeam: true });
    if (value.revision !== state.revision) throw new Error('state_changed_request_again');
    const { action, input } = value;
    if (action === 'team.create') state.teams.push({ id: `team_${state.teams.length}`, name: input.name, members: input.members });
    if (action === 'team.update') Object.assign(state.teams.find(team => team.id === input.id), input);
    if (action === 'team.delete') {
      labelHistory();
      state.messages = state.messages.filter(message => message.scope !== input.id);
      for (const item of state.audit) item.scopes = item.scopes.filter(scope => scope !== input.id);
      state.audit = state.audit.filter(item => item.scopes.length);
      state.teams = state.teams.filter(team => team.id !== input.id);
    }
    state.revision++;
  },
  removeData: async value => {
    report({ removeData: value });
    Object.assign(state, { teams: [], connections: [], messages: [], audit: [], people: {} });
    state.discovery.registered = []; state.revision = 0;
    await preferences.set({ command: 'team' });
    return { removed: true };
  },
  profileManage: async value => {
    report({ ...value, userProfile: true });
    if (profileFailure) throw profileFailure;
    if (value.revision !== state.revision) throw new Error('state_changed_request_again');
    const peer = state.agents.find(peer => peer.sessionID === value.sessionID) ?? state.people[value.sessionID];
    if (!peer) throw new Error('invalid_session');
    Object.assign(peer, value.input);
    state.revision++;
  },
  configure: async input => {
    if (input.command !== undefined) await preferences.set(input);
    if (input.capabilities) state.capabilities = { ...state.capabilities, ...structuredClone(input.capabilities) };
    if (input.discoveryMode) state.discovery.mode = input.discoveryMode;
    report({ configure: input }); return readSettings();
  },
  snapshot: async input => {
    report({ snapshot: true, input });
    labelHistory();
    // RPC crosses a serialisation boundary. Never let the UI store reconcile into the fixture's source objects.
    const copy = structuredClone(state);
    copy.messages.sort((a, b) => a.at - b.at);
    copy.audit.sort((a, b) => a.at - b.at);
    const count = scope => ({ messages: state.messages.filter(message => message.scope === scope).length, activity: state.audit.filter(item => item.scopes.includes(scope)).length });
    copy.scopes = { teams: Object.fromEntries(state.teams.map(team => [team.id, count(team.id)])), none: count(NO_TEAM), general: count(GENERAL) };
    if (input?.scope) {
      copy.messages = copy.messages.filter(message => message.scope === input.scope);
      copy.audit = copy.audit.filter(item => item.scopes.includes(input.scope));
    }
    copy.messages = copy.messages.slice(-(input?.limit ?? 200));
    copy.audit = copy.audit.slice(-(input?.limit ?? 200));
    if (heldSnapshot?.scope === input?.scope) {
      const held = heldSnapshot; heldSnapshot = undefined;
      await held.promise; held.finished = true;
    }
    return copy;
  }, manage: async value => {
    report(value);
    const { action, input, sessionID } = value;
    if (action === 'discovery.unregister') state.discovery.registered = state.discovery.registered.filter(id => id !== sessionID);
    if (action === 'discovery.register' && !state.discovery.registered.includes(sessionID)) state.discovery.registered.push(sessionID);
    if (action === 'profile.update') Object.assign(state.agents.find(peer => peer.sessionID === sessionID) ?? state.people[sessionID], input);
    if (action === 'team.create') state.teams.push({ id: `team_${state.teams.length}`, name: input.name, members: input.members });
    if (action === 'team.members') state.teams.find(team => team.id === input.id).members = input.members;
    if (action === 'team.delete') state.teams = state.teams.filter(team => team.id !== input.id);
    if (action === 'connection.close') state.connections.find(item => item.id === input.id).active = false;
  } }) };
const server = { id: 'fixture', client, data, builtin: true, local: true };
const session = { key: 'fixture\nses_alice', id: 'ses_alice', server, project: { id: 'project-a', name: 'Engine' }, location: { directory: 'C:/Projects/Engine' } };
const [selectedSession, setSelectedSession] = createSignal(session);
const expansionStores = new Map();
function teamExpansion(target) {
  const key = `agent-teams-preview:expansion:${JSON.stringify([target.server.id, target.location.directory, target.id])}`;
  if (!expansionStores.has(key)) {
    let initial = { expandedTeams: [] };
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (Array.isArray(saved?.expandedTeams) && saved.expandedTeams.every(id => typeof id === 'string')) initial = saved;
    } catch { /* Use the initial state for invalid preview preferences. */ }
    const [value, setValue] = createSignal(initial);
    expansionStores.set(key, { get value() { return value(); }, ready: () => true,
      update(mutate) {
        const draft = structuredClone(value()); mutate(draft);
        localStorage.setItem(key, JSON.stringify(draft)); setValue(draft);
      } });
  }
  return expansionStores.get(key);
}
const savedOrder = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem('agent-teams-preview:order'));
    return Array.isArray(saved?.order) ? saved : { order: [] };
  } catch { return { order: [] }; }
})();
const [orderValue, setOrderValue] = createSignal(savedOrder);
const teamOrder = { get value() { return orderValue(); }, ready: () => true,
  update(mutate) {
    const draft = structuredClone(orderValue()); mutate(draft);
    localStorage.setItem('agent-teams-preview:order', JSON.stringify(draft)); setOrderValue(draft);
  } };
const savedHistory = JSON.parse(localStorage.getItem('agent-teams-preview:historySelection') ?? '{}');
const [historyValue, setHistoryValue] = createSignal({ messages: savedHistory.messages ?? {}, activity: savedHistory.activity ?? {} });
const historySelection = { get value() { return historyValue(); }, ready: () => true,
  update(mutate) {
    const draft = structuredClone(historyValue()); mutate(draft);
    localStorage.setItem('agent-teams-preview:historySelection', JSON.stringify(draft)); setHistoryValue(draft);
  } };
const dialogHost = dialogs(report);
function showView(view, target) {
  dialogHost.closeAll();
  disposeView?.();
  setSelectedSession(view === 'settings' ? undefined : session);
  setPreviewView(view);
  setPanelOpen(view === 'dashboard');
  const url = new URL(window.location.href);
  url.searchParams.set('view', view);
  window.history.replaceState(null, '', url);
  disposeView = render(() => view === 'settings' ? window.fixtureSettings.render({ target }) : panel.render(), document.querySelector('#app'));
}
const ctx = { id: 'agent-teams-for-opencode', client, ui, dialogs: dialogHost.api,
  stores: { teamExpansion, teamOrder, historySelection }, storage: { remove: (key, options) => report({ storageRemove: key, options: { from: options?.from, session: options?.scope?.session?.id } }) },
  screen: { current: () => ({ composer: { model: () => ({ ...composerChoice() }),
    setModel: value => { report({ composerSetModel: value }); return true; } } }) },
  sessions: { current: selectedSession }, servers: { list: () => ['fixture'], get: () => server },
  tabs: { open: value => report({ navigation: value }) }, layout: {
    open: (value, target) => { setPanelOpen(true); report({ panel: value, session: target.id }); },
    state: () => panelOpen() ? 'visible' : 'closed', settings: page => { report({ settings: page }); showView('settings'); },
  },
  toast: { show: value => report({ toast: value }) }, attention: { notify: async value => report({ notification: value }) },
  add(token, value) {
    if (token === Style) { const tag = document.createElement('style'); tag.textContent = value; document.head.append(tag); }
    if (token === Panel) { panel = value; disposeView = render(() => value.render(), document.querySelector('#app')); }
    if (token === Command) {
      if (typeof value === 'function') {
        let resolved;
        createEffect(() => { resolved = value(); commandUpdates++; });
        commands.push(() => resolved);
      } else commands.push(value);
    }
    if (token === MenuItem) menus.push(value);
    if (token === SettingsPage) window.fixtureSettings = value;
  },
};
render(dialogHost.Host, document.querySelector('#dialogs'));
createRoot(dispose => { window.disposeFixture = dispose; plugin.setup(ctx); });
render(() => PreviewToolbar({ view: previewView, onView: showView }), document.querySelector('#preview-toolbar'));
window.fixture = { teamOrder, historySelection, state, calls, composerModel, models, providers, openCodeAgents, setAgentList,
  holdSnapshot: scope => {
    let release;
    const held = { scope, promise: new Promise(resolve => { release = resolve; }), finished: false };
    heldSnapshot = held;
    window.fixture.releaseSnapshot = () => release();
    window.fixture.heldSnapshot = held;
  },
  switchSession: (id, serverID = 'fixture') => setSelectedSession({ ...session, id, key: `${serverID}\n${id}`, server: { ...server, id: serverID } }),
  failProfile: error => { profileFailure = error; },
  setComposerModel: model => setComposerChoice(model),
  setNativeModel: (id, model) => setNativeModels(value => ({ ...value, [id]: model })),
  setAttention: (id, approval, question, activity) => {
    setApprovals(value => ({ ...value, [id]: approval ? [{ id: 'permission_test' }] : [] }));
    setQuestions(value => ({ ...value, [id]: question ? [{ id: 'form_test' }] : [] }));
    if (activity) setNativeActivity(value => ({ ...value, [id]: activity }));
  },
  setCatalog: (nextModels, nextProviders = providers) => { setModelList(nextModels); setProviderList(nextProviders); },
  failCatalog: value => { failCatalog = value; }, get commandUpdates() { return commandUpdates; },
  get commands() { return commands.map(value => typeof value === 'function' ? value() : value); },
  menus, panel, closePanel: () => setPanelOpen(false),
  get view() { return previewView(); },
  showSettings: target => showView('settings', target),
  showDashboard: () => showView('dashboard'),
  emit: (name, event) => listeners.get(name)?.(event) };
showView(new URLSearchParams(window.location.search).get('view') === 'settings' ? 'settings' : 'dashboard');
