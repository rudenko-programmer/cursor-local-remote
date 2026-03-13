# Cursor Remote Control

Control your Cursor IDE agent from any device on your local network. Open the web UI on your phone, tablet, or another computer and interact with Cursor's AI agent running on your machine.

Inspired by [Claude Code's Remote Control](https://code.claude.com/docs/en/remote-control), but built for Cursor and designed to work over LAN without any cloud infrastructure.

## How it works

1. Start the Next.js server on your development machine
2. Open the URL (or scan the QR code) from any device on the same network
3. Send messages through the web UI — they run on Cursor's CLI agent locally
4. See assistant responses, tool calls (file reads, writes, shell commands) streamed in real time

```
Phone / Tablet / Other PC                Your Machine
       (browser)           ──── LAN ────>  Next.js  ──> Cursor CLI (agent)
                           <── stream ───  (0.0.0.0:3000)
```

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Cursor CLI](https://cursor.com/cli) installed and authenticated (`agent login`)
- A Cursor subscription (the CLI requires one)

## Quick start

```bash
git clone https://github.com/your-user/cursor-remote-control.git
cd cursor-remote-control
npm install
npm run dev
```

The server starts on `http://0.0.0.0:3000`. Open it from any device on your network using your machine's LAN IP (shown in the terminal output or via the QR code button in the UI).

## Usage

- **Send messages**: type a prompt and press Enter (or the send button)
- **QR code**: tap the QR icon in the top bar to show a scannable link for your phone
- **Sessions**: tap the hamburger menu to browse and resume previous agent sessions
- **Tool calls**: file reads, writes, and shell commands appear as collapsible cards in the conversation

## Project structure

```
src/
  app/
    api/
      chat/route.ts       - POST streaming endpoint, spawns Cursor CLI
      sessions/route.ts   - GET session list via `agent ls`
      info/route.ts       - GET LAN IP and network info
    layout.tsx
    page.tsx
  components/             - React UI components
  hooks/use-chat.ts       - Chat state and stream consumption
  lib/
    cursor-cli.ts         - Cursor CLI process management
    types.ts              - TypeScript types for CLI stream events
    network.ts            - LAN IP detection
```

## Tech stack

- **Next.js 15** (App Router)
- **React 19**
- **Tailwind CSS v4**
- **Cursor CLI** headless mode (`agent -p --stream-json`)

## License

MIT
