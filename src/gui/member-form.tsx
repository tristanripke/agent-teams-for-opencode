// The agent-acting form for a new team, a team's members or a connection.
import type { Context } from '@opencode/plugin/gui';
import { createSignal, createMemo, onCleanup, Show } from 'solid-js';
import { nameOf, person } from '../format.js';
import { collectForm } from './api.js';
import { SessionPicker } from './session-picker.jsx';
import type { Peer, Snapshot, Team } from './types.js';

export type FormKind = 'team.create' | 'team.members' | 'connection.create';
const FORMS: Record<FormKind, { title: string; submit: string; description: string; label: string; chosen: string }> = {
  'team.create': { title: 'New team', submit: 'Create team', label: 'Members', chosen: 'In this team',
    description: 'Members of a team can message each other, including across projects.' },
  'team.members': { title: 'Change team members', submit: 'Save members', label: 'Members', chosen: 'In this team',
    description: 'Add or remove the members of this team.' },
  'connection.create': { title: 'Connect sessions', submit: 'Connect', label: 'Sessions', chosen: 'Connected',
    description: 'Connected sessions can message each other across projects until the connection ends.' },
};

function MemberForm(props: { ctx: Context; kind: FormKind; state: Snapshot; sessionID: string; team?: Team; close: (value?: object) => void }) {
  const ui = props.ctx.ui, form = FORMS[props.kind];
  const [name, setName] = createSignal('');
  const [selected, setSelected] = createSignal(new Set<string>([...(props.team?.members ?? []), props.sessionID]));
  const [query, setQuery] = createSignal('');
  const [minutes, setMinutes] = createSignal(String(props.state.limits.connectionMinutes));
  onCleanup(() => props.close());
  const known = (id: string): Peer => person(props.state, id) ?? { sessionID: id, name: nameOf(props.state, id), role: 'Session', directory: '' };
  const chosen = createMemo(() => [...selected()].map(known));
  const others = createMemo(() => {
    const term = query().trim().toLowerCase(), seen = new Set(selected());
    // A connection takes listed sessions only, so its picker leaves out the unlisted ones that teams may keep.
    const pool = props.kind === 'connection.create' ? props.state.agents.filter(peer => props.state.discovery.mode === 'automatic' || peer.registered)
      : [...props.state.agents, ...Object.values(props.state.people ?? {})];
    return pool.filter(peer => !seen.has(peer.sessionID) && seen.add(peer.sessionID) && (!term ||
      [peer.name, peer.role, peer.directory, peer.sessionID].some(value => String(value).toLowerCase().includes(term)))).slice(0, 50);
  });
  const toggle = (peer: Peer, on: boolean) => setSelected(previous => {
    const next = new Set(previous); on ? next.add(peer.sessionID) : next.delete(peer.sessionID); return next;
  });
  const validMinutes = () => /^\d+$/.test(minutes().trim()) && Number(minutes()) > 0;
  const valid = () => selected().size >= (props.kind === 'connection.create' ? 2 : 1) && (props.kind !== 'team.create' || Boolean(name().trim())) &&
    (props.kind !== 'connection.create' || validMinutes());
  function submit() {
    if (!valid()) return;
    const members = [...selected()];
    props.close(props.kind === 'team.create' ? { name: name().trim(), members }
      : props.kind === 'team.members' ? { id: props.team.id, members }
        : { members, minutes: Number(minutes()) });
  }
  return <ui.Dialog title={props.team ? `${form.title}: ${props.team.name}` : form.title} description={form.description} size="x-large"
    footer={<><span class="teams-foot-note">
      {props.kind === 'team.members' ? 'A removed member can no longer message this team from another project.' : ''}</span>
      <ui.Button variant="ghost" onClick={() => props.close()}>Cancel</ui.Button>
      <ui.Button variant="contrast" disabled={!valid()} onClick={submit}>{form.submit}</ui.Button></>}>
    <div class="teams-form">
      <Show when={props.kind === 'team.create'}><label class="teams-field"><span class="teams-title">Team name</span>
        <ui.TextInput label="Team name" placeholder="For example: Release review" class="teams-input-wide" autofocus value={name()} onInput={setName}
          onSubmit={submit} /></label></Show>
      <SessionPicker ctx={props.ctx} label={form.label} chosenTitle={form.chosen} count={`${selected().size} selected`} chosen={chosen()}
        others={others()} query={query()} onQuery={setQuery} toggle={toggle} full={false} sessionID={props.sessionID} locked={props.sessionID}
        listedOnly={props.state.discovery.mode !== 'automatic'} />
      <Show when={props.kind === 'connection.create'}>
        <div class="teams-field">
          <span class="teams-title">Ends after</span>
          <div class="teams-inline">
            <ui.TextInput label="Minutes until it ends" value={minutes()} invalid={!validMinutes()} onInput={setMinutes} class="teams-minutes" />
            <span class="teams-hint">minutes. You can extend or close it at any time.</span>
          </div>
        </div>
      </Show>
    </div>
  </ui.Dialog>;
}

export function memberForm(ctx: Context, kind: FormKind, state: Snapshot, sessionID: string, team?: Team) {
  return collectForm(ctx, close => <MemberForm ctx={ctx} kind={kind} state={state} sessionID={sessionID} team={team} close={close} />);
}
