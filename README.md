# Group Crash

Group Crash is a web-first second-screen multiplayer game platform for TV and phone controllers.

The TV shows the shared lobby and game experience. Players scan a QR code, join from their phones, send quick messages, request host control, vote on host changes, and eventually use their phones as private controllers for modular party games.

The first development milestone is the lobby only. No playable games are included yet.

## MVP Scope

The lobby MVP includes:

- TV room creation with room code and QR join link
- Phone join flow with display name, chess avatar, and role preference
- Live connected player list on the TV
- Current host indicator
- Host request and majority host-transfer vote
- Quick messages from phones to the TV lobby
- Empty game library state
- Server-authoritative room state
- Reconnectable player sessions

The MVP does not include:

- Real games
- Public matchmaking
- User accounts
- Persistent profiles
- Voice chat
- Native Android TV wrapper
- Database persistence
- Payment or monetization

## Design Source

The visual source of truth is the Figma file:

https://www.figma.com/design/7xGXtygVpXnPd6aNSXeTBV

The implementation should follow the Group Crash design system:

- Bright red environment
- Yellow emphasis for host authority, focus, and primary actions
- Cream readable surfaces
- Dark ink text
- Large rounded typography
- Thick outlines
- Generous negative space
- Chess-piece player avatars

## Planned Architecture

```text
TV web app
  React + TypeScript + Vite
        |
        | WebSocket
        v
Authoritative multiplayer server
  Node.js + TypeScript + Socket.IO/Fastify
        ^
        | WebSocket
        |
Phone controller web app
  React + TypeScript + Vite
```

The Android TV app will come later as a thin WebView wrapper around the TV web app. The product should be built and proven in the browser first.

## Planned Repository Shape

```text
group-crash/
+-- AGENTS.md
+-- README.md
+-- docs/
|   +-- product-spec.md
|   +-- design-system.md
|   +-- lobby-rules.md
|   +-- architecture.md
|   +-- protocol.md
|   +-- acceptance-tests.md
+-- apps/
|   +-- tv/
|   +-- controller/
|   +-- server/
+-- packages/
|   +-- design-tokens/
|   +-- protocol/
|   +-- ui/
|   +-- game-engine/
|   +-- game-sdk/
+-- games/
```

## Development Order

1. Build static TV and phone lobby screens from mocked data.
2. Add local lobby interaction without networking.
3. Define shared protocol types and Zod schemas.
4. Connect TV and phones through the server.
5. Add reconnects, rate limits, room expiration, and tests.
6. Add a game module contract after the lobby is stable.
7. Package the TV client for Google TV after the browser version works reliably.

## Current Status

Milestone 1 is in progress. The monorepo is scaffolded with static TV and phone lobby screens using mocked room data. Multiplayer is intentionally not implemented yet.
