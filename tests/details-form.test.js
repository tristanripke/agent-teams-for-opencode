import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real form's callbacks without a browser or the host's Solid runtime.
// Layout, focus and native dialog rendering remain browser/Desktop acceptance work.
const source = await readFile(new URL('../src/gui/details-form.tsx', import.meta.url), 'utf8');
const form = source.slice(source.indexOf('function DetailsForm('), source.indexOf('\nexport function detailsForm('));
const compiled = ts.transpileModule(`${form}\nglobalThis.DetailsForm = DetailsForm;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
const settle = () => new Promise(resolve => setImmediate(resolve));

async function host(options = {}) {
  const location = { directory: '/project' }, syncs = [], syncedDirectories = [], choices = [], results = [], cleanups = [];
  const data = {
    agents: [{ id: 'build', name: 'Build', mode: 'primary', hidden: false },
      { id: 'review-config', name: 'Reviewer', description: 'Review changes', mode: 'all', hidden: false },
      { id: 'internal', name: 'Internal', mode: 'primary', hidden: true },
      { id: 'explore', name: 'Explore', mode: 'subagent', hidden: false }],
    providers: [{ id: 'provider', name: 'Provider', activation: 'configured' }],
    models: [{ id: 'alias', modelID: 'upstream', name: 'Alias', providerID: 'provider', enabled: true, type: 'chat', variants: [{ id: 'high' }] }],
    projects: [{ id: 'project_main', canonical: '/project', name: 'Server name', vcs: 'git' },
      { id: 'project_other', canonical: '/other', name: 'Other project' }],
    worktrees: [{ directory: '/project-worktree', strategy: 'branch' }],
    ...options,
  };
  const catalog = Object.fromEntries(['agent', 'provider', 'model'].map(kind => [kind, {
    list: ref => { assert.equal(typeof ref.directory, 'string'); return data.byDirectory?.[ref.directory]?.[`${kind}s`] ?? data[`${kind}s`]; },
    sync: async ref => { syncs.push(kind); syncedDirectories.push(ref.directory); if (data[`${kind}Error`]) throw new Error(data[`${kind}Error`]); },
  }]));
  const client = { project: { list: async () => { if (data.projectError) throw new Error(data.projectError); return data.projects; } },
    worktree: { list: async input => { assert.equal(input.projectID, 'project_main'); return data.worktrees; } } };
  const ui = Object.fromEntries(['Dialog', 'Button', 'TextInput', 'Menu'].map(name => [name, name]));
  const ctx = { ui, sessions: { current: () => ({ location, project: { id: 'project_main', name: 'OpenCode Agent Teams' },
    server: { local: true, client, data: { location: catalog } } }) },
    screen: { current: () => ({ composer: { model: () => ({ providerID: 'provider', modelID: 'alias', variant: 'high' }),
      setModel: () => assert.fail('The composer must not change'), setVariant: () => assert.fail('The composer must not change') } }) },
    dialogs: { select: async input => { choices.push(input); return data.choose?.(input); } },
    desktop: options.desktop,
    layout: { draft: () => assert.fail('Project selection must not open a draft'), project: () => assert.fail('Project selection must not change the route') } };
  const runtime = { React: { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) }, Show: 'Show',
    createSignal: initial => { let value = initial; return [() => value, next => { value = typeof next === 'function' ? next(value) : next; }]; },
    createMemo: run => run, createStore: value => [value, (key, next) => typeof key === 'string' ? value[key] = next : Object.assign(value, key)],
    onCleanup: run => cleanups.push(run), person: () => ({ directory: '/project' }), errorText: error => error.message,
    folder: directory => directory.split('/').filter(Boolean).at(-1) };
  vm.createContext(runtime); vm.runInContext(compiled, runtime);
  const tree = runtime.DetailsForm({ ctx, kind: 'session.create', state: { teams: [] }, sessionID: 'ses_fixture', close: value => results.push(value) });
  const nodes = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    nodes.push(node); visit(node.props?.footer); visit(node.children);
  }
  visit(tree);
  const content = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(content).join('') : content(node?.children ?? []);
  const button = label => nodes.find(node => node.type === 'Button' && content(node) === label);
  const input = (label, value) => nodes.find(node => node.type === 'TextInput' && node.props.label === label).props.onInput(value);
  input('Name', 'Teammate'); input('Role', 'Reviewer');
  await settle();
  return { data, choices, results, syncs, syncedDirectories, nodes, button, input,
    chooseProject: async () => { button('Loading projects…').props.onClick(); await settle(); },
    chooseAgent: async () => { button('Loading agents…').props.onClick(); await settle(); },
    chooseModel: async () => { button('Loading models…').props.onClick(); await settle(); },
    submit: () => button('Create agent').props.onClick(), dispose: () => cleanups.forEach(run => run()) };
}

test('new-session agent field is a native searchable choice of visible primary agents', async () => {
  const f = await host();
  assert.equal(f.nodes.some(node => node.type === 'TextInput' && node.props.label === 'OpenCode agent'), false);
  assert.deepEqual([...f.syncs].sort(), ['agent', 'model', 'provider']);
  f.data.choose = input => input.options.find(option => option.value === 'review-config').value;
  await f.chooseAgent();
  assert.equal(f.choices[0].title, 'Choose OpenCode agent');
  assert.equal(f.choices[0].placeholder, 'Search OpenCode agents');
  assert.equal(f.choices[0].current, 'build');
  assert.deepEqual(Array.from(f.choices[0].options, option => option.value), ['build', 'review-config']);
  assert.match(f.choices[0].options[1].description, /review-config.*Review changes/);
  f.submit();
  assert.equal(f.results[0].agent, 'review-config');
  assert.equal(f.results[0].model.id, 'alias');
  assert.equal(f.results[0].model.variant, 'high');
});

test('cancelling the agent picker preserves the selection and cancelling the form creates nothing', async () => {
  const f = await host();
  await f.chooseAgent();
  f.submit();
  assert.equal(f.results[0].agent, 'build');
  const cancelled = await host();
  cancelled.button('Cancel').props.onClick(); cancelled.dispose();
  assert.equal(cancelled.results.some(Boolean), false);
});

test('agent choices revalidate when the catalog changes during selection or before submit', async () => {
  const f = await host();
  f.data.choose = input => {
    const choice = input.options[1].value;
    f.data.agents = f.data.agents.filter(agent => agent.id !== choice);
    return choice;
  };
  await f.chooseAgent(); f.submit();
  assert.equal(f.results[0].agent, 'build');
  f.data.agents = []; f.submit();
  assert.equal(f.results.length, 1);
});

test('agent loading errors require successful retry and empty catalogs block creation', async () => {
  const f = await host({ agentError: 'Agent catalog unavailable' });
  f.submit(); assert.equal(f.results.length, 0);
  f.data.agentError = undefined;
  f.button('Retry agents').props.onClick(); await settle();
  f.submit(); assert.equal(f.results[0].agent, 'build');
  const empty = await host({ agents: [] });
  empty.submit(); assert.equal(empty.results.length, 0);
});

test('agent defaults use catalog ids rather than display names and ignore choices after disposal', async () => {
  const f = await host({ agents: [{ id: 'custom-id', name: 'Custom label', mode: 'primary', hidden: false }] });
  f.submit(); assert.equal(f.results[0].agent, 'custom-id');
  const disposed = await host();
  disposed.data.choose = input => { disposed.dispose(); return input.options[1].value; };
  await disposed.chooseAgent();
  assert.equal(disposed.results.some(Boolean), false);
});

test('model alias and variant selection stay local without claiming Desktop visibility parity', async () => {
  const f = await host();
  f.data.models.push({ id: 'other-alias', modelID: 'other-upstream', name: 'Other', providerID: 'provider', enabled: true, variants: [{ id: 'low' }] });
  f.data.choose = input => input.options[1].value;
  await f.chooseModel();
  const variant = f.nodes.find(node => node.type === 'Menu' && node.props.label === 'high');
  // The menu's initial props are a callback snapshot; submission still uses the live state.
  assert.ok(variant);
  f.submit();
  assert.equal(f.results[0].model.id, 'other-alias');
  assert.equal(f.results[0].model.variant, undefined);
  assert.match(source, /Models hidden in Settings › Models still appear in the model list/);
  assert.doesNotMatch(form, /localStorage|sessionStorage|setModel\(|setVariant\(/);
});

test('project selection lists native projects and worktrees with names, paths and the current default', async () => {
  const f = await host();
  assert.equal(f.nodes.some(node => node.type === 'TextInput' && /Folder|Project/.test(node.props.label)), false);
  f.data.choose = input => input.options.find(option => option.value === '/project-worktree').value;
  await f.chooseProject();
  const picker = f.choices[0];
  assert.equal(picker.title, 'Choose project');
  assert.equal(picker.current, '/project');
  assert.deepEqual(Array.from(picker.options, option => [option.title, option.description]), [
    ['OpenCode Agent Teams', '/project'], ['OpenCode Agent Teams · project-worktree', '/project-worktree'], ['Other project', '/other'],
  ]);
  f.submit();
  assert.equal(f.results[0].directory, '/project-worktree');
  assert.deepEqual(f.syncedDirectories.slice(-3), ['/project-worktree', '/project-worktree', '/project-worktree']);
});

test('project cancellation keeps the default and project changes reload agents for the target directory', async () => {
  const f = await host();
  await f.chooseProject(); f.submit();
  assert.equal(f.results[0].directory, '/project');
  f.data.byDirectory = { '/other': { agents: [{ id: 'other-builder', name: 'Other builder', mode: 'primary', hidden: false }] } };
  f.data.choose = input => input.options.find(option => option.value === '/other').value;
  await f.chooseProject(); f.submit();
  assert.equal(f.results[1].directory, '/other');
  assert.equal(f.results[1].agent, 'other-builder');
});

test('project loading failures block creation until retried successfully', async () => {
  const f = await host({ projectError: 'Project list unavailable' });
  f.submit(); assert.equal(f.results.length, 0);
  f.data.projectError = undefined;
  f.button('Retry projects').props.onClick(); await settle();
  f.submit(); assert.equal(f.results[0].directory, '/project');
});

test('other-folder selection uses only the native directory picker and cancels without changing the project', async () => {
  let picked, pickOptions;
  const f = await host({ desktop: { pick: async input => { pickOptions = input; return picked ?? []; } } });
  f.data.choose = input => input.options.find(option => option.value === '').value;
  await f.chooseProject(); f.submit();
  assert.equal(f.results[0].directory, '/project');
  assert.equal(pickOptions.directory, true);
  picked = ['/new-project'];
  await f.chooseProject(); f.submit();
  assert.equal(f.results[1].directory, '/new-project');
});
