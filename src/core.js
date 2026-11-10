// The engine: one closure per concern in src/engine/, sharing the saved state through one queue.
import { randomUUID } from 'node:crypto';
import { limitsFrom, serialQueue } from './engine/shared.js';
import { createStore } from './engine/store.js';
import { createSessions } from './engine/sessions.js';
import { createViews } from './engine/snapshot.js';
import { createMessaging } from './engine/messages.js';
import { createManagement } from './engine/manage.js';
import { createUserControls } from './engine/user.js';

export { CAPABILITIES } from './manage-schema.js';
export { DEFAULT_CAPABILITIES, DEFAULT_LIMITS, REMOVE_DATA_CONFIRMATION, AgentTeamsError, limitsFrom, serialQueue } from './engine/shared.js';

// `titles` holds names from the latest listings, so Activity can still name a session once it is gone.
export function createEngine({ storage, session, approve, queue = serialQueue(),
  now = Date.now, uuid = randomUUID, messageID = () => `msg_${uuid().replaceAll('-', '')}`,
  sessionID = () => `ses_${uuid().replaceAll('-', '')}`, limits: configuredLimits, catalog, titles = new Map(), attention = undefined }) {
  const limits = limitsFrom(configuredLimits);
  const base = { storage, session, approve, queue, now, uuid, messageID, sessionID, limits, catalog, titles, attention };
  const store = createStore(base);
  const sessions = createSessions({ ...base, store });
  const parts = { ...base, store, sessions };
  const { maintain, configuration, configure, removeData } = store;
  const { reconcile, sessionDeleted } = sessions;
  return { ...createViews(parts), ...createMessaging(parts), ...createManagement(parts), ...createUserControls(parts),
    removeData, sessionDeleted, reconcile, maintain, limits, configuration, configure };
}
