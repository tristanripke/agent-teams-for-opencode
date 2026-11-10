// Development-only ctx.ui adapters. The shipped plugin continues using the real native controls.
// Match their roles, interaction and visual vocabulary; verify final pixels in Desktop.
import { createContext, useContext, createSignal, For, Show, onCleanup } from 'solid-js';

const paths = { plus: 'M12 5v14M5 12h14', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7',
  'settings-gear': 'M9 4l1-2h4l1 2 3 2 2 1v4l-2 1-1 3-1 2h-4l-1-2-3-2-2-1V8l2-1zM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  'new-session': 'M12 5v14M5 12h14', lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5z',
  'outline-rotate-clockwise': 'M20 10a8 8 0 1 0-1 8M20 3v7h-7', 'square-arrow-top-right': 'M14 3h7v7M21 3L11 13M10 5H4v15h15v-6',
  'chevron-left': 'M15 5l-7 7 7 7', 'chevron-right': 'M9 5l7 7-7 7', 'chevron-down': 'M5 9l7 7 7-7',
  'speech-bubble': 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2z',
  'circle-exclamation': 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 7v6M12 16v.5',
  share: 'M4 7h16M16 3l4 4-4 4M20 17H4M8 13l-4 4 4 4', close: 'M6 6l12 12M6 18L18 6',
  check: 'M5 12l4 4L19 6', 'magnifying-glass': 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0M15 15l6 6',
  'outline-dots': 'M5 12h.1M12 12h.1M19 12h.1' };
// Copied from the installed Desktop app, because these two are compared against it directly.
const nativeIcons = {
  "edit": "<path d=\"M17.0832 17.0807V17.5807H17.5832V17.0807H17.0832ZM2.9165 17.0807H2.4165V17.5807H2.9165V17.0807ZM2.9165 2.91406V2.41406H2.4165V2.91406H2.9165ZM9.58317 3.41406H10.0832V2.41406H9.58317V2.91406V3.41406ZM17.5832 10.4141V9.91406H16.5832V10.4141H17.0832H17.5832ZM6.24984 11.2474L5.89628 10.8938L5.74984 11.0403V11.2474H6.24984ZM6.24984 13.7474H5.74984V14.2474H6.24984V13.7474ZM8.74984 13.7474V14.2474H8.95694L9.10339 14.101L8.74984 13.7474ZM15.2082 2.28906L15.5617 1.93551L15.2082 1.58196L14.8546 1.93551L15.2082 2.28906ZM17.7082 4.78906L18.0617 5.14262L18.4153 4.78906L18.0617 4.43551L17.7082 4.78906ZM17.0832 17.0807V16.5807H2.9165V17.0807V17.5807H17.0832V17.0807ZM2.9165 17.0807H3.4165V2.91406H2.9165H2.4165V17.0807H2.9165ZM2.9165 2.91406V3.41406H9.58317V2.91406V2.41406H2.9165V2.91406ZM17.0832 10.4141H16.5832V17.0807H17.0832H17.5832V10.4141H17.0832ZM6.24984 11.2474H5.74984V13.7474H6.24984H6.74984V11.2474H6.24984ZM6.24984 13.7474V14.2474H8.74984V13.7474V13.2474H6.24984V13.7474ZM6.24984 11.2474L6.60339 11.6009L15.5617 2.64262L15.2082 2.28906L14.8546 1.93551L5.89628 10.8938L6.24984 11.2474ZM15.2082 2.28906L14.8546 2.64262L17.3546 5.14262L17.7082 4.78906L18.0617 4.43551L15.5617 1.93551L15.2082 2.28906ZM17.7082 4.78906L17.3546 4.43551L8.39628 13.3938L8.74984 13.7474L9.10339 14.101L18.0617 5.14262L17.7082 4.78906Z\" fill=\"currentColor\"/>",
  "circle-exclamation": "<g transform=\"scale(1.25)\"><path d=\"M8.75 11.75H7.25V10.25H8.75V11.75Z\" fill=\"currentColor\"/><path d=\"M8.75 9.25H7.25V4.25H8.75V9.25Z\" fill=\"currentColor\"/><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M8 1C9.93286 1 11.684 1.7836 12.9502 3.0498C14.2164 4.31601 15 6.06714 15 8C15 11.866 11.866 15 8 15C6.06714 15 4.31601 14.2164 3.0498 12.9502C1.7836 11.684 1 9.93286 1 8C1 4.13401 4.13401 1 8 1ZM8 2C4.68629 2 2 4.68629 2 8C2 9.65699 2.67148 11.1559 3.75781 12.2422C4.84415 13.3285 6.34301 14 8 14C11.3137 14 14 11.3137 14 8C14 6.34301 13.3285 4.84415 12.2422 3.75781C11.1559 2.67148 9.65699 2 8 2Z\" fill=\"currentColor\"/></g>",
  "speech-bubble": "<path d=\"M18.3334 10.0003C18.3334 5.57324 15.0927 2.91699 10.0001 2.91699C4.90749 2.91699 1.66675 5.57324 1.66675 10.0003C1.66675 11.1497 2.45578 13.1016 2.5771 13.3949C2.5878 13.4207 2.59839 13.4444 2.60802 13.4706C2.69194 13.6996 3.04282 14.9364 1.66675 16.7684C3.5186 17.6538 5.48526 16.1982 5.48526 16.1982C6.84592 16.9202 8.46491 17.0837 10.0001 17.0837C15.0927 17.0837 18.3334 14.4274 18.3334 10.0003Z\" stroke=\"currentColor\" stroke-linecap=\"square\"/>",
  "chevron-grabber-vertical": "<path d=\"M6.66675 12.4998L10.0001 15.8332L13.3334 12.4998M6.66675 7.49984L10.0001 4.1665L13.3334 7.49984\" stroke=\"currentColor\" stroke-linecap=\"square\"/>"
};
const Icon = props => <span class={`ui-icon ${props.class ?? ''}`} data-icon={props.name} aria-hidden="true">
  <Show when={nativeIcons[props.name]} fallback={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <Show when={props.name === 'outline-dots'} fallback={<path d={paths[props.name] ?? paths['outline-dots']} />}>
      <circle cx="5" cy="12" r="1.75" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.75" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.75" fill="currentColor" stroke="none" />
    </Show>
  </svg>}><svg viewBox="0 0 20 20" fill="none" innerHTML={nativeIcons[props.name]} /></Show>
</span>;
const DialogClose = createContext(() => {});
let menuCount = 0;

export const ui = {
  Icon,
  Button: props => <button type={props.type ?? 'button'} class={`ui-button ui-${props.variant ?? 'neutral'} ui-${props.size ?? 'normal'} ${props.class ?? ''}`}
    disabled={props.disabled || props.busy} aria-busy={props.busy || undefined} onClick={event => props.onClick?.(event)}>
    <Show when={props.icon}><Icon name={props.icon} /></Show>{props.children}</button>,
  IconButton: props => <button type="button" class={`ui-icon-button ui-${props.size ?? 'normal'} ${props.class ?? ''}`} aria-label={props.label}
    aria-pressed={props.pressed} disabled={props.disabled || props.busy} onClick={event => props.onClick?.(event)}><Icon name={props.icon} /></button>,
  Tooltip: props => <span class="ui-tooltip" title={typeof props.value === 'string' ? props.value : undefined}>{props.children}</span>,
  Loader: props => <span class={`ui-loader ${props.class ?? ''}`} role="progressbar" aria-label="Loading" />,
  Menu: props => {
    const [open, setOpen] = createSignal(false);
    let root;
    const outside = event => { if (open() && !root?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    onCleanup(() => document.removeEventListener('pointerdown', outside));
    const items = () => props.items.flatMap(item => item.type === 'group' ? item.items : [item]);
    const menuId = `ui-menu-${++menuCount}`;
    return <span class="ui-menu" ref={root}>
      <button type="button" class={props.trigger === 'button' ? 'ui-button' : 'ui-icon-button'} aria-label={props.label} aria-haspopup="menu" aria-expanded={open()} aria-controls={open() ? menuId : undefined}
        disabled={props.disabled}
        onPointerDown={event => { if (event.button === 0 && event.pointerType !== 'touch') setOpen(!open()); }}
        onClick={event => { if (event.detail === 0) setOpen(!open()); }}><Show when={props.trigger === 'button'} fallback={<Icon name={props.icon ?? 'outline-dots'} />}>
          <Show when={props.icon}><Icon name={props.icon} /></Show>{props.label}</Show></button>
      <Show when={open()}><div id={menuId} role="menu" class={`ui-menu-list ${props.placement?.endsWith('start') ? 'ui-menu-start' : ''}`} onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
      }}><For each={items()}>{item => item.type === 'separator' ? <hr />
        : <button type="button" role="menuitem" disabled={item.disabled} onClick={() => { setOpen(false); item.onSelect(); }}>
          <Show when={item.icon}><Icon name={item.icon} /></Show>{item.label}</button>}</For></div></Show>
    </span>;
  },
  Switch: props => <label class="ui-switch">
    <input type="checkbox" role="switch" checked={props.checked} disabled={props.disabled} aria-label={props.label}
      onChange={event => { const next = event.currentTarget.checked; event.currentTarget.checked = props.checked; props.onChange(next); }} />
    <Show when={!props.hideLabel}><span>{props.label}</span></Show>
  </label>,
  TextInput: props => <input class={`ui-input ${props.class ?? ''}`} type={props.type ?? 'text'} aria-label={props.label} value={props.value}
    placeholder={props.placeholder} disabled={props.disabled} aria-invalid={props.invalid || undefined} autofocus={props.autofocus}
    onInput={event => props.onInput(event.currentTarget.value)}
    onKeyDown={event => { if (event.key === 'Enter') props.onSubmit?.(event.currentTarget.value); }} />,
  Dialog: props => {
    const close = useContext(DialogClose);
    return <div role="dialog" aria-label={props.title} class={`ui-dialog ui-dialog-${props.size ?? 'fit'}`}>
      <div class="ui-dialog-header"><div class="ui-dialog-title-group"><h2>{props.title}</h2>
        <Show when={props.description}><p class="ui-dialog-description">{props.description}</p></Show></div>
        <Show when={props.closable !== false}><button type="button" class="ui-icon-button ui-dialog-close" aria-label="Close" onClick={close}><Icon name="close" /></button></Show>
      </div>
      <div class="ui-dialog-body">{props.children}</div><Show when={props.footer}><div class="ui-dialog-footer">{props.footer}</div></Show>
    </div>;
  },
  Keybind: () => null, Markdown: props => <div>{props.text}</div>, Code: props => <pre>{props.content}</pre>,
};

// ctx.dialogs.open renders into a portal; closing disposes it, as the host does.
export function dialogs(report) {
  const [stack, setStack] = createSignal([]);
  function open(render) {
    const entry = { render, handle: undefined };
    entry.handle = { close: () => setStack(items => items.filter(item => item !== entry)) };
    setStack(items => [...items, entry]);
    return entry.handle;
  }
  const Host = () => {
    const escape = event => { if (event.key === 'Escape') stack().at(-1)?.handle.close(); };
    document.addEventListener('keydown', escape);
    onCleanup(() => document.removeEventListener('keydown', escape));
    return <For each={stack()}>{entry => <div class="ui-backdrop" onPointerDown={event => {
      if (event.target === event.currentTarget && stack().at(-1) === entry) entry.handle.close();
    }}><DialogClose.Provider value={() => entry.handle.close()}>{entry.render(entry.handle)}</DialogClose.Provider></div>}</For>;
  };
  function select(settings) {
    report({ select: settings.title, options: settings.options.map(({ title, description, group }) => ({ title, description, group })) });
    return new Promise(resolve => {
      let done = false, handle;
      const close = value => { if (done) return; done = true; resolve(value); handle?.close(); };
      const Selection = () => {
        const [query, setQuery] = createSignal('');
        const [highlighted, setHighlighted] = createSignal(Math.max(0, settings.options.findIndex(option => option.value === settings.current)));
        const options = () => settings.options.filter(option =>
          `${option.title} ${option.description ?? ''} ${option.group ?? ''}`.toLowerCase().includes(query().toLowerCase()));
        const groups = () => [...new Set(options().map(option => option.group ?? ''))];
        onCleanup(() => close());
        const activeIndex = () => Math.min(highlighted(), Math.max(0, options().length - 1));
        const keydown = event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlighted((activeIndex() + (event.key === 'ArrowDown' ? 1 : -1) + options().length) % Math.max(1, options().length));
          }
          if (event.key === 'Enter' && options()[activeIndex()]) { event.preventDefault(); close(options()[activeIndex()].value); }
        };
        return <ui.Dialog title={settings.title} footer={<ui.Button variant="ghost" onClick={() => close()}>Cancel</ui.Button>}>
          <div class="ui-select" onKeyDown={keydown}>
          <div class="ui-select-search"><Icon name="magnifying-glass" />
            <ui.TextInput label={settings.placeholder ?? 'Search'} placeholder={settings.placeholder ?? 'Search'} value={query()}
              onInput={value => { setQuery(value); setHighlighted(0); }} autofocus /></div>
          <div role="listbox" aria-label={settings.title} class="ui-select-list"><For each={groups()} fallback={<div class="ui-select-empty">No matches found.</div>}>{group => <div role="group" aria-label={group || undefined} class="ui-select-group">
            <Show when={group}><h3>{group}</h3></Show>
            <For each={options().filter(option => (option.group ?? '') === group)}>{option =>
              <button type="button" role="option" class="ui-select-option" aria-selected={option.value === settings.current}
                data-highlighted={options().indexOf(option) === activeIndex()} onPointerMove={() => setHighlighted(options().indexOf(option))} onClick={() => close(option.value)}>
                <span class="ui-select-copy"><span class="ui-select-title" title={option.title}>{option.title}</span>
                  <Show when={option.description}><span class="ui-select-description" title={option.description}>{option.description}</span></Show></span>
                <Show when={option.value === settings.current}><Icon name="check" class="ui-select-check" /></Show>
              </button>}</For>
          </div>}</For></div></div>
        </ui.Dialog>;
      };
      handle = open(() => <Selection />);
    });
  }
  function confirm(settings) {
    report({ confirm: settings.title });
    return new Promise(resolve => {
      let done = false, handle;
      const close = value => { if (done) return; done = true; resolve(value); handle?.close(); };
      const Confirmation = () => {
        onCleanup(() => close(false));
        return <ui.Dialog title={settings.title} description={settings.description}
          footer={<><ui.Button variant="ghost" onClick={() => close(false)}>{settings.cancel ?? 'Cancel'}</ui.Button>
            <ui.Button variant={settings.danger ? 'danger' : 'contrast'} onClick={() => close(true)}>{settings.confirm ?? 'Confirm'}</ui.Button></>} />;
      };
      handle = open(() => <Confirmation />);
    });
  }
  return { Host, closeAll: () => setStack([]), api: {
    open, active: () => stack().length > 0,
    confirm,
    select,
    prompt: async options => { report({ prompt: options.title }); return options.value; },
    alert: async () => {},
  } };
}
