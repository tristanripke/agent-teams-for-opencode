// The plugin's RPC client for the open session's server, and helpers the forms and rows share.
import type { Context } from '@opencode/plugin/gui';
import type { JSX } from 'solid-js';
import { Collaboration } from '../rpc.js';
import type { Candidates, CandidateQuery, Snapshot } from './types.js';

export function api(ctx: Context) {
  const current = ctx.sessions.current();
  const client = (current?.server.client ?? ctx.client).rpc(Collaboration);
  const options = current?.location ? { location: current.location } : {};
  return { snapshot: (input = {}) => client.snapshot(input, options) as Promise<Snapshot>, manage: input => client.manage(input, options),
    removeData: () => client.removeData({ confirm: 'remove-all-saved-data' }, options),
    teamCandidates: (input: CandidateQuery) => client.teamCandidates(input, options) as Promise<Candidates>,
      teamManage: input => client.teamManage(input, options),
    profileManage: input => client.profileManage(input, options),
    settings: () => client.settings({}, options), configure: input => client.configure(input, options) };
}

export function collectForm(ctx: Context, render: (close: (value?: object) => void) => JSX.Element) {
  return new Promise<object | undefined>(resolve => {
    let done = false, handle: { close(): void } | undefined;
    const close = (value?: object) => {
      if (done) return;
      done = true; resolve(value); handle?.close();
    };
    handle = ctx.dialogs.open(() => render(close));
    if (done) handle.close();
  });
}

export function sessionData(ctx: Context) {
  const server = ctx.sessions.current()?.server ?? ctx.servers.get(ctx.servers.list().find(id => ctx.servers.get(id)?.builtin)!);
  return server?.data;
}
