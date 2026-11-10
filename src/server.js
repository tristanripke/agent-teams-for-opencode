// @ts-check
import { Plugin } from '@opencode/plugin';
import { Session } from '@opencode/schema/session';
import { SessionMessage } from '@opencode/schema/session-message';
import { Tool } from '@opencode/schema/tool';
import { createAttention } from './attention.js';
import { AgentTeamsError, createEngine, serialQueue } from './core.js';
import { manageDescription, manageSchema } from './manage-schema.js';
import { Collaboration } from './rpc.js';
import { createSettings } from './settings.js';

// Known refusals are completed results carrying {error}. The host records any error thrown by a
// plugin (whose Tool.Error class is a separate module instance) as type "unknown", hiding the code.
export function refusal(error) {
  return { content: JSON.stringify({ error: error.toJSON() }), metadata: { error: error.toJSON() } };
}
// Unexpected failures still fail the call, with a JSON message instead of a bare defect.
export function toolError(error) {
  const detail = { code: 'unexpected_error', message: error instanceof Error ? error.message : String(error),
    remedy: 'Inspect the message; retry only if the request is safe to repeat.' };
  return new Tool.Error({ message: JSON.stringify(detail), metadata: detail });
}
// Server-side catalogs mirror the GUI pickers: visible primary agents and enabled chat models.
function catalogOf(ctx) {
  if (typeof ctx.agent?.list !== 'function' || typeof ctx.model?.list !== 'function') return undefined;
  return {
    agents: async directory => (await ctx.agent.list({ location: { directory } })).data
      .filter(agent => !agent.hidden && agent.mode !== 'subagent')
      .map(agent => ({ id: agent.id, name: agent.name, ...(agent.description ? { description: agent.description } : {}) })),
    models: async directory => (await ctx.model.list({ location: { directory }, types: ['chat'] })).data
      .filter(model => model.enabled !== false && (model.type === undefined || model.type === 'chat'))
      .map(model => ({ providerID: model.providerID, id: model.id, name: model.name,
        variants: (model.variants ?? []).map(variant => typeof variant === 'string' ? variant : variant.id).filter(Boolean) })),
  };
}

const lockKey = Symbol.for('agent-teams-for-opencode.queue.v1');
const queue = globalThis[lockKey] ??= serialQueue();
// Any location instance can handle a deletion first, so all of them share the latest session names.
const titles = globalThis[Symbol.for('agent-teams-for-opencode.titles.v1')] ??= new Map();
// Every location instance receives the same events, so one tracker of who is waiting for a person serves them all.
const attention = globalThis[Symbol.for('agent-teams-for-opencode.attention.v1')] ??= createAttention();
const maintenanceKey = Symbol.for('agent-teams-for-opencode.maintenance.v1');
function startMaintenance(engine) {
  // Location instances share storage. One process-wide timer is enough, with no privileged engine.
  const shared = globalThis[maintenanceKey] ??= { members: new Set(), timer: undefined };
  const run = () => engine.maintain().catch(error => console.error('agent-teams-for-opencode history cleanup failed', error));
  shared.members.add(run);
  if (!shared.timer) {
    shared.timer = setInterval(() => { void shared.members.values().next().value?.(); }, 60000);
    shared.timer.unref?.();
  }
  return () => {
    shared.members.delete(run);
    if (!shared.members.size) { clearInterval(shared.timer); shared.timer = undefined; }
  };
}
export function verifyContext(ctx) {
  const version = /^(\d+)\.(\d+)\.(\d+)/.exec(ctx.app?.version ?? '');
  if (!version || Number(version[1]) !== 2 || Number(version[2]) < 2 ||
    (Number(version[2]) === 2 && Number(version[3]) < 5)) throw new Error('OpenCode V2 2.2.5 or later is required');
  for (const [domain, methods] of Object.entries({ session: ['list', 'get', 'create', 'synthetic'],
    permission: ['assert', 'hook'], storage: ['get', 'set', 'remove', 'scan'], tool: ['transform'], rpc: ['register'], event: ['subscribe'] })) {
    for (const method of methods) if (typeof ctx[domain]?.[method] !== 'function') throw new Error(`Missing V2 API: ${domain}.${method}`);
  }
}
export default Plugin.define({
  id: 'agent-teams-for-opencode',
  async setup(ctx) {
    verifyContext(ctx);
    const registrations = [], controller = new AbortController();
    const settings = createSettings(ctx.storage, queue);
    const engine = createEngine({ storage: ctx.storage, session: ctx.session, queue, titles,
      messageID: () => SessionMessage.ID.create(), sessionID: () => Session.ID.create(),
      limits: ctx.options.limits, catalog: catalogOf(ctx),
      // Pending approvals are looked up through this instance, which is loaded while it asks.
      attention: { of: id => attention.of(id), refresh: ids => attention.refresh(ids,
        typeof ctx.permission.list === 'function' ? sessionID => ctx.permission.list({ sessionID }) : undefined) },
      // The prompt shows a summary with names and folders, never session IDs.
      approve: async (sessionID, action, input, categories, summary) => {
        await ctx.permission.assert({ sessionID,
          action: `agentTeamsForOpencode.approve.${categories.join('+')}`,
          resources: summary ?? [action], save: [],
          metadata: { action, summary, categories },
        });
      },
    });
    // Housekeeping also runs while the dashboard is closed. It never dispatches native messages.
    const stopMaintenance = startMaintenance(engine);
    const readSettings = async () => ({ ...await settings.get(),
      .../** @type {{discoveryMode: string, capabilities: Record<string, string>}} */ (await engine.configuration()) });
    try {
      registrations.push(await ctx.permission.hook('evaluate', event => {
        // A saved allow must not override this plugin's explicit approval policy.
        if (event.action.startsWith('agentTeamsForOpencode.approve.') && event.effect !== 'deny') event.effect = 'ask';
      }));
      registrations.push(await ctx.rpc.register(Collaboration, {
        settings: readSettings,
        configure: async value => {
          const input = /** @type {Record<string, unknown>} */ (value);
          if (!input || Object.keys(input).length !== 1) throw new Error('invalid_setting');
          if (Object.hasOwn(input, 'command')) await settings.set(input);
          else await engine.configure(input);
          return readSettings();
        },
        // An optional sessionID only adds that session's name to `people`.
        snapshot: value => {
          const input = /** @type {{sessionID?: string, scope?: string, limit?: number}} */ (value);
          return engine.snapshot(undefined, input?.sessionID, { scope: input?.scope, limit: input?.limit });
        },
        removeData: value => engine.removeData(/** @type {{confirm: string}} */ (value)?.confirm),
        teamCandidates: value => engine.teamCandidates(value),
        teamManage: value => {
          const { action, input, revision } = /** @type {{action: string, input: object, revision: number}} */ (value);
          return engine.teamManage(action, input, revision);
        },
        profileManage: (value, call) => {
          const { sessionID, input, revision } = /** @type {{sessionID: string, input: object, revision: number}} */ (value);
          return engine.profileManage(sessionID, input, revision, call?.signal);
        },
        manage: (value, call) => {
          const { sessionID, action, input } = /** @type {{sessionID: string, action: string, input: object}} */ (value);
          // The user's own controls: the click is the approval.
          return engine.manage(sessionID, action, input, call.signal, { user: true });
        },
      }));
      registrations.push(await ctx.tool.transform(editor => {
        editor.namespace({ name: 'peers', description: 'Discover sessions and collaborate with authorized peers.' });
        const add = (name, description, input, run) => editor.add({ name, description, input, options: { codemode: false },
          execute: async (value, context) => {
            try { return { content: JSON.stringify(await run(value, context)) }; }
            catch (error) {
              if (error instanceof AgentTeamsError) return refusal(error);
              throw toolError(error);
            }
          } });
        const object = properties => ({ type: 'object', properties, additionalProperties: false });
        const string = { type: 'string' };
        add('discover', 'List discoverable sessions, teams, your connections and your messages. Teams you are not in show only their listed ' +
          'members (membersShown: listed). Ask one of them, or the user, to add you. self shows this session\'s capabilities (allow: proceeds, ' +
          'ask: needs human approval, deny: refused), managed-session quota (unlisted counts plugin sessions that left the list, which are not ' +
          'named) and remaining messages this minute. Sessions you create are listed straight away. messages holds your newest messages from your ' +
          'teams and connections, up to 50 and about 64 KiB, and messagesOmitted says how many older ones were left out. Each peer has activity ' +
          '(running or idle). waitingFor is set while a running peer waits for a person: approval (a permission prompt) or input (a question). ' +
          'That peer is blocked on the user, not on you, so tell the user rather than messaging it again. agents lists up to 100 listed, ' +
          'unarchived peers, newest first, and agentsOmitted counts the rest. compact:true returns only self, peers, own teams/connections and ' +
          'unacknowledged message IDs. catalog:true adds valid agent and model values for session.create. Registration is required by default: ' +
          'manage discovery.register with input {}. Discovery grants no access.',
          object({ compact: { type: 'boolean', description: 'Return a short summary.' },
            catalog: { type: 'boolean', description: 'Include agents and models for session.create.' } }),
          (input, context) => engine.snapshot(context.sessionID, undefined, { compact: input?.compact === true, catalog: input?.catalog === true }));
        add('send', 'Send a steering synthetic peer message. Steers busy recipients at their next step boundary and wakes idle recipients; does ' +
          'not cancel an in-flight model or tool call. Reuse key for immediate retries only: duplicate protection lasts 15 minutes from the first ' +
          'attempt, or until its team is deleted. After that the same key is a new send. Never force a retry of an uncertain admission; inspect ' +
          'the recipient first. Set replyTo for a reply. Returns admission status, not delivery or recipient acknowledgement. retryUntil reports ' +
          'the protection deadline. historyPruned:true means only the short-lived receipt remains. A refusal returns {"error":{code, remedy, ' +
          '...}} and sends nothing.',
          { ...object({ to: string, key: string, text: string, replyTo: string }), required: ['to', 'key', 'text'] },
          (input, context) => engine.send(context.sessionID, input, context.signal));
        add('acknowledge', 'Mark a message addressed to this session as processed. Use only after reading and processing it.',
          { ...object({ id: string }), required: ['id'] }, (input, context) => engine.acknowledge(context.sessionID, input.id));
        add('manage', manageDescription(), manageSchema(engine.limits),
          (input, context) => engine.manage(context.sessionID, input.action, input.input, context.signal));
      }));
      const events = (async () => {
        // While no instance follows events, the tracker can't stay current, so it starts again from nothing.
        const stopListening = attention.listen();
        try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          attention.event(event);
          if (event.type === 'session.inbox.delivered') await engine.delivered(event.data.sessionID, event.data.inboxID)
            .catch(error => console.error('agent-teams-for-opencode delivery update failed', error));
          // A failed save must not end the subscription. The next read reconciles it.
          if (event.type === 'session.deleted') await engine.sessionDeleted(event.data.sessionID)
            .catch(error => console.error('agent-teams-for-opencode session removal failed', error));
        }
        } finally { stopListening(); }
      })();
      events.catch(error => { if (!controller.signal.aborted) console.error('agent-teams-for-opencode event subscription failed', error); });
      // Events are not replayed, so deletions made while the plugin was stopped are found here.
      const reconciled = engine.reconcile().catch(error => console.error('agent-teams-for-opencode session reconciliation failed', error));
      return async () => {
        stopMaintenance();
        controller.abort();
        await Promise.allSettled(registrations.reverse().map(item => item.dispose()));
        await events.catch(() => {});
        await reconciled;
      };
    } catch (error) {
      stopMaintenance();
      controller.abort();
      await Promise.allSettled(registrations.reverse().map(item => item.dispose()));
      throw error;
    }
  },
});
