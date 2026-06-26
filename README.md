# Claude Code DeepSeek Monitor

Real-time DeepSeek API usage monitor for Claude Code — displays session cost and account balance in the status bar. **USD pricing, English interface.**

Forked from [love72-seven/Claude-Code-DeepSeek-Monitor](https://github.com/love72-seven/Claude-Code-DeepSeek-Monitor) with these changes:

- **USD throughout** — currency symbol detected from DeepSeek balance API
- **English UI** — all text translated from Chinese
- **DeepSeek V4 pricing** — recognizes V4 Pro, V4 Flash, V3, and R2 models
- **Trimmed status bar** — model, context, project, DeepSeek cost + balance only
- **API key** — reads from `ANTHROPIC_AUTH_TOKEN` env var or `settings.json`

## Status Bar

```
[deepseek-v4-pro[1m]] ██░░░ 20% (196k/1M) | wsl | $0.092  Balance $3.14
```

| Segment | Meaning |
|---|---|
| `[deepseek-v4-pro[1m]]` | Model + context window size |
| `██░░░ 20% (196k/1M)` | Context fill + tokens used / max |
| `wsl` | Project name |
| `$0.092` | Session DeepSeek cost (real, not Anthropic estimate) |
| `Balance $3.14` | Account balance from DeepSeek API |

## Commands

| Command | Description |
|---|---|
| `/usage` | Full color dashboard with token/cost breakdown |
| `/usage --short` | Single-line compact view |
| `/usage --refresh` | Force refresh balance |

## Install

```bash
git clone https://github.com/JTPerez01/Claude-Code-DeepSeek-Monitor.git
cd Claude-Code-DeepSeek-Monitor
node install.js
```

Restart Claude Code.

## Pricing

Built-in DeepSeek V4 Pro pricing (USD, overridable via env):

| Token Type | Price per 1M |
|---|---|
| Input (cache miss) | $0.435 |
| Input (cache hit) | $0.003625 |
| Output | $0.87 |

```bash
export DEEPSEEK_INPUT_PRICE=0.435
export DEEPSEEK_OUTPUT_PRICE=0.87
export DEEPSEEK_CACHE_HIT_PRICE=0.003625
```

## Uninstall

```bash
node uninstall.js
```

Or manually:

```bash
rm -rf ~/.claude/plugins/cache/deepseek-monitor
rm -rf ~/.claude/plugins/custom/deepseek-monitor
rm -rf ~/.claude/plugins/claude-hud
rm -rf ~/.claude/skills/usage
rm -rf ~/.claude/deepseek-cache
```

Then remove `statusLine` from `~/.claude/settings.json`.

## License

MIT
