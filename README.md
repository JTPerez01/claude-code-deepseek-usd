# Claude Code DeepSeek USD

Real-time DeepSeek cost display for Claude Code's status bar — session cost + account balance, all in **USD**. Built for Americans who want to know what they're actually paying.

Forked from [love72-seven/Claude-Code-DeepSeek-Monitor](https://github.com/love72-seven/Claude-Code-DeepSeek-Monitor) with these changes:

- **USD throughout** — currency detected from DeepSeek balance API
- **English UI** — all text translated from Chinese
- **DeepSeek V4 pricing** — recognizes V4 Pro, V4 Flash, V3, and R2
- **Clean status bar** — model, context, project, cost + balance only
- **API key** — reads from `ANTHROPIC_AUTH_TOKEN` env var or `settings.json`

## Status Bar

```
[deepseek-v4-pro[1m]] ██░░░ 20% (196k/1M) | wsl | $0.092  Balance $3.14
```

| Segment | Meaning |
|---|---|
| `[deepseek-v4-pro[1m]]` | Model + context window |
| `██░░░ 20% (196k/1M)` | Context fill + tokens |
| `wsl` | Project name |
| `$0.092` | Session DeepSeek cost (real) |
| `Balance $3.14` | Account balance from DeepSeek API |

## Install

```bash
git clone https://github.com/JTPerez01/claude-code-deepseek-usd.git
cd claude-code-deepseek-usd
node install.js
```

Restart Claude Code.

## Commands

| Command | Description |
|---|---|
| `/usage` | Full color dashboard |
| `/usage --short` | Compact one-liner |
| `/usage --refresh` | Force balance refresh |

## Uninstall

```bash
node uninstall.js
```

## License

MIT
