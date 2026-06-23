# Change Log

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
