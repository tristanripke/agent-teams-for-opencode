// The saved core record: loading and checking it, saving it with its history, settings, and removing everything.
import { CAPABILITIES, CAPABILITY_VALUES } from '../manage-schema.js';
import { openHistory, expireRetries, scopesForAudit } from '../history.js';
import { DEFAULT_CAPABILITIES, REMOVE_DATA_CONFIRMATION, fail, clone, identifier } from './shared.js';

const KEY = 'collaboration.v1';
const ENDED_CONNECTION_KEPT = 7 * 24 * 60 * 60 * 1000;
const initial = () => ({ version: 1, revision: 0, capabilities: { ...DEFAULT_CAPABILITIES }, profiles: {},
  discovery: { mode: 'registered', registrations: {} },
  teams: {}, connections: {}, receipts: {}, created: {}, counts: {}, unacknowledged: {}, rate: {}, operations: {} });
const validCapabilities = value => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === CAPABILITIES.length &&
  Object.entries(value).every(([key, setting]) => CAPABILITIES.includes(key) && CAPABILITY_VALUES.includes(setting));

export function createStore({ storage, limits, now, queue, titles }) {
  const open = new WeakMap();
  const historyOf = state => open.get(state);
  const start = (state, savedText) => {
    const history = openHistory(storage, state, savedText, { records: limits.records, now, invalid: () => fail('invalid_stored_state') });
    open.set(state, history);
    return history;
  };
  async function load() {
    const state = await storage.get(KEY);
    if (state === undefined) { const fresh = initial(); start(fresh, JSON.stringify(fresh)); return fresh; }
    if (state?.version !== 1 || !state.teams ||
      !state.connections || !state.operations || !state.profiles || !state.rate ||
      !Number.isSafeInteger(state.revision) || !validCapabilities(state.capabilities)) fail('invalid_stored_state');
    const recovered = clone(state);
    const discovery = recovered.discovery;
    if (!discovery || !['registered', 'automatic'].includes(discovery.mode) ||
      !discovery.registrations || Array.isArray(discovery.registrations) ||
      typeof discovery.registrations !== 'object' ||
      Object.entries(discovery.registrations).some(([id, value]) => !identifier(id) || !id.startsWith('ses_') || value !== true)) fail('invalid_stored_state');
    for (const field of ['receipts', 'created', 'counts', 'unacknowledged']) {
      recovered[field] ??= {};
      if (!recovered[field] || typeof recovered[field] !== 'object' || Array.isArray(recovered[field])) fail('invalid_stored_state');
    }
    start(recovered, JSON.stringify(state));
    return recovered;
  }
  async function save(state) {
    expireRetries(state, now());
    for (const [actor, times] of Object.entries(state.rate)) {
      const recent = times.filter(at => at > now() - 60000);
      if (recent.length) state.rate[actor] = recent;
      else delete state.rate[actor];
    }
    for (const [id, connection] of Object.entries(state.connections)) {
      if ((connection.closedAt ?? connection.expiresAt) <= now() - ENDED_CONNECTION_KEPT) delete state.connections[id];
    }
    await historyOf(state).commit();
  }
  async function maintain() { return queue(async () => save(await load())); }
  // A partial change merged over the saved values; own keys only.
  function mergeCapabilities(current, change) {
    const valid = change && typeof change === 'object' && !Array.isArray(change) && Object.keys(change).length > 0 &&
      Object.entries(change).every(([key, value]) => CAPABILITIES.includes(key) && CAPABILITY_VALUES.includes(value));
    const merged = { ...current };
    if (valid) for (const key of Object.keys(change)) merged[key] = change[key];
    if (!valid || !validCapabilities(merged)) fail('invalid_capabilities', { allowed: CAPABILITIES, values: CAPABILITY_VALUES,
      remedy: 'Set one or more listed capabilities to allow, ask or deny.' });
    return merged;
  }
  const configurationOf = state => ({ discoveryMode: state.discovery.mode, capabilities: clone(state.capabilities) });
  const configuration = () => queue(async () => configurationOf(await load()));
  async function configure(input) {
    input = clone(input);
    return queue(async () => {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 ||
        !['capabilities', 'discoveryMode'].includes(Object.keys(input)[0])) fail('invalid_setting');
      const state = await load();
      if (Object.hasOwn(input, 'capabilities')) state.capabilities = mergeCapabilities(state.capabilities, input.capabilities);
      else {
        if (!['registered', 'automatic'].includes(input.discoveryMode)) fail('invalid_discovery_mode');
        state.discovery.mode = input.discoveryMode;
      }
      state.revision++;
      audit(state, 'user', 'settings.update', { proposal: clone(input) });
      await save(state);
      return configurationOf(state);
    });
  }
  function audit(state, actor, action, data, scopes = scopesForAudit(state, actor, action, data)) {
    historyOf(state).audit({ at: now(), actor, action, data }, scopes);
  }
  // Everything this plugin stored, in every scope. The plugin's own namespace is all that storage can reach.
  async function removeData(confirm) {
    if (confirm !== REMOVE_DATA_CONFIRMATION) fail('invalid_action_input');
    return queue(async () => {
      for (;;) {
        const page = await storage.scan({ prefix: '', limit: 20 });
        if (!page.entries.length) break;
        for (const { key } of page.entries) await storage.remove(key);
      }
      titles.clear();
      return { removed: true };
    });
  }
  return { load, save, historyOf, audit, maintain, mergeCapabilities, configuration, configure, removeData };
}
