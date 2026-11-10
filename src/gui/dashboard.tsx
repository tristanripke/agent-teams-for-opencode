// The Agent Teams panel: Teams, Agents, Connections, Messages and Activity.
import type { Context, Persisted } from '@opencode/plugin/gui';
import { createSignal, createMemo, createEffect, on, onCleanup, onMount, untrack, For, Show } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { CONNECT_HINT, collectAction, joinFirst } from '../actions.js';
import { activity, ends, errorText, folder, modelDisplay, nameOf, names, person, projects, relative, sessionStatus } from '../format.js';
import { createTeamReorder, orderTeams } from '../team-order.js';
import { NO_TEAM, GENERAL } from '../history.js';
import { api, collectForm, sessionData } from './api.js';
import { memberForm, type FormKind } from './member-form.jsx';
import { detailsForm, type DetailsKind } from './details-form.jsx';
import { Empty, PeerIndicator, MessageRow, markOwnMenus, openMenuAt } from './rows.jsx';
import { TeamForm } from './team-form.jsx';
import type { Connection, Model, Peer, Snapshot, Team } from './types.js';

const DONE: Record<string, string> = {
  'discovery.register': 'This session is now listed', 'discovery.unregister': 'This session is no longer listed',
  'profile.update': 'Name and role saved', 'team.create': 'Team created', 'team.members': 'Team members saved',
  'team.delete': 'Team deleted', 'connection.create': 'Sessions connected', 'connection.extend': 'Connection extended',
  'connection.close': 'Connection closed', 'session.create': 'Agent session created',
};
const SECTIONS = ['Teams', 'Agents', 'Connections', 'Messages', 'Activity'];
const HISTORY_PAGE = 200;
type MenuItems = Parameters<Context['ui']['Menu']>[0]['items'];

export function Dashboard(props: { ctx: Context; initial?: string; panelKey: string;
  expansion: () => Persisted<{ readonly expandedTeams: readonly string[] }> | undefined;
  teamOrder: Persisted<{ readonly order: readonly string[] }>;
  historySelection: Persisted<{ readonly messages: Readonly<Record<string, string>>; readonly activity: Readonly<Record<string, string>> }> }) {
  const ctx = props.ctx, ui = ctx.ui;
  const [section, setSection] = createSignal(props.initial ?? 'Teams');
  const [busy, setBusy] = createSignal(false);
  const [agentQuery, setAgentQuery] = createSignal('');
  const [agentPage, setAgentPage] = createSignal(0);
  const [expandedMessages, setExpandedMessages] = createSignal<ReadonlySet<string>>(new Set());
  const toggleMessage = (id: string) => setExpandedMessages(current => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  const expandedTeams = createMemo(() => new Set(props.expansion()?.value?.expandedTeams ?? []));
  const sessionID = () => ctx.sessions.current()?.id;
  // The model a member's record says it uses. The record changes only when a prompt is sent.
  const storedModel = (id: string) => person(state(), id)?.model ?? sessionData(ctx)?.session.get(id)?.model;
  const modelKey = (model?: Model) => model ? `${model.providerID}/${model.id}/${model.variant ?? ''}` : '';
  // A model picked in the open session's composer shows at once. Only a change counts: the composer falls back to a
  // default for a session with no choice, and that would be a guess. It gives way once the record changes.
  const [picked, setPicked] = createSignal<Readonly<Record<string, { model: Model; over: string }>>>({});
  let watching: { id?: string; key?: string } = {};
  createEffect(() => {
    const id = sessionID(), choice = ctx.screen.current()?.composer.model();
    const model = choice ? { providerID: choice.providerID, id: choice.modelID, ...(choice.variant ? { variant: choice.variant } : {}) } : undefined;
    const key = model ? modelKey(model) : undefined;
    if (id !== watching.id) { watching = { id, key }; return; }
    if (!id || !key || key === watching.key) return;
    const first = watching.key === undefined;
    watching = { id, key };
    if (first) return;
    const over = untrack(() => modelKey(storedModel(id)));
    setPicked(current => ({ ...current, [id]: { model, over } }));
  });
  const memberModel = (id: string) => {
    const stored = storedModel(id), choice = picked()[id];
    return choice && choice.over === modelKey(stored) ? choice.model : stored;
  };
  // A store, not createResource, so polling never puts the panel or the host into a loading state.
  const [store, setStore] = createStore<{ value?: Snapshot }>({});
  const [loadError, setLoadError] = createSignal<unknown>();
  const [loadedHistory, setLoadedHistory] = createSignal<{ server: string; scope: string }>();
  const state = () => store.value;
  let request = 0;
  let refreshing = false;
  async function refetch() {
    const id = ++request;
    const server = serverID(), scope = activeScope();
    refreshing = true;
    try {
      const next = await api(ctx).snapshot({ ...(sessionID() ? { sessionID: sessionID() } : {}), scope, limit: historyLimit() });
      if (id !== request || server !== serverID() || scope !== activeScope()) return;
      // Key agents by session so a changed list never reuses another session's row.
      next.agents = next.agents.map(peer => ({ ...peer, id: peer.sessionID }));
      setStore('value', reconcile(next));
      setLoadedHistory({ server, scope });
      if (loadError() !== undefined) setLoadError(undefined);
    } catch (error) { if (id === request && server === serverID() && scope === activeScope()) setLoadError(error); }
    finally { if (id === request) refreshing = false; }
  }
  createEffect(on(() => ctx.sessions.current()?.key, () => void refetch()));
  // Poll only while the tab is on screen and the window is shown.
  const [pageVisible, setPageVisible] = createSignal(document.visibilityState !== 'hidden');
  const onVisibility = () => setPageVisible(document.visibilityState !== 'hidden');
  document.addEventListener('visibilitychange', onVisibility);
  const visible = createMemo(() => {
    const session = ctx.sessions.current();
    return pageVisible() && (!session || ctx.layout.state(props.panelKey, session) === 'visible');
  });
  createEffect(on(visible, shown => { if (shown) void refetch(); }, { defer: true }));
  const timer = setInterval(() => { if (visible() && !busy() && !refreshing) void refetch(); }, 5000);
  onCleanup(() => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); });

  const matchingAgents = createMemo(() => {
    const query = agentQuery().trim().toLowerCase();
    return (state()?.agents ?? []).filter(peer => !query ||
      [peer.name, peer.role, peer.projectID, peer.directory, peer.sessionID].some(value => String(value).toLowerCase().includes(query)));
  });
  const pageSize = 50;
  const pageCount = createMemo(() => Math.max(1, Math.ceil(matchingAgents().length / pageSize)));
  const currentPage = createMemo(() => Math.min(agentPage(), pageCount() - 1));
  const visibleAgents = createMemo(() => matchingAgents().slice(currentPage() * pageSize, (currentPage() + 1) * pageSize));
  const teams = createMemo(() => orderTeams(state()?.teams ?? [], [...(props.teamOrder.value?.order ?? [])], sessionID()));
  // Messages and Activity show one team at a time, so a busy team cannot push a quiet one out of view.
  const serverID = () => ctx.sessions.current()?.server.id ?? ctx.servers.list().find(id => ctx.servers.get(id)?.builtin) ?? 'local';
  const historySection = () => section() === 'Activity' ? 'activity' : 'messages';
  const setScopeChoice = (scope: string) => props.historySelection.update(draft => { draft[historySection()][serverID()] = scope; });
  const activeScope = createMemo(() => {
    const choice = props.historySelection.value?.[historySection()][serverID()];
    if (choice === NO_TEAM) return NO_TEAM;
    if (choice === GENERAL && section() === 'Activity') return GENERAL;
    return teams().some(team => team.id === choice) ? choice : teams()[0]?.id ?? NO_TEAM;
  });
  const historyReady = () => loadedHistory()?.server === serverID() && loadedHistory()?.scope === activeScope();
  // How many pages of older history are open. Choosing another team goes back to the newest page.
  const [olderPages, setOlderPages] = createSignal(0);
  const historyLimit = () => HISTORY_PAGE * (1 + olderPages());
  const showOlder = () => { setOlderPages(pages => pages + 1); void refetch(); };
  createEffect(on(activeScope, () => { setOlderPages(0); void refetch(); }, { defer: true }));
  const active = createMemo(() => (state()?.connections ?? []).filter(item => item.active));
  const closed = createMemo(() => (state()?.connections ?? []).filter(item => !item.active).slice(-10).reverse());
  const counts = createMemo(() => ({ Teams: state()?.teams.length, Agents: state()?.agents.length,
    Connections: active().length }));

  const dialogs = {
    select: (title, options) => ctx.dialogs.select({ title, options }),
    prompt: (title, value) => ctx.dialogs.prompt({ title, value }),
  };
  async function manage(action: string, input?: object | (() => Promise<object | undefined>)) {
    const id = sessionID();
    if (!id) { ctx.toast.show({ title: 'Open a session first', variant: 'error' }); return; }
    setBusy(true);
    try {
      const proposal = typeof input === 'function' ? await input() : input ?? await collectAction(dialogs, action, state(), id);
      if (!proposal) return;
      const refusal = joinFirst(state(), action, proposal);
      if (refusal) throw new Error(refusal);
      await api(ctx).manage({ sessionID: id, action, input: proposal });
      await refetch();
      ctx.toast.show({ title: DONE[action] ?? 'Saved', variant: 'success' });
    } catch (error) { ctx.toast.show({ title: errorText(error), variant: 'error' }); }
    finally { setBusy(false); }
  }
  // Every connection member must be listed, the open session included.
  const canConnect = () => !sessionID() || state()?.discovery.mode === 'automatic' || Boolean(state()?.discovery.registered.includes(sessionID()));
  const form = (kind: FormKind, team?: Team) => manage(kind, () => memberForm(ctx, kind, state(), sessionID(), team));
  const details = (kind: DetailsKind) => manage(kind, () => detailsForm(ctx, kind, state(), sessionID()));
  async function editMemberProfile(id: string) {
    const target = person(state(), id);
    if (!target) return;
    const revision = state().revision;
    setBusy(true);
    try {
      const input = await detailsForm(ctx, 'profile.update', state(), id, `Edit name and role: ${target.name}`);
      if (!input) return;
      await api(ctx).profileManage({ sessionID: id, input, revision });
      await refetch();
      ctx.toast.show({ title: 'Name and role saved', variant: 'success' });
    } catch (error) {
      const message = errorText(error);
      ctx.toast.show({ title: message === '[object Object]' ? 'Could not save name and role. Refresh and try again.' : message, variant: 'error' });
      await refetch();
    }
    finally { setBusy(false); }
  }
  async function userTeam(action: string, input: object | (() => Promise<object | undefined>)) {
    const revision = state().revision;
    setBusy(true);
    try {
      const proposal = typeof input === 'function' ? await input() : input;
      if (!proposal) return;
      await api(ctx).teamManage({ action, input: proposal, revision });
      await refetch();
      ctx.toast.show({ title: action === 'team.delete' ? 'Team deleted' : action === 'team.create' ? 'Team created' : 'Team saved', variant: 'success' });
    } catch (error) { ctx.toast.show({ title: errorText(error), variant: 'error' }); await refetch(); }
    finally { setBusy(false); }
  }
  const editTeam = (team?: Team, addOnly = false) => userTeam(team ? 'team.update' : 'team.create', () => collectForm(ctx, close =>
    <TeamForm ctx={ctx} state={state()} sessionID={sessionID()} team={team} addOnly={addOnly}
      candidates={input => api(ctx).teamCandidates(input)} close={close} />));
  async function addToTeam(peer: Peer) {
    const eligible = teams().filter(team => !team.members.includes(peer.sessionID) && team.members.length < 32);
    if (!eligible.length) { ctx.toast.show({ title: 'Create a team first, or manage a team that already includes this session.' }); return; }
    const id = await ctx.dialogs.select({ title: `Add ${peer.name} to a team`, options: eligible.map(team => ({ title: team.name, value: team.id })) });
    const team = teams().find(team => team.id === id);
    if (team) await userTeam('team.update', { id: team.id, name: team.name, members: [...team.members, peer.sessionID] });
  }
  const scopeName = (id: string) => id === NO_TEAM ? 'Connections' : id === GENERAL ? 'General' : teams().find(team => team.id === id)?.name ?? 'Connections';
  const scopeCount = (id: string) => {
    const counts = id === NO_TEAM ? state()?.scopes?.none : id === GENERAL ? state()?.scopes?.general : state()?.scopes?.teams?.[id];
    return (section() === 'Activity' ? counts?.activity : counts?.messages) ?? 0;
  };
  const scopeLabel = (id: string) => `${scopeName(id)} (${scopeCount(id)})`;
  const [orderStatus, setOrderStatus] = createSignal('');
  const reorder = createTeamReorder({ ids: () => teams().map(team => team.id), disabled: busy,
    commit: (order, id, index) => {
      props.teamOrder.update(draft => { draft.order = order; });
      setOrderStatus(`${teams().find(team => team.id === id)?.name ?? 'Team'} moved to position ${index + 1} of ${order.length}.`);
    } });
  onCleanup(() => reorder.dispose());
  let dashboardRoot: HTMLElement | undefined;
  onMount(() => { if (dashboardRoot) onCleanup(markOwnMenus(dashboardRoot)); });
  const toggleTeam = (id: string) => props.expansion()?.update(draft => {
    const index = draft.expandedTeams.indexOf(id);
    if (index === -1) draft.expandedTeams.push(id);
    else draft.expandedTeams.splice(index, 1);
  });
  async function deleteTeam(team: Team) {
    const confirmed = await ctx.dialogs.confirm({ title: `Delete ${team.name}?`, confirm: 'Delete team', danger: true,
      description: 'This deletes the team’s message and Activity history and retry records. Members also lose the permission this team gives them ' +
        'to message each other.' });
    if (confirmed) await userTeam('team.delete', { id: team.id });
  }
  async function extend(connection: Connection) {
    const value = await ctx.dialogs.prompt({ title: 'Extend connection', description: 'Minutes from now until it ends.',
      value: String(state().limits.connectionMinutes) });
    if (value !== undefined) await manage('connection.extend', { id: connection.id, minutes: Number(value) });
  }
  // Each row's menu, shared by its menu button, which shows on hover, and by a right-click on the row.
  const teamItems = (team: Team): MenuItems => [
    { label: 'Manage team', icon: 'edit', onSelect: () => void editTeam(team) },
    { label: 'Add sessions', icon: 'plus', disabled: team.members.length >= 32, onSelect: () => void editTeam(team, true) },
    { type: 'separator' },
    { label: 'Delete team', icon: 'trash', onSelect: () => void deleteTeam(team) },
  ];
  const memberItems = (id: string): MenuItems => [{ label: 'Edit name and role', icon: 'edit', onSelect: () => void editMemberProfile(id) }];
  const agentItems = (peer: Peer): MenuItems => [
    { label: 'Add to team', icon: 'plus', onSelect: () => void addToTeam(peer) },
    ...memberItems(peer.sessionID),
  ];
  // A right-click opens the row's menu at the pointer. Each one mounts a fresh hidden menu button for openMenuAt.
  const [pointerMenu, setPointerMenu] = createSignal<{ x: number; y: number; label: string; items: MenuItems }>();
  let pointerAnchor: HTMLSpanElement | undefined;
  function menuAt(event: MouseEvent, label: string, items: MenuItems) {
    if (busy()) return;
    event.preventDefault();
    setPointerMenu({ x: event.clientX, y: event.clientY, label, items });
    if (pointerAnchor) openMenuAt(pointerAnchor, event.clientX, event.clientY);
  }
  function navigate(id: string) {
    const server = ctx.sessions.current()?.server.id ?? ctx.servers.list().find(id => ctx.servers.get(id)?.builtin);
    if (server) ctx.tabs.open({ server, id }, { focus: true });
  }
  const settings = () => ctx.layout.settings('collaboration');

  return <section ref={dashboardRoot} class="teams-dashboard" aria-label="Agent Teams">
    <header class="teams-head">
      <h2>Agent Teams</h2>
      <ui.Menu label="More actions" items={[
        { label: 'Edit my name and role', icon: 'edit', disabled: busy() || !sessionID(), onSelect: () => void details('profile.update') },
        { label: 'New agent session', icon: 'new-session', disabled: busy() || !sessionID(), onSelect: () => void details('session.create') },
        { type: 'separator' },
        { label: 'Agent Teams settings', icon: 'settings-gear', onSelect: settings },
      ]} />
    </header>
    <Show when={loadError()}><p role="alert" class="teams-error">{errorText(loadError())}</p></Show>
    <Show when={state()} fallback={<Show when={!loadError()}><div class="teams-loading"><ui.Loader size="large" /></div></Show>}>{data => <>
      <Show when={sessionID()}>{id => {
        const me = () => person(data(), id());
        const listed = () => data().discovery.registered.includes(id());
        const automatic = () => data().discovery.mode === 'automatic';
        return <div class="teams-me">
          <PeerIndicator ctx={ctx} peer={me() ?? { sessionID: id() }} />
          <div class="teams-main teams-line"><span class="teams-title">{me()?.name ?? 'This session'}</span>
            <Show when={me()?.role}><span class="teams-muted"> · {me().role}</span></Show></div>
          <Show when={automatic()} fallback={<>
            <span class={listed() ? 'teams-chip teams-ok' : 'teams-chip'}>{listed() ? 'Listed' : 'Not listed'}</span>
            <ui.Button variant={listed() ? 'ghost' : 'neutral'} disabled={busy()}
              onClick={() => void manage(listed() ? 'discovery.unregister' : 'discovery.register', {})}>
              {listed() ? 'Leave list' : 'Join list'}</ui.Button></>}>
            <span class="teams-chip">Listed automatically</span>
          </Show>
        </div>;
      }}</Show>
      <nav class="teams-nav" aria-label="Agent Teams sections"><For each={SECTIONS}>{name =>
        <button type="button" aria-label={name} aria-pressed={section() === name} onClick={() => setSection(name)}>
          {name}<Show when={counts()[name] !== undefined}><span class="teams-count" aria-hidden="true">{counts()[name]}</span></Show>
        </button>}</For></nav>
      <Show when={section() === 'Teams'}>
        <span class="teams-sr-only" role="status">{orderStatus()}</span>
        <Show when={teams().length}><div class="teams-section-head"><h3>Teams</h3>
          <ui.Button icon="plus" disabled={busy()} onClick={() => void editTeam()}>New team</ui.Button></div></Show>
        <For each={teams()} fallback={<Empty ctx={ctx} title="No teams yet" text="A team lets its members message each other, including across projects."
          action="New team" run={() => void editTeam()} />}>{team => {
          const member = () => team.members.includes(sessionID());
          return <div class="teams-team" data-team-id={team.id}>
            <div class="teams-team-header" onContextMenu={event => menuAt(event, `Actions for ${team.name}`, teamItems(team))}>
            <ui.Button variant="ghost" class="teams-row teams-team-toggle" onClick={() => toggleTeam(team.id)}>
              <span class="teams-sr-only">{expandedTeams().has(team.id) ? 'Collapse' : 'Expand'} {team.name}</span>
              <span aria-hidden="true" class="teams-actions-visible teams-main">
                <ui.Icon name={expandedTeams().has(team.id) ? 'chevron-down' : 'chevron-right'} size="small" />
                <span class="teams-peer-details">
                  <span class="teams-title">{team.name}</span>
                  <span class="teams-muted teams-line">{team.members.length} {team.members.length === 1 ? 'agent' : 'agents'} · {team.members.filter(id =>
                    sessionStatus(person(data(), id) ?? { sessionID: id }, sessionData(ctx)).kind === 'running')
                    .length} active · {projects(data(), team.members)}</span>
                  <Show when={!member()}><span class="teams-muted">Not a member</span></Show>
                </span>
              </span>
            </ui.Button>
            <Show when={teams().length > 1}>
              <div class="teams-team-handle" onMouseDown={event => event.preventDefault()}
                onPointerDown={event => reorder.pointerDown(team.id, event)} onKeyDown={event => reorder.keyDown(team.id, event)}>
                <ui.Tooltip value="Drag to reorder">
                  <ui.IconButton icon="chevron-grabber-vertical" label={`Reorder ${team.name}. Use the up and down arrow keys.`}
                  disabled={busy()} /></ui.Tooltip>
              </div>
            </Show>
            <div class="teams-row-menu"><ui.Menu label={`Actions for ${team.name}`} disabled={busy()} items={teamItems(team)} /></div>
            </div>
            <Show when={expandedTeams().has(team.id)}><div class="teams-team-members" role="group" aria-label={`Members of ${team.name}`}>
              <For each={team.members}>{id => {
                const peer = () => person(data(), id) ?? { sessionID: id, name: nameOf(data(), id), role: 'Unavailable session', directory: '' };
                const model = createMemo(() => modelDisplay(memberModel(id),
                  sessionData(ctx)?.location.model.list({ directory: peer().directory }) ?? []));
                return <div class="teams-member-entry"
                  onContextMenu={event => { if (person(data(), id)) menuAt(event, `Actions for member ${peer().name}`, memberItems(id)); }}>
                <ui.Button variant="ghost" class="teams-row teams-peer-tile" onClick={() => navigate(id)}>
                  <PeerIndicator ctx={ctx} peer={peer()} />
                  <span class="teams-peer-details">
                    <span class="teams-title teams-member-title">
                      <span class={id === sessionID() ? 'teams-member-identity teams-member-self' : 'teams-member-identity'}>
                        {peer().name}<Show when={peer().role}>{' '}<span class="teams-member-role">[{peer().role}]</span></Show>
                      </span>
                      <Show when={id === sessionID()}><span class="teams-you">You</span></Show>
                    </span>
                    <span class="teams-muted teams-line teams-member-secondary">
                      <span class="teams-member-project" title={peer().directory}>{folder(peer().directory) || 'Project unavailable'}</span>
                      <span class="teams-member-separator" aria-hidden="true">·</span>
                      <span class="teams-member-model" title={model().title}>{model().label}</span>
                    </span>
                  </span>
                </ui.Button>
                <div class="teams-row-menu"><ui.Menu label={`Actions for member ${peer().name}`}
                  disabled={busy() || !person(data(), id)} items={memberItems(id)} /></div>
                </div>;
              }}</For>
              <div class="teams-team-add"><ui.Button variant="ghost" class="teams-add-session-button"
                disabled={busy() || team.members.length >= 32} onClick={() => void editTeam(team, true)}>
                <span class="teams-indicator"><ui.Icon name="plus" size="small" /></span><span>Add sessions</span>
              </ui.Button></div>
            </div></Show>
          </div>;
        }}</For>
      </Show>

      <Show when={section() === 'Agents'}>
        <Show when={data().agents.length}>
          <div class="teams-search"><ui.TextInput type="search" label="Search agents" placeholder="Search names, roles, folders or session IDs"
            value={agentQuery()} onInput={value => { setAgentQuery(value); setAgentPage(0); }} /></div>
        </Show>
        <For each={visibleAgents()} fallback={data().agents.length ? <p class="teams-muted teams-pad">No agents match “{agentQuery()}”.</p>
          : <Empty ctx={ctx} title="No agents listed yet" text={data().discovery.mode === 'automatic' ? 'No sessions are available.'
            : 'Sessions appear here after they join the list. You can also list every session automatically.'}
            action={data().discovery.mode === 'automatic' ? undefined : 'Open settings'} run={settings} />}>{peer =>
          <div class="teams-agent-entry" onContextMenu={event => menuAt(event, `Team actions for ${peer.name}`, agentItems(peer))}>
          <ui.Button variant="ghost" class="teams-row teams-peer-tile" onClick={() => navigate(peer.sessionID)}>
          <PeerIndicator ctx={ctx} peer={peer} />
          <span class="teams-peer-details">
            <span class="teams-title">{peer.name}<Show when={peer.sessionID === sessionID()}><span class="teams-you">You</span></Show></span>
            <span class="teams-muted teams-line">{peer.role} · {folder(peer.directory)}</span>
          </span></ui.Button>
          <div class="teams-row-menu"><ui.Menu label={`Team actions for ${peer.name}`} disabled={busy()} items={agentItems(peer)} /></div>
        </div>}</For>
        <Show when={matchingAgents().length}><div class="teams-foot">
          <span aria-live="polite">{matchingAgents().length > pageSize
            ? `${currentPage() * pageSize + 1}–${Math.min((currentPage() + 1) * pageSize, matchingAgents().length)} of ${matchingAgents().length}`
            : `${matchingAgents().length} ${matchingAgents().length === 1 ? 'agent' : 'agents'}`}
            {data().discovery.mode === 'automatic' ? '' : ' · listed after joining'}</span>
          <Show when={matchingAgents().length > pageSize}>
            <ui.IconButton icon="chevron-left" label="Previous agents" disabled={currentPage() === 0} onClick={() => setAgentPage(currentPage() - 1)} />
            <ui.IconButton icon="chevron-right" label="Next agents" disabled={currentPage() + 1 >= pageCount()}
              onClick={() => setAgentPage(currentPage() + 1)} />
          </Show>
        </div></Show>
      </Show>

      <Show when={section() === 'Connections'}>
        <Show when={active().length}><div class="teams-section-head"><h3>Active</h3>
          <Show when={!canConnect()}><span class="teams-hint">{CONNECT_HINT}</span></Show>
          <ui.Button icon="plus" disabled={busy() || !canConnect()} onClick={() => void form('connection.create')}>Connect</ui.Button></div></Show>
        <For each={active()} fallback={<Empty ctx={ctx} title="No active connections"
          text={canConnect() ? 'A connection lets sessions from different projects message each other for a limited time.'
            : `A connection lets sessions from different projects message each other for a limited time. ${CONNECT_HINT}`}
          action={canConnect() ? 'Connect' : undefined} run={() => void form('connection.create')} />}>{connection => <div class="teams-row teams-connection">
          <div class="teams-main">
            <div class="teams-title">{names(data(), connection.members).replaceAll(', ', ' ↔ ')}</div>
            <div class="teams-muted teams-line">Temporary connection · {ends(connection)}</div>
          </div>
          <Show when={connection.members.includes(sessionID())}><div class="teams-actions">
            <ui.Button variant="ghost" disabled={busy()} onClick={() => void extend(connection)}>Extend</ui.Button>
            <ui.Button variant="ghost" disabled={busy()} onClick={() => void manage('connection.close', { id: connection.id })}>Close</ui.Button>
          </div></Show>
        </div>}</For>
        <Show when={closed().length}>
          <div class="teams-section-head"><h3>Closed or expired</h3></div>
          <For each={closed()}>{connection => <div class="teams-row teams-connection teams-faded">
            <div class="teams-main">
              <div>{names(data(), connection.members).replaceAll(', ', ' ↔ ')}</div>
              <div class="teams-muted teams-line">Temporary connection · {ends(connection)}</div>
            </div>
          </div>}</For>
        </Show>
      </Show>

      <Show when={section() === 'Messages' || section() === 'Activity'}>
        <div class="teams-scope"><span class="teams-muted">Team</span>
          <ui.Menu trigger="button" icon="chevron-down" placement="bottom-start" label={scopeLabel(activeScope())} items={[
          ...teams().map(team => ({ label: scopeLabel(team.id), onSelect: () => setScopeChoice(team.id) })),
          { label: scopeLabel(NO_TEAM), onSelect: () => setScopeChoice(NO_TEAM) },
          ...(section() === 'Activity' ? [{ label: scopeLabel(GENERAL), onSelect: () => setScopeChoice(GENERAL) }] : []),
        ]} /></div>
      </Show>

      <Show when={section() === 'Messages'}><Show when={historyReady()}
        fallback={<Show when={!loadError()}><div class="teams-loading"><ui.Loader size="large" /></div></Show>}>
        <div class="teams-list">
        <For each={data().messages.slice().reverse()} fallback={<Empty ctx={ctx}
          title={activeScope() === NO_TEAM ? 'No connection messages yet' : 'No messages in this team yet'}
          text="Messages between agents appear here with their delivery status." />}>{message => <MessageRow ctx={ctx} message={message} navigate={navigate}
          expanded={expandedMessages().has(message.id)} toggle={() => toggleMessage(message.id)} />}</For>
        <Show when={scopeCount(activeScope()) > data().messages.length}>
          <div class="teams-older"><ui.Button variant="ghost" onClick={showOlder}>Show older</ui.Button></div></Show>
      </div></Show></Show>

      <Show when={section() === 'Activity'}><Show when={historyReady()}
        fallback={<Show when={!loadError()}><div class="teams-loading"><ui.Loader size="large" /></div></Show>}>
        <div class="teams-list">
        <For each={data().audit.slice().reverse()} fallback={<Empty ctx={ctx}
          title={activeScope() === GENERAL ? 'No general activity yet' : activeScope() === NO_TEAM ? 'No connection activity yet'
          : 'No activity in this team yet'}
          text="Team, connection, session and settings changes appear here." />}>{item => {
          // Rows are reused when the list changes, so the wording has to follow the entry.
          const line = createMemo(() => activity(item, data()));
          return <div class="teams-row teams-top">
            <div class="teams-main">
              <div class="teams-title-row"><span>{line().text}</span><span class="teams-time">{relative(item.at)}</span></div>
              <Show when={line().detail}><div class="teams-muted teams-line">{line().detail}</div></Show>
            </div>
          </div>;
        }}</For>
        <Show when={scopeCount(activeScope()) > data().audit.length}>
          <div class="teams-older"><ui.Button variant="ghost" onClick={showOlder}>Show older</ui.Button></div></Show>
      </div></Show></Show>
    </>}</Show>
    <Show when={pointerMenu()} keyed>{menu => <span class="teams-pointer-menu" ref={pointerAnchor} style={{ left: `${menu.x}px`, top: `${menu.y}px` }}>
      <ui.Menu label={menu.label} items={menu.items} placement="bottom-start" />
    </span>}</Show>
  </section>;
}
