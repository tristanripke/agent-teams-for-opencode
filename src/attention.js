// @ts-check
// Which sessions are waiting for a person: an approval, or an answer to a question.
// Approvals can be looked up, so each running session is looked up once and then followed through events.
// Questions can only be followed through events, so one asked while nothing was listening is not known.
// Nothing here is saved: it describes the moment, and a session that goes idle is waiting for nobody.

// One tracker serves every location instance, so each lookup is given by the instance asking, which is still loaded.
/** @typedef {(sessionID: string) => Promise<ReadonlyArray<{ id: string }>>} ListApprovals */
export function createAttention() {
  /** @type {Map<string, Set<string>>} */ const approvals = new Map();
  /** @type {Map<string, Set<string>>} */ const questions = new Map();
  /** @type {Set<string>} */ const looked = new Set();
  // Bumped by every event about a session, so a lookup that overlapped one is known to be out of date.
  /** @type {Map<string, number>} */ const changes = new Map();
  // Bumped when the tracker is cleared, so a lookup started before then is dropped.
  let epoch = 0, listeners = 0;
  /** @param {Map<string, Set<string>>} map @param {unknown} session @param {unknown} id */
  const add = (map, session, id) => {
    if (typeof session !== 'string' || typeof id !== 'string') return;
    let set = map.get(session);
    if (!set) map.set(session, set = new Set());
    set.add(id);
  };
  /** @param {Map<string, Set<string>>} map @param {unknown} session @param {unknown} id */
  const drop = (map, session, id) => {
    if (typeof session !== 'string') return;
    const set = map.get(session);
    if (!set) return;
    set.delete(/** @type {string} */ (id));
    if (!set.size) map.delete(session);
  };
  /** @param {unknown} session */
  const changed = session => { if (typeof session === 'string') changes.set(session, (changes.get(session) ?? 0) + 1); };
  /** @param {string} session */
  const forget = session => { approvals.delete(session); questions.delete(session); };
  function clear() { approvals.clear(); questions.clear(); looked.clear(); changes.clear(); epoch++; }

  /** @param {{ type?: string, data?: any }} event */
  function event(event) {
    const data = event?.data ?? {};
    switch (event?.type) {
      case 'permission.asked': changed(data.sessionID); add(approvals, data.sessionID, data.id); break;
      case 'permission.replied': changed(data.sessionID); drop(approvals, data.sessionID, data.requestID); break;
      case 'form.created': add(questions, data.form?.sessionID, data.form?.id); break;
      case 'form.replied': case 'form.cancelled': drop(questions, data.sessionID, data.id); break;
      // An idle session is not blocked on anyone, whatever an event was missed.
      case 'session.idle': changed(data.sessionID); forget(data.sessionID); break;
      case 'session.deleted': changed(data.sessionID); forget(data.sessionID); looked.delete(data.sessionID); break;
    }
  }
  /**
   * Each instance that follows events says so. With nobody following them, anything known could go out of date
   * unseen, so the tracker starts again from nothing, and the next instance looks approvals up afresh.
   * @returns {() => void} stops following
   */
  function listen() {
    listeners++;
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      if (--listeners === 0) clear();
    };
  }
  /**
   * Looks up the pending approvals of running sessions not looked up before. A lookup is kept only if nothing about
   * that session happened while it ran, and only while events are being followed. Otherwise it is tried again.
   * @param {ReadonlyArray<string>} sessionIDs @param {ListApprovals | undefined} listApprovals
   */
  async function refresh(sessionIDs, listApprovals) {
    if (!listApprovals || !listeners) return;
    await Promise.all(sessionIDs.filter(id => !looked.has(id)).map(async id => {
      looked.add(id);
      const before = changes.get(id) ?? 0, started = epoch;
      let found;
      try { found = await listApprovals(id); }
      catch { if (epoch === started) looked.delete(id); return; }
      if (epoch !== started) return;
      if ((changes.get(id) ?? 0) !== before || !listeners) { looked.delete(id); return; }
      for (const request of found ?? []) add(approvals, id, request?.id);
    }));
  }
  /** @param {string} sessionID @returns {'approval' | 'input' | undefined} */
  const of = sessionID => !listeners ? undefined : approvals.has(sessionID) ? 'approval' : questions.has(sessionID) ? 'input' : undefined;
  return { event, listen, refresh, of };
}
