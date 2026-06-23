# Claude Usage Live

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
- `ccusage` installed globally:
  ```
  npm install -g ccusage
  ```

**API mode** additionally requires:
- Claude Code must have been used at least once (log files must exist under `~/.claude/projects/`)

**Subscription mode** additionally requires:
- Logged in via `claude login` (credentials must exist at `~/.claude/.credentials.json`)

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `claudeUsage.displayMode` | `"api"` | `"api"` for pay-per-use (today / month), `"subscription"` for fixed plan (5 h / 7 d) |
| `claudeUsage.refreshIntervalSeconds` | `60` | Auto-refresh interval in seconds (10–3600) |
| `claudeUsage.statusBarAlignment` | `"right"` | Position: `"left"` or `"right"` |
| `claudeUsage.statusBarPriority` | `100` | Priority relative to other status bar items |
| `claudeUsage.enabled` | `true` | Show or hide the status bar item |
| `claudeUsage.ccusagePath` | `""` | Path to the ccusage binary. Leave empty to use ccusage from PATH. |

## Commands

| Command | Description |
|---|---|
| `Claude Usage: Refresh Now` | Immediately fetch and display the latest usage data |