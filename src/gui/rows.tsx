// Small pieces of the dashboard: the empty state, a session's status indicator and a message card.
import type { Context } from '@opencode/plugin/gui';
import { createSignal, createEffect, on, onCleanup, onMount, Show } from 'solid-js';
import { plain, relative, sessionStatus, status } from '../format.js';
import { sessionData } from './api.js';
import type { IconName, Message, PeerRef } from './types.js';

export function Empty(props: { title: string; text: string; action?: string; run?: () => void; ctx: Context }) {
  return <div class="teams-empty">
    <div class="teams-empty-title">{props.title}</div>
    <p class="teams-muted">{props.text}</p>
    <Show when={props.action}><props.ctx.ui.Button variant="contrast" onClick={() => props.run?.()}>{props.action}</props.ctx.ui.Button></Show>
  </div>;
}

export function PeerIndicator(props: { ctx: Context; peer: PeerRef }) {
  const ui = props.ctx.ui;
  const source = () => sessionData(props.ctx);
  createEffect(on(() => [source(), props.peer.sessionID] as const, ([data, id]) => {
    if (!data || !id) return;
    // Hydrate once per mounted row. Native events keep these stores current; no request polling.
    void Promise.all([data.session.permission.sync(id), data.session.form.sync(id)]).catch(() => {});
  }));
  const current = () => sessionStatus(props.peer, source());
  return <ui.Tooltip value={current().label}><span class={`teams-indicator teams-indicator-${current().kind}`} role="img" aria-label={current().label}>
    <Show when={current().icon} fallback={<span class={current().kind === 'running' ? 'teams-dot teams-running' : 'teams-dot'} />}>
      <ui.Icon name={current().icon as IconName} size="small" />
    </Show>
  </span></ui.Tooltip>;
}

export function MessageRow(props: { ctx: Context; message: Message; expanded: boolean; toggle: () => void; navigate: (id: string) => void }) {
  const ui = props.ctx.ui;
  let body: HTMLParagraphElement | undefined;
  const [clipped, setClipped] = createSignal(false);
  // Expanded text is not clipped, so keep the last collapsed measurement until it collapses again.
  const measure = () => { if (body && !props.expanded) setClipped(body.scrollHeight > body.clientHeight + 1); };
  onMount(() => {
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body!);
    onCleanup(() => observer.disconnect());
  });
  const expandable = () => props.expanded || clipped();
  // The whole card responds, except its buttons and the end of a text selection.
  const onClick = (event: MouseEvent) => {
    if (!expandable() || (event.target as Element).closest('.teams-actions') || String(window.getSelection())) return;
    props.toggle();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!expandable() || event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    props.toggle();
  };
  return <div class="teams-row teams-top" classList={{ 'teams-message-expandable': expandable() }} onClick={onClick}>
    <div class="teams-main" role={expandable() ? 'button' : undefined} tabindex={expandable() ? 0 : undefined} onKeyDown={onKeyDown}
      aria-expanded={expandable() ? props.expanded : undefined}>
      <div class="teams-title-row">
        <span class="teams-title"><bdi>{plain(props.message.sender.name)}</bdi> → <bdi>{plain(props.message.recipient.name)}</bdi></span>
        <ui.Tooltip value={status(props.message.status).help}>
          <span class={`teams-chip teams-status-${props.message.status}`}>{status(props.message.status).label}</span></ui.Tooltip>
        <span class="teams-time">{relative(props.message.at)}</span>
      </div>
      <p ref={body} class="teams-muted"
        classList={{ 'teams-clamp': !props.expanded, 'teams-message-full': props.expanded }}>{plain(props.message.text, true)}</p>
    </div>
    <div class="teams-actions">
      <ui.Tooltip value="Open recipient">
        <ui.IconButton icon="square-arrow-top-right" label="Open recipient" onClick={() => props.navigate(props.message.to)} /></ui.Tooltip>
    </div>
  </div>;
}

// Ui.Menu opens only from its own button, beside that button, on a primary pointer press. To open one at the pointer,
// its button sits hidden in `anchor`: this moves the button's lower left corner to the point and sends it that press.
// With no menu button to find, nothing happens.
export function openMenuAt(anchor: HTMLElement, x: number, y: number) {
  const trigger = anchor.querySelector<HTMLElement>('button[aria-haspopup]');
  if (!trigger) return;
  // Measured, not assumed: an ancestor that transforms or contains its content moves where a fixed position starts.
  const box = trigger.getBoundingClientRect();
  anchor.style.left = `${parseFloat(anchor.style.left) + x - box.left}px`;
  anchor.style.top = `${parseFloat(anchor.style.top) + y - box.bottom}px`;
  trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse' }));
}

// Ui.Menu has no class option and renders outside the panel. Marking our open menus through their ARIA link
// evens out the native item padding for them alone; if the link is ever missing, the native padding stays.
export function markOwnMenus(root: HTMLElement) {
  const mark = (trigger: Element) => {
    const id = trigger.getAttribute('aria-controls');
    (id ? document.getElementById(id) : trigger.id ? document.querySelector(`[role="menu"][aria-labelledby="${CSS.escape(trigger.id)}"]`) : null)
      ?.setAttribute('data-teams-menu', '');
  };
  const observer = new MutationObserver(records => {
    for (const { target } of records) {
      if (!(target instanceof Element) || target.getAttribute('aria-expanded') !== 'true' || !target.hasAttribute('aria-haspopup')) continue;
      mark(target);
      requestAnimationFrame(() => mark(target));
    }
  });
  observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['aria-expanded', 'aria-controls'] });
  return () => observer.disconnect();
}
