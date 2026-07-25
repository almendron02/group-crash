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
- pnpm workspaces for the monorepo

Auth, formal schema validation, and Android TV packaging come later.

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
  demo-crash/
  imposter-crash/
  sketch-crash/
```

## TV App

Responsibilities:

- Create or attach to a TV room session
- Display room code and QR join link
- Render public room state
- Show player presence
- Show quick messages
- Show host status and votes
- Show available game modules, selected game shell, or empty game library
- Store its current room code locally so it can re-watch the same room after reconnect
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
- Select registered game modules if current player is host
- Reconnect using a private token
- Use host controls for room lock, capacity, mute, and kick actions

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
- Enforce room lock, capacity, mute, and kick controls
- Register game manifests
- Validate host-only game selection
- Broadcast public snapshots
- Send private player state only to the correct player
- Persist room snapshots and reconnect tokens when a room store is configured

The server is the only authority for host status and room state.

## Persistence Boundary

The server can run without persistence for simple public tests. When
`ROOM_STORE_FILE_PATH` or `ROOM_STORE_REDIS_URL` is configured, room snapshots
and reconnect tokens are saved after accepted state changes.

After a server restart, restored players are marked disconnected and can
reconnect with their existing phone tokens during the configured grace window.
For public deployments, use a Redis-compatible external store rather than the
local file store.

## Public And Private State

Public TV state can include:

- Room code
- Player list
- Current host
- Active vote summary
- Latest messages
- Available game manifests
- Selected game module

Private player state can include:

- Player reconnect token
- Whether this phone controls this player
- Host controls for the current host
- Vote eligibility

Do not send private state for all players to every client.

## Game Module Boundary

No playable games are included in the lobby MVP, but the architecture now includes a modular game registry shell.

The first registered shell is:

```text
games/demo-crash
```

`Demo Crash` exposes a manifest and placeholder state. It is not playable; it exists to prove that the server can register game modules and let the current host select one.

`Imposter Crash` is the first playable module. Its full secret state lives on the server. Public TV snapshots show phase, category, players, vote progress and results. Private phone snapshots show each player's own role and clue.

`Sketch Crash` is the second playable module. Its full prompt, drawer choice, strokes, guesses and results live on the server. Public TV snapshots show the drawer, category, drawing strokes, guess counts and final revealed guesses. Private phone snapshots show only whether a player is the drawer or a guesser; only the drawer receives the actual prompt before results.

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
