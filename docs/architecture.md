# Architecture

## High-Level Shape

Group Crash has three main runtime surfaces:

```text
TV web app
  Shared public lobby and future game display

Phone controller web app
  Private player join flow, lobby controls, and future game controls

Multiplayer server
  Authoritative rooms, players, messages, host rules, and future game state
```

## First Implementation Stack

Recommended MVP stack:

- TypeScript everywhere
- React for TV and phone apps
- Vite for frontend builds
- Node.js for the server
- WebSocket for real-time communication
- Zod for future runtime validation
- pnpm workspaces for the monorepo

Database, Redis, auth, formal schema validation, and Android TV packaging come later.

## Initial Monorepo Shape

```text
apps/
  tv/
  controller/
  server/

packages/
  design-tokens/
  protocol/
  ui/
  game-engine/
  game-sdk/

games/
```

## TV App

Responsibilities:

- Create or attach to a TV room session
- Display room code and QR join link
- Render public room state
- Show player presence
- Show quick messages
- Show host status and votes
- Show empty game library
- Support keyboard/D-pad style focus

The TV app should not contain authoritative lobby rules.

## Phone App

Responsibilities:

- Join a room by code
- Enter name
- Pick chess avatar
- Choose player or host request
- Send quick messages
- Request host
- Vote on host proposals
- Show host controls if current player is host
- Reconnect using a private token

The phone app sends player intentions to the server.

## Server

Responsibilities:

- Create rooms
- Validate room codes
- Track TV display session
- Track connected players
- Store latest lobby messages
- Assign initial host
- Start and resolve host votes
- Handle reconnect tokens
- Rate-limit messages
- Broadcast public snapshots
- Send private player state only to the correct player

The server is the only authority for host status and room state.

## Public And Private State

Public TV state can include:

- Room code
- Player list
- Current host
- Active vote summary
- Latest messages
- Empty game-library state

Private player state can include:

- Player reconnect token
- Whether this phone controls this player
- Host controls for the current host
- Vote eligibility

Do not send private state for all players to every client.

## Game Module Boundary

No games are included in the lobby MVP, but the architecture should leave room for modular games later.

Future game modules should define:

```ts
interface GroupCrashGame {
  manifest: GameManifest;
  createInitialState(context: GameContext): GameState;
  handlePlayerAction(
    state: GameState,
    action: PlayerAction,
    context: GameContext
  ): GameTransition;
  getTvView(state: GameState): PublicGameView;
  getPlayerView(state: GameState, playerId: string): PrivatePlayerView;
}
```

Do not couple the first lobby implementation to a specific game.

## Android TV Strategy

The Android TV app comes after browser multiplayer works.

Planned approach:

- Keep the main TV experience as a web app.
- Add a thin Android TV WebView wrapper later.
- Use the wrapper for launch, full-screen mode, D-pad/back behavior, app icons, banners, and Google Play packaging.

Do not start with native Android implementation.
