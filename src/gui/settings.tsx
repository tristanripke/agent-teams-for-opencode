// The settings page: command name, listing mode, agent permissions and removing saved data.
import type { Context } from '@opencode/plugin/gui';
import { createSignal, createEffect, For, Show } from 'solid-js';
import { CAPABILITY, capabilityText, errorText } from '../format.js';

export type SettingsValue = { command: string; discoveryMode: string; capabilities: Record<string, 'allow' | 'ask' | 'deny'> };
export type SettingsController = { value: () => SettingsValue | undefined; error: () => unknown;
  save: (input: object) => Promise<void>; removeData: () => Promise<void> };

const normalized = (value: string) => value.trim().replace(/^\//, '').toLowerCase();

function SettingsControls(props: { ctx: Context; settings: SettingsController; target?: string }) {
  const ui = props.ctx.ui;
  const [draft, setDraft] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  let root: HTMLDivElement | undefined;
  createEffect(() => {
    if (props.target && props.settings.value()) root?.querySelector(`[data-action="${props.target}"]`)?.scrollIntoView({ block: 'center' });
  });
  async function removeData() {
    const confirmed = await props.ctx.dialogs.confirm({ title: 'Remove all saved data?', confirm: 'Remove saved data', danger: true,
      description: 'This deletes all teams, connections, message history, Activity, profiles and settings this plugin stored. It cannot be ' +
        'undone. Sessions and their conversations are not changed.' });
    if (!confirmed) return;
    setBusy(true);
    try {
      await props.settings.removeData();
      setDraft(undefined);
      props.ctx.toast.show({ title: 'Saved data removed', variant: 'success' });
    } catch (failure) { props.ctx.toast.show({ title: errorText(failure), variant: 'error' }); }
    finally { setBusy(false); }
  }
  async function save(input: object, done: string) {
    setBusy(true); setError('');
    try {
      await props.settings.save(input);
      if (Object.hasOwn(input, 'command')) setDraft(undefined);
      props.ctx.toast.show({ title: done, variant: 'success' });
    } catch (failure) {
      // A controlled switch keeps its saved state when a save fails.
      if (Object.hasOwn(input, 'command')) setError(errorText(failure));
      else props.ctx.toast.show({ title: errorText(failure), variant: 'error' });
    } finally { setBusy(false); }
  }
  return <div class="teams-settings" ref={root}>
    <Show when={props.settings.error()}><p role="alert" class="teams-error">Settings could not be loaded.</p></Show>
    <Show when={props.settings.value()} fallback={<Show when={!props.settings.error()}><ui.Loader size="large" /></Show>}>{value => {
      const command = () => draft() ?? value().command;
      const dirty = () => draft() !== undefined && normalized(draft()) !== value().command;
      const saveCommand = () => { if (dirty()) void save({ command: command() }, `Command saved: /${normalized(command())}`); };
      return <>
        <section class="teams-group" data-action="command">
          <h3>Command</h3>
          <div class="teams-card">
            <div class="teams-setting">
              <div class="teams-main">
                <div class="teams-title">Dashboard command</div>
                <div class="teams-muted">Opens Agent Teams from the composer. <code>/peers</code> is reserved for the quick overview.</div>
              </div>
              <div class="teams-command">
                <span class="teams-muted" aria-hidden="true">/</span>
                <ui.TextInput label="Slash command name" value={command()} invalid={Boolean(error())} disabled={busy()}
                  onInput={next => { setDraft(next); setError(''); }} onSubmit={saveCommand} class="teams-command-input" />
                <ui.Button variant={dirty() ? 'contrast' : 'neutral'} disabled={!dirty()} busy={busy()} onClick={saveCommand}>Save</ui.Button>
              </div>
            </div>
            <Show when={error()}><p role="alert" class="teams-field-error">{error()}</p></Show>
          </div>
        </section>
        <section class="teams-group" data-action="discovery">
          <h3>Discovery</h3>
          <div class="teams-card">
            <div class="teams-setting">
              <div class="teams-main">
                <div class="teams-title">List sessions automatically</div>
                <div class="teams-muted">When off, a session shows up for other agents only after it joins. Sessions created through
                  Agent Teams join automatically. Being listed never grants permission to send messages.</div>
              </div>
              <ui.Switch label="List sessions automatically" hideLabel checked={value().discoveryMode === 'automatic'} disabled={busy()}
                onChange={on => void save({ discoveryMode: on ? 'automatic' : 'registered' },
                  on ? 'Sessions are listed automatically' : 'Sessions are listed after they join')} />
            </div>
          </div>
        </section>
        <section class="teams-group" data-action="approvals">
          <div class="teams-group-head">
            <h3>Agent permissions</h3>
            <p class="teams-muted">An agent may do the following without asking for permission:</p>
          </div>
          <div class="teams-card">
            <For each={Object.keys(CAPABILITY)}>{key => <div class="teams-setting">
              <div class="teams-main">
                <div class="teams-title">{CAPABILITY[key].title}</div>
                <Show when={CAPABILITY[key].description}><div class="teams-muted">{CAPABILITY[key].description}</div></Show>
                <Show when={value().capabilities[key] === 'deny'}><div class="teams-muted">Currently blocked. Turn on to allow without asking.</div></Show>
              </div>
              <ui.Switch label={`An agent may ${CAPABILITY[key].title.toLowerCase()} without asking`} hideLabel
                checked={value().capabilities[key] === 'allow'} disabled={busy()}
                onChange={on => void save({ capabilities: { [key]: on ? 'allow' : 'ask' } }, capabilityText(key, on ? 'allow' : 'ask'))} />
            </div>}</For>
            <div class="teams-note"><ui.Icon name="lock" size="small" />
              <span>Agents need your approval to change these permissions or how sessions are listed through Agent Teams.
                Changes you make here apply immediately.</span></div>
          </div>
        </section>
        <section class="teams-group" data-action="data">
          <h3>Saved data</h3>
          <div class="teams-card">
            <div class="teams-setting">
              <div class="teams-main">
                <div class="teams-title">Remove saved data</div>
                <div class="teams-muted">Deletes all teams, connections, message history, Activity, profiles and settings this plugin stored.
                  Do this before uninstalling, because removing the plugin leaves them behind.
                  Sessions and their conversations are not changed.</div>
              </div>
              <ui.Button disabled={busy()} onClick={() => void removeData()}>Remove saved data</ui.Button>
            </div>
          </div>
        </section>
      </>;
    }}</Show>
  </div>;
}

export function SettingsView(props: { ctx: Context; settings: SettingsController; target?: string }) {
  return <section class="teams-page" aria-label="Agent Teams settings">
    <h2>Agent Teams</h2>
    <p class="teams-muted teams-lead">Choose how agents find each other and what they may do without asking you.</p>
    <SettingsControls ctx={props.ctx} settings={props.settings} target={props.target} />
  </section>;
}
