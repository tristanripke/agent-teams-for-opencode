// One form for a session's name and role, and for a new agent session with its project, agent and model.
import type { Context } from '@opencode/plugin/gui';
import { createSignal, createMemo, onCleanup, Show } from 'solid-js';
import { createStore } from 'solid-js/store';
import { errorText, folder, person } from '../format.js';
import { collectForm } from './api.js';
import type { Snapshot } from './types.js';

export type DetailsKind = 'profile.update' | 'session.create';

export function DetailsForm(props: { ctx: Context; kind: DetailsKind; state: Snapshot; sessionID: string;
  profileTitle?: string; close: (value?: object) => void }) {
  const ui = props.ctx.ui, creating = props.kind === 'session.create';
  const me = person(props.state, props.sessionID);
  const session = props.ctx.sessions.current();
  const catalog = creating ? session?.server.data.location : undefined;
  const initialModel = creating ? props.ctx.screen.current()?.composer.model() : undefined;
  const [values, setValues] = createStore({ name: creating ? '' : me?.name ?? '', role: creating ? '' : me?.role ?? '',
    directory: me?.directory ?? session?.location?.directory ?? '', agent: 'build',
    providerID: initialModel?.providerID ?? '', modelID: initialModel?.modelID ?? '', variant: initialModel?.variant ?? '', teamID: '' });
  const [catalogReady, setCatalogReady] = createSignal(false);
  const [catalogError, setCatalogError] = createSignal('');
  const [agentsReady, setAgentsReady] = createSignal(false);
  const [agentsError, setAgentsError] = createSignal('');
  const [projectsReady, setProjectsReady] = createSignal(false);
  const [projectsError, setProjectsError] = createSignal('');
  const [projectChoices, setProjectChoices] = createSignal<Array<{ name: string; directory: string; group: string }>>([]);
  let active = true;
  let modelRequest = 0, agentRequest = 0;
  const location = () => ({ directory: values.directory });
  const pathKey = (directory: string) => {
    const key = directory.replace(/\\/g, '/').replace(/\/+$/, '');
    return /^[A-Za-z]:\//.test(key) ? key.toLowerCase() : key;
  };
  const selectedProject = () => projectChoices().find(project => pathKey(project.directory) === pathKey(values.directory));
  const agents = createMemo(() => (catalog?.agent.list(location()) ?? []).filter(agent => !agent.hidden && agent.mode !== 'subagent'));
  const selectedAgent = createMemo(() => agents().find(agent => agent.id === values.agent));
  const providers = createMemo(() => catalog?.provider.list(location()) ?? []);
  const models = createMemo(() => (catalog?.model.list(location()) ?? []).filter(model => model.enabled &&
    (!model.type || model.type === 'chat') && providers().some(provider => provider.id === model.providerID && provider.activation !== 'disabled')));
  const selectedModel = createMemo(() => models().find(model => model.providerID === values.providerID && model.id === values.modelID));
  const variants = () => selectedModel()?.variants ?? [];
  const providerName = (id: string) => providers().find(provider => provider.id === id)?.name ?? id;
  const modelLabel = () => selectedModel() ? `${selectedModel()!.name} · ${providerName(values.providerID)}` : 'Choose model';
  async function loadCatalog() {
    const request = ++modelRequest, ref = location();
    setCatalogReady(false); setCatalogError('');
    try {
      if (!catalog) throw new Error('Open a connected session to choose a model.');
      await Promise.all([catalog.model.sync(ref), catalog.provider.sync(ref)]);
      if (active && request === modelRequest) setCatalogReady(true);
    } catch (error) { if (active && request === modelRequest) setCatalogError(errorText(error)); }
  }
  async function loadAgents() {
    const request = ++agentRequest, ref = location();
    setAgentsReady(false); setAgentsError('');
    try {
      if (!catalog) throw new Error('Open a connected session to choose an OpenCode agent.');
      await catalog.agent.sync(ref);
      if (!active || request !== agentRequest) return;
      if (!selectedAgent()) setValues('agent', agents().find(agent => agent.id === 'build')?.id ?? agents()[0]?.id ?? '');
      setAgentsReady(true);
    } catch (error) { if (active && request === agentRequest) setAgentsError(errorText(error)); }
  }
  async function loadProjects() {
    setProjectsReady(false); setProjectsError('');
    try {
      if (!session) throw new Error('Open a connected session to choose a project.');
      const client = session.server.client;
      const projects = (await client.project.list()).filter(project => project.id !== 'global');
      const rows = await Promise.all(projects.map(async project => {
        const current = session.project?.id === project.id ? session.project : undefined;
        const name = current?.name || project.name || folder(project.canonical);
        const worktrees = project.vcs ? await client.worktree.list({ projectID: project.id }) : [];
        return [{ name, directory: project.canonical, group: name }, ...worktrees
          .filter(worktree => pathKey(worktree.directory) !== pathKey(project.canonical))
          .map(worktree => ({ name: `${name} · ${folder(worktree.directory)}`, directory: worktree.directory, group: name }))];
      }));
      if (!active) return;
      const choices = rows.flat(), currentDirectory = session.location?.directory;
      if (currentDirectory && !choices.some(project => pathKey(project.directory) === pathKey(currentDirectory))) {
        const name = session.project?.name || folder(currentDirectory);
        choices.unshift({ name, directory: currentDirectory, group: 'Current project' });
      }
      setProjectChoices(choices); setProjectsReady(true);
    } catch (error) { if (active) setProjectsError(errorText(error)); }
  }
  if (creating) { void loadCatalog(); void loadAgents(); void loadProjects(); }
  async function chooseProject() {
    const options = projectChoices().map(project => ({ title: project.name, description: project.directory, group: project.group, value: project.directory }));
    if (props.ctx.desktop && session?.server.local)
      options.push({ title: 'Other folder…', description: 'Choose a folder on this computer', group: 'Other projects', value: '' });
    const choice = await props.ctx.dialogs.select({ title: 'Choose project', placeholder: 'Search projects and worktrees', options,
      current: selectedProject()?.directory });
    if (!active || choice === undefined) return;
    let directory = choice;
    if (choice === '') {
      try {
        const picked = await props.ctx.desktop?.pick({ directory: true, title: 'Choose project folder' });
        if (!active || !picked?.[0]) return;
        directory = picked[0];
        if (!projectChoices().some(project => pathKey(project.directory) === pathKey(directory))) {
          setProjectChoices(rows => [...rows, { name: folder(directory), directory, group: 'Other projects' }]);
        }
      } catch (error) { if (active) setProjectsError(errorText(error)); return; }
    }
    if (!projectChoices().some(project => pathKey(project.directory) === pathKey(directory)) || pathKey(directory) === pathKey(values.directory)) return;
    setValues('directory', directory);
    void loadCatalog(); void loadAgents();
  }
  async function chooseAgent() {
    const choice = await props.ctx.dialogs.select({ title: 'Choose OpenCode agent', placeholder: 'Search OpenCode agents',
      options: agents().map(agent => ({ title: agent.name, description: [agent.id, agent.description].filter(Boolean).join(' · '), value: agent.id })),
      current: selectedAgent()?.id });
    if (!active || !choice || !agents().some(agent => agent.id === choice)) return;
    setValues('agent', choice);
  }
  async function chooseModel() {
    const options = models().map(model => ({ title: model.name, description: `${providerName(model.providerID)} · ${model.providerID}/${model.id}`,
      group: providerName(model.providerID), value: model }));
    const choice = await props.ctx.dialogs.select({ title: 'Choose model', placeholder: 'Search providers and models', options,
      current: selectedModel() });
    if (!active || !choice) return;
    const changed = choice.providerID !== values.providerID || choice.id !== values.modelID;
    setValues({ providerID: choice.providerID, modelID: choice.id, variant: changed ? '' : values.variant });
  }
  const teams = (props.state?.teams ?? []).filter(team => team.members.includes(props.sessionID));
  const selectedTeam = () => teams.find(team => team.id === values.teamID)?.name ?? 'No team';
  const text = key => values[key].trim();
  const validText = key => Boolean(text(key)) && values[key].length <= 120;
  const valid = () => validText('name') && validText('role') && (!creating ||
    projectsReady() && Boolean(selectedProject()) && agentsReady() && Boolean(selectedAgent()) && catalogReady() && Boolean(selectedModel()) &&
    /^(?:[A-Za-z]:[\\/]|\/)/.test(text('directory')) &&
    (!text('variant') || variants().some(variant => variant.id === text('variant'))));
  onCleanup(() => { active = false; props.close(); });
  function submit() {
    if (!valid()) return;
    props.close(creating ? { name: text('name'), role: text('role'), directory: text('directory'), agent: text('agent'),
      model: { providerID: text('providerID'), id: text('modelID'), ...(text('variant') ? { variant: text('variant') } : {}) },
      ...(values.teamID ? { teamID: values.teamID } : {}) } : { name: text('name'), role: text('role') });
  }
  // An unchanged profile has nothing to save.
  const changed = () => creating || text('name') !== (me?.name ?? '') || text('role') !== (me?.role ?? '');
  const field = (key: 'name' | 'role', label: string, placeholder: string) => <label class="teams-field">
    <span class="teams-title">{label}</span>
    <ui.TextInput label={label} placeholder={creating ? placeholder : undefined} class="teams-input-wide" value={values[key]}
      onInput={value => setValues(key, value)} onSubmit={submit} autofocus={key === 'name'} />
  </label>;
  return <ui.Dialog title={creating ? 'New agent session' : props.profileTitle ?? 'Edit my name and role'} size={creating ? 'x-large' : 'fit'}
    description={creating ? 'Create a teammate in a project of your choice. It starts idle and waits for its first message.'
      : 'How this session appears to other agents and in your teams.'}
    footer={<><span class="teams-foot-note">
      {creating ? 'Models hidden in Settings › Models still appear in the model list.' : 'Listing does not change.'}</span>
      <ui.Button variant="ghost" onClick={() => props.close()}>Cancel</ui.Button>
      <ui.Button variant="contrast" disabled={!valid() || !changed()} onClick={submit}>{creating ? 'Create agent' : 'Save'}</ui.Button></>}>
    <div class="teams-form">
      <div class={creating ? 'teams-grid-two' : 'teams-form'}>
        {field('name', 'Name', 'For example: Reviewer')}
        {field('role', 'Role', 'For example: Code review')}
      </div>
      <Show when={!creating}>
        <p class="teams-hint">The role shows in brackets after the name.</p>
        <div class="teams-profile-preview" aria-live="polite">
          <span class="teams-dot teams-running" />
          <span class="teams-title teams-line">{text('name') || 'Name'}
            <Show when={text('role')}>{' '}<span class="teams-member-role">[{text('role')}]</span></Show></span>
          <span class="teams-hint">Preview</span>
        </div>
      </Show>
      <Show when={creating}>
        <div class="teams-field">
          <span class="teams-title">Project</span>
          <ui.Button icon="chevron-down" class="teams-select" disabled={!projectsReady()} onClick={() => void chooseProject()}>
            {projectsReady() || projectsError() ? selectedProject()?.name ?? 'Choose project' : 'Loading projects…'}
          </ui.Button>
          <span class="teams-path" title={values.directory}>{values.directory}</span>
        </div>
        <Show when={projectsError()}><div role="alert">{projectsError()}
          <ui.Button variant="ghost" onClick={() => void loadProjects()}>Retry projects</ui.Button></div></Show>
        <div class="teams-grid-three">
          <div class="teams-field">
            <span class="teams-title">OpenCode agent</span>
            <ui.Button icon="chevron-down" class="teams-select" disabled={!agentsReady() || !agents().length} onClick={() => void chooseAgent()}>
              {agentsReady() || agentsError() ? selectedAgent()?.name ?? 'Choose OpenCode agent' : 'Loading agents…'}
            </ui.Button>
          </div>
          <div class="teams-field">
            <span class="teams-title">Model</span>
            <ui.Button icon="chevron-down" class="teams-select teams-picker-button" disabled={!catalogReady() || !models().length}
              onClick={() => void chooseModel()}>
              <span class="teams-picker-label" title={modelLabel()}>{catalogReady() || catalogError() ? modelLabel() : 'Loading models…'}</span>
            </ui.Button>
          </div>
          <div class="teams-field teams-select-menu">
            <span class="teams-title">Variant <span class="teams-optional">(optional)</span></span>
            <ui.Menu label={values.variant || 'Default variant'} trigger="button" icon="chevron-down" disabled={!selectedModel() || !variants().length}
              items={[
                { label: 'Default variant', onSelect: () => setValues('variant', '') },
                ...variants().map(variant => ({ label: variant.id, onSelect: () => setValues('variant', variant.id) })),
              ]} />
          </div>
        </div>
        <Show when={catalogError()}><div role="alert">{catalogError()}
          <ui.Button variant="ghost" onClick={() => void loadCatalog()}>Retry models</ui.Button></div></Show>
        <Show when={catalogReady() && !models().length}>
          <p class="teams-hint">No available chat models in the server catalog. Configure a provider and model, then reopen this form.</p>
        </Show>
        <Show when={agentsError()}><div role="alert">{agentsError()}
          <ui.Button variant="ghost" onClick={() => void loadAgents()}>Retry agents</ui.Button></div></Show>
        <Show when={agentsReady() && !agents().length}>
          <p class="teams-hint">No visible primary OpenCode agents. Configure an agent, then reopen this form.</p>
        </Show>
        <div class="teams-field teams-select-menu">
          <span class="teams-title">Team <span class="teams-optional">(optional)</span></span>
          <ui.Menu label={selectedTeam()} trigger="button" icon="chevron-down" items={[
            { label: 'No team', onSelect: () => setValues('teamID', '') },
            ...teams.map(team => ({ label: team.name, onSelect: () => setValues('teamID', team.id) })),
          ]} />
          <p class="teams-hint">In a team, it can message the other members at once, including across projects.</p>
        </div>
      </Show>
    </div>
  </ui.Dialog>;
}

export function detailsForm(ctx: Context, kind: DetailsKind, state: Snapshot, sessionID: string, profileTitle?: string) {
  return collectForm(ctx, close => <DetailsForm ctx={ctx} kind={kind} state={state} sessionID={sessionID} profileTitle={profileTitle} close={close} />);
}
