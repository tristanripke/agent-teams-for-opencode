// The Desktop plugin: stores, the panel, its launcher and commands, the settings page and message notices.
import { Plugin, Command, MenuItem, Panel, SettingsPage, Store, Style, createKeyed } from '@opencode/plugin/gui';
import { Schema } from 'effect';
import { createSignal, createMemo, createEffect, on, onCleanup } from 'solid-js';
import { errorText, plain } from './format.js';
import { api } from './gui/api.js';
import { Dashboard } from './gui/dashboard.jsx';
import { SettingsView, type SettingsValue, type SettingsController } from './gui/settings.jsx';
import css from './gui.css?inline';

export default Plugin.define({
  stores: { teamExpansion: Store.session(Schema.Struct({ expandedTeams: Schema.Array(Schema.String) }), { expandedTeams: [] }),
    teamOrder: Store.global(Schema.Struct({ order: Schema.Array(Schema.String) }), { order: [] }),
    historySelection: Store.global(Schema.Struct({ messages: Schema.Record(Schema.String, Schema.String),
      activity: Schema.Record(Schema.String, Schema.String) }), { messages: {}, activity: {} }) },
  setup(ctx) {
    // Plain signals, not createResource: a refetching resource re-enters loading and can
    // suspend host UI that reads it. Polling updates the signal only when values change.
    const [settings, setSettings] = createSignal<SettingsValue>();
    const [settingsError, setSettingsError] = createSignal<unknown>();
    let commandGeneration = 0, savingCommand = false;
    const keep = (value: SettingsValue) => setSettings(previous =>
      previous && JSON.stringify(previous) === JSON.stringify(value) ? previous : value);
    async function loadSettings() {
      if (savingCommand) return;
      const generation = commandGeneration;
      try {
        const value = await api(ctx).settings() as SettingsValue;
        if (generation === commandGeneration && !savingCommand) keep(value);
        if (settingsError() !== undefined) setSettingsError(undefined);
      } catch (error) { if (!settings()) setSettingsError(error); }
    }
    createEffect(on(() => ctx.sessions.current()?.server.id, () => void loadSettings()));
    // Global contributions read only this memo, so settings polling cannot register them again.
    const commandName = createMemo(() => settings()?.command ?? 'team');
    const preferences: SettingsController = { value: settings, error: settingsError, save: async input => {
      savingCommand = true;
      try {
        const saved = await api(ctx).configure(input) as SettingsValue;
        commandGeneration++;
        keep(saved);
      }
      finally { savingCommand = false; }
    }, removeData: async () => {
      await api(ctx).removeData();
      // Window preferences live apart from the server's data. A session's expansion can be removed only while that session is open.
      ctx.storage.remove('teamOrder');
      ctx.storage.remove('historySelection');
      const session = ctx.sessions.current();
      if (session) ctx.storage.remove('teamExpansion', { scope: { session } });
      commandGeneration++;
      await loadSettings();
    } };
    const settingsTimer = setInterval(() => void loadSettings(), 5000);
    onCleanup(() => clearInterval(settingsTimer));
    createKeyed(() => ctx.servers.list().map(id => ctx.servers.get(id)?.data).filter(Boolean), sources => {
      const stop = sources.map(data => data.on('session.inbox.enqueued', event => {
        if (event.data.item.type !== 'synthetic') return;
        const meta = event.data.item.payload.metadata?.agentTeamsForOpencode;
        if (!meta) return;
        // Agent-chosen names are plain text here, so a name can't fake a second line.
        const title = `${meta.senderName ? plain(meta.senderName) : 'An agent'} sent ${meta.recipientName ? plain(meta.recipientName) : 'a session'} a message`;
        const server = ctx.servers.list().find(id => ctx.servers.get(id)?.data === data);
        ctx.toast.show({ title });
        if (server) void ctx.attention.notify({ title, message: 'Agent Teams',
          session: { server, id: event.data.sessionID }, id: `agent-teams-for-opencode:${server}:${event.data.item.id}` });
      }));
      onCleanup(() => stop.forEach(dispose => dispose()));
    }, { equals: (previous, next) => previous.length === next.length && previous.every((item, index) => item === next[index]) });
    ctx.add(Style, css);
    const tab = { id: 'collaboration', title: 'Agent Teams',
      label: () => <span class="teams-tab-label"><ctx.ui.Icon name="speech-bubble" size="small" class="teams-tab-icon" />Agent Teams</span> };
    const panelKey = `${ctx.id}:${tab.id}`;
    function openTeams() {
      const session = ctx.sessions.current();
      if (session) ctx.layout.open(panelKey, session);
      else ctx.toast.show({ title: 'Open a session first' });
    }
    ctx.add(Panel, { id: 'collaboration', region: 'side', wide: true,
      mobile: { title: 'Agent Teams', order: 60, kind: 'menu', icon: 'speech-bubble' },
      list: input => input.open.includes(tab.id) ? [tab] : [],
      render: () => <Dashboard ctx={ctx} initial="Teams" panelKey={panelKey} teamOrder={ctx.stores.teamOrder}
        historySelection={ctx.stores.historySelection} expansion={() => {
        const session = ctx.sessions.current();
        return session ? ctx.stores.teamExpansion(session) : undefined;
      }} />,
    });
    ctx.add(MenuItem, { menu: 'session.panel', id: 'teams', title: 'Agent Teams', icon: 'speech-bubble',
      get opened() {
        const session = ctx.sessions.current();
        return Boolean(session && ctx.layout.state(panelKey, session) !== 'closed');
      },
      run: openTeams,
    });
    ctx.add(Command, () => ({ id: 'dashboard', title: 'Open Agent Teams', group: 'Agent Teams', keywords: 'teams agents peers collaboration',
      slash: { name: commandName() }, run: openTeams,
    }));
    ctx.add(Command, { id: 'overview', title: 'Show agents', group: 'Agent Teams', keywords: 'peers agents sessions',
      slash: { name: 'peers' }, run: async () => {
        try {
          const state = await api(ctx).snapshot();
          const id = await ctx.dialogs.select({ title: 'Agents', placeholder: 'Search agents', options: state.agents.map(peer => ({
            title: `${peer.name} · ${peer.role}`, description: `${peer.activity === 'running' ? 'Running' : 'Idle'} · ${peer.directory}`,
            value: peer.sessionID,
          })) });
          const server = ctx.sessions.current()?.server.id;
          if (id && server) ctx.tabs.open({ server, id: String(id) }, { focus: true });
        } catch (error) { ctx.toast.show({ title: errorText(error), variant: 'error' }); }
      },
    });
    ctx.add(SettingsPage, { id: 'collaboration', title: 'Agent Teams', icon: 'speech-bubble',
      entries: [
        { id: 'command', title: 'Dashboard command', description: 'The slash command that opens Agent Teams.', keywords: 'slash command team' },
        { id: 'discovery', title: 'List sessions automatically', description: 'How sessions appear to other agents.',
          keywords: 'discovery register list join' },
        { id: 'approvals', title: 'Agent permissions', description: 'What an agent may do without asking for permission.',
          keywords: 'approval autonomy permission policy capability allow' },
        { id: 'data', title: 'Remove saved data', description: 'Delete everything this plugin stored, before uninstalling.',
          keywords: 'uninstall remove delete data purge clear' },
      ],
      render: input => <SettingsView ctx={ctx} settings={preferences} target={input?.target} />,
    });
  },
});
