# Configuration reference

Settings, limits and agent tool rules that go beyond the [README](../README.md).

## Interface command

The default dashboard command is `/team`. The Desktop sidebar launcher is **Agent Teams**.

Open **Settings → Agent Teams → Dashboard command**, enter a name and select **Save**, which becomes available once you've changed something. In the TUI, you'll find the same setting by opening the dashboard and selecting **Settings → Dashboard command**. You can type a leading slash, and capitals are converted to lowercase. However, the name must start with a letter and contain 1–32 letters, digits or hyphens. Since `peers` is reserved for the overview, choose a name that no other plugin or native command uses.

The setting applies across locations on the same backend and survives restart. It does not change permissions or approval policy.

## Discovery

The default mode is `registered`. Each session registers itself with **Join list** in the Desktop panel, through **Actions → Join the agent list** in the TUI, or by calling:

```json
{"action":"discovery.register","input":{}}
```

Use `discovery.unregister` with empty input to leave. These actions affect only the acting session and need no extra approval. They also don't change who can message whom, so an unlisted session with a known ID still follows the same project, team and connection rules.

The **List sessions automatically** switch selects `automatic` discovery, and you'll find it on the Desktop settings page or under TUI **Settings**. It saves straight away, even without an open session. Once on, it lists all top-level backend sessions, including unregistered ones, and hides the join controls. A subagent's session appears only if it joins the list itself, and archived sessions are never listed. Because the team and connection pickers only offer discoverable sessions, you can then add sessions that haven't joined. If you switch back to `registered`, the saved registrations are kept. An agent's `discovery.update` proposal, by contrast, always requires native approval:

```json
{"action":"discovery.update","input":{"mode":"automatic"}}
```

`session.create` accepts an optional `teamID`, provided the acting session belongs to that team. The usual native session creation, membership and cross-project approval rules apply. On success, the new session becomes a member. Every session created through the plugin registers automatically, with or without a team. A session created natively neither joins a team nor registers.

In `registered` mode, new team members and every member of a new connection must be registered, whether they're added manually or by an agent. In `automatic` mode, by contrast, any available session can join. A member that unregisters can stay in its team and can still be removed, although re-adding it requires registration again. The picker never registers a session as a side effect. The one exception is a session created for a team, which registers automatically as described above.

## Limits

Limits are operator configuration, read from `options.limits` when the plugin loads. As a result, agents cannot change them with the collaboration tools.

Limits go in your global config, `<config-root>/opencode/opencode.json`, where `<config-root>` is `$XDG_CONFIG_HOME` when set, otherwise `$HOME/.config`. Use an object entry for the plugin:

```json
{
  "plugins": [
    {
      "package": "agent-teams-for-opencode",
      "options": {
        "limits": {
          "messagesPerMinute": 30,
          "managedSessions": 16,
          "connectionMinutes": 60,
          "maxConnectionMinutes": 1440,
          "records": 2000
        }
      }
    }
  ]
}
```

If you installed with `opencode plugin add`, your config already lists `"agent-teams-for-opencode"` under `plugins`. Replace that string with the object above, so the plugin is listed once. Use the same options in all locations on one backend.

If you installed from source into `plugins/`, OpenCode loads that folder without any config entry, and an entry would load the plugin a second time. To set limits for a source install, keep the folder outside `plugins/` and give its absolute path as `package` instead.

| Key | Default | Meaning |
| --- | ---: | --- |
| `messageBytes` | 32768 | Maximum UTF-8 body bytes. Cannot exceed 32768. |
| `messagesPerMinute` | 30 | Messages and completed `manage` actions per sender in a rolling 60-second window. It's checked before any approval prompt. |
| `maxHops` | 100 | Maximum reply depth outside a team. The first message has depth zero. |
| `messagesPerConversation` | 100 | Maximum admissions with one conversation ID outside a team, counted per history scope. |
| `connectionMinutes` | 60 | Default connection lifetime. |
| `maxConnectionMinutes` | 1440 | Maximum requested lifetime from the current time. |
| `managedSessions` | 16 | Maximum non-archived sessions created by this plugin that aren't in any team. |
| `records` | 2000 | Full messages and Activity entries kept per history scope. |

All values must be positive safe integers. The maximum lifetime must be at least the default lifetime. Unknown limit keys are refused.

No retention limit ever refuses a message. Between members of a team, `maxHops` and `messagesPerConversation` don't apply, so a long exchange can continue for as long as the work needs. The sender rate and message size limits apply everywhere. A team holds up to 32 sessions, and creating a session for a team doesn't use `managedSessions`.

## Saved data

Everything is stored through native plugin storage, in OpenCode's database, and each kind of data is stored separately:

| Key | Holds |
| --- | --- |
| `collaboration.v1` | Teams, connections, profiles, registrations, capabilities, retry records, history counts, and which messages each session has yet to acknowledge. |
| `collaboration.v1.history.<scope>` | One team's messages, conversation counts and Activity. `<scope>` is a team ID, `none` for messages outside a team, or `general` for plugin-wide Activity. |
| `collaboration.v1.index` | Which scope holds each retained message. |
| `collaboration.ui.v1` | The dashboard command. |

**History.** Each team keeps its newest `records` messages or about 8 MiB, whichever comes first, and the oldest are removed as new ones arrive. Activity keeps its newest `records` entries per scope. Connection messages and same-project messages share the `none` scope, labelled **Connections** in Desktop. A message between two sessions that share several teams goes under the lowest team ID.

**Retry records.** A retry key lasts 15 minutes from the first attempt, and a retry doesn't extend it. If a message's text is removed sooner, a small receipt without the text stands in for it until then. After that, the same key is treated as a new send.

**Deleting.** Deleting a team removes its history key, index entries and retry records, and the same applies when all of its sessions are deleted. Copies already delivered into sessions aren't affected. Deleting a session also removes its profile and registration. Connections that have ended are removed after seven days. If a write is interrupted, startup finishes the job and rebuilds the index and counts.

**Removing everything.** **Settings → Agent Teams → Remove saved data** deletes every key above after asking for confirmation, and it resets permissions and the dashboard command to their defaults. It's a user RPC, `removeData({confirm: "remove-all-saved-data"})`, which agents can't call. A running plugin starts saving again when it's next used, so uninstall it straight afterwards. See the README's [uninstall steps](../README.md#uninstall).

## Agent capabilities

Capabilities use native plugin storage, separate from the configuration file. Each is named for the agent action and stores one of three values:

| Value | Meaning |
| --- | --- |
| `allow` | The agent may do it without asking. |
| `ask` | The agent may do it after native human approval. Default. |
| `deny` | The agent may not do it. The request is refused before any approval prompt with `capability_denied`. |

| Capability | Applies to |
| --- | --- |
| `createSession` | Starting an independent session in OpenCode. |
| `createTeam` | Starting a named group whose members can message each other. |
| `changeMembers` | Adding or removing members, or deleting a team. Also applies when creating a team or creating a session for a team. |
| `workAcrossProjects` | Any team or connection that spans more than one project, or a new session in another project. |
| `openConnection` | Letting specific sessions message each other for a limited time, without sharing a team. |
| `extendConnection` | Keeping an active connection open for longer. |

An action can use several capabilities. Any `deny` refuses it outright. Otherwise, every `ask` must be approved together, and an action that is `allow` throughout proceeds directly. Closing a connection and changing the current session's profile use no capability at all. An agent's `policy.update`, on the other hand, always needs approval, whatever the current values. Agents can read their values in `discover` as `self.capabilities`.

The approval dialogue describes the request in words, with session names and folders rather than IDs, for example *Alice asks to change the members of "Review":* followed by one line for each session, *Add: Carol (/c)* and *Remove: Bob (/a)*.

The Desktop settings page lists these under **Agent permissions** ("An agent may do the following without asking for permission:"). A switch that is on stores `allow`, while off stores `ask`. Neither the GUI nor the TUI sets `deny`. However, a row can become `deny` through an approved agent request or another client using the `configure` RPC, in which case it shows **Currently blocked**. Turning it on then stores `allow`.

User settings save directly through the authenticated user RPC: `configure({capabilities: {createSession: "allow"}})`, with one or more capabilities. A client with the user's OpenCode credentials can call it, so this API does not prove that a caller is a human. Changes invalidate pending agent proposals made before them.

The plugin has no coordinator exemption. Any peer can propose management actions, and the configured native approval remains the authority.

These permissions limit agents. The Desktop panel's and the TUI's own controls act as the open session without asking, because your click is the approval. They don't use that session's per-minute allowance, and **Activity** shows them as yours. They can't change permissions or the discovery mode, which stay in **Settings**.

## Agent tool inputs

The sender identity comes from native tool execution context. A caller cannot select a different sender.

### Errors

A known refusal returns a completed tool result whose content is `{"error":{...}}`, and nothing was changed. Every error has a `code` and usually a `remedy`. Field errors list `missing` and `invalid` fields and a `hint`, and shape problems are all reported together, before membership, limit or approval checks. Unexpected failures, such as storage or host errors, still fail the call with `unexpected_error`.

Codes with details include `invalid_action_input` (`missing`, `invalid`, `hint`), `capability_denied` (`denied` capabilities), `session_creation_limit` (`used`, `limit`, `counted` with the listed sessions, and `countedUnlisted`), `member_not_registered` (`sessions`), `team_not_found`, `connection_not_found`, `rate_limit` (`used`, `limit`, `retryAfterSeconds`), `team_full` and `state_changed_request_again` (`approved`, `required`). The `session.create` agent and model are checked against the native catalogue of the target directory when it can be read. An unreadable catalogue does not block creation.

### `discover`

Input: `{}`, optionally `compact: true` for a short summary and `catalog: true` for valid agents and models. The short summary answers from saved summaries and reads no message history, so it stays quick however long a team's history grows.

Each peer has `activity`, `running` or `idle`. While a running peer is waiting for a person, `waitingFor` says why: `approval` for a permission prompt, or `input` for a question. Approvals are looked up once per session and then followed through OpenCode's events, so they're always current. Questions can only be followed through events, so a question asked while OpenCode or the plugin was restarting isn't shown until the next one. An idle peer never has `waitingFor`. Message bodies and audit entries are limited to the calling session and its current teams and connections. Teams the session belongs to are shown in full. Other teams show their name and only their listed members, marked `membersShown: "listed"`, so an agent knows whom to ask to be added. Connections are limited to the session's own. `agents` holds up to 100 listed, unarchived peers, newest first, and `agentsOmitted` gives the number left out. The result holds its newest messages, up to 50 and about 64 KiB, with `messagesOmitted` giving the number left out, and its newest 50 Activity entries.

### `send`

| Field | Required | Meaning |
| --- | --- | --- |
| `to` | Yes | Recipient session ID. |
| `key` | Yes | Retry key, scoped to the sender. It protects against duplicates for 15 minutes from the first attempt. |
| `text` | Yes | Nonempty body within the UTF-8 size limit. |
| `replyTo` | No | Received message ID. Replies must reverse the original sender and recipient. |

Keys use 1–160 letters, digits, underscores, periods, colons, or hyphens. A new conversation receives a conversation ID. Replies retain that ID and increase the hop count. Self-messages and archived recipients are refused.

### `acknowledge`

Input: `{"id":"msg_RECEIVED"}`. Only the addressed recipient can acknowledge an admitted message. The output is the updated record.

### `manage`

Input: `{"action":"ACTION","input":{...}}`. Only the fields below are accepted. The tool's own schema and description list the same fields, with an example for each action.

| Action | `input` fields | Capabilities |
| --- | --- | --- |
| `profile.update` | Optional `name` and optional `role`, with at least one required. Acting session only. | None |
| `team.create` | `name`, `members` | `createTeam`, `changeMembers` |
| `team.members` | `id`, `members` | `changeMembers` |
| `team.delete` | `id` | `changeMembers` |
| `connection.create` | `members`, optional `minutes` | `openConnection` |
| `connection.extend` | `id`, optional `minutes`. The connection then ends in that many minutes, or later if it already did. Extending never shortens it. | `extendConnection` |
| `connection.close` | `id` | None |
| `session.create` | `name`, `role`, `agent`, absolute `directory`, `model` `{providerID,id,variant?}`, optional `teamID` | `createSession` (+ `changeMembers` with `teamID`) |
| `policy.update` | `capabilities`: one or more of the six capabilities set to `allow`, `ask` or `deny` | Always approval |
| `discovery.register` | Empty object. Register the acting session. | None |
| `discovery.unregister` | Empty object. Remove the acting session's registration. | None |
| `discovery.update` | `mode`: `registered` or `automatic` | Always approval |

Multi-project teams and connections also use `workAcrossProjects`, and so does `session.create` in a folder outside the requesting session's project. A folder that already holds a session belongs to that session's project. Otherwise the requesting session's own folder and any folder inside it belong to its project, however the path is written, and a folder anywhere else counts as another project. So a separate project nested inside the requesting session's folder is recognised only once a session exists in that exact folder.

Names and roles must contain 1–120 characters, with no control, formatting or invisible characters. A session can't be named "You" or "user", because "You" stands for you in Activity. Team names must be unique, ignoring case and look-alike characters. Closing a connection that's already closed changes nothing. Teams hold 1–32 unique session IDs and connections 2–32. In both cases, the member list must include the acting session, so a single agent can start a team containing only itself. It can then create teammates with `session.create` and the team's `teamID`, and they'll join and register automatically, subject to the usual approvals. Replacing a team's members supplies the complete list, which may leave just the acting session. Only a current member can do this or delete the team, and anyone else receives `team_not_found`. Similarly, any member can close or extend a connection, although one that has closed or expired can't be extended.

When a session is deleted, it leaves all of its teams automatically. No approval is involved and nobody is messaged, but pending team changes must be requested again, and **Activity** records the removal. A team whose last member is deleted is deleted with it. Sessions deleted while the plugin isn't running are picked up at startup or on the next dashboard or `discover` read, and a member is only removed once OpenCode itself reports that the session no longer exists, so a failed listing changes nothing. Archiving a session doesn't affect its membership, and connections are kept as they are. A message stays in its team's history until it rolls over or the team is deleted.

A connection authorises two-way communication between its members until it expires or is closed. Close it when you've finished, or simply let it expire.

`model.variant` and `teamID` are optional. To find valid agent IDs and models, use `discover` with `catalog: true`, since invalid choices are refused with the allowed values. The new session registers for discovery, and with `teamID` it also joins that team. Creation doesn't grant tool permissions, create a worktree, send an initial prompt or establish a parent session. The new session therefore stays idle until it receives work.

## Recovery

- `state_changed_request_again`: Submit a new management proposal, because the previous approval doesn't apply to a changed revision or changed approval requirements.
- `cancelled`: A stopped management request does not start a queued mutation or native session creation. A persisted `session.create.cancelled` entry confirms cancellation before dispatch. Creation already dispatched is not automatically undone.
- `communication_not_authorized`: Check current project identity, team membership, connection expiry, and closure. A retry cannot restore revoked access.
- `uncertain`: Inspect the recipient's native inbox and context by message ID. Do not use a new key merely to force a resend. That can create a duplicate. The error `message_record_lost` means a retry key outlived its message after an interrupted write, so the message may have been sent, and it won't be sent again.
- `invalid_reply` or `not_message_recipient` for a message you know exists: It has probably aged out of history. Send a new message without `replyTo`. An aged-out message needs no acknowledgement.
- Session creation error after native dispatch: Inspect `session.create.intent` in Activity and discover sessions before proposing another creation. Creation is not automatically retried.
- `invalid_stored_state`: Preserve the native data and its backup. Do not reset it automatically.

The plugin saves admission intent before calling the native inbox. If admission succeeds but the final storage write then fails, recovery reports uncertainty, keeping the original ID rather than repeating the native call.
