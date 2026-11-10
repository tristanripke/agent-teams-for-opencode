// Sessions as the host reports them: lookup, listing, names, projects, who may message whom, and deleted sessions.
import { isReservedName, cleanLabel } from '../manage-schema.js';
import { GENERAL } from '../history.js';
import { fail, identifier, millis } from './shared.js';

// The host copies session metadata to child sessions, so plugin-created sessions are recorded in state, never tagged.
// A team already limits its own size, so only sessions outside every team count here.
export const managed = (item, state) => !item.time?.archived && Object.hasOwn(state.created, item.id) &&
  !Object.values(state.teams).some(team => team.members.includes(item.id));
// A session that joined is always listed. Automatic listing covers top-level sessions only, so subagents stay out.
export const listedSession = (state, item) => Object.hasOwn(state.discovery.registrations, item.id) ||
  (state.discovery.mode === 'automatic' && !item.parentID);
// The plugin context reports the first tag and the HTTP client the second.
const SESSION_NOT_FOUND = ['Session.NotFoundError', 'SessionNotFoundError'];
const sessionNotFound = (error, id) => SESSION_NOT_FOUND.includes(error?._tag) && error.sessionID === id;
export function identity(item, state) {
  const profile = state.profiles[item.id] ?? {};
  const time = item.time ?? {};
  // Native titles can be set outside this plugin, so every name and role is cleaned here, once, for every view. A
  // session whose name reads as "You" or "user" is marked, so it can't pass as the user in Activity.
  const name = cleanLabel(profile.name ?? item.title) || item.id;
  return { sessionID: item.id, name: isReservedName(name) ? `${name} (agent)` : name,
    role: cleanLabel(profile.role ?? item.agent) || 'agent', projectID: item.projectID,
    directory: item.location.directory, archived: Boolean(time.archived),
    ...(item.model ? { model: { id: item.model.id, providerID: item.model.providerID,
      ...(item.model.variant ? { variant: item.model.variant } : {}) } } : {}),
    registered: Object.hasOwn(state.discovery.registrations, item.id),
    activity: millis(time.busy) > millis(time.idle) ? 'running' : 'idle' };
}
// One spelling per folder: separators, a trailing separator and, for Windows paths, letter case don't matter.
export const folderKey = directory => {
  const text = String(directory).replaceAll('\\', '/').replace(/\/+$/, '');
  return /^([a-z]:|\/\/)/i.test(text) ? text.toLowerCase() : text;
};
export const within = (directory, parent) => {
  const inner = folderKey(directory), outer = folderKey(parent);
  return !inner.split('/').includes('..') && (inner === outer || inner.startsWith(`${outer}/`));
};
export const projectKey = item => item.projectID === 'global' ? `directory:${item.location.directory}` : item.projectID;
// Every session the plugin creates is listed. One that later unregisters chose not to be found, so agents see it
// only as a count: same-project agents could otherwise message it. The limit still counts it.
export const isListed = (state, id) => state.discovery.mode === 'automatic' || Object.hasOwn(state.discovery.registrations, id);

export function createSessions({ session, titles, now, catalog, queue, store: { load, save, historyOf, audit } }) {
  async function peer(id) {
    if (!identifier(id) || !id.startsWith('ses_')) fail('invalid_session_id', { sessionID: id });
    // The host's error has an empty message, so it would otherwise reach agents as a blank failure.
    const item = await session.get({ sessionID: id }).catch(error => { if (!sessionNotFound(error, id)) throw error; });
    if (item?.id !== id || !item.projectID || !item.location?.directory) fail('invalid_session', { sessionID: id });
    return item;
  }
  async function peers() {
    const result = [], cursors = new Set();
    let cursor;
    for (let page = 0; page < 1000; page++) {
      const response = await session.list(cursor ? { limit: 100, cursor } : { limit: 100, order: 'desc' });
      if (!Array.isArray(response?.data) || !response.cursor) fail('invalid_discovery_response');
      result.push(...response.data);
      for (const item of response.data) if (item.title) titles.set(item.id, item.title);
      cursor = response.cursor.next;
      if (!cursor || response.data.length === 0) return result;
      if (cursors.has(cursor)) fail('repeated_discovery_cursor');
      cursors.add(cursor);
    }
    fail('discovery_page_limit');
  }
  // A system change: it needs no approval, reads no capability and messages nobody.
  function removeDeleted(state, deleted) {
    const teams = Object.values(state.teams).filter(team => team.members.some(id => deleted.includes(id)));
    for (const team of teams) {
      for (const id of team.members.filter(id => deleted.includes(id))) {
        const name = state.profiles[id]?.name ?? titles.get(id);
        audit(state, 'system', 'team.member.removed', { teamID: team.id, teamName: team.name, sessionID: id, ...(name ? { name } : {}) });
      }
      team.members = team.members.filter(id => !deleted.includes(id));
      if (!team.members.length) {
        delete state.teams[team.id];
        historyOf(state).forget(team.id);
        audit(state, 'system', 'team.removed', { teamID: team.id, teamName: team.name }, [GENERAL]);
      }
    }
    if (teams.length) state.revision++;
    let forgotten = false;
    for (const id of deleted) {
      titles.delete(id);
      for (const records of [state.created, state.profiles, state.discovery.registrations]) {
        if (Object.hasOwn(records, id)) { delete records[id]; forgotten = true; }
      }
    }
    return teams.length > 0 || forgotten;
  }
  // Only the host's own not-found answer for this ID proves deletion. Any other failure keeps the member.
  async function confirmedDeleted(id) {
    try { await session.get({ sessionID: id }); return false; }
    catch (error) { return sessionNotFound(error, id); }
  }
  // Runs inside the queue. The listing only narrows the candidates, so a short page cannot remove anyone.
  async function reconcileState(state, list, everything = false) {
    const listed = new Set(list.map(item => item.id));
    // Reads check only what affects them. Profiles and registrations of other gone sessions wait for startup.
    const absent = [...new Set([...Object.values(state.teams).flatMap(team => team.members), ...Object.keys(state.created),
      ...(everything ? [...Object.keys(state.profiles), ...Object.keys(state.discovery.registrations)] : [])])].filter(id => !listed.has(id));
    if (!absent.length) return;
    const confirmed = await Promise.all(absent.map(confirmedDeleted));
    if (removeDeleted(state, absent.filter((_, index) => confirmed[index]))) await save(state);
  }
  // Catches deletions that no running plugin saw. A failed listing rejects before any state is read.
  async function reconcile() {
    const list = await peers();
    return queue(async () => {
      const state = await load();
      await reconcileState(state, list, true);
      await historyOf(state).repair();
      await save(state);
    });
  }
  // Every location instance receives the event, so a repeat must change nothing.
  async function sessionDeleted(id) {
    return queue(async () => {
      const state = await load();
      if (removeDeleted(state, [id])) await save(state);
    });
  }
  function authorized(state, from, to) {
    if (projectKey(from) === projectKey(to)) return true;
    if (Object.values(state.teams).some(team => team.members.includes(from.id) && team.members.includes(to.id))) return true;
    return Object.values(state.connections).some(connection =>
      !connection.closed && connection.expiresAt > now() &&
      connection.members.includes(from.id) && connection.members.includes(to.id));
  }
  async function catalogFor(directory) {
    if (!catalog) return undefined;
    try {
      const [agents, models] = await Promise.all([catalog.agents(directory), catalog.models(directory)]);
      return { agents, models };
    } catch { return undefined; }
  }
  function countedSessions(list, state) {
    return list.filter(item => managed(item, state)).map(item => ({ sessionID: item.id, name: identity(item, state).name,
      registered: Object.hasOwn(state.discovery.registrations, item.id),
      lastActive: new Date(Math.max(millis(item.time?.updated), millis(item.time?.busy), millis(item.time?.idle),
        millis(item.time?.created))).toISOString() }));
  }
  return { peer, peers, reconcileState, reconcile, sessionDeleted, authorized, catalogFor, countedSessions };
}
