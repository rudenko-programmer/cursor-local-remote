# cursor local remote

Control Cursor from your phone. Or tablet. Or any browser on your network.

A local web UI that talks to Cursor's CLI agent on your machine. No cloud, no accounts, no tunneling. Just your local network.

## Install

Run it instantly with npx (no install needed):

```bash
npx cursor-local-remote
```

A QR code pops up in your terminal — scan it from your phone, and you're connected to Cursor.

Or install globally for a shorter command:

```bash
npm install -g cursor-local-remote
clr
```

To uninstall:

```bash
npm uninstall -g cursor-local-remote
```

## What it does

- **Send prompts** to Cursor's agent from any device on your network
- **Watch responses stream in** — text, tool calls, file edits, shell commands
- **Pick a model** — fetches your actual available models from Cursor
- **Switch modes** — Agent, Ask, or Plan
- **Browse sessions** — see all your past Cursor sessions for the workspace, tap to view
- **Live tail** — open an active desktop Cursor session and watch it update in real time
- **Resume sessions** — continue any past session right from the web UI
- **Stop / retry / copy** — cancel a running response, retry, or copy any message

## Usage

`clr` is the short alias for `cursor-local-remote` when installed globally.

```bash
# start in current folder
clr

# start for a specific project
clr ~/projects/my-app

# use a different port
clr --port 8080

# skip auto-opening browser
clr --no-open

# skip QR code in terminal
clr --no-qr
```

## How it works

```
Your phone / tablet / laptop          Your machine
        (browser)          ── LAN ──>  Next.js app  ──>  cursor CLI (agent)
                           <─ stream ─  :3100
```

The Next.js app runs on your machine at `0.0.0.0:3100`. It spawns `agent` processes using Cursor's CLI in headless mode (`agent -p --output-format stream-json`), streams the NDJSON output to the browser, and reads Cursor's own session transcripts from `~/.cursor/projects/` so you can see all your sessions — not just ones started from this tool.

## Limitations

Sessions started from the remote UI won't appear in Cursor's desktop sidebar. This is a limitation of the Cursor CLI, it doesn't register headless sessions in the IDE's internal state. The sessions still work and are fully accessible from the remote's own session browser.

The best workflow is to **start a session in Cursor on your desktop**, then continue or monitor it from your phone via the remote UI. Sessions started from either side can be resumed from either side.

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [Cursor](https://cursor.com) with the CLI installed (`agent --version` should work)
- A Cursor subscription (Pro, Team, etc.)

## Development

Clone the repo and run in dev mode:

```bash
git clone https://github.com/jonmakinen/cursor-local-remote.git
cd cursor-local-remote
npm install
npm run dev
```

## License

MIT
