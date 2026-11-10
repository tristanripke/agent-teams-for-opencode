// Defaults, structured refusals and small helpers shared by every part of the engine.
import { CAPABILITIES } from '../manage-schema.js';

// Each capability names the agent action: allow proceeds, ask needs human approval, deny refuses.
export const DEFAULT_CAPABILITIES = Object.freeze(Object.fromEntries(CAPABILITIES.map(key => [key, 'ask'])));
export const DEFAULT_LIMITS = Object.freeze({
  messageBytes: 32768, messagesPerMinute: 30, maxHops: 100,
  messagesPerConversation: 100, connectionMinutes: 60, maxConnectionMinutes: 1440,
  managedSessions: 16, records: 2000,
});
export const REMOVE_DATA_CONFIRMATION = 'remove-all-saved-data';
const REMEDY = {
  invalid_action_input: 'Correct the listed fields and call again.',
  state_changed_request_again: 'Call discover, then submit a new request. The earlier approval does not carry over.',
  team_not_found: 'Call discover and use the ID of a team that lists this session as a member.',
  connection_not_found: 'Call discover and use the ID of a connection that lists this session as a member.',
  connection_expired: 'Open a new connection with connection.create.',
  member_not_registered: 'Ask those sessions to call manage discovery.register, or ask the user to enable automatic listing.',
  team_name_exists: 'Choose a different team name.',
  communication_not_authorized: 'Share a project, join a common team, or open a connection with connection.create.',
  rate_limit: 'Wait until the oldest message in the last minute expires, then retry with the same key.',
  conversation_limit: 'Start a new conversation without replyTo.',
  hop_limit: 'Start a new conversation without replyTo.',
  invalid_session: 'Call discover for current session IDs.',
  invalid_session_id: 'Use a session ID starting with ses_ from discover.',
  self_message: 'Send to a different session.',
  recipient_archived: 'Choose a session that is not archived.',
  invalid_reply: 'replyTo must be a recent message this session received from the recipient. If it has aged out of history, send a new message ' +
    'without replyTo.',
  idempotency_conflict: 'Use a new key for different content; reuse a key only to retry the same message.',
  not_message_recipient: 'Acknowledge only messages addressed to this session. A message that has aged out of history needs no acknowledgement.',
  cancelled: 'Submit the request again if it is still needed.',
  unknown_action: 'Use one of the listed actions.',
  invalid_setting: 'Send exactly one of command, discoveryMode or capabilities.',
  invalid_discovery_mode: 'Use registered or automatic.',
  invalid_stored_state: 'Preserve the saved data and its backup; it was left unchanged.',
};
export class AgentTeamsError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.code = code;
    this.details = { ...(REMEDY[code] && !details.remedy ? { remedy: REMEDY[code] } : {}), ...details };
  }
  toJSON() { return { code: this.code, ...this.details }; }
}
export const fail = (code, details) => { throw new AgentTeamsError(code, details); };
export const clone = value => structuredClone(value);
export const identifier = value => typeof value === 'string' && /^[\w.:-]{1,160}$/.test(value);
export const millis = value => value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value ?? '') || 0;

export function limitsFrom(options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...options };
  for (const [key, value] of Object.entries(limits)) {
    if (!Object.hasOwn(DEFAULT_LIMITS, key) || !Number.isSafeInteger(value) || value < 1) fail('invalid_limit');
  }
  if (limits.messageBytes > 32768 || limits.maxConnectionMinutes < limits.connectionMinutes) fail('invalid_limit');
  return limits;
}

// All location instances share one lock in one OpenCode backend process.
export function serialQueue() {
  let tail = /** @type {Promise<unknown>} */ (Promise.resolve());
  /** @template T @param {() => T | PromiseLike<T>} task */
  function run(task) {
    const result = tail.then(task);
    tail = result.catch(() => {});
    return result;
  }
  return run;
}
