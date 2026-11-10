// The manage action for agents and for the user's own controls: validation, capabilities, approval and commit.
import { ACTIONS, hintFor, validateInput, cleanLabel, nameKey } from '../manage-schema.js';
import { GENERAL } from '../history.js';
import { fail, clone } from './shared.js';
import { identity, folderKey, within, projectKey, isListed } from './sessions.js';

// The user's own controls act without asking. Permission and listing changes stay in the settings.
const USER_ACTIONS = Object.freeze(Object.keys(ACTIONS).filter(action => !['policy.update', 'discovery.update'].includes(action)));
// Text from outside the plugin, such as a folder path, shown without control or direction characters.
const readable = value => String(value).replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, '');

export function createManagement({ session, approve, limits, now, uuid, sessionID, queue,
  store: { load, save, historyOf, audit, mergeCapabilities }, sessions: { peer, peers, catalogFor, countedSessions } }) {
  // Capabilities an action uses. Policy and discovery-mode requests always need approval.
  // places: sessions whose projects decide cross-project approval, when they differ from members.
  function categories(action, state, members, user, places = members) {
    // The user's own click is the approval, and permissions limit agents, not the user.
    if (user) return [];
    if (action === 'policy.update') return ['policy'];
    if (action === 'discovery.update') return ['discovery'];
    const result = [];
    if (action === 'session.create') result.push('createSession');
    if (action === 'session.create' && members) result.push('changeMembers');
    if (action === 'team.create') result.push('createTeam', 'changeMembers');
    if (['team.members', 'team.delete'].includes(action)) result.push('changeMembers');
    if (action === 'connection.create') result.push('openConnection');
    if (action === 'connection.extend') result.push('extendConnection');
    if (places && new Set(places.map(projectKey)).size > 1) result.push('workAcrossProjects');
    const needed = [...new Set(result)];
    const denied = needed.filter(item => state.capabilities[item] === 'deny');
    if (denied.length) fail('capability_denied', { action, denied,
      remedy: 'A user can allow these in Settings → Agent Teams, or request a change with manage policy.update (needs approval).' });
    return needed.filter(item => state.capabilities[item] === 'ask');
  }
  function invalidInput(action, missing, invalid, hint = hintFor(action)) {
    fail('invalid_action_input', { action, missing, invalid, hint });
  }
  // Validates agent and model against the target directory's native catalog when it is readable.
  async function catalogProblems(input, directory) {
    const found = await catalogFor(directory);
    if (!found) return { invalid: [], hints: [] };
    const invalid = [], hints = [];
    const agents = found.agents.map(item => item.id);
    if (agents.length) {
      hints.push(`agent must be one of: ${agents.join(', ')}`);
      if (input.agent !== undefined && !agents.includes(input.agent)) invalid.push({ field: 'agent', reason: 'is not an available agent', allowed: agents });
    }
    if (found.models.length) {
      const sample = found.models.slice(0, 20).map(item => `${item.providerID}/${item.id}`);
      hints.push(`model is {providerID,id}, for example: ${sample.join(', ')}${found.models.length > sample.length
        ? ' (call discover with catalog:true for all)' : ''}`);
      const model = input.model && typeof input.model === 'object' ? found.models.find(item =>
        item.providerID === input.model.providerID && item.id === input.model.id) : undefined;
      if (input.model?.providerID !== undefined && input.model?.id !== undefined && !model)
        invalid.push({ field: 'model', reason: 'is not an enabled chat model for this directory' });
      if (model && input.model.variant !== undefined && model.variants?.length && !model.variants.includes(input.model.variant))
        invalid.push({ field: 'model.variant', reason: 'is not a variant of this model', allowed: model.variants });
    }
    return { invalid, hints };
  }
  async function prepare(actor, action, input, state, user) {
    const self = await peer(actor);
    if (!Object.hasOwn(ACTIONS, action)) fail('unknown_action', { action, allowed: Object.keys(ACTIONS) });
    if (user && !USER_ACTIONS.includes(action)) fail('unknown_action', { action, allowed: [...USER_ACTIONS] });
    // Report every shape problem before any membership, limit or approval check.
    const shape = validateInput(action, input, limits);
    if (action === 'session.create' && input && typeof input === 'object' && !Array.isArray(input)) {
      // Without a usable directory, the acting session's catalog still lists valid values.
      const usable = typeof input.directory === 'string' && !shape.invalid.some(item => item.field === 'directory');
      const extra = await catalogProblems(usable ? input : { ...input, agent: undefined, model: undefined },
        usable ? input.directory : self.location.directory);
      shape.invalid.push(...extra.invalid);
      if (shape.missing.length || shape.invalid.length) invalidInput(action, shape.missing, shape.invalid,
        [...extra.hints, hintFor(action)].join('; '));
    }
    if (shape.missing.length || shape.invalid.length) invalidInput(action, shape.missing, shape.invalid);
    let members, places;
    if (['team.create', 'team.members', 'connection.create'].includes(action)) {
      if (!input.members.includes(actor)) invalidInput(action, [], [{ field: 'members', reason: 'must include the acting session', sessionID: actor }]);
      members = await Promise.all(input.members.map(peer));
    }
    // Only current members can change or delete a team, as with connections.
    if (action.startsWith('team.') && action !== 'team.create' &&
      (!Object.hasOwn(state.teams, input.id) || !state.teams[input.id].members.includes(actor))) fail('team_not_found', { teamID: input.id });
    if (action === 'team.create' && Object.values(state.teams).some(team => nameKey(team.name) === nameKey(input.name)))
      fail('team_name_exists', { name: input.name.trim() });
    // New team members and every connection member must have joined the list, unless listing is automatic.
    if (['team.create', 'team.members', 'connection.create'].includes(action) && state.discovery.mode !== 'automatic') {
      const kept = action === 'team.members' ? state.teams[input.id].members : [];
      const unregistered = input.members.filter(id => !kept.includes(id) && !Object.hasOwn(state.discovery.registrations, id));
      if (unregistered.length) fail('member_not_registered', { sessions: unregistered,
        names: members.filter(item => unregistered.includes(item.id)).map(item => identity(item, state).name) });
    }
    if (action.startsWith('connection.') && action !== 'connection.create') {
      const connection = Object.hasOwn(state.connections, input.id) ? state.connections[input.id] : undefined;
      if (!connection || !connection.members.includes(actor)) fail('connection_not_found', { connectionID: input.id });
      if (action === 'connection.extend' && (connection.closed || connection.expiresAt <= now())) fail('connection_expired', { connectionID: input.id });
      if (action === 'connection.extend') members = await Promise.all(connection.members.map(peer));
    }
    if (action === 'session.create') {
      const list = await peers();
      const counted = countedSessions(list, state);
      if (input.teamID === undefined && counted.length >= limits.managedSessions) {
        const shown = counted.filter(item => isListed(state, item.sessionID));
        fail('session_creation_limit', { used: counted.length, limit: limits.managedSessions, counted: shown, countedUnlisted: counted.length - shown.length,
          remedy: 'Archive a counted session, add it to a team, or ask the operator to raise options.limits.managedSessions in this plugin\'s ' +
            'opencode.json(c) entry. Unlisted sessions are counted but not named. Ask the user about them.' });
      }
      // A session already in that exact folder shows which project it is, so a nested project inside the requester's
      // folder still counts as another one. With no session there, the requester's own folder and anything inside it
      // is its project, and a folder elsewhere counts as its own project.
      const target = list.find(item => folderKey(item.location.directory) === folderKey(input.directory)) ??
        (within(input.directory, self.location.directory) ? self : { projectID: 'global', location: { directory: input.directory } });
      if (input.teamID === undefined) places = [self, target];
      if (input.teamID !== undefined) {
        const team = Object.hasOwn(state.teams, input.teamID) ? state.teams[input.teamID] : undefined;
        if (!team || !team.members.includes(actor)) fail('team_not_found', { teamID: input.teamID });
        if (team.members.length >= 32) fail('team_full', { teamID: input.teamID, limit: 32, remedy: 'Remove a member or use another team.' });
        // Include the requested directory in the cross-project approval check.
        members = [...await Promise.all(team.members.map(peer)), target];
      }
    }
    if (action === 'policy.update') mergeCapabilities(state.capabilities, input.capabilities);
    return categories(action, state, members, user, places ?? members);
  }
  // What an approval allows: a headline, then one line per session or setting. Labels can't contain line breaks, so a
  // name can't pass as another line. Sessions show by name and folder, never by ID.
  async function describe(actor, action, input, state) {
    const nameOf = item => { const name = identity(item, state).name; return name === item.id ? 'an untitled session' : name; };
    const who = async ids => (await Promise.all(ids.map(id => peer(id).catch(() => undefined))))
      .map(item => item ? `${nameOf(item)} (${readable(item.location.directory)})` : 'a session that no longer exists');
    const team = id => `"${cleanLabel(state.teams[id]?.name ?? '')}"`;
    const minutes = `${input.minutes ?? limits.connectionMinutes} minutes`;
    const sessions = count => count === 1 ? '1 session' : `${count} sessions`;
    const lines = {
      'team.create': async () => [`create the team "${cleanLabel(input.name)}" with ${sessions(input.members.length)}:`, ...await who(input.members)],
      'team.members': async () => {
        const current = state.teams[input.id].members;
        const added = input.members.filter(id => !current.includes(id)), removed = current.filter(id => !input.members.includes(id));
        return [`change the members of ${team(input.id)}:`, ...(await who(added)).map(text => `Add: ${text}`),
          ...(await who(removed)).map(text => `Remove: ${text}`)];
      },
      'team.delete': async () => [`delete the team ${team(input.id)} and its message history`],
      'connection.create': async () => [`connect ${sessions(input.members.length)} for ${minutes}:`, ...await who(input.members)],
      'connection.extend': async () => [`extend a connection so it ends in ${minutes}:`, ...await who(state.connections[input.id].members)],
      'session.create': async () => ['create a session:', `Name: "${cleanLabel(input.name)}"`, `Role: ${cleanLabel(input.role)}`,
        `Folder: ${readable(input.directory)}`, `OpenCode agent: ${readable(input.agent)}`,
        `Model: ${readable(input.model.providerID)}/${readable(input.model.id)}${input.model.variant ? ` (${readable(input.model.variant)})` : ''}`,
        ...(input.teamID !== undefined ? [`Team: ${team(input.teamID)}`] : [])],
      'policy.update': async () => ['change agent permissions:', ...Object.entries(input.capabilities).map(([key, value]) => `${key}: ${value}`)],
      'discovery.update': async () => [input.mode === 'automatic' ? 'list every session automatically' : 'list only sessions that join the list'],
    }[action];
    const [headline, ...rest] = lines ? await lines() : [action];
    const first = `${nameOf(await peer(actor))} asks to ${headline}`;
    return [first[0].toUpperCase() + first.slice(1), ...rest];
  }
  const recentOf = (state, actor) => (state.rate[actor] ?? []).filter(at => at > now() - 60000);
  // user: the request comes from the user's own controls, acting as this session. It needs no approval and uses
  // none of the session's per-minute allowance.
  async function manage(actor, action, input = {}, signal, { user = false } = {}) {
    const proposal = clone(input);
    const baseline = await queue(async () => {
      const state = await load();
      const categories = await prepare(actor, action, proposal, state, user);
      // Checked before any approval prompt, so a sender over its limit never asks the user for anything.
      const recent = recentOf(state, actor);
      if (!user && recent.length >= limits.messagesPerMinute) fail('rate_limit', { used: recent.length, limit: limits.messagesPerMinute,
        retryAfterSeconds: Math.max(1, Math.ceil((Math.min(...recent) + 60000 - now()) / 1000)) });
      return { revision: state.revision, categories,
        summary: categories.length ? await describe(actor, action, proposal, state) : undefined };
    });
    if (signal?.aborted) fail('cancelled');
    if (baseline.categories.length) await approve(actor, action, proposal, baseline.categories, baseline.summary);
    if (signal?.aborted) fail('cancelled');
    return queue(async () => {
      if (signal?.aborted) fail('cancelled');
      const state = await load();
      if (state.revision !== baseline.revision) fail('state_changed_request_again');
      const required = await prepare(actor, action, proposal, state, user);
      if (signal?.aborted) fail('cancelled');
      // Native project identities can change without a plugin revision change.
      if (required.length !== baseline.categories.length || required.some(category => !baseline.categories.includes(category)))
        fail('state_changed_request_again', { approved: baseline.categories, required });
      let result;
      if (action === 'connection.close' && state.connections[proposal.id].closed) return clone(state.connections[proposal.id]);
      // Extending never shortens a connection. One that already ends later stays as it is.
      const extendedTo = now() + (proposal.minutes ?? limits.connectionMinutes) * 60000;
      if (action === 'connection.extend' && state.connections[proposal.id].expiresAt >= extendedTo) return clone(state.connections[proposal.id]);
      if (action === 'team.members' && state.teams[proposal.id].members.length === proposal.members.length &&
        proposal.members.every(id => state.teams[proposal.id].members.includes(id))) return clone(state.teams[proposal.id]);
      // Changes an agent makes to its own listing or labels affect nothing an approval relies on, because every approved
      // request is checked again against the current state above. So they don't move the revision, which would make
      // pending approvals and the user's edits start again. A change that changes nothing saves nothing.
      const selfOnly = ['discovery.register', 'discovery.unregister', 'profile.update'].includes(action);
      if (selfOnly) {
        const registered = Object.hasOwn(state.discovery.registrations, actor);
        if (action === 'discovery.register' && registered) return { registered: true };
        if (action === 'discovery.unregister' && !registered) return { registered: false };
        if (action === 'profile.update') {
          const current = identity(await peer(actor), state);
          const next = { name: (proposal.name ?? current.name).trim(), role: (proposal.role ?? current.role).trim() };
          const saved = state.profiles[actor];
          if (saved && saved.name === next.name && saved.role === next.role) return clone(saved);
        }
      }
      if (action === 'discovery.register') {
        state.discovery.registrations[actor] = true; result = { registered: true };
      }
      if (action === 'discovery.unregister') {
        delete state.discovery.registrations[actor]; result = { registered: false };
      }
      if (action === 'discovery.update') {
        state.discovery.mode = proposal.mode; result = { mode: proposal.mode };
      }
      let previousName;
      if (action === 'profile.update') {
        // Either label may be omitted; the other keeps its current value.
        const current = identity(await peer(actor), state);
        previousName = current.name;
        result = state.profiles[actor] = { name: (proposal.name ?? current.name).trim(), role: (proposal.role ?? current.role).trim() };
      }
      if (action === 'team.create') {
        const id = `team_${uuid()}`;
        result = state.teams[id] = { id, name: proposal.name.trim(), members: proposal.members };
      }
      if (action === 'team.members') {
        state.teams[proposal.id].members = proposal.members; result = state.teams[proposal.id];
      }
      const teamName = action === 'team.delete' ? state.teams[proposal.id].name : undefined;
      if (action === 'team.delete') { delete state.teams[proposal.id]; historyOf(state).forget(proposal.id); result = { deleted: proposal.id }; }
      if (action === 'connection.create') {
        const id = `connection_${uuid()}`;
        result = state.connections[id] = { id, members: proposal.members,
          createdAt: now(), expiresAt: now() + (proposal.minutes ?? limits.connectionMinutes) * 60000 };
      }
      if (action === 'connection.extend') {
        result = state.connections[proposal.id];
        result.expiresAt = extendedTo;
      }
      if (action === 'connection.close') { result = state.connections[proposal.id]; result.closed = true; result.closedAt = now(); }
      if (action === 'policy.update') result = state.capabilities = mergeCapabilities(state.capabilities, proposal.capabilities);
      if (action === 'session.create') {
        // Persist intent first. Do not silently repeat a creation after an uncertain result.
        const id = sessionID();
        audit(state, actor, 'session.create.intent', { id, proposal });
        // Recorded before dispatch so a lost response cannot leave a real session uncounted.
        state.created[id] = true;
        await save(state);
        if (signal?.aborted) {
          audit(state, actor, 'session.create.cancelled', { id, reason: 'cancelled_before_native_dispatch',
            ...(proposal.teamID ? { teamID: proposal.teamID } : {}) });
          delete state.created[id];
          await save(state);
          fail('cancelled');
        }
        result = await session.create({ id, title: proposal.name, agent: proposal.agent,
          model: proposal.model, location: { directory: proposal.directory } });
        state.profiles[result.id] = { name: proposal.name, role: proposal.role };
        // Created to work with others, so it is listed straight away, team or not.
        state.discovery.registrations[result.id] = true;
        if (proposal.teamID !== undefined) state.teams[proposal.teamID].members.push(result.id);
      }
      // Every completed change counts toward the sender's per-minute limit, which messages share. It was checked before
      // approval, so an approved request is never refused for it here.
      if (!user) state.rate[actor] = [...recentOf(state, actor), now()];
      if (!selfOnly) state.revision++;
      audit(state, actor, action, { proposal, ...(user ? { userAction: true, ...(previousName ? { previousName } : {}) }
        : { approvalCategories: baseline.categories }),
        ...(action === 'team.create' ? { teamID: result.id } : {}), ...(teamName ? { teamName } : {}),
        ...(action === 'profile.update' ? { profile: clone(result) } : {}) }, action === 'team.delete' ? [GENERAL] : undefined);
      await save(state);
      return clone(result);
    });
  }
  return { manage };
}
