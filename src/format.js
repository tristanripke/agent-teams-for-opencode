// User-facing copy shared by the Desktop and TUI interfaces.

export const STATUS = {
  sending: { label: 'Sending', help: 'Waiting for OpenCode to accept the message.' },
  accepted: { label: 'Sent', help: 'OpenCode accepted the message for the recipient.' },
  delivered: { label: 'Delivered', help: 'The message is in the recipient\'s conversation and waits to be handled.' },
  processed: { label: 'Handled', help: 'The recipient confirmed that it handled the message.' },
  uncertain: { label: 'Unconfirmed', help: 'Delivery could not be confirmed. It was not resent. Check the recipient session before trying again.' },
};
export const status = value => STATUS[value] ?? { label: String(value), help: '' };

// Titles follow "An agent may do the following without asking for permission:". A switch on means allow; off means the agent asks first.
export const CAPABILITY = {
  createSession: { title: 'Create a session', description: 'Starting an independent session in OpenCode.' },
  createTeam: { title: 'Create a team', description: 'Starting a named group whose members can message each other.' },
  changeMembers: { title: 'Change team members', description: 'Adding or removing members, or deleting a team.' },
  workAcrossProjects: { title: 'Work across projects',
    description: 'Any team or connection that spans more than one project, or a new session in another project.' },
  openConnection: { title: 'Open a connection', description: 'Letting specific sessions message each other for a limited time, without sharing a team.' },
  extendConnection: { title: 'Extend a connection', description: 'Keeping an active connection open for longer.' },
};
export const capabilityState = value => value === 'allow' ? 'allowed without asking' : value === 'deny' ? 'blocked' : 'asks you first';
export const capabilityText = (key, value) => `${CAPABILITY[key]?.title ?? key}: ${capabilityState(value)}`;
const CATEGORY = { createSession: 'session creation', createTeam: 'team creation', changeMembers: 'membership',
  workAcrossProjects: 'cross-project', openConnection: 'connection', extendConnection: 'extension',
  policy: 'agent permissions', discovery: 'discovery' };

const ERRORS = {
  team_not_found: 'That team no longer exists, or this session is not one of its members.',
  connection_not_found: 'That connection no longer exists, or this session is not one of its members.',
  connection_expired: 'That connection has already ended. Open a new one instead.',
  state_changed_request_again: 'Something changed while this waited for approval. Try again.',
  invalid_members: 'Choose 1–32 unique team members or 2–32 connection members. Agent requests must include the acting session.',
  member_not_registered: 'New team and connection members must join the agent list first, unless List sessions automatically is enabled.',
  team_name_exists: 'A team with this name already exists.',
  invalid_team_name: 'Enter a team name of up to 120 characters.',
  invalid_profile: 'Enter a name and a role of up to 120 characters each.',
  invalid_expiry: 'Enter a whole number of minutes within the configured maximum.',
  invalid_session_request: 'Check the name, role, agent, folder and model. The folder must be an absolute path.',
  session_creation_limit: 'The limit for sessions created by Agent Teams is reached. Archive one first.',
  communication_not_authorized: 'These sessions are not allowed to message each other. They need the same project, a team or a connection.',
  rate_limit: 'Too many messages in the last minute. Wait and try again.',
  invalid_session: 'That session is no longer available.',
  invalid_session_id: 'That session is no longer available.',
  invalid_setting: 'That setting could not be saved.',
  invalid_capabilities: 'That setting could not be saved.',
  capability_denied: 'Agents are not allowed to do that. Change it in Settings → Agent Teams.',
  team_full: 'That team already has 32 members.',
  invalid_action_input: 'Check the entered values and try again.',
  invalid_discovery_mode: 'That setting could not be saved.',
  invalid_stored_state: 'The saved Agent Teams data is unreadable. It was left unchanged.',
  cancelled: 'The request was cancelled.',
};
export function errorText(error) {
  const message = String(error?.message ?? error ?? '');
  const code = Object.keys(ERRORS).find(key => new RegExp(`\\b${key}\\b`).test(message));
  return code ? ERRORS[code] : message || 'Something went wrong.';
}

export function person(state, id) {
  return state?.agents?.find(peer => peer.sessionID === id) ?? state?.people?.[id];
}
// Native pending requests take precedence over activity; never infer a question from idle.
export function sessionStatus(peer, data) {
  const id = peer?.sessionID;
  if ((data?.session.permission.list(id) ?? []).length) return { kind: 'approval', label: 'Needs approval', icon: 'circle-exclamation' };
  if ((data?.session.form.list(id) ?? []).length) return { kind: 'question', label: 'Needs input', icon: 'speech-bubble' };
  const running = data?.session.get(id) ? data.session.status(id) === 'running' : peer?.activity === 'running';
  return running ? { kind: 'running', label: 'Active' } : { kind: 'idle', label: 'Idle' };
}
// Text from agents is shown as plain text. Control, format and line-separator characters are dropped, so a name can't
// fake a second line or flip the order of what's around it. Message bodies keep their line breaks and tabs.
const UNSAFE = /[\p{Cc}\p{Cf}\u2028\u2029]/gu;
export function plain(text, multiline = false) {
  const value = String(text ?? '');
  return multiline ? value.replace(UNSAFE, character => character === '\n' || character === '\t' ? character : '')
    : value.replace(/[\r\n\u2028\u2029]+/g, ' ').replace(UNSAFE, '');
}
export function nameOf(state, id) {
  if (id === 'user') return 'You';
  const name = person(state, id)?.name;
  return name === undefined ? `Session …${String(id).slice(-6)}` : plain(name);
}
export const names = (state, ids) => ids.map(id => nameOf(state, id)).join(', ');
export const folder = directory => String(directory ?? '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || String(directory ?? '');
// Display only a session's own model: its record, or a choice just made in its own composer. Never another session's.
export function modelDisplay(model, catalog = []) {
  if (!model?.id || !model?.providerID) return { label: 'Model unavailable', title: 'No explicit model information is available for this session.' };
  const entry = catalog.find(item => item.id === model.id && item.providerID === model.providerID);
  const name = entry?.name || model.id;
  const variant = model.variant ? ` · ${model.variant}` : '';
  return { label: `${name}${variant}`, title: `${name} · ${model.providerID}/${model.id}${variant}` };
}
export function projects(state, ids) {
  const keys = new Set(ids.map(id => person(state, id)).filter(Boolean).map(peer => peer.projectID === 'global' ? peer.directory : peer.projectID));
  return keys.size === 1 ? '1 project' : `${keys.size} projects`;
}

export function relative(at, now = Date.now()) {
  const minutes = Math.round((at - now) / 60000);
  if (Math.abs(minutes) < 1) return 'just now';
  if (Math.abs(minutes) < 60) return minutes > 0 ? `in ${minutes} min` : `${-minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return hours > 0 ? `in ${hours} h` : `${-hours} h ago`;
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
export function ends(connection, now = Date.now()) {
  if (connection.closed) return 'closed';
  return connection.expiresAt > now ? `ends ${relative(connection.expiresAt, now)}` : `ended ${relative(connection.expiresAt, now)}`;
}

// One readable Activity line per audit record.
export function activity(item, state) {
  // The user's own controls act as a session. Those entries are the user's, so they say so.
  const byUser = item.data?.userAction === true && item.actor !== 'user';
  const actor = byUser ? `You (${nameOf(state, item.actor)})` : nameOf(state, item.actor), proposal = item.data?.proposal ?? {};
  const others = members => names(state, (members ?? []).filter(id => id !== item.actor));
  const teamName = state?.teams?.find(team => team.id === proposal.id)?.name ?? 'a team';
  const text = {
    'team.create': `${actor} created team ${proposal.name}`,
    'team.members': `${actor} changed the members of ${teamName}`,
    'team.update': `${actor} updated team ${proposal.name}`,
    'team.delete': `${actor} deleted ${item.data?.teamName ?? teamName}`,
    // System entries carry their own names: neither the session nor always the team still exists.
    'team.member.removed': `${item.data?.name
      ?? nameOf(state, item.data?.sessionID)} was removed from ${item.data?.teamName ?? 'a team'} because its session was deleted`,
    'team.removed': `${item.data?.teamName ?? 'A team'} was deleted because its last member's session was deleted`,
    'connection.create': `${actor} opened a connection with ${others(proposal.members)}`,
    'connection.extend': `${actor} extended a connection`,
    'connection.close': `${actor} closed a connection`,
    'session.create': `${actor} created session ${proposal.name}`,
    'session.create.intent': `${actor} started creating session ${proposal.name}`,
    'session.create.cancelled': `${actor} cancelled session creation before it started`,
    'profile.update': item.data?.userAction === true
      ? `You set ${item.data.previousName
        ?? nameOf(state, item.data.sessionID ?? item.actor)}'s profile to ${(item.data?.profile ?? proposal).name} (${(item.data?.profile ?? proposal).role})`
      : `${actor} set its name to ${(item.data?.profile ?? proposal).name} (${(item.data?.profile ?? proposal).role})`,
    'discovery.register': `${actor} joined the agent list`,
    'discovery.unregister': `${actor} left the agent list`,
    'discovery.update': `${actor} changed how sessions are listed`,
    'policy.update': `${actor} changed what agents may do`,
    'message.admission': `${actor} sent ${nameOf(state, state?.messages?.find(message => message.id === item.data?.id)?.to ?? '')} a message`,
  }[item.action];
  if (item.action === 'settings.update') return { text: 'You changed a setting', detail: settingText(proposal) };
  if (item.action === 'message.admission') {
    const recipient = item.data?.to ?? state?.messages?.find(message => message.id === item.data?.id)?.to;
    return { text: recipient ? `${actor} sent ${nameOf(state, recipient)} a message` : `${actor} sent a message`,
      detail: `Status: ${status(item.data?.status).label}` };
  }
  const categories = item.data?.approvalCategories;
  const detail = categories === undefined ? '' : categories.length
    ? `You approved: ${categories.map(key => CATEGORY[key] ?? key).join(', ')}` : 'No approval needed';
  return { text: text ?? `${actor}: ${item.action}`, detail };
}
function settingText(proposal) {
  if (proposal.command) return `Dashboard command: /${proposal.command}`;
  if (proposal.discoveryMode) return proposal.discoveryMode === 'automatic' ? 'Sessions are listed automatically' : 'Sessions are listed after they join';
  return Object.entries(proposal.capabilities ?? {}).map(([key, value]) => capabilityText(key, value)).join('; ');
}
