# Change Log

## [1.1.0] - 2026-11-25

### Added
- Subscription mode now works on macOS: credentials are read from the Keychain (item `Claude Code-credentials`), falling back to `~/.claude/.credentials.json`
- Support for `CLAUDE_CONFIG_DIR` (credentials file location and the matching Keychain item)

### Changed
- Credentials are re-read on every refresh, so a token refreshed by Claude Code is picked up automatically
- Clearer authentication errors: the message now shows where credentials were looked up, distinguishes "Keychain could not be read" from "not found", and suggests starting Claude Code when the token has expired

### Fixed
- Subscription mode showed "Claude Usage Live: Error" ("Claude Code credentials not found") on macOS (#2)

## [1.0.1] - 2026-06-28

### Fixed
- Subscription mode no longer shows "ccusage not found" error when ccusage is not installed

## [1.0.0] - 2026-06-22

### Added
- Status bar display of today's and monthly costs in API (pay-per-use) mode
- Status bar display of 5-hour and 7-day utilization in subscription mode
- Hover tooltip with cost/utilization details and last-updated time
- Auto-refresh on a configurable interval (default: 5 minutes)
- Manual refresh via `Claude Usage: Refresh Now` command
- Configurable status bar alignment (left/right) and priority
- Transient error retry with exponential backoff (3s → 10s → 30s)
- Localization support for English and Japanese
- Notification prompt to install ccusage if not found in PATH
