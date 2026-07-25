# Public Test Deployment

This deployment plan is for a public browser test build of Group Crash.

It intentionally keeps the MVP simple:

- No accounts
- No database
- No Redis
- No Android TV wrapper
- In-memory rooms only
- One server instance

## Recommended Host

Use Render for the first public test because it can host both:

- Static Vite sites for the TV and controller apps
- A Node web service that accepts public WebSocket connections

Public clients must connect with `wss://`, not `ws://`.

## Fastest Path: Render Blueprint

This repo includes `render.yaml` at the repository root. In Render, create a new
Blueprint from the GitHub repository and Render can create all three services:

- `group-crash-server`
- `group-crash-controller`
- `group-crash-tv`

The Blueprint wires the public service URLs automatically with
`RENDER_EXTERNAL_URL`. The TV and controller apps accept
`VITE_GROUP_CRASH_SERVER_URL` and convert it to the correct `wss://` WebSocket
URL at runtime.

Use the manual settings below only if you prefer creating each service one at a
time.

## Service 1: Multiplayer Server

Create a Render **Web Service**.

Settings:

```text
Name: group-crash-server
Root directory: leave blank / repository root
Runtime: Node
Build command: pnpm install --frozen-lockfile && pnpm --filter @group-crash/server build
Start command: pnpm --filter @group-crash/server start
```

Environment variables:

```text
NODE_VERSION=22
HOST=0.0.0.0
CONTROLLER_ORIGIN=https://YOUR-CONTROLLER-SITE.onrender.com
ROOM_TTL_MS=7200000
RECONNECT_GRACE_MS=30000
CLEANUP_INTERVAL_MS=15000
MESSAGE_COOLDOWN_MS=1200
MAX_MESSAGE_BYTES=4096
```

Render provides `PORT` automatically. Do not hard-code it in the Render service.

After deploy, the server URL should look like:

```text
https://group-crash-server.onrender.com
```

The frontend WebSocket URL should use the same host with `wss://`:

```text
wss://group-crash-server.onrender.com
```

## Service 2: Phone Controller

Create a Render **Static Site**.

Settings:

```text
Name: group-crash-controller
Root directory: leave blank / repository root
Build command: pnpm install --frozen-lockfile && pnpm --filter @group-crash/controller build
Publish directory: apps/controller/dist
```

Environment variables:

```text
NODE_VERSION=22
VITE_GROUP_CRASH_WS_URL=wss://YOUR-SERVER.onrender.com
# Or, for Render Blueprints:
VITE_GROUP_CRASH_SERVER_URL=https://YOUR-SERVER.onrender.com
```

After deploy, the controller URL should look like:

```text
https://group-crash-controller.onrender.com
```

Update the server's `CONTROLLER_ORIGIN` to this exact controller URL and redeploy the server.

## Service 3: TV App

Create a Render **Static Site**.

Settings:

```text
Name: group-crash-tv
Root directory: leave blank / repository root
Build command: pnpm install --frozen-lockfile && pnpm --filter @group-crash/tv build
Publish directory: apps/tv/dist
```

Environment variables:

```text
NODE_VERSION=22
VITE_GROUP_CRASH_WS_URL=wss://YOUR-SERVER.onrender.com
# Or, for Render Blueprints:
VITE_GROUP_CRASH_SERVER_URL=https://YOUR-SERVER.onrender.com
VITE_GROUP_CRASH_CONTROLLER_URL=https://YOUR-CONTROLLER-SITE.onrender.com
```

After deploy, the TV URL should look like:

```text
https://group-crash-tv.onrender.com
```

## Deploy Order

1. Deploy `group-crash-server` with a temporary `CONTROLLER_ORIGIN`.
2. Deploy `group-crash-controller`.
3. Update the server `CONTROLLER_ORIGIN` to the real controller URL.
4. Redeploy `group-crash-server`.
5. Deploy `group-crash-tv` with the real server and controller URLs.
6. Open the TV public URL and scan the QR code.

## Public Test Checklist

Run this before sharing the link broadly:

- TV creates a room and displays a QR code.
- QR opens the public controller URL.
- A phone on cellular data can join the room.
- At least three players can join.
- Host can select and start `Imposter Crash`.
- Imposter private role is not visible on TV or other phones.
- Host can return to lobby after Imposter results.
- Host can select and start `Sketch Crash`.
- Drawer can draw from the phone.
- Non-drawers cannot draw.
- Guessers can submit guesses.
- TV shows Sketch results.
- Refreshing a phone reconnects if the room still exists.
- Leaving a room reassigns host when needed.

## Known MVP Limitations

- Rooms are in memory and disappear when the server redeploys or restarts.
- One server instance should be used until Redis or another shared room store is added.
- Free or low-cost hosting tiers may sleep after inactivity, which can break active rooms.
- There is no account system, moderation dashboard, or persistent game history yet.

## Local Production Smoke Test

From the repo root:

```text
pnpm check
pnpm test:integration
pnpm build
pnpm start:server
```

In separate terminals:

```text
pnpm dev:tv
pnpm dev:controller
```

Local URLs:

```text
TV: http://127.0.0.1:5173
Controller: http://127.0.0.1:5174
Server health: http://127.0.0.1:3001
```
