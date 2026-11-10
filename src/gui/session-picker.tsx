// The one list every form uses to choose sessions: chosen sessions on top, the others below, a search box above
// and a fixed height, so loading, an empty result and an error never change the dialog's size.
import type { Context } from '@opencode/plugin/gui';
import type { JSX } from 'solid-js';
import { For, Show } from 'solid-js';
import { folder } from '../format.js';
import type { Peer } from './types.js';

export function SessionPicker(props: { ctx: Context; label: string; chosenTitle: string; count: string; chosen: Peer[]; others: Peer[];
  query: string; onQuery: (value: string) => void; toggle: (peer: Peer, on: boolean) => void; full: boolean; sessionID?: string;
  locked?: string; listedOnly: boolean; loading?: boolean; error?: string; retry?: () => void; autofocus?: boolean; children?: JSX.Element }) {
  const ui = props.ctx.ui;
  const row = (peer: Peer, on: boolean) => <div class="teams-member">
    <div class="teams-main">
      <div class="teams-title">{peer.name}<Show when={peer.sessionID === props.sessionID}><span class="teams-you">You</span></Show></div>
      <div class="teams-muted teams-line">{peer.role} · {folder(peer.directory)}</div>
    </div>
    <ui.Switch label={peer.name} hideLabel checked={on} disabled={on ? peer.sessionID === props.locked : props.full}
      onChange={value => props.toggle(peer, value)} />
  </div>;
  return <div class="teams-field">
    <div class="teams-form-head"><span class="teams-title">{props.label}</span><span class="teams-muted">{props.count}</span></div>
    <ui.TextInput type="search" label="Search sessions" placeholder="Search names, roles or folders" class="teams-input-wide" value={props.query}
      onInput={props.onQuery} autofocus={props.autofocus} />
    <div class="teams-picker-list" aria-label="Sessions">
      <Show when={props.chosen.length}>
        <div class="teams-picker-group">{props.chosenTitle}</div>
        <For each={props.chosen}>{peer => row(peer, true)}</For>
      </Show>
      <div class="teams-picker-group">{props.query.trim() ? 'Matching sessions' : props.listedOnly ? 'Listed sessions' : 'Other sessions'}</div>
      <Show when={!props.loading} fallback={<div class="teams-picker-state"><ui.Loader size="small" /></div>}>
        <Show when={!props.error} fallback={<div class="teams-picker-state" role="alert">{props.error}
          <ui.Button variant="ghost" onClick={() => props.retry?.()}>Retry sessions</ui.Button></div>}>
          <For each={props.others} fallback={<p class="teams-picker-state teams-muted">
            {props.query.trim() ? 'No session matches your search.' : 'No other sessions to choose.'}</p>}>{peer => row(peer, false)}</For>
        </Show>
      </Show>
    </div>
    {props.children}
    <Show when={props.listedOnly}>
      <p class="teams-hint">Only listed sessions appear. To include every session, turn on List sessions automatically in settings.</p>
    </Show>
  </div>;
}
