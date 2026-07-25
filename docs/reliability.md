# Reliability Plan

Group Crash is now built around server-authoritative rooms with optional restart
persistence.

## What Is Protected

When persistence is enabled, the server stores:

- Room snapshot
- Host state
- Lock/capacity settings
- Lobby messages
- Reconnect tokens
- Selected or active game state
- Message cooldown timestamps
- Room expiration timestamp

On server restart, rooms are restored with players marked disconnected. Phones
can reconnect with their private reconnect token during the configured grace
window.

The TV app also stores its current room code locally, so an installed TV session
re-watches the same room instead of creating a new one after reconnect.

## Storage Modes

Local development:

```text
ROOM_STORE_FILE_PATH=.data/group-crash-rooms.json
```

Public deployment:

```text
ROOM_STORE_REDIS_URL=redis://default:password@host:6379
ROOM_STORE_KEY_PREFIX=group-crash
```

Use the file store only for local development. Render's normal web-service
filesystem is ephemeral, so production reliability needs an external durable
store such as Redis-compatible hosting.

## Remaining Production Risks

- In-memory WebSocket peers still disconnect on server restart.
- Players must reconnect from their phones after a restart.
- Active drawing strokes and game state persist, but a game may still feel
interrupted if a restart happens mid-round.
- A single server instance should be used until room routing is added.
- Free hosting tiers can still sleep and drop active WebSocket connections.

## Recommended Public Setup

For the next reliability step, use:

```text
TV: https://crashtv.formawebsite.com
Controller: https://crash-join.formawebsite.com
Server: Render web service
Room store: external Redis-compatible store
```

Do not scale the server horizontally until room state is moved fully into a
shared store and WebSocket routing is handled.
