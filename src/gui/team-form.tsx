import type { Context } from '@opencode/plugin/gui';
import { createSignal, createEffect, onCleanup, Show } from 'solid-js';
import { errorText, person, nameOf } from '../format.js';
import { SessionPicker } from './session-picker.jsx';
import type { Candidates, CandidateQuery, Peer, Snapshot, Team } from './types.js';

// User team management is independent of the routed session's membership.
export function TeamForm(props: { ctx: Context; state: Snapshot; sessionID?: string; team?: Team; addOnly?: boolean;
  candidates: (input: CandidateQuery) => Promise<Candidates>; close: (value?: object) => void }) {
  const ui = props.ctx.ui;
  const initial = props.addOnly ? [] : props.team?.members ?? (props.sessionID && (props.state.discovery.mode === 'automatic' ||
    props.state.discovery.registered.includes(props.sessionID)) ? [props.sessionID] : []);
  const [name, setName] = createSignal(props.team?.name ?? '');
  const [selected, setSelected] = createSignal(new Map<string, Peer>(initial.map(id => [id, person(props.state, id) ??
    { sessionID: id, name: nameOf(props.state, id), role: 'Session', directory: '' }])));
  const [query, setQuery] = createSignal('');
  const [page, setPage] = createSignal(0);
  const [result, setResult] = createSignal<Candidates>({ items: [], total: 0, page: 0 });
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal('');
  const [retry, setRetry] = createSignal(0);
  const maximum = props.addOnly ? 32 - props.team.members.length : 32;
  let generation = 0;
  createEffect(() => {
    const search = query(), index = page(); retry();
    const request = ++generation;
    setLoading(true); setError('');
    const timer = setTimeout(async () => {
      try {
        const value = await props.candidates({ query: search, page: index, ...(props.addOnly ? { exclude: props.team.members } : {}) });
        if (generation === request) setResult(value);
      }
      catch (error) { if (generation === request) setError(errorText(error)); }
      finally { if (generation === request) setLoading(false); }
    }, 180);
    onCleanup(() => { clearTimeout(timer); generation++; });
  });
  onCleanup(() => props.close());
  const toggle = (peer: Peer, checked: boolean) => setSelected(previous => {
    const next = new Map(previous);
    if (checked && next.size < maximum) next.set(peer.sessionID, peer);
    if (!checked) next.delete(peer.sessionID);
    return next;
  });
  const valid = () => Boolean(name().trim()) && name().length <= 120 && selected().size > 0 && selected().size <= maximum;
  const submit = () => { if (valid()) props.close({ ...(props.team ? { id: props.team.id } : {}), name: name().trim(),
    members: [...(props.addOnly ? props.team.members : []), ...selected().keys()] }); };
  const count = () => props.addOnly ? `${selected().size} chosen · ${maximum - selected().size} places left` : `${selected().size} of ${maximum} selected`;
  return <ui.Dialog title={props.addOnly ? `Add sessions to ${props.team.name}` : props.team ? `Manage team: ${props.team.name}` : 'New team'} size="x-large"
    description={props.addOnly ? 'Choose the sessions to add. Current members are not shown.'
      : props.team ? 'Rename the team, and add or remove its members.' : 'Members of a team can message each other, including across projects.'}
    footer={<><span class="teams-foot-note">
      {props.team && !props.addOnly ? 'A removed member can no longer message this team from another project.' : ''}</span>
      <ui.Button variant="ghost" onClick={() => props.close()}>Cancel</ui.Button>
      <ui.Button variant="contrast" disabled={!valid()} onClick={submit}>
        {props.addOnly ? 'Add sessions' : props.team ? 'Save team' : 'Create team'}</ui.Button></>}>
    <div class="teams-form">
      <Show when={!props.addOnly}><label class="teams-field"><span class="teams-title">Team name</span>
        <ui.TextInput label="Team name" placeholder="For example: Release review" class="teams-input-wide" value={name()} onInput={setName}
          onSubmit={submit} autofocus /></label></Show>
      <SessionPicker ctx={props.ctx} label={props.addOnly ? 'Sessions to add' : 'Members'} chosenTitle={props.addOnly ? 'To add' : 'In this team'}
        count={count()} chosen={[...selected().values()]} others={result().items.filter(peer => !selected().has(peer.sessionID))}
        query={query()} onQuery={value => { setQuery(value); setPage(0); }} toggle={toggle} full={selected().size >= maximum}
        sessionID={props.sessionID} listedOnly={props.state.discovery.mode !== 'automatic'} loading={loading()} error={error()}
        retry={() => setRetry(value => value + 1)} autofocus={props.addOnly}>
        <Show when={!loading() && !error() && result().total > 50}><div class="teams-form-head">
          <span class="teams-muted">{result().total} matching sessions</span>
          <div class="teams-actions-visible">
            <ui.IconButton icon="chevron-left" label="Previous sessions" disabled={result().page === 0} onClick={() => setPage(result().page - 1)} />
            <span>{result().page + 1} / {Math.ceil(result().total / 50)}</span>
            <ui.IconButton icon="chevron-right" label="Next sessions" disabled={(result().page + 1) * 50 >= result().total}
              onClick={() => setPage(result().page + 1)} />
          </div></div></Show>
      </SessionPicker>
    </div>
  </ui.Dialog>;
}
