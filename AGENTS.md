# Agent Teams: architecture guide

A native OpenCode V2 collaboration plugin. The package and plugin ID are `agent-teams-for-opencode`, and people see the name Agent Teams. Each OpenCode session is a peer: there is no coordinator, separate service or database. Everything runs on OpenCode's plugin APIs and native storage.

Development packages are pinned to OpenCode **2.2.5**, and the package accepts any 2.x host from 2.2.5 on. The GUI plugin API is experimental, so check a newer host before assuming it still behaves the same.

## Code map

| Path | Responsibility |
| --- | --- |
| `src/core.js` | The engine's entry point. It composes the parts in `src/engine/`, which share the saved state through one queue. |
| `src/engine/` | `shared.js` defaults, structured errors and helpers. `store.js` the saved core record and settings. `sessions.js` host sessions, names, projects and who may message whom. `snapshot.js` what agents and the user see. `messages.js` admission and acknowledgement. `manage.js` the `manage` action, capabilities and approval. `user.js` the user's team and profile controls. |
| `src/server.js` | Native tools, RPC handlers, permission hook and event subscription. |
| `src/attention.js` | Which running sessions wait for a person, from native permission and form events. In memory only. |
| `src/history.js` | Per-scope history storage: attribution, rollover, retry expiry, deletion, the commit order and repair after an interruption. |
| `src/manage-schema.js` | Single source for `manage` actions: JSON schema, examples, hints and input validation. Capability names and values. |
| `src/rpc.js` | Shared RPC schemas. `configure` and `removeData` are user APIs, not peer tool actions. |
| `src/settings.js` | Validated command name in native storage. |
| `src/actions.js` | Shared management dialogue inputs for the TUI and the Desktop header menu. |
| `src/format.js` | Shared user-facing wording: statuses, readable errors, approval labels, activity sentences and member names. |
| `src/gui.tsx`, `src/gui.css` | Desktop entry point: stores, the panel, its launcher and commands, the settings page and message notices. Layout CSS. |
| `src/gui/` | `dashboard.tsx` the panel. `rows.tsx` status indicator and message card. `member-form.tsx`, `details-form.tsx` and `team-form.tsx` the forms, which share `session-picker.tsx` to choose sessions. `settings.tsx` the settings page. `api.ts` the RPC client. `types.ts` the shapes the panel reads. |
| `src/team-order.js` | Team order and the drag handle. |
| `src/tui.js` | Native dialogues, global command layer, settings and navigation. |
| `dist/gui-experimental.cjs` | Built Desktop bundle, committed so the package installs from a checkout. |
| `dist/server.js`, `dist/rpc.js`, `dist/tui.js` | Entry points bundled with `@opencode/schema` by `build.mjs`. The package exports these, so an install needs only `solid-js`. `THIRD_PARTY_LICENSES` carries the bundled code's notice. |
| `tests/` | Engine, settings, server adapter and TUI handler tests. Some read the Desktop source as text, so keep the patterns they match. |
| `scripts/ui-preview.mjs`, `scripts/ui-preview/` | Synthetic host that renders the real Desktop components and CSS at `http://127.0.0.1:5176`. Its `ctx.ui` adapters are stand-ins, and OpenCode Desktop stays the visual reference. |
| `scripts/ui-browser-check.cjs`, `scripts/history-browser-check.cjs` | Browser checks of the panel and of the history pickers, run against the preview. |
| `scripts/readme-screenshots.cjs` | Regenerates `assets/screenshots/` from the preview. |
| `.github/workflows/ci.yml` | Type check, tests and build, and a check that the committed `dist/` matches `src/`. |
| `docs/configuration.md` | Settings, limits and action inputs. |

## Develop

Use Node.js 24 or later.

```sh
npm ci --ignore-scripts
npm run check    # type check
npm test         # unit and adapter tests
npm run build    # rebuild every bundle in dist/ after any source change
npm run preview  # the Desktop panel with synthetic data, for layout work and the browser checks
```

The browser checks need the preview running. Each script starts with the commands to run it. Keep mock controls and CSS in `scripts/ui-preview/`, never in `src/`. Wrap source lines at 160 characters.

## Rules to preserve

### Collaboration model
- Discovery requires self-registration by default. Automatic listing is a user setting. Being listed never grants permission to message.
- Same-project communication is allowed. Cross-project communication needs a team or an active connection. Keep the exact-directory check for OpenCode's shared `global` project ID.
- Teams hold 1–32 sessions including their creator. Connections need at least two members.
- A session created through this plugin registers, team or not, and joins the team when one is given. Native creation outside the plugin does not infer membership. Profiles do not register sessions.
- A deleted session leaves its teams through the queue as a system action, with no approval, no capability check and no message. It increases the revision and adds an audit entry, and an empty team is deleted. The `session.deleted` event is trusted. Reconciliation at startup and on snapshots treats the listing only as a source of candidates, and removes a member only on the host's not-found answer for that exact ID from `session.get`. Archived sessions keep their membership, and connections do not change. Deleting a team, including through its last member, removes its history and retry records.
- New team additions and every member of a new connection must be registered unless automatic listing is on, including in backend validation. Existing unlisted team members may stay. Re-adding requires registration.
- `connection.extend` never shortens a connection. `session.create` outside the requesting session's project needs `workAcrossProjects`, with or without a team. A session already in that exact folder decides the project. With none there, the requester's folder and folders inside it are its project, whatever the separators, trailing separator or Windows letter case, so a nested project with no session yet still passes.
- The open session must be listed before the user controls offer Connect, and the connection picker shows listed sessions only. A refusal names the sessions that must join.

### Permissions
- Capabilities (`createSession`, `createTeam`, `changeMembers`, `workAcrossProjects`, `openConnection`, `extendConnection`) store `allow|ask|deny`. `true` always means permission granted, never a guard.
- Any deny refuses before approval. Asks need one native approval. An agent request to change capabilities or the discovery mode always needs native approval, even when everything is allowed.
- Approval prompts carry a readable summary from `describe()`, with names and folders. Never put session IDs or the raw proposal into the prompt's `resources` or `metadata`.
- The user `manage` RPC is the Desktop and TUI controls acting as the open session. The click is the approval, so it skips capability checks and prompts, uses none of the per-minute allowance and records `userAction: true`. It refuses `policy.update` and `discovery.update`, which stay in settings. Agent tools never reach it.
- User APIs trust OpenCode user credentials and cannot prove the caller is human. Do not claim a stronger boundary.
- Peer `profile.update` is self-only. User `profileManage` edits any member's labels with revision, target, input and cancellation checks, and has no registration side effects.
- Agent `team.members` and `team.delete` are member-only. Manual user `teamCandidates` and `teamManage` RPCs can manage any team without an acting session, and check the snapshot revision.
- Revalidate required approval categories immediately before commit: native project moves can change them. Reject outdated requirements with `state_changed_request_again`. Check cancellation inside queued commits, after awaited validation and before native creation dispatch. Never pretend a dispatched creation was undone.

### Tools and messages
- `src/manage-schema.js` is the single source for the `manage` schema (`anyOf` on `input`, no top-level `oneOf`), examples and validation. Report every shape problem in one `invalid_action_input` before membership, limits or approval.
- Known refusals are completed tool results `{error:{code,…,remedy}}`. OpenCode 2.2.5 records thrown plugin errors as `type: "unknown"`, because the plugin's `Tool.Error` is a separate module instance. Only unexpected failures throw.
- Keep `accepted`, `delivered`, `processed` and `uncertain` as separate states. Never silently resend uncertain admission or uncertain session creation. Recheck authorisation on retries.
- Sends and replies use native `delivery: "steer"` with `resume: true`, not `queue`. Tool descriptions must state next-step steering without cancelling in-flight calls.
- Native storage keys are `collaboration.v1`, `collaboration.v1.history.<scope>`, `collaboration.v1.index` and `collaboration.ui.v1`. Preserve saved data. Location instances share a queue and session names in one backend. Independent backends do not synchronise.
- Retention never refuses a send. History rolls over per scope, by count and bytes, so a busy team cannot displace another's. Do not add a limit that stops messaging when storage fills.
- A commit writes scopes, then the index, then the core record, so a retry key in core means its message was saved. A key whose message is gone must never send again. Removing a team writes core first, so a failure cannot destroy a surviving team's history. Startup removes orphan scopes and rebuilds the index and counts.
- Retry records last 15 minutes from the first attempt and are not extended by a retry. There is no permanent retry ledger.
- `maxHops` and `messagesPerConversation` do not apply between members of a team. Plugin-created sessions are recorded in `created`, never tagged in session metadata, because the host copies metadata to child sessions. `managedSessions` counts only those outside every team. An agent sees counted sessions by name only while they are listed. Unlisted ones appear only as counts (`quota.managedSessions.unlisted`, `countedUnlisted`), because same-project ones could otherwise be messaged.
- `waitingFor` (`approval` or `input`) comes from one process-wide tracker fed by every instance's events. Approvals are looked up once per running session through the asking instance's `ctx.permission.list`, then followed by events. Questions have no server-side lookup, so they are followed by events only. `session.idle` clears a session, and an idle session never shows it. A lookup that overlaps any event about its session is dropped and repeated. Instances register while they follow events, and when the last stops the tracker clears, so the next starts fresh. With no listener it reports and caches nothing. It is never saved, and never written into message records.
- An agent's `discover` shows its own teams and connections in full, and other teams by name with listed members only (`membersShown: 'listed'`). `people` covers only its own collaborations and messages. Unlisted members of other teams must never reach an agent: they chose not to be found, and same-project ones could be messaged. The user API still sees everything.
- An agent's own `discovery.register`, `discovery.unregister` and `profile.update` don't move the revision, because every approved request is re-checked against current state before commit. No-op versions, and closing a closed connection, save nothing. Every completed `manage` action shares the sender's per-minute limit with its messages, checked before any approval prompt.
- Labels refuse Unicode control, format and line-separator characters, at the engine boundary. Display names can't be "You" or "user", including look-alike letters from other scripts. Native titles skip input checks, so `identity()` cleans every name and role once with `cleanLabel()`, and marks a name that reads as You or user with "(agent)". An unchanged `team.members` list saves nothing. Team names are unique by NFKC, case-insensitive key. Anything shown from agents goes through `plain()`, which keeps line breaks and tabs only in message bodies, and names are bidi-isolated in the GUI. No session IDs are shown in the GUI or TUI.
- Agent `discover` output is capped. Read only the scopes a view needs. Compact `discover` reads no history: unacknowledged message IDs are kept per scope in the core record (`unacknowledged`), recalculated wherever the counts are, cleared with the team and rebuilt by repair. Before a history whose summary changes is written, the previously saved core record is rewritten with that summary set to `null`, so an interrupted save leaves it unknown, never stale. Unknown, or missing while the counts show messages, is read once and filled in.
- `removeData` is the only way to clear everything, needs an exact confirmation, and is never a peer tool. Never purge in unload cleanup, because reloads and shutdowns also unload the plugin. The server plugin ID sets the storage namespace, so changing it needs an explicit data transfer.

### Desktop interface
- Build controls from `ctx.ui` so they follow the app theme. Keep plugin CSS to layout and spacing. Use catalogue icons only.
- Do not poll with `createResource`: a refetch re-enters loading and refreshes the whole app. Poll into signals or a store and update only changed values. A unit test guards this. There is no manual Refresh button.
- Keep global GUI contributions stable during polling. Derive the command name with an equality-preserving memo, or the host re-registers commands repeatedly.
- Team expansion is a native GUI `Store.session` preference (`teamExpansion`), separate per session, server and location. Use draft updates so writes before load are queued.
- Messages and Activity each have an independent Team picker, saved per server in the native GUI `Store.global` preference `historySelection`. Filtering happens before the newest entries are selected, and a response for another scope is discarded. Counts appear on the picker only. Outside-team messages are **Connections**, and plugin-wide events are **General**.
- Team order is a native GUI `Store.global` preference (`teamOrder`), one order for the app. Teams reorder only through the drag handle on the left of the row, or with the arrow keys on that handle. The handle shows only on hover, or while the handle itself has keyboard focus, and a mouse press must not leave focus on it. The row click stays reserved for expanding and collapsing. Escape cancels a drag, and reduced-motion settings turn the animation off.
- `Ui.Menu` has no class option, so `[data-teams-menu]` is set through the trigger's ARIA link to even out our menu rows. It must keep failing safe to native padding, and must never restyle OpenCode's own menus.
- Team tiles expand and collapse as whole rows. Member and agent tiles navigate as whole rows. Never nest a button inside a navigation row. A row's menu button shows only on hover, with keyboard focus or while its menu is open, and there is no Manage team button. A right-click on a team, member or agent row, or the keyboard's menu key on it, opens the same menu at the pointer. `Ui.Menu` opens only from its own button and beside it, so the panel keeps one hidden menu button, moves it to the pointer and sends it the primary pointer press it opens on (`openMenuAt`). It must stay harmless when the host's menu button changes. The team menu offers Manage team, Add sessions and Delete team, and deletion still asks for confirmation.
- Messages cards expand and contract in place when clicked, with no chevron and no modal. Only text clipped by the two-line limit responds. Clicks on actions or at the end of a text selection do not toggle. Keep expanded IDs in a dashboard signal so refreshes and tab changes keep them open.
- Do not pass conditional JSX expressions as props that are read from event handlers or observers. Solid compiles them to a memo per read outside any root, which leaks.
- A member's model comes from its session record. A model picked in the open session's composer shows at once, but only a change counts, because the composer falls back to a default for a session with no choice. It gives way once the record changes. Never show one session's composer choice for another.
- Every form follows one layout: a title that names the action and one sentence on what it does, a label above each field, fields as wide as their column, selectors with the value on the left and the arrow on the right, one quiet line of help under what it explains, and a footer with an optional note on the left, then Cancel and one action. Sessions are always chosen in `SessionPicker`: chosen ones on top, a search box above, the count on the right and a fixed height, so loading, an empty result and an error never resize the dialog. Forms open outside the panel, so `.teams-form` and `.teams-foot-note` set the muted colours themselves.
- Forms show all their fields together. Model selection uses the enabled catalogue and native searchable dialogues. Never change the composer's selection to configure a teammate. Resolve exact model IDs from cached catalogues. Show `Model unavailable` rather than guessing.
- Model catalogue availability is not Desktop Settings → Models visibility. Version 2.2.5 has no public reader for it. Do not reach into private GUI storage or scrape the DOM.
- Use native `Ui.Dialog` size `x-large` for team, new-agent and connection forms, and `fit` for simple profile editing.
- Render at most 50 agents per page. Search covers all discoverable peers.
- No view lists archived sessions. Automatic listing covers top-level sessions only, so a subagent is listed only if it registers. An agent's `discover` lists at most 100 peers, newest first, with `agentsOmitted`.

### Architecture limits
- Use native host APIs. Do not add a broker, database, coordinator privilege or V1 compatibility layer. Import the SDK by its public package name. OpenCode resolves `effect` and `@opencode/plugin` to its own instances for every plugin, so they stay external, as optional peers that npm doesn't install. Never bundle them: two copies of `effect` don't share internal state. `@opencode/schema`, which OpenCode doesn't supply, is bundled into `dist/`, and its notice is in `THIRD_PARTY_LICENSES`; update that file if anything else gets bundled. The same file carries the notices for material that is only in the repository: the typeface embedded in the hero image and the icon shapes the preview copies from OpenCode. `solid-js` is a dependency, and never also a dev dependency, or npm treats it as dev-only. Rerun the real-host checks after any OpenCode upgrade. Use the host's Solid instance for GUI builds.
