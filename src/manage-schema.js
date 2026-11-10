// One description of every peers.manage action: it builds the agent tool's JSON schema,
// its examples and the engine's input validation, so the three cannot drift apart.

export const CAPABILITIES = Object.freeze(['createSession', 'createTeam', 'changeMembers',
  'workAcrossProjects', 'openConnection', 'extendConnection']);
export const CAPABILITY_VALUES = Object.freeze(['allow', 'ask', 'deny']);

const label = description => ({ kind: 'label', description });
const sessions = (min, description) => ({ kind: 'sessions', min, max: 32, description });
const id = (prefix, description) => ({ kind: 'id', prefix, description });

export const ACTIONS = {
  'profile.update': {
    description: "Change the acting session's own collaboration name and/or role. Other sessions cannot be targeted. Does not rename the native session title.",
    fields: { name: { ...label('New display name. Not "You" or "user".'), kind: 'name' }, role: label('New role.') }, atLeastOne: true,
    example: { name: 'Reviewer', role: 'Code review' },
  },
  'team.create': {
    description: 'Create a team. Members can message each other across projects. Needs createTeam and changeMembers (and workAcrossProjects when ' +
      'members span projects).',
    fields: { name: { ...label('Unique team name.'), required: true },
      members: { ...sessions(1, 'Session IDs; must include the acting session.'), required: true } },
    example: { name: 'Release review', members: ['ses_SELF', 'ses_OTHER'] },
  },
  'team.members': {
    description: 'Replace the complete member list of a team the acting session belongs to. Needs changeMembers.',
    fields: { id: { ...id('team_', 'Team ID from discover.'), required: true },
      members: { ...sessions(1, 'Complete new member list; must include the acting session.'), required: true } },
    example: { id: 'team_ID', members: ['ses_SELF', 'ses_OTHER'] },
  },
  'team.delete': {
    description: 'Delete a team the acting session belongs to. Needs changeMembers.',
    fields: { id: { ...id('team_', 'Team ID from discover.'), required: true } },
    example: { id: 'team_ID' },
  },
  'connection.create': {
    description: 'Open a temporary connection so its members can message each other until it expires or closes. Needs openConnection.',
    fields: { members: { ...sessions(2, 'Session IDs; must include the acting session.'), required: true },
      minutes: { kind: 'minutes', description: 'Lifetime in minutes. Defaults to limits.connectionMinutes.' } },
    example: { members: ['ses_SELF', 'ses_OTHER'], minutes: 30 },
  },
  'connection.extend': {
    description: 'Extend an active connection the acting session belongs to. Needs extendConnection.',
    fields: { id: { ...id('connection_', 'Connection ID from discover.'), required: true },
      minutes: { kind: 'minutes', description: 'New lifetime from now. Defaults to limits.connectionMinutes.' } },
    example: { id: 'connection_ID', minutes: 60 },
  },
  'connection.close': {
    description: 'Close a connection the acting session belongs to. Needs no capability.',
    fields: { id: { ...id('connection_', 'Connection ID from discover.'), required: true } },
    example: { id: 'connection_ID' },
  },
  'session.create': {
    description: 'Create an idle teammate session. Needs createSession (and changeMembers with teamID). Call discover with catalog:true for valid ' +
      'agent and model values.',
    fields: { name: { ...label('Display name. Not "You" or "user".'), kind: 'name', required: true }, role: { ...label('Role.'), required: true },
      agent: { ...label('OpenCode agent ID from discover self.catalog.agents.'), required: true },
      directory: { kind: 'path', required: true, description: 'Absolute project folder.' },
      model: { kind: 'model', required: true, description: 'Model from discover self.catalog.models.' },
      teamID: id('team_', 'Optional team of the acting session. The new session joins it. It is listed either way.') },
    example: { name: 'Reviewer', role: 'Code review', agent: 'build', directory: 'C:/Projects/Example',
      model: { providerID: 'PROVIDER', id: 'MODEL' } },
  },
  'policy.update': {
    description: 'Request a change to agent capabilities. Always needs human approval.',
    fields: { capabilities: { kind: 'capabilities', required: true, description: 'Capabilities to change; omitted ones keep their value.' } },
    example: { capabilities: { createSession: 'allow' } },
  },
  'discovery.register': { description: 'List the acting session for other agents. Input {}.', fields: {}, example: {} },
  'discovery.unregister': { description: 'Remove the acting session from the list. Input {}.', fields: {}, example: {} },
  'discovery.update': {
    description: 'Request a discovery mode change. Always needs human approval.',
    fields: { mode: { kind: 'enum', values: ['registered', 'automatic'], required: true, description: 'registered lists only joined sessions.' } },
    example: { mode: 'registered' },
  },
};

const sessionID = value => typeof value === 'string' && /^ses_[\w.:-]{1,156}$/.test(value);
// Control, format and line-separator characters can fake extra lines, flip the order text appears in, or hide
// differences between names, so labels refuse them.
export const UNSAFE_TEXT = /[\p{Cc}\p{Cf}\u2028\u2029]/u;
export const isLabel = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 120 && !UNSAFE_TEXT.test(value);
// "You" means the user in Activity, so no session may use it, or "user", as its name. No list of look-alike letters
// is ever complete, so a name counts when it has the same length and every character is the right Latin letter (after
// mapping known look-alikes, before and after lowercasing), except for at most one unrecognised non-Latin character.
// That catches "Υou" or "Yоü", and leaves real words in other scripts, such as "Ура" or "李明華", alone.
export const RESERVED_NAMES = Object.freeze(['you', 'user']);
const LOOK_ALIKES = { 'Υ': 'y', 'ϒ': 'y', 'Ꭹ': 'y', 'Ү': 'y', 'У': 'y', 'у': 'y', 'ү': 'y', 'ʏ': 'y', 'γ': 'y',
  'о': 'o', 'ο': 'o', 'օ': 'o', 'ᴏ': 'o', 'υ': 'u', 'ս': 'u', 'ᴜ': 'u', 'μ': 'u',
  'ѕ': 's', 'ꜱ': 's', 'е': 'e', 'ҽ': 'e', 'ᴇ': 'e', 'г': 'r', 'ʀ': 'r', 'ꭇ': 'r' };
const look = character => LOOK_ALIKES[character] ?? LOOK_ALIKES[character.toLowerCase()] ?? character.toLowerCase();
export const isReservedName = value => {
  // Marks, invisible joiners and blank fillers don't change how the name reads, so they're left out of this check only.
  const letters = [...String(value).normalize('NFKD').replace(/[\p{M}\p{Default_Ignorable_Code_Point}\u2800\u3164\uFFA0]/gu, '')
    .normalize('NFKC').trim()].map(look);
  return RESERVED_NAMES.some(word => letters.length === word.length &&
    letters.every((character, index) => character === word[index] || !/[\u0000-\u007f]/.test(character)) &&
    letters.filter((character, index) => character !== word[index]).length <= 1);
};
export const isDisplayName = value => isLabel(value) && !isReservedName(value);
// A name or role shown from a session, which may come from its native title and so skip the input checks above.
const UNSAFE_ALL = new RegExp(UNSAFE_TEXT.source, 'gu');
export const cleanLabel = value => String(value ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').replace(UNSAFE_ALL, '').trim();
// Team names are compared after normalising, so look-alike spellings count as the same name.
export const nameKey = value => String(value).normalize('NFKC').trim().toLowerCase();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function check(field, value, limits) {
  switch (field.kind) {
    case 'label': return isLabel(value) ? '' : 'must be a nonblank string of at most 120 characters, without control or invisible characters';
    case 'name': return isDisplayName(value) ? '' :
      'must be a nonblank string of at most 120 characters, without control or invisible characters, and not "You" or "user"';
    case 'id': return typeof value === 'string' && value.startsWith(field.prefix) && /^[\w.:-]{1,160}$/.test(value)
      ? '' : `must be an ID starting with ${field.prefix}`;
    case 'enum': return field.values.includes(value) ? '' : `must be one of: ${field.values.join(', ')}`;
    case 'path': return typeof value === 'string' && /^(?:[A-Za-z]:[\\/]|\/)/.test(value) ? '' : 'must be an absolute path';
    case 'minutes': return Number.isSafeInteger(value) && value >= 1 && value <= limits.maxConnectionMinutes
      ? '' : `must be a whole number from 1 to ${limits.maxConnectionMinutes}`;
    case 'sessions':
      if (!Array.isArray(value) || value.length < field.min || value.length > field.max) return `must list ${field.min}-${field.max} session IDs`;
      if (!value.every(sessionID)) return 'must contain only session IDs starting with ses_';
      return new Set(value).size === value.length ? '' : 'must not repeat a session';
    case 'model': {
      if (!object(value)) return 'must be an object {providerID, id, variant?}';
      const problems = [];
      if (!isLabel(value.providerID)) problems.push('providerID is required');
      if (!isLabel(value.id)) problems.push('id is required');
      if (value.variant !== undefined && !isLabel(value.variant)) problems.push('variant must be a nonblank string');
      const extra = Object.keys(value).filter(key => !['providerID', 'id', 'variant'].includes(key));
      if (extra.length) problems.push(`unknown fields: ${extra.join(', ')}`);
      return problems.join('; ');
    }
    case 'capabilities': {
      if (!object(value) || !Object.keys(value).length) return `must set at least one of: ${CAPABILITIES.join(', ')}`;
      const bad = Object.entries(value).filter(([key, setting]) => !CAPABILITIES.includes(key) || !CAPABILITY_VALUES.includes(setting));
      return bad.length ? `unknown capability or value: ${bad.map(([key]) => key).join(', ')}; values are allow, ask or deny` : '';
    }
  }
  return 'is not accepted';
}

export function hintFor(action) {
  const spec = ACTIONS[action];
  if (!spec) return `action must be one of: ${Object.keys(ACTIONS).join(', ')}`;
  const fields = Object.entries(spec.fields);
  const required = fields.filter(([, field]) => field.required).map(([name]) => name);
  const optional = fields.filter(([, field]) => !field.required).map(([name]) => name);
  return [required.length ? `required: ${required.join(', ')}` : '', optional.length ? `optional: ${optional.join(', ')}` : '',
    spec.atLeastOne ? 'set at least one field' : '', `example: ${JSON.stringify(spec.example)}`].filter(Boolean).join('; ');
}

// Every shape problem at once; semantic checks such as membership and limits come later.
export function validateInput(action, input, limits) {
  const spec = ACTIONS[action];
  if (!spec) return { missing: [], invalid: [{ field: 'action', reason: `must be one of: ${Object.keys(ACTIONS).join(', ')}` }] };
  if (!object(input)) return { missing: [], invalid: [{ field: 'input', reason: 'must be an object' }] };
  const missing = [], invalid = [];
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(spec.fields, key)) invalid.push({ field: key, reason: `is not accepted by ${action}` });
  }
  for (const [name, field] of Object.entries(spec.fields)) {
    if (!Object.hasOwn(input, name) || input[name] === undefined) { if (field.required) missing.push(name); continue; }
    const reason = check(field, input[name], limits);
    if (reason) invalid.push({ field: name, reason });
  }
  if (spec.atLeastOne && !Object.keys(spec.fields).some(name => input[name] !== undefined) && !invalid.length)
    missing.push(Object.keys(spec.fields).join(' or '));
  return { missing, invalid };
}

function fieldSchema(field, limits) {
  const description = field.description;
  switch (field.kind) {
    case 'label': case 'name': return { type: 'string', minLength: 1, maxLength: 120, description };
    case 'id': return { type: 'string', pattern: `^${field.prefix}`, description };
    case 'enum': return { type: 'string', enum: field.values, description };
    case 'path': return { type: 'string', description };
    case 'minutes': return { type: 'integer', minimum: 1, maximum: limits.maxConnectionMinutes, description };
    case 'sessions': return { type: 'array', items: { type: 'string', pattern: '^ses_' },
      minItems: field.min, maxItems: field.max, uniqueItems: true, description };
    case 'model': return { type: 'object', description, required: ['providerID', 'id'], additionalProperties: false,
      properties: { providerID: { type: 'string' }, id: { type: 'string' }, variant: { type: 'string' } } };
    case 'capabilities': return { type: 'object', description, minProperties: 1, additionalProperties: false,
      properties: Object.fromEntries(CAPABILITIES.map(key => [key, { type: 'string', enum: CAPABILITY_VALUES }])) };
  }
}

// Providers refuse a top-level oneOf, so the union sits on `input`, one titled branch per action.
export function manageSchema(limits) {
  return {
    type: 'object', additionalProperties: false, required: ['action', 'input'],
    properties: {
      action: { type: 'string', enum: Object.keys(ACTIONS) },
      input: { description: 'Use the branch whose title equals action.', anyOf: Object.entries(ACTIONS).map(([action, spec]) => {
        const required = Object.entries(spec.fields).filter(([, field]) => field.required).map(([name]) => name);
        return { title: action, description: spec.description, type: 'object', additionalProperties: false,
          ...(required.length ? { required } : {}), ...(spec.atLeastOne ? { minProperties: 1 } : {}),
          properties: Object.fromEntries(Object.entries(spec.fields).map(([name, field]) => [name, fieldSchema(field, limits)])) };
      }) },
    },
  };
}

export function manageDescription() {
  return ['Manage the acting session\'s profile, teams, connections, new sessions and capability requests.',
    'Each capability in discover self.capabilities is allow (proceeds), ask (waits for human approval) or deny (refused).',
    'A refusal returns {"error":{code, missing, invalid, hint, remedy}} instead of a result; nothing was changed. Examples:',
    ...Object.entries(ACTIONS).map(([action, spec]) => `${JSON.stringify({ action, input: spec.example })} - ${spec.description}`)].join('\n');
}
