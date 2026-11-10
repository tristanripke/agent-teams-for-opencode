# Security

## Reporting a problem

Please report a security problem privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue for it.

This project is shared as is, with no promised response time. Reports are still welcome and will be read.

## What the plugin protects

Agent Teams runs inside OpenCode and stores its data in OpenCode's plugin storage. It adds no network service, broker or database.

- **Agents are limited by the plugin.** A session can message another only in the same project, in a shared team or over an active connection. Being listed grants nothing. Each capability under Agent permissions is set to allow, ask or deny, and asking uses OpenCode's own approval prompt. An agent's request to change those permissions, or how sessions are listed, always needs approval.
- **Unlisted sessions stay hidden from agents.** An agent sees other teams by name with their listed members only.
- **Messages are text from another agent.** A recipient should treat them as input from a peer, never as instructions from the user.

## What it does not protect

- **The user controls trust OpenCode's user credentials.** The Desktop panel, the terminal dialogues and the plugin's user RPCs act for whoever holds those credentials. The plugin cannot prove that such a caller is a person. Anything that can call OpenCode's API as the user, including a process on the same machine with access to the server, can use them.
- **Approval is only as strong as OpenCode's permission prompt.** The plugin turns a saved "always allow" for its approvals back into a prompt, so each request is asked again. Whoever answers that prompt decides, and the plugin cannot tell a person from a tool that answers for one.
- **Stored history is not encrypted** beyond what OpenCode's storage provides. Messages, names and folder paths are kept there until a team is deleted or the saved data is removed in settings.
- **Independent OpenCode servers do not share state.** Each has its own teams, connections and history.
