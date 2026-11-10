// The core record stays small. Each scope's history has its own key, so a message rewrites only its own scope.
export const NO_TEAM = 'none';
export const GENERAL = 'general';
export const HISTORY_BYTES = 8 * 1024 * 1024;
export const RECENT_RECORDS = 200;
export const RETRY_WINDOW = 15 * 60 * 1000;
export const INDEX_KEY = 'collaboration.v1.index';
const HISTORY_PREFIX = 'collaboration.v1.history.';
export const historyKey = scope => `${HISTORY_PREFIX}${scope}`;
const emptyHistory = () => ({ messages: {}, conversations: {}, audit: [] });

export function scopeForMessage(state, from, to, parent) {
  const shared = Object.values(state.teams).filter(team => team.members.includes(from) && team.members.includes(to));
  return shared.find(team => team.id === parent?.scope)?.id ?? shared.map(team => team.id).sort()[0] ?? NO_TEAM;
}

export function scopesForAudit(state, actor, action, data) {
  const proposal = data.proposal ?? {};
  if (data.teamID ?? proposal.teamID) return [data.teamID ?? proposal.teamID];
  if (action.startsWith('team.')) {
    const id = proposal.id ?? Object.values(state.teams).find(team => team.name === proposal.name)?.id;
    return [id ?? GENERAL];
  }
  if (action === 'profile.update') {
    const id = data.sessionID ?? actor;
    const scopes = Object.values(state.teams).filter(team => team.members.includes(id)).map(team => team.id);
    return scopes.length ? scopes : [GENERAL];
  }
  return [action.startsWith('connection.') ? NO_TEAM : GENERAL];
}

export function expireRetries(state, time) {
  for (const [key, operation] of Object.entries(state.operations)) {
    if (operation.at <= time - RETRY_WINDOW) delete state.operations[key];
  }
  for (const [id, receipt] of Object.entries(state.receipts)) {
    if (receipt.at <= time - RETRY_WINDOW) delete state.receipts[id];
  }
}

// Which retained messages each recipient still has to acknowledge. Kept per scope in the core record, beside the
// counts, so a short discover can answer without reading any history.
export function unacknowledged(history) {
  const waiting = {};
  for (const message of Object.values(history.messages)) {
    if (message.status === 'accepted' || message.status === 'delivered') (waiting[message.to] ??= []).push(message.id);
  }
  return waiting;
}

export function historyCounts(state) {
  const count = scope => ({ messages: state.counts[scope]?.messages ?? 0, activity: state.counts[scope]?.activity ?? 0 });
  return { teams: Object.fromEntries(Object.keys(state.teams).map(id => [id, count(id)])), none: count(NO_TEAM), general: count(GENERAL) };
}

// One unit of work on the saved state. Nothing reaches storage until commit, and an unchanged key is not rewritten.
export function openHistory(storage, state, savedCoreText, { records, now, invalid }) {
  const loaded = new Map(), dirty = new Set(), forgotten = new Set();
  let pending = [], index, indexDirty = false, savedCore = savedCoreText;

  async function scope(id) {
    if (loaded.has(id)) return loaded.get(id);
    const saved = forgotten.has(id) ? undefined : await storage.get(historyKey(id));
    if (saved !== undefined && (!saved?.messages || !saved.conversations || !Array.isArray(saved.audit))) invalid();
    const history = saved === undefined ? emptyHistory() : structuredClone(saved);
    for (const record of Object.values(history.messages)) {
      if (record.status !== 'sending') continue;
      dirty.add(id);
      // Its retry key is written after it and before dispatch, so a missing key proves it was never sent, but
      // only while that key would still exist. Once the key could have expired, the message may have gone out.
      const keyed = Object.values(state.operations).some(operation => operation.id === record.id);
      if (keyed || record.at <= now() - RETRY_WINDOW) {
        record.status = 'uncertain'; record.error = 'recovered_admission_unconfirmed';
      } else {
        delete history.messages[record.id];
        if (history.conversations[record.conversationID] > 1) history.conversations[record.conversationID]--;
        else delete history.conversations[record.conversationID];
      }
    }
    loaded.set(id, history);
    return history;
  }
  async function readIndex() {
    if (index === undefined) {
      const saved = await storage.get(INDEX_KEY);
      if (saved !== undefined && (!saved || typeof saved !== 'object' || Array.isArray(saved))) invalid();
      index = structuredClone(saved ?? {});
    }
    return index;
  }
  // A receipt or a retained message. A retry within the window can reach only one of the two.
  async function find(id) {
    if (Object.hasOwn(state.receipts, id)) return state.receipts[id];
    const known = await readIndex();
    return Object.hasOwn(known, id) ? (await scope(known[id])).messages[id] : undefined;
  }
  async function add(record) {
    const history = await scope(record.scope), known = await readIndex();
    history.messages[record.id] = record;
    history.conversations[record.conversationID] = (history.conversations[record.conversationID] ?? 0) + 1;
    known[record.id] = record.scope;
    dirty.add(record.scope); indexDirty = true;
  }
  const touched = record => { if (!record.historyPruned) dirty.add(record.scope); };
  const audit = (entry, scopes) => pending.push({ entry, scopes });
  function forget(id) {
    forgotten.add(id); loaded.delete(id); dirty.delete(id);
    pending = pending.map(item => ({ ...item, scopes: item.scopes.filter(scope => scope !== id) }));
    for (const [key, operation] of Object.entries(state.operations)) if (operation.scope === id) delete state.operations[key];
    for (const [key, receipt] of Object.entries(state.receipts)) if (receipt.scope === id) delete state.receipts[key];
    delete state.counts[id];
    if (state.unacknowledged) delete state.unacknowledged[id];
  }
  function compact(history, message, known, time) {
    delete history.messages[message.id];
    delete known[message.id];
    if (message.at <= time - RETRY_WINDOW) return;
    const receipt = { historyPruned: true };
    for (const key of ['id', 'from', 'to', 'conversationID', 'hops', 'delivery', 'replyTo', 'at', 'status',
      'deliveredAt', 'processedAt', 'error', 'scope', 'retryUntil']) {
      if (message[key] !== undefined) receipt[key] = message[key];
    }
    state.receipts[message.id] = receipt;
  }
  // Insertion order, not timestamps, so a clock change cannot trim the newest message.
  function prune(history, known, time) {
    let count = 0, bytes = 0, full = false, trimmed = false;
    for (const message of Object.values(history.messages).reverse()) {
      const size = Buffer.byteLength(JSON.stringify(message), 'utf8');
      // An in-flight intent keeps its body until the native result is known.
      if (message.status !== 'sending' && count && (full || count >= records || bytes + size > HISTORY_BYTES)) {
        full = true; trimmed = true;
        compact(history, message, known, time);
      } else { count++; bytes += size; }
    }
    if (history.audit.length > records) history.audit = history.audit.slice(-records);
    const used = new Set([...Object.values(history.messages), ...Object.values(state.receipts)].map(item => item.conversationID));
    for (const id of Object.keys(history.conversations)) if (!used.has(id)) delete history.conversations[id];
    return trimmed;
  }
  // Finds what an interrupted commit left behind. The index and counts can be derived from the scopes, so they are.
  async function repair() {
    const rebuilt = {}, seen = new Set(), live = id => id === NO_TEAM || id === GENERAL || Object.hasOwn(state.teams, id);
    let after;
    do {
      const page = await storage.scan({ prefix: HISTORY_PREFIX, limit: 20, ...(after ? { after } : {}) });
      for (const { key, value } of page.entries) {
        const id = key.slice(HISTORY_PREFIX.length);
        if (!live(id)) { forget(id); continue; }
        if (!value?.messages || !Array.isArray(value.audit)) invalid();
        seen.add(id);
        for (const message of Object.keys(value.messages)) rebuilt[message] = id;
        state.counts[id] = { messages: Object.keys(value.messages).length, activity: value.audit.length };
        (state.unacknowledged ??= {})[id] = unacknowledged(value);
      }
      after = page.next;
    } while (after);
    for (const id of Object.keys(state.counts)) if (!seen.has(id)) delete state.counts[id];
    for (const id of Object.keys(state.unacknowledged ?? {})) if (!seen.has(id)) delete state.unacknowledged[id];
    const known = await readIndex(), ids = Object.keys(rebuilt);
    if (ids.length !== Object.keys(known).length || ids.some(id => known[id] !== rebuilt[id])) { index = rebuilt; indexDirty = true; }
  }
  async function commit() {
    for (const { entry, scopes } of pending) {
      for (const id of scopes) { (await scope(id)).audit.push(entry); dirty.add(id); }
    }
    pending = [];
    const writeCore = async () => {
      const core = JSON.stringify(state);
      if (core !== savedCore) await storage.set('collaboration.v1', state);
      savedCore = core;
    };
    // The core record says which teams exist. Removing a team writes it first, so a failure cannot
    // destroy the history of a team that survives. repair finishes the removal after an interruption.
    const removing = forgotten.size > 0;
    if (dirty.size || removing || indexDirty) {
      const known = await readIndex(), time = now();
      for (const id of forgotten) {
        for (const [message, owner] of Object.entries(known)) if (owner === id) { delete known[message]; indexDirty = true; }
      }
      const fresh = {};
      for (const id of dirty) {
        const history = await scope(id);
        if (prune(history, known, time)) indexDirty = true;
        state.counts[id] = { messages: Object.keys(history.messages).length, activity: history.audit.length };
        fresh[id] = unacknowledged(history);
      }
      // A summary lives in the core record, which is written after the histories. So before a history whose summary
      // changes is written, its saved summary is marked unknown. An interruption then leaves unknown, which is read
      // from the history, rather than a stale summary. Only the previously saved record is rewritten, so this never
      // saves a retry key before its message. Nothing waiting and no summary mean the same, so that needs no mark.
      const before = savedCore === undefined ? {} : JSON.parse(savedCore);
      const same = (a, b) => JSON.stringify(a && Object.keys(a).length ? a : {}) === JSON.stringify(b && Object.keys(b).length ? b : {});
      const changed = [...dirty].filter(id => !same(before.unacknowledged?.[id], fresh[id]));
      state.unacknowledged ??= {};
      if (removing) {
        for (const id of changed) state.unacknowledged[id] = null;
        await writeCore();
      } else if (changed.length) {
        before.unacknowledged = { ...before.unacknowledged };
        for (const id of changed) before.unacknowledged[id] = null;
        await storage.set('collaboration.v1', before);
        savedCore = JSON.stringify(before);
      }
      for (const id of dirty) await storage.set(historyKey(id), loaded.get(id));
      if (indexDirty) await storage.set(INDEX_KEY, known);
      for (const id of forgotten) await storage.remove(historyKey(id));
      Object.assign(state.unacknowledged, fresh);
      if (removing && changed.length) await writeCore();
    }
    if (!removing) await writeCore();
    dirty.clear(); forgotten.clear(); indexDirty = false;
  }
  return { scope, find, add, touched, audit, forget, repair, commit };
}
