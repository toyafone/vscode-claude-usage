# Claude Usage Live

[![CI](https://github.com/toyafone/vscode-claude-usage/actions/workflows/ci.yml/badge.svg)](https://github.com/toyafone/vscode-claude-usage/actions/workflows/ci.yml)

Monitor your Claude Code usage in the VS Code status bar.

## Features

Minimal by design. Displays your Claude Code usage in the status bar — updated automatically every 60 seconds (configurable).

**API mode** (pay-per-use):

```
✻ Today: $1.23  Month: $45.67
```

Data source: reads `~/.claude/projects/**/*.jsonl` log files via the `ccusage` CLI.

**Subscription mode** (Max plan etc.):

```
✻ 5h: 25%  7d: 80%
```

Data source: fetches utilization from the Anthropic OAuth API using the credentials stored by `claude login`.

Hover over the status bar item to see a detailed tooltip with reset times and last updated time.

Run **Claude Usage: Refresh Now** from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) to fetch the latest data immediately.

## Requirements

- VS Code 1.120.0 or later
- [Claude Code](https://claude.ai/code) installed

**API mode** additionally requires:
- `ccusage` installed globally:
  ```
  npm install -g ccusage
  ```
- Claude Code must have been used at least once (log files must exist under `~/.claude/projects/`)

**Subscription mode** additionally requires:
- Logged in via `claude login`. The credentials are read from where Claude Code stores them:
  - **macOS**: the Keychain (item `Claude Code-credentials`). If it cannot be read, `~/.claude/.credentials.json` is used as a fallback.
  - **Linux / Windows**: `~/.claude/.credentials.json`
- If you set `CLAUDE_CONFIG_DIR`, the credentials are read from that directory (and from the matching Keychain item on macOS)

### Authentication notes (subscription mode)

- **`CLAUDE_CONFIG_DIR`** must be set as an environment variable of the VS Code process. Setting it only in Claude Code's settings file (`env` block) is not detected. Relative paths are not supported. Because VS Code may see different environment variables depending on how it was launched (Dock/Spotlight vs. a terminal), the error message shows the location that was checked.
- **Expired token**: the access token is short-lived and is refreshed by Claude Code itself, not by this extension. If you have not used Claude Code for a while and see `Authentication failed`, start Claude Code and try again (or run `Claude Usage: Refresh Now`).
- **Keychain locked** (macOS): unlock the Keychain, or run `claude login` again. The extension never changes the Keychain item or its access settings.
- **Stale `~/.claude/.credentials.json`** (macOS): if the Keychain cannot be read, the extension falls back to this file. An old file left over from a previous Claude Code version may contain an outdated token and cause `Authentication failed`. Delete the file or run `claude login` again.
- **Not supported in subscription mode**: authentication through environment variables (`CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`) and third-party providers (Bedrock, Vertex AI, etc.). If you use an API key, use API mode (ccusage).
- **Windows**: only the credentials file is read. Windows Credential Manager has not been verified.

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `claudeUsage.displayMode` | `"api"` | `"api"` for pay-per-use (today / month), `"subscription"` for fixed plan (5 h / 7 d) |
| `claudeUsage.refreshIntervalSeconds` | `300` | Auto-refresh interval in seconds (10–3600) |
| `claudeUsage.statusBarAlignment` | `"right"` | Position: `"left"` or `"right"` |
| `claudeUsage.statusBarPriority` | `100` | Priority relative to other status bar items |
| `claudeUsage.enabled` | `true` | Show or hide the status bar item |
| `claudeUsage.ccusagePath` | `""` | Path to the ccusage binary. Leave empty to use ccusage from PATH. |

## Commands

| Command | Description |
|---|---|
| `Claude Usage: Refresh Now` | Immediately fetch and display the latest usage data |

## Development

See [docs/architecture.md](docs/architecture.md) for how the extension is structured and why. Press `F5` to start an Extension Development Host, and run `npm test` to run the tests.
