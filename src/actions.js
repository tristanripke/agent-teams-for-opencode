import { names, person } from './format.js';

export const ACTIONS = {
  'discovery.register': { title: 'Join the agent list', fields: [] },
  'discovery.unregister': { title: 'Leave the agent list', fields: [] },
  'profile.update': { title: 'Edit my name and role', fields: ['name', 'role'] },
  'team.create': { title: 'New team', fields: ['name', 'members'] },
  'team.members': { title: 'Change team members', fields: ['id', 'members'] },
  'team.delete': { title: 'Delete a team', fields: ['id'] },
  'connection.create': { title: 'Connect sessions', fields: ['members', 'minutes'] },
  'connection.extend': { title: 'Extend a connection', fields: ['id', 'minutes'] },
  'connection.close': { title: 'Close a connection', fields: ['id'] },
  'session.create': { title: 'New agent session', fields: ['name', 'role', 'directory', 'agent', 'providerID', 'modelID', 'variant', 'teamID'] },
};

const PROMPTS = {
  name: 'Name', role: 'Role', directory: 'Folder (absolute path)', agent: 'Agent, e.g. build',
  providerID: 'Model provider ID', modelID: 'Model ID', variant: 'Model variant (optional)', minutes: 'Minutes until it ends',
};

// Native user flow; unlike a peer request, this does not force the routed session into the team.
export async function collectUserTeam(ui, snapshot, team, sessionID) {
  const name = await ui.prompt('Team name', team?.name ?? '');
  if (name === undefined) return;
  const selected = new Set(team?.members ?? (snapshot.agents.some(peer => peer.sessionID === sessionID) ? [sessionID] : []));
  const candidates = new Map([...snapshot.agents.filter(peer => !peer.archived),
    ...(team?.members ?? []).map(id => person(snapshot, id) ?? { sessionID: id, name: `Session …${id.slice(-6)}`, role: 'Unavailable' })]
    .map(peer => [peer.sessionID, peer]));
  for (;;) {
    const choice = await ui.select(`Team members (${selected.size}/32)`, [
      ...(selected.size ? [{ title: 'Save team', value: 'done' }] : []),
      ...[...candidates.values()].map(peer => ({ title: `${selected.has(peer.sessionID) ? '✓ ' : ''}${peer.name}`,
        description: peer.role, value: peer.sessionID })),
    ]);
    if (!choice) return;
    if (choice === 'done' && selected.size) return { ...(team ? { id: team.id } : {}), name, members: [...selected] };
    if (selected.has(choice)) selected.delete(choice);
    else if (selected.size < 32 && candidates.has(choice)) selected.add(choice);
  }
}
export const MEMBER_HINT = 'Only listed sessions appear. Turn on List sessions automatically in Settings to include every session.';

// Names the sessions that must join the list before a team or connection can include them.
export function joinFirst(snapshot, action, input) {
  if (!snapshot.discovery || snapshot.discovery.mode === 'automatic' || !['team.create', 'team.members', 'connection.create'].includes(action)) return;
  const kept = action === 'team.members' ? snapshot.teams.find(team => team.id === input.id)?.members ?? [] : [];
  const waiting = (input.members ?? []).filter(id => !kept.includes(id) && !snapshot.discovery.registered.includes(id))
    .map(id => person(snapshot, id)?.name ?? 'An untitled session');
  if (waiting.length) return `${new Intl.ListFormat('en-GB').format(waiting)} must join the agent list first.`;
}
export const CONNECT_HINT = 'Join the list to connect this session.';

export async function collectAction(ui, action, snapshot, sessionID) {
  const definition = ACTIONS[action];
  if (action === 'connection.create') {
    const refusal = joinFirst(snapshot, action, { members: [sessionID] });
    if (refusal) throw new Error(refusal);
  }
  const input = {};
  for (const field of definition.fields) {
    if (field === 'members') {
      const members = new Set(input.id ? snapshot.teams.find(team => team.id === input.id)?.members : [sessionID]);
      members.add(sessionID);
      while (true) {
        const selected = await ui.select(snapshot.discovery?.mode === 'automatic' ? 'Select members, then choose Done'
          : `Select members, then choose Done. ${MEMBER_HINT}`, [
          { title: `Done (${members.size} selected)`, value: 'done' },
          ...snapshot.agents.filter(peer => peer.sessionID !== sessionID).map(peer => ({
            title: `${members.has(peer.sessionID) ? '[x]' : '[ ]'} ${peer.name} · ${peer.role}`,
            description: peer.directory, value: peer.sessionID })),
        ]);
        if (selected === undefined) return;
        if (selected === 'done') break;
        members.has(selected) ? members.delete(selected) : members.add(selected);
      }
      input.members = [...members];
    } else if (field === 'id') {
      // The engine accepts team and connection changes only from members.
      const rows = (action.startsWith('team.') ? snapshot.teams : snapshot.connections.filter(item => item.active))
        .filter(item => item.members.includes(sessionID));
      input.id = await ui.select(action.startsWith('team.') ? 'Select a team' : 'Select a connection', rows.map(item => ({
        title: item.name ?? names(snapshot, item.members).replaceAll(', ', ' ↔ '),
        description: names(snapshot, item.members), value: item.id })));
      if (!input.id) return;
    } else if (field === 'teamID') {
      const teams = snapshot.teams?.filter(team => team.members.includes(sessionID)) ?? [];
      if (teams.length) {
        const selected = await ui.select('Add the new session to a team?', [
          { title: 'No team', value: 'none' }, ...teams.map(team => ({ title: team.name, value: team.id })),
        ]);
        if (selected === undefined) return;
        if (selected !== 'none') input.teamID = selected;
      }
    } else {
      const me = person(snapshot, sessionID);
      const defaults = { directory: me?.directory, minutes: String(snapshot.limits.connectionMinutes), agent: 'build',
        ...(action === 'profile.update' ? { name: me?.name, role: me?.role } : {}) };
      const value = await ui.prompt(PROMPTS[field] ?? field, defaults[field] ?? '');
      if (value === undefined) return;
      input[field] = field === 'minutes' ? Number(value) : value;
    }
  }
  if (action === 'session.create') {
    input.model = { id: input.modelID, providerID: input.providerID, ...(input.variant ? { variant: input.variant } : {}) };
    delete input.modelID; delete input.providerID; delete input.variant;
  }
  return input;
}
