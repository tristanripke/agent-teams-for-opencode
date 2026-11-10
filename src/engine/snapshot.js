// What a session or the user sees: discover for agents, the dashboard snapshot, and the team form's session search.
import { NO_TEAM, GENERAL, RECENT_RECORDS, historyCounts, unacknowledged as waitingIn } from '../history.js';
import { fail, clone, identifier, millis } from './shared.js';
import { identity, listedSession, isListed } from './sessions.js';

// An agent's discover result goes into its model context, so it carries only recent messages.
const AGENT_MESSAGES = 50, AGENT_ACTIVITY = 50, AGENT_MESSAGE_BYTES = 64 * 1024;
// An agent sees at most this many peers, newest first. agentsOmitted counts the rest.
const AGENT_PEERS = 100;

export function createViews({ limits, now, queue, attention, store: { load, save, historyOf },
  sessions: { peer, peers, reconcileState, catalogFor, countedSessions } }) {
  function selfOf(item, state, list) {
    const recent = (state.rate[item.id] ?? []).filter(at => at > now() - 60000);
    return { ...identity(item, state), capabilities: clone(state.capabilities),
      quota: { managedSessions: (counted => ({ used: counted.length, limit: limits.managedSessions,
        unlisted: counted.filter(entry => !isListed(state, entry.sessionID)).length }))(countedSessions(list, state)) },
      messages: { perMinuteRemaining: Math.max(0, limits.messagesPerMinute - recent.length), perMinute: limits.messagesPerMinute } };
  }
  async function snapshot(actor, viewer, options = {}) {
    const self = actor === undefined ? undefined : await peer(actor);
    const list = await peers();
    // Only a running session can be waiting for a person. Each is looked up once, then followed through events.
    const running = item => millis(item.time?.busy) > millis(item.time?.idle);
    await attention?.refresh(list.filter(running).map(item => item.id));
    const blockedOn = item => { const reason = running(item) ? attention?.of(item.id) : undefined; return reason ? { waitingFor: reason } : {}; };
    const found = options.catalog && self ? await catalogFor(self.location.directory) : undefined;
    return queue(async () => {
      const state = await load();
      await reconcileState(state, list);
      await save(state);
      const listed = item => listedSession(state, item);
      // Archived sessions can't receive messages, so no view lists them. An agent sees only the newest peers.
      const shown = list.filter(item => listed(item) && !item.time?.archived);
      const forAgent = (rows, row) => ({ agents: rows.slice(0, AGENT_PEERS).map(row),
        ...(rows.length > AGENT_PEERS ? { agentsOmitted: rows.length - AGENT_PEERS } : {}) });
      if (options.scope !== undefined && !identifier(options.scope)) fail('invalid_action_input');
      const connections = Object.values(state.connections).map(item => ({ ...item, active: !item.closed && item.expiresAt > now() }));
      const agentSelf = () => self ? { self: { ...selfOf(self, state, list),
        ...(options.catalog ? { catalog: found ?? { unavailable: true } } : {}) } } : {};
      // A short view reads the saved summary of unacknowledged messages, never a history. A scope saved before the
      // summary existed is read once, and its summary is saved for next time.
      if (options.compact && self) {
        const mine = item => item.members.includes(actor);
        const scopes = [...Object.values(state.teams).filter(mine).map(team => team.id), NO_TEAM];
        const waiting = new Set();
        let filled = false;
        for (const id of scopes) {
          // Unknown, from an interrupted save, is always read. A missing summary is read only if the counts say the
          // scope holds a message, so an empty scope never is.
          const saved = state.unacknowledged[id];
          if (saved === null || (saved === undefined && state.counts[id]?.messages))
            { state.unacknowledged[id] = waitingIn(await historyOf(state).scope(id)); filled = true; }
          for (const message of state.unacknowledged[id]?.[actor] ?? []) waiting.add(message);
        }
        for (const receipt of Object.values(state.receipts)) {
          if (receipt.to === actor && ['accepted', 'delivered'].includes(receipt.status)) waiting.add(receipt.id);
        }
        if (filled) await save(state);
        return { ...agentSelf(), revision: state.revision, discovery: { mode: state.discovery.mode },
          ...forAgent(shown.filter(item => item.id !== actor), item => {
            const peerIdentity = identity(item, state);
            return { sessionID: peerIdentity.sessionID, name: peerIdentity.name, role: peerIdentity.role,
              directory: peerIdentity.directory, activity: peerIdentity.activity, ...blockedOn(item) };
          }),
          teams: Object.values(state.teams).filter(mine), connections: connections.filter(item => item.active && mine(item)),
          unacknowledged: [...waiting] };
      }
      // Only the scopes this view needs are read, so another team's history costs it nothing.
      const wanted = actor !== undefined
        ? [...Object.values(state.teams).filter(team => team.members.includes(actor)).map(team => team.id), NO_TEAM, GENERAL]
        : options.scope !== undefined ? [options.scope] : Object.keys(state.counts);
      const histories = await Promise.all(wanted.map(id => historyOf(state).scope(id)));
      let messages = histories.flatMap(history => Object.values(history.messages))
        .filter(item => actor === undefined || item.from === actor || item.to === actor);
      // An entry about several teams is stored once per team, so only a view across scopes can see it twice.
      const seen = new Set();
      let audit = histories.flatMap(history => history.audit).filter(item => {
        if (actor !== undefined && item.actor !== actor) return false;
        if (histories.length === 1) return true;
        const key = JSON.stringify(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).sort((a, b) => a.at - b.at);
      messages.sort((a, b) => a.at - b.at);
      const scopes = actor === undefined ? historyCounts(state) : undefined;
      let messagesOmitted;
      if (actor === undefined) {
        const limit = Number.isSafeInteger(options.limit) && options.limit > 0 ? options.limit : RECENT_RECORDS;
        messages = messages.slice(-limit);
        audit = audit.slice(-limit);
      } else {
        const total = messages.length;
        let bytes = 0, kept = 0;
        for (const message of messages.slice(-AGENT_MESSAGES).reverse()) {
          bytes += Buffer.byteLength(JSON.stringify(message), 'utf8');
          if (kept && bytes > AGENT_MESSAGE_BYTES) break;
          kept++;
        }
        messages = messages.slice(-kept || total);
        messagesOmitted = total - messages.length;
        audit = audit.slice(-AGENT_ACTIVITY);
      }
      // An agent sees its own teams and connections in full. Other teams show their name and only their listed members,
      // so an agent knows whom to ask to be added. Unlisted members of those teams stay hidden: they chose not to be
      // found, and in the same project they could otherwise be messaged.
      const visible = item => actor === undefined || item.members.includes(actor);
      const ownTeams = Object.values(state.teams).filter(visible), visibleConnections = connections.filter(visible);
      const listedIDs = new Set(list.filter(listed).map(item => item.id));
      const visibleTeams = actor === undefined ? ownTeams : Object.values(state.teams).map(team => visible(team) ? team
        : { id: team.id, name: team.name, members: team.members.filter(id => listedIDs.has(id)), membersShown: 'listed' });
      // Names for unlisted members of the agent's own collaborations. They do not become discoverable.
      const referenced = new Set([...ownTeams.flatMap(item => item.members),
        ...visibleConnections.flatMap(item => item.members), ...messages.flatMap(item => [item.from, item.to]),
        ...audit.flatMap(item => [item.actor, item.data?.to, item.data?.sessionID]),
        ...(typeof viewer === 'string' ? [viewer] : [])]);
      const row = item => ({ ...identity(item, state), ...blockedOn(item) });
      const agentRows = actor === undefined ? { agents: shown.map(row) } : forAgent(shown, row);
      const inAgents = new Set(agentRows.agents.map(item => item.sessionID));
      const people = Object.fromEntries(list.filter(item => referenced.has(item.id) && !inAgents.has(item.id))
        .map(item => [item.id, identity(item, state)]));
      // Plugin-created sessions count against the limit even when nobody can discover them.
      return { ...agentSelf(), revision: state.revision, capabilities: clone(state.capabilities), limits,
        discovery: { mode: state.discovery.mode, registered: Object.keys(state.discovery.registrations) },
        ...agentRows, people, teams: visibleTeams,
        connections: visibleConnections, messages, audit, ...(scopes ? { scopes } : { messagesOmitted }) };
    });
  }
  // A user API: the sessions a team form can add.
  async function teamCandidates(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['query', 'page', 'exclude'].includes(key)) ||
      (input.query !== undefined && (typeof input.query !== 'string' || input.query.length > 240)) ||
      (input.exclude !== undefined && (!Array.isArray(input.exclude) || input.exclude.length > 32 || input.exclude.some(id => !identifier(id)))) ||
      (input.page !== undefined && (!Number.isSafeInteger(input.page) || input.page < 0))) fail('invalid_action_input');
    const list = await peers();
    return queue(async () => {
      const state = await load(), query = (input.query ?? '').trim().toLowerCase();
      const rows = list.filter(item => !item.time?.archived &&
        !input.exclude?.includes(item.id) && listedSession(state, item)).map(item => identity(item, state))
        .filter(item => !query || [item.name, item.role, item.directory, item.sessionID].some(value => value.toLowerCase().includes(query)));
      const page = Math.min(input.page ?? 0, Math.max(0, Math.ceil(rows.length / 50) - 1));
      return { items: rows.slice(page * 50, (page + 1) * 50), total: rows.length, page };
    });
  }
  return { snapshot, teamCandidates };
}
