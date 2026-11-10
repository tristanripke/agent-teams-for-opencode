/* Agent Teams. Third-party code bundled into these files, and its licence: see THIRD_PARTY_LICENSES. */

// src/tui.js
import { Plugin } from "@opencode/plugin/tui";

// src/rpc.js
import { Rpc } from "@opencode/plugin/rpc";
var Collaboration = Rpc.define(
  /** @type {const} */
  {
    id: "agent-teams-for-opencode",
    methods: {
      settings: { input: { type: "object", additionalProperties: false }, output: {} },
      configure: { input: {
        type: "object",
        properties: {
          command: { type: "string" },
          discoveryMode: { type: "string", enum: ["registered", "automatic"] },
          capabilities: { type: "object" }
        },
        minProperties: 1,
        maxProperties: 1,
        additionalProperties: false
      }, output: {} },
      snapshot: { input: {
        type: "object",
        properties: { sessionID: { type: "string" }, scope: { type: "string" }, limit: { type: "integer", minimum: 1 } },
        additionalProperties: false
      }, output: {} },
      removeData: { input: {
        type: "object",
        properties: { confirm: { type: "string", enum: ["remove-all-saved-data"] } },
        required: ["confirm"],
        additionalProperties: false
      }, output: {} },
      teamCandidates: { input: { type: "object", properties: {
        query: { type: "string", maxLength: 240 },
        page: { type: "integer", minimum: 0 },
        exclude: { type: "array", items: { type: "string" }, maxItems: 32 }
      }, additionalProperties: false }, output: {} },
      teamManage: { input: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["team.create", "team.update", "team.delete"] },
          input: { type: "object" },
          revision: { type: "integer", minimum: 0 }
        },
        required: ["action", "input", "revision"],
        additionalProperties: false
      }, output: {} },
      profileManage: { input: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          input: {
            type: "object",
            properties: { name: { type: "string" }, role: { type: "string" } },
            required: ["name", "role"],
            additionalProperties: false
          },
          revision: { type: "integer", minimum: 0 }
        },
        required: ["sessionID", "input", "revision"],
        additionalProperties: false
      }, output: {} },
      manage: { input: { type: "object", properties: {
        sessionID: { type: "string" },
        action: { type: "string" },
        input: { type: "object" }
      }, required: ["sessionID", "action", "input"], additionalProperties: false }, output: {} }
    },
    events: {}
  }
);

// src/format.js
var STATUS = {
  sending: { label: "Sending", help: "Waiting for OpenCode to accept the message." },
  accepted: { label: "Sent", help: "OpenCode accepted the message for the recipient." },
  delivered: { label: "Delivered", help: "The message is in the recipient's conversation and waits to be handled." },
  processed: { label: "Handled", help: "The recipient confirmed that it handled the message." },
  uncertain: { label: "Unconfirmed", help: "Delivery could not be confirmed. It was not resent. Check the recipient session before trying again." }
};
var status = (value) => STATUS[value] ?? { label: String(value), help: "" };
var CAPABILITY = {
  createSession: { title: "Create a session", description: "Starting an independent session in OpenCode." },
  createTeam: { title: "Create a team", description: "Starting a named group whose members can message each other." },
  changeMembers: { title: "Change team members", description: "Adding or removing members, or deleting a team." },
  workAcrossProjects: {
    title: "Work across projects",
    description: "Any team or connection that spans more than one project, or a new session in another project."
  },
  openConnection: { title: "Open a connection", description: "Letting specific sessions message each other for a limited time, without sharing a team." },
  extendConnection: { title: "Extend a connection", description: "Keeping an active connection open for longer." }
};
var capabilityState = (value) => value === "allow" ? "allowed without asking" : value === "deny" ? "blocked" : "asks you first";
var capabilityText = (key, value) => `${CAPABILITY[key]?.title ?? key}: ${capabilityState(value)}`;
var CATEGORY = {
  createSession: "session creation",
  createTeam: "team creation",
  changeMembers: "membership",
  workAcrossProjects: "cross-project",
  openConnection: "connection",
  extendConnection: "extension",
  policy: "agent permissions",
  discovery: "discovery"
};
var ERRORS = {
  team_not_found: "That team no longer exists, or this session is not one of its members.",
  connection_not_found: "That connection no longer exists, or this session is not one of its members.",
  connection_expired: "That connection has already ended. Open a new one instead.",
  state_changed_request_again: "Something changed while this waited for approval. Try again.",
  invalid_members: "Choose 1\u201332 unique team members or 2\u201332 connection members. Agent requests must include the acting session.",
  member_not_registered: "New team and connection members must join the agent list first, unless List sessions automatically is enabled.",
  team_name_exists: "A team with this name already exists.",
  invalid_team_name: "Enter a team name of up to 120 characters.",
  invalid_profile: "Enter a name and a role of up to 120 characters each.",
  invalid_expiry: "Enter a whole number of minutes within the configured maximum.",
  invalid_session_request: "Check the name, role, agent, folder and model. The folder must be an absolute path.",
  session_creation_limit: "The limit for sessions created by Agent Teams is reached. Archive one first.",
  communication_not_authorized: "These sessions are not allowed to message each other. They need the same project, a team or a connection.",
  rate_limit: "Too many messages in the last minute. Wait and try again.",
  invalid_session: "That session is no longer available.",
  invalid_session_id: "That session is no longer available.",
  invalid_setting: "That setting could not be saved.",
  invalid_capabilities: "That setting could not be saved.",
  capability_denied: "Agents are not allowed to do that. Change it in Settings \u2192 Agent Teams.",
  team_full: "That team already has 32 members.",
  invalid_action_input: "Check the entered values and try again.",
  invalid_discovery_mode: "That setting could not be saved.",
  invalid_stored_state: "The saved Agent Teams data is unreadable. It was left unchanged.",
  cancelled: "The request was cancelled."
};
function errorText(error) {
  const message = String(error?.message ?? error ?? "");
  const code = Object.keys(ERRORS).find((key) => new RegExp(`\\b${key}\\b`).test(message));
  return code ? ERRORS[code] : message || "Something went wrong.";
}
function person(state, id) {
  return state?.agents?.find((peer) => peer.sessionID === id) ?? state?.people?.[id];
}
var UNSAFE = /[\p{Cc}\p{Cf}\u2028\u2029]/gu;
function plain(text, multiline = false) {
  const value = String(text ?? "");
  return multiline ? value.replace(UNSAFE, (character) => character === "\n" || character === "	" ? character : "") : value.replace(/[\r\n\u2028\u2029]+/g, " ").replace(UNSAFE, "");
}
function nameOf(state, id) {
  if (id === "user") return "You";
  const name = person(state, id)?.name;
  return name === void 0 ? `Session \u2026${String(id).slice(-6)}` : plain(name);
}
var names = (state, ids) => ids.map((id) => nameOf(state, id)).join(", ");
function relative(at, now = Date.now()) {
  const minutes = Math.round((at - now) / 6e4);
  if (Math.abs(minutes) < 1) return "just now";
  if (Math.abs(minutes) < 60) return minutes > 0 ? `in ${minutes} min` : `${-minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return hours > 0 ? `in ${hours} h` : `${-hours} h ago`;
  return new Date(at).toLocaleDateString(void 0, { day: "numeric", month: "short" });
}
function ends(connection, now = Date.now()) {
  if (connection.closed) return "closed";
  return connection.expiresAt > now ? `ends ${relative(connection.expiresAt, now)}` : `ended ${relative(connection.expiresAt, now)}`;
}
function activity(item, state) {
  const byUser = item.data?.userAction === true && item.actor !== "user";
  const actor = byUser ? `You (${nameOf(state, item.actor)})` : nameOf(state, item.actor), proposal = item.data?.proposal ?? {};
  const others = (members) => names(state, (members ?? []).filter((id) => id !== item.actor));
  const teamName = state?.teams?.find((team) => team.id === proposal.id)?.name ?? "a team";
  const text = {
    "team.create": `${actor} created team ${proposal.name}`,
    "team.members": `${actor} changed the members of ${teamName}`,
    "team.update": `${actor} updated team ${proposal.name}`,
    "team.delete": `${actor} deleted ${item.data?.teamName ?? teamName}`,
    // System entries carry their own names: neither the session nor always the team still exists.
    "team.member.removed": `${item.data?.name ?? nameOf(state, item.data?.sessionID)} was removed from ${item.data?.teamName ?? "a team"} because its session was deleted`,
    "team.removed": `${item.data?.teamName ?? "A team"} was deleted because its last member's session was deleted`,
    "connection.create": `${actor} opened a connection with ${others(proposal.members)}`,
    "connection.extend": `${actor} extended a connection`,
    "connection.close": `${actor} closed a connection`,
    "session.create": `${actor} created session ${proposal.name}`,
    "session.create.intent": `${actor} started creating session ${proposal.name}`,
    "session.create.cancelled": `${actor} cancelled session creation before it started`,
    "profile.update": item.data?.userAction === true ? `You set ${item.data.previousName ?? nameOf(state, item.data.sessionID ?? item.actor)}'s profile to ${(item.data?.profile ?? proposal).name} (${(item.data?.profile ?? proposal).role})` : `${actor} set its name to ${(item.data?.profile ?? proposal).name} (${(item.data?.profile ?? proposal).role})`,
    "discovery.register": `${actor} joined the agent list`,
    "discovery.unregister": `${actor} left the agent list`,
    "discovery.update": `${actor} changed how sessions are listed`,
    "policy.update": `${actor} changed what agents may do`,
    "message.admission": `${actor} sent ${nameOf(state, state?.messages?.find((message) => message.id === item.data?.id)?.to ?? "")} a message`
  }[item.action];
  if (item.action === "settings.update") return { text: "You changed a setting", detail: settingText(proposal) };
  if (item.action === "message.admission") {
    const recipient = item.data?.to ?? state?.messages?.find((message) => message.id === item.data?.id)?.to;
    return {
      text: recipient ? `${actor} sent ${nameOf(state, recipient)} a message` : `${actor} sent a message`,
      detail: `Status: ${status(item.data?.status).label}`
    };
  }
  const categories = item.data?.approvalCategories;
  const detail = categories === void 0 ? "" : categories.length ? `You approved: ${categories.map((key) => CATEGORY[key] ?? key).join(", ")}` : "No approval needed";
  return { text: text ?? `${actor}: ${item.action}`, detail };
}
function settingText(proposal) {
  if (proposal.command) return `Dashboard command: /${proposal.command}`;
  if (proposal.discoveryMode) return proposal.discoveryMode === "automatic" ? "Sessions are listed automatically" : "Sessions are listed after they join";
  return Object.entries(proposal.capabilities ?? {}).map(([key, value]) => capabilityText(key, value)).join("; ");
}

// src/actions.js
var ACTIONS = {
  "discovery.register": { title: "Join the agent list", fields: [] },
  "discovery.unregister": { title: "Leave the agent list", fields: [] },
  "profile.update": { title: "Edit my name and role", fields: ["name", "role"] },
  "team.create": { title: "New team", fields: ["name", "members"] },
  "team.members": { title: "Change team members", fields: ["id", "members"] },
  "team.delete": { title: "Delete a team", fields: ["id"] },
  "connection.create": { title: "Connect sessions", fields: ["members", "minutes"] },
  "connection.extend": { title: "Extend a connection", fields: ["id", "minutes"] },
  "connection.close": { title: "Close a connection", fields: ["id"] },
  "session.create": { title: "New agent session", fields: ["name", "role", "directory", "agent", "providerID", "modelID", "variant", "teamID"] }
};
var PROMPTS = {
  name: "Name",
  role: "Role",
  directory: "Folder (absolute path)",
  agent: "Agent, e.g. build",
  providerID: "Model provider ID",
  modelID: "Model ID",
  variant: "Model variant (optional)",
  minutes: "Minutes until it ends"
};
async function collectUserTeam(ui, snapshot, team, sessionID) {
  const name = await ui.prompt("Team name", team?.name ?? "");
  if (name === void 0) return;
  const selected = new Set(team?.members ?? (snapshot.agents.some((peer) => peer.sessionID === sessionID) ? [sessionID] : []));
  const candidates = new Map([
    ...snapshot.agents.filter((peer) => !peer.archived),
    ...(team?.members ?? []).map((id) => person(snapshot, id) ?? { sessionID: id, name: `Session \u2026${id.slice(-6)}`, role: "Unavailable" })
  ].map((peer) => [peer.sessionID, peer]));
  for (; ; ) {
    const choice = await ui.select(`Team members (${selected.size}/32)`, [
      ...selected.size ? [{ title: "Save team", value: "done" }] : [],
      ...[...candidates.values()].map((peer) => ({
        title: `${selected.has(peer.sessionID) ? "\u2713 " : ""}${peer.name}`,
        description: peer.role,
        value: peer.sessionID
      }))
    ]);
    if (!choice) return;
    if (choice === "done" && selected.size) return { ...team ? { id: team.id } : {}, name, members: [...selected] };
    if (selected.has(choice)) selected.delete(choice);
    else if (selected.size < 32 && candidates.has(choice)) selected.add(choice);
  }
}
var MEMBER_HINT = "Only listed sessions appear. Turn on List sessions automatically in Settings to include every session.";
function joinFirst(snapshot, action, input) {
  if (!snapshot.discovery || snapshot.discovery.mode === "automatic" || !["team.create", "team.members", "connection.create"].includes(action)) return;
  const kept = action === "team.members" ? snapshot.teams.find((team) => team.id === input.id)?.members ?? [] : [];
  const waiting = (input.members ?? []).filter((id) => !kept.includes(id) && !snapshot.discovery.registered.includes(id)).map((id) => person(snapshot, id)?.name ?? "An untitled session");
  if (waiting.length) return `${new Intl.ListFormat("en-GB").format(waiting)} must join the agent list first.`;
}
async function collectAction(ui, action, snapshot, sessionID) {
  const definition = ACTIONS[action];
  if (action === "connection.create") {
    const refusal = joinFirst(snapshot, action, { members: [sessionID] });
    if (refusal) throw new Error(refusal);
  }
  const input = {};
  for (const field of definition.fields) {
    if (field === "members") {
      const members = new Set(input.id ? snapshot.teams.find((team) => team.id === input.id)?.members : [sessionID]);
      members.add(sessionID);
      while (true) {
        const selected = await ui.select(snapshot.discovery?.mode === "automatic" ? "Select members, then choose Done" : `Select members, then choose Done. ${MEMBER_HINT}`, [
          { title: `Done (${members.size} selected)`, value: "done" },
          ...snapshot.agents.filter((peer) => peer.sessionID !== sessionID).map((peer) => ({
            title: `${members.has(peer.sessionID) ? "[x]" : "[ ]"} ${peer.name} \xB7 ${peer.role}`,
            description: peer.directory,
            value: peer.sessionID
          }))
        ]);
        if (selected === void 0) return;
        if (selected === "done") break;
        members.has(selected) ? members.delete(selected) : members.add(selected);
      }
      input.members = [...members];
    } else if (field === "id") {
      const rows = (action.startsWith("team.") ? snapshot.teams : snapshot.connections.filter((item) => item.active)).filter((item) => item.members.includes(sessionID));
      input.id = await ui.select(action.startsWith("team.") ? "Select a team" : "Select a connection", rows.map((item) => ({
        title: item.name ?? names(snapshot, item.members).replaceAll(", ", " \u2194 "),
        description: names(snapshot, item.members),
        value: item.id
      })));
      if (!input.id) return;
    } else if (field === "teamID") {
      const teams = snapshot.teams?.filter((team) => team.members.includes(sessionID)) ?? [];
      if (teams.length) {
        const selected = await ui.select("Add the new session to a team?", [
          { title: "No team", value: "none" },
          ...teams.map((team) => ({ title: team.name, value: team.id }))
        ]);
        if (selected === void 0) return;
        if (selected !== "none") input.teamID = selected;
      }
    } else {
      const me = person(snapshot, sessionID);
      const defaults = {
        directory: me?.directory,
        minutes: String(snapshot.limits.connectionMinutes),
        agent: "build",
        ...action === "profile.update" ? { name: me?.name, role: me?.role } : {}
      };
      const value = await ui.prompt(PROMPTS[field] ?? field, defaults[field] ?? "");
      if (value === void 0) return;
      input[field] = field === "minutes" ? Number(value) : value;
    }
  }
  if (action === "session.create") {
    input.model = { id: input.modelID, providerID: input.providerID, ...input.variant ? { variant: input.variant } : {} };
    delete input.modelID;
    delete input.providerID;
    delete input.variant;
  }
  return input;
}

// src/tui.js
import { createSignal } from "solid-js";
var SECTIONS = ["Teams", "Agents", "Connections", "Messages", "Activity", "Actions", "Settings"];
var tui_default = Plugin.define({
  id: "agent-teams-for-opencode",
  setup(ctx) {
    const [command, setCommand] = createSignal("team");
    const api = () => {
      const client = ctx.client.rpc(Collaboration);
      const options = { location: ctx.location ?? ctx.data.location.default() };
      return {
        snapshot: async () => {
          const route = ctx.ui.router.current();
          return (
            /** @type {any} */
            await client.snapshot(route.type === "session" ? { sessionID: route.sessionID } : {}, options)
          );
        },
        manage: (input) => client.manage(input, options),
        teamManage: (input) => client.teamManage(input, options),
        settings: async () => (
          /** @type {{command: string}} */
          await client.settings({}, options)
        ),
        removeData: (input) => client.removeData(input, options),
        configure: async (input) => (
          /** @type {{command: string}} */
          await client.configure(input, options)
        )
      };
    };
    const ui = {
      select: (title, options) => ctx.ui.dialog.select({ title, options }),
      prompt: (title, value) => ctx.ui.dialog.prompt({ title, value })
    };
    const guarded = (fn) => async () => {
      try {
        await fn();
      } catch (error) {
        ctx.ui.toast.show({ message: errorText(error), variant: "error" });
      }
    };
    let disposed = false, loadingSettings = false, settingsFailed = false, commandGeneration = 0;
    async function loadSettings() {
      if (loadingSettings || disposed) return;
      loadingSettings = true;
      const generation = commandGeneration;
      try {
        const value = await api().settings();
        if (!disposed && generation === commandGeneration) setCommand(value.command);
        settingsFailed = false;
      } catch (error) {
        if (!settingsFailed) console.error("agent-teams-for-opencode command setting unavailable", error);
        settingsFailed = true;
      } finally {
        loadingSettings = false;
      }
    }
    void loadSettings();
    const settingsTimer = setInterval(() => void loadSettings(), 5e3);
    function current() {
      const route = ctx.ui.router.current();
      if (route.type !== "session") throw new Error("Open a session first.");
      return route.sessionID;
    }
    async function overview() {
      const state = await api().snapshot();
      const id = await ui.select("Agents", state.agents.map((peer) => ({
        title: `${plain(peer.name)} \xB7 ${plain(peer.role)}`,
        description: `${peer.activity === "running" ? "Running" : "Idle"} \xB7 ${peer.directory}`,
        value: peer.sessionID
      })));
      if (id) ctx.ui.router.navigate({ type: "session", sessionID: id });
    }
    async function settings(state) {
      const name = await ui.select("Agent Teams settings", [
        { title: `Dashboard command: /${command()}`, value: "slashCommand" },
        { title: `List sessions automatically: ${state.discovery.mode === "automatic" ? "on" : "off"}`, value: "discoveryMode" },
        ...Object.keys(CAPABILITY).map((value) => ({
          title: `An agent may ${CAPABILITY[value].title.toLowerCase()} without asking: ${state.capabilities[value] === "allow" ? "on" : "off"}`,
          description: [CAPABILITY[value].description, state.capabilities[value] === "deny" ? "Currently blocked." : ""].filter(Boolean).join(" ") || void 0,
          value
        })),
        { title: "Remove saved data", description: "Delete all teams, history and settings this plugin stored.", value: "removeData" }
      ]);
      if (!name) return;
      if (name === "removeData") {
        const answer = await ui.select("Delete all teams, history and settings this plugin stored? This cannot be undone.", [
          { title: "Cancel", value: "cancel" },
          { title: "Remove saved data", value: "remove" }
        ]);
        if (answer !== "remove") return;
        await api().removeData({ confirm: "remove-all-saved-data" });
        commandGeneration++;
        setCommand("team");
        ctx.ui.toast.show({ message: "Saved data removed", variant: "success" });
        return;
      }
      if (name === "slashCommand") {
        const value = await ui.prompt("Dashboard command (default: team)", command());
        if (value !== void 0) {
          const saved = await api().configure({ command: value });
          commandGeneration++;
          setCommand(saved.command);
          ctx.ui.toast.show({ message: `Command saved: /${saved.command}`, variant: "success" });
        }
        return;
      }
      if (name === "discoveryMode") {
        const mode = await ui.select("List sessions automatically", [
          { title: "Off: list a session after it joins", value: "registered" },
          { title: "On: list every session", value: "automatic" }
        ]);
        if (mode) await api().configure({ discoveryMode: mode });
        return;
      }
      const next = state.capabilities[name] === "allow" ? "ask" : "allow";
      await api().configure({ capabilities: { [name]: next } });
      ctx.ui.toast.show({ message: capabilityText(name, next), variant: "success" });
    }
    async function dashboard() {
      const section = await ui.select("Agent Teams", SECTIONS.map((title) => ({ title, value: title })));
      if (!section) return;
      if (section === "Agents") return overview();
      const state = await api().snapshot();
      if (section === "Teams") {
        const id = await ui.select("Teams", [
          { title: "New team", value: "new" },
          ...state.teams.map((team2) => ({ title: team2.name, description: names(state, team2.members), value: team2.id }))
        ]);
        if (!id) return;
        const team = state.teams.find((team2) => team2.id === id);
        const action = team ? await ui.select(team.name, [
          { title: "Manage team", value: "manage" },
          { title: "Delete team", value: "delete" },
          ...team.members.map((id2) => ({ title: `Open ${names(state, [id2])}`, value: id2 }))
        ]) : "manage";
        if (!action) return;
        if (action.startsWith("ses_")) {
          ctx.ui.router.navigate({ type: "session", sessionID: action });
          return;
        }
        if (action === "delete") {
          if (await ui.select(
            `Delete ${team.name} and its history?`,
            [{ title: "Cancel", value: "cancel" }, { title: "Delete team", value: "delete" }]
          ) !== "delete") return;
          await api().teamManage({ action: "team.delete", input: { id: team.id }, revision: state.revision });
        } else {
          const route = ctx.ui.router.current();
          const input = await collectUserTeam(ui, state, team, route.type === "session" ? route.sessionID : void 0);
          if (!input) return;
          await api().teamManage({ action: team ? "team.update" : "team.create", input, revision: state.revision });
        }
        ctx.ui.toast.show({ message: action === "delete" ? "Team deleted" : "Team saved", variant: "success" });
        return;
      }
      if (section === "Actions") {
        const action = await ui.select("Agent Teams actions", Object.entries(ACTIONS).map(([value, item]) => ({ title: item.title, value })));
        if (!action) return;
        const sessionID = current(), input = await collectAction(ui, action, state, sessionID);
        if (!input) return;
        const refusal = joinFirst(state, action, input);
        if (refusal) throw new Error(refusal);
        await api().manage({ sessionID, action, input });
        ctx.ui.toast.show({ message: `${ACTIONS[action].title}: done`, variant: "success" });
      } else if (section === "Settings") {
        await settings(state);
      } else if (section === "Messages") {
        const message = await ui.select("Messages", state.messages.slice().reverse().map((item2) => ({
          title: `${plain(item2.sender.name)} \u2192 ${plain(item2.recipient.name)} \xB7 ${status(item2.status).label} \xB7 ${relative(item2.at)}`,
          description: plain(item2.text).slice(0, 100),
          value: item2.id
        })));
        if (!message) return;
        const item = state.messages.find((row) => row.id === message);
        await ctx.ui.dialog.alert({
          title: `${plain(item.sender.name)} \u2192 ${plain(item.recipient.name)} \xB7 ${status(item.status).label}`,
          message: `${plain(item.text, true)}

${status(item.status).help}`
        });
        ctx.ui.router.navigate({ type: "session", sessionID: item.to });
      } else {
        const rows = section === "Connections" ? state.connections.map((item) => `${names(state, item.members).replaceAll(", ", " \u2194 ")}
Temporary connection \xB7 ${ends(item)}`) : state.audit.slice(-50).reverse().map((item) => {
          const line = activity(item, state);
          return `${relative(item.at)} \xB7 ${line.text}${line.detail ? `
${line.detail}` : ""}`;
        });
        await ctx.ui.dialog.alert({ title: section, message: rows.join("\n\n") || `No ${section.toLowerCase()} yet.` });
      }
    }
    ctx.keymap.layer(() => ({ mode: "global", commands: [
      {
        id: "peers.overview",
        title: "Show agents",
        group: "Agent Teams",
        palette: true,
        slash: { name: "peers" },
        run: guarded(overview)
      },
      {
        id: "peers.dashboard",
        title: "Open Agent Teams",
        group: "Agent Teams",
        palette: true,
        slash: { name: command() },
        run: guarded(dashboard)
      }
    ] }));
    const stop = ctx.data.on("session.inbox.enqueued", (event) => {
      const meta = event.data.item.type === "synthetic" ? event.data.item.payload.metadata?.agentTeamsForOpencode : void 0;
      if (meta) ctx.ui.toast.show({
        message: `${meta.senderName ? plain(meta.senderName) : "An agent"} sent ${meta.recipientName ? plain(meta.recipientName) : "a session"} a message`,
        variant: "info"
      });
    });
    return () => {
      disposed = true;
      clearInterval(settingsTimer);
      stop();
    };
  }
});
export {
  tui_default as default
};
