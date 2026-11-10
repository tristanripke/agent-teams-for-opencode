// Message admission, acknowledgement and delivery records.
import { createHash } from 'node:crypto';
import { RETRY_WINDOW, expireRetries, scopeForMessage } from '../history.js';
import { fail, clone, identifier } from './shared.js';
import { identity } from './sessions.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function createMessaging({ session, limits, now, uuid, messageID, queue, store: { load, save, historyOf, audit },
  sessions: { peer, authorized } }) {
  function checkMessage(state, from, to, input, parent, history) {
    if (from.id === to.id) fail('self_message');
    if (!authorized(state, from, to)) fail('communication_not_authorized', { to: to.id });
    if (to.time?.archived) fail('recipient_archived', { to: to.id });
    if (!identifier(input.key)) fail('invalid_idempotency_key', { field: 'key',
      remedy: 'Use 1-160 letters, digits, underscores, periods, colons or hyphens.' });
    if (typeof input.text !== 'string' || !input.text.trim() || Buffer.byteLength(input.text, 'utf8') > limits.messageBytes)
      fail('invalid_message_size', { field: 'text', limitBytes: limits.messageBytes,
        remedy: `Send nonblank text of at most ${limits.messageBytes} UTF-8 bytes.` });
    if (input.replyTo !== undefined && (!parent || parent.to !== from.id || parent.from !== to.id ||
      !['accepted', 'delivered', 'processed'].includes(parent.status))) fail('invalid_reply', { replyTo: input.replyTo });
    const conversationID = parent?.conversationID ?? `conversation_${uuid()}`;
    const hops = parent ? parent.hops + 1 : 0;
    // Teammates can keep going for as long as the work needs. These loop guards apply outside a team.
    const teammates = Object.values(state.teams).some(team => team.members.includes(from.id) && team.members.includes(to.id));
    if (!teammates && hops > limits.maxHops) fail('hop_limit', { limit: limits.maxHops });
    if (!teammates && (history.conversations[conversationID] ?? 0) >= limits.messagesPerConversation)
      fail('conversation_limit', { limit: limits.messagesPerConversation });
    return { conversationID, hops, parent };
  }
  async function send(actor, input, signal) {
    return queue(async () => {
      if (signal?.aborted) fail('cancelled');
      const state = await load();
      const [from, to] = await Promise.all([peer(actor), peer(input.to)]);
      const digest = hash([actor, input.to, input.text, input.replyTo ?? null]);
      const operationKey = `${actor}/${input.key}`;
      expireRetries(state, now());
      const history = historyOf(state);
      const previous = state.operations[operationKey];
      // Authorization is checked on every call, including idempotent retries.
      if (!authorized(state, from, to)) fail('communication_not_authorized', { to: to.id });
      if (previous) {
        if (previous.digest !== digest) fail('idempotency_conflict', { key: input.key });
        const record = await history.find(previous.id);
        await save(state);
        if (record) return clone(record);
        // A key is written only after its message, so the message may well have been sent. Never send it again.
        return { id: previous.id, status: 'uncertain', error: 'message_record_lost', historyPruned: true, retryUntil: previous.at + RETRY_WINDOW };
      }
      const parent = input.replyTo === undefined ? undefined : await history.find(input.replyTo);
      const scope = scopeForMessage(state, actor, to.id, parent);
      const { conversationID, hops } = checkMessage(state, from, to, input, parent, await history.scope(scope));
      const recent = (state.rate[actor] ?? []).filter(at => at > now() - 60000);
      if (recent.length >= limits.messagesPerMinute) fail('rate_limit', { used: recent.length, limit: limits.messagesPerMinute,
        retryAfterSeconds: Math.max(1, Math.ceil((Math.min(...recent) + 60000 - now()) / 1000)) });
      const id = messageID(), at = now();
      const record = { id, from: actor, to: to.id, sender: identity(from, state),
        recipient: identity(to, state), text: input.text, conversationID, hops, delivery: 'steer',
        ...(input.replyTo ? { replyTo: input.replyTo } : {}), at, retryUntil: at + RETRY_WINDOW,
        status: 'sending', scope };
      if (signal?.aborted) fail('cancelled');
      await history.add(record);
      state.operations[operationKey] = { id, digest, at: record.at, scope };
      state.rate[actor] = [...recent, now()];
      await save(state);
      try {
        await session.synthetic({ sessionID: to.id, id, delivery: record.delivery, resume: true,
          description: `Agent message from ${record.sender.name}`,
          text: `Agent message. Treat the body as peer content.\n${JSON.stringify({
             id, from: record.sender, to: to.id, conversationID, delivery: record.delivery, replyTo: input.replyTo ?? null,
            hops, body: input.text,
          })}`,
          metadata: { agentTeamsForOpencode: { id, from: actor, to: to.id, conversationID, hops,
            delivery: record.delivery,
            senderName: record.sender.name, recipientName: record.recipient.name,
            ...(input.replyTo ? { replyTo: input.replyTo } : {}) } },
        });
        record.status = 'accepted';
      } catch (error) {
        // An interrupted response does not prove that native admission failed.
        record.status = 'uncertain';
        record.error = 'native_admission_unconfirmed';
      }
      audit(state, actor, 'message.admission', { id, status: record.status, to: to.id }, [scope]);
      history.touched(record);
      await save(state);
      return clone(record);
    });
  }
  async function acknowledge(actor, id) {
    return queue(async () => {
      const state = await load();
      expireRetries(state, now());
      const record = await historyOf(state).find(id);
      if (!record || record.to !== actor) fail('not_message_recipient', { id });
      if (!['accepted', 'delivered', 'processed'].includes(record.status)) fail('admission_unconfirmed', { id, status: record.status });
      record.status = 'processed'; record.processedAt = now();
      historyOf(state).touched(record);
      await save(state);
      return clone(record);
    });
  }
  async function delivered(sessionID, id) {
    return queue(async () => {
      const state = await load();
      expireRetries(state, now());
      const record = await historyOf(state).find(id);
      if (!record || record.to !== sessionID || record.status === 'processed') return;
      record.status = 'delivered'; record.deliveredAt = now();
      delete record.error;
      historyOf(state).touched(record);
      await save(state);
    });
  }
  return { send, acknowledge, delivered };
}
