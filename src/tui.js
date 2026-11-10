// @ts-check
import { Plugin } from '@opencode/plugin/tui';
import { Collaboration } from './rpc.js';
import { ACTIONS, collectAction, collectUserTeam, joinFirst } from './actions.js';
import { CAPABILITY, activity, capabilityText, ends, errorText, names, relative, status, plain } from './format.js';
import { createSignal } from 'solid-js';

const SECTIONS = ['Teams', 'Agents', 'Connections', 'Messages', 'Activity', 'Actions', 'Settings'];

export default Plugin.define({
  id: 'agent-teams-for-opencode',
  setup(ctx) {
    const [command, setCommand] = createSignal('team');
    const api = () => {
      const client = ctx.client.rpc(Collaboration);
      const options = { location: ctx.location ?? ctx.data.location.default() };
      return { snapshot: async () => {
        const route = ctx.ui.router.current();
        return /** @type {any} */ (await client.snapshot(route.type === 'session' ? { sessionID: route.sessionID } : {}, options));
      }, manage: input => client.manage(input, options),
        teamManage: input => client.teamManage(input, options),
        settings: async () => /** @type {{command: string}} */ (await client.settings({}, options)),
        removeData: input => client.removeData(input, options),
        configure: async input => /** @type {{command: string}} */ (await client.configure(input, options)) };
    };
    const ui = {
      select: (title, options) => ctx.ui.dialog.select({ title, options }),
      prompt: (title, value) => ctx.ui.dialog.prompt({ title, value }),
    };
    const guarded = fn => async () => {
      try { await fn(); }
      catch (error) { ctx.ui.toast.show({ message: errorText(error), variant: 'error' }); }
    };
    let disposed = false, loadingSettings = false, settingsFailed = false, commandGeneration = 0;
    async function loadSettings() {
      if (loadingSettings || disposed) return;
      loadingSettings = true;
      const generation = commandGeneration;
      try {
        const value = await api().settings();
        if (!disposed && generation === commandGeneration) setCommand(value.command);
        settingsFailed = false;
      }
      catch (error) {
        if (!settingsFailed) console.error('agent-teams-for-opencode command setting unavailable', error);
        settingsFailed = true;
      }
      finally { loadingSettings = false; }
    }
    void loadSettings();
    const settingsTimer = setInterval(() => void loadSettings(), 5000);
    function current() {
      const route = ctx.ui.router.current();
      if (route.type !== 'session') throw new Error('Open a session first.');
      return route.sessionID;
    }
    async function overview() {
      const state = await api().snapshot();
      const id = await ui.select('Agents', state.agents.map(peer => ({
        title: `${plain(peer.name)} · ${plain(peer.role)}`,
          description: `${peer.activity === 'running' ? 'Running' : 'Idle'} · ${peer.directory}`, value: peer.sessionID,
      })));
      if (id) ctx.ui.router.navigate({ type: 'session', sessionID: id });
    }
    async function settings(state) {
      const name = await ui.select('Agent Teams settings', [
        { title: `Dashboard command: /${command()}`, value: 'slashCommand' },
        { title: `List sessions automatically: ${state.discovery.mode === 'automatic' ? 'on' : 'off'}`, value: 'discoveryMode' },
        ...Object.keys(CAPABILITY).map(value => ({
          title: `An agent may ${CAPABILITY[value].title.toLowerCase()} without asking: ${state.capabilities[value] === 'allow' ? 'on' : 'off'}`,
          description: [CAPABILITY[value].description, state.capabilities[value] === 'deny' ? 'Currently blocked.' : '']
            .filter(Boolean).join(' ') || undefined, value })),
        { title: 'Remove saved data', description: 'Delete all teams, history and settings this plugin stored.', value: 'removeData' },
      ]);
      if (!name) return;
      if (name === 'removeData') {
        const answer = await ui.select('Delete all teams, history and settings this plugin stored? This cannot be undone.', [
          { title: 'Cancel', value: 'cancel' }, { title: 'Remove saved data', value: 'remove' }]);
        if (answer !== 'remove') return;
        await api().removeData({ confirm: 'remove-all-saved-data' });
        commandGeneration++;
        setCommand('team');
        ctx.ui.toast.show({ message: 'Saved data removed', variant: 'success' });
        return;
      }
      if (name === 'slashCommand') {
        const value = await ui.prompt('Dashboard command (default: team)', command());
        if (value !== undefined) {
          const saved = await api().configure({ command: value });
          commandGeneration++;
          setCommand(saved.command);
          ctx.ui.toast.show({ message: `Command saved: /${saved.command}`, variant: 'success' });
        }
        return;
      }
      if (name === 'discoveryMode') {
        const mode = await ui.select('List sessions automatically', [
          { title: 'Off: list a session after it joins', value: 'registered' }, { title: 'On: list every session', value: 'automatic' },
        ]);
        if (mode) await api().configure({ discoveryMode: mode });
        return;
      }
      const next = state.capabilities[name] === 'allow' ? 'ask' : 'allow';
      await api().configure({ capabilities: { [name]: next } });
      ctx.ui.toast.show({ message: capabilityText(name, next), variant: 'success' });
    }
    async function dashboard() {
      const section = await ui.select('Agent Teams', SECTIONS.map(title => ({ title, value: title })));
      if (!section) return;
      if (section === 'Agents') return overview();
      const state = await api().snapshot();
      if (section === 'Teams') {
        const id = await ui.select('Teams', [{ title: 'New team', value: 'new' },
          ...state.teams.map(team => ({ title: team.name, description: names(state, team.members), value: team.id }))]);
        if (!id) return;
        const team = state.teams.find(team => team.id === id);
        const action = team ? await ui.select(team.name, [{ title: 'Manage team', value: 'manage' }, { title: 'Delete team', value: 'delete' },
          ...team.members.map(id => ({ title: `Open ${names(state, [id])}`, value: id }))]) : 'manage';
        if (!action) return;
        if (action.startsWith('ses_')) { ctx.ui.router.navigate({ type: 'session', sessionID: action }); return; }
        if (action === 'delete') {
          if (await ui.select(`Delete ${team.name} and its history?`,
            [{ title: 'Cancel', value: 'cancel' }, { title: 'Delete team', value: 'delete' }]) !== 'delete') return;
          await api().teamManage({ action: 'team.delete', input: { id: team.id }, revision: state.revision });
        } else {
          const route = ctx.ui.router.current();
          const input = await collectUserTeam(ui, state, team, route.type === 'session' ? route.sessionID : undefined);
          if (!input) return;
          await api().teamManage({ action: team ? 'team.update' : 'team.create', input, revision: state.revision });
        }
        ctx.ui.toast.show({ message: action === 'delete' ? 'Team deleted' : 'Team saved', variant: 'success' });
        return;
      }
      if (section === 'Actions') {
        const action = await ui.select('Agent Teams actions', Object.entries(ACTIONS).map(([value, item]) => ({ title: item.title, value })));
        if (!action) return;
        const sessionID = current(), input = await collectAction(ui, action, state, sessionID);
        if (!input) return;
        const refusal = joinFirst(state, action, input);
        if (refusal) throw new Error(refusal);
        await api().manage({ sessionID, action, input });
        ctx.ui.toast.show({ message: `${ACTIONS[action].title}: done`, variant: 'success' });
      } else if (section === 'Settings') {
        await settings(state);
      } else if (section === 'Messages') {
        const message = await ui.select('Messages', state.messages.slice().reverse().map(item => ({
          title: `${plain(item.sender.name)} → ${plain(item.recipient.name)} · ${status(item.status).label} · ${relative(item.at)}`,
          description: plain(item.text).slice(0, 100), value: item.id,
        })));
        if (!message) return;
        const item = state.messages.find(row => row.id === message);
        await ctx.ui.dialog.alert({ title: `${plain(item.sender.name)} → ${plain(item.recipient.name)} · ${status(item.status).label}`,
          message: `${plain(item.text, true)}\n\n${status(item.status).help}` });
        ctx.ui.router.navigate({ type: 'session', sessionID: item.to });
      } else {
        const rows = section === 'Connections'
          ? state.connections.map(item => `${names(state, item.members).replaceAll(', ', ' ↔ ')}\nTemporary connection · ${ends(item)}`)
            : state.audit.slice(-50).reverse().map(item => {
              const line = activity(item, state);
              return `${relative(item.at)} · ${line.text}${line.detail ? `\n${line.detail}` : ''}`;
            });
        await ctx.ui.dialog.alert({ title: section, message: rows.join('\n\n') || `No ${section.toLowerCase()} yet.` });
      }
    }
    ctx.keymap.layer(() => ({ mode: 'global', commands: [
      { id: 'peers.overview', title: 'Show agents', group: 'Agent Teams', palette: true,
        slash: { name: 'peers' }, run: guarded(overview) },
      { id: 'peers.dashboard', title: 'Open Agent Teams', group: 'Agent Teams', palette: true,
        slash: { name: command() }, run: guarded(dashboard) },
    ] }));
    const stop = ctx.data.on('session.inbox.enqueued', event => {
      const meta = event.data.item.type === 'synthetic' ? event.data.item.payload.metadata?.agentTeamsForOpencode : undefined;
      if (meta) ctx.ui.toast.show({
        message: `${meta.senderName ? plain(meta.senderName)
        : 'An agent'} sent ${meta.recipientName ? plain(meta.recipientName) : 'a session'} a message`, variant: 'info' });
    });
    return () => { disposed = true; clearInterval(settingsTimer); stop(); };
  },
});
