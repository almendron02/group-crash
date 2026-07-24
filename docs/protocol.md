# Protocol

The protocol defines messages between TV, phone clients, and the server.

All protocol data should eventually live in `packages/protocol` and be shared by all apps.

Use Zod schemas for runtime validation.

## Core Types

```ts
export type ChessAvatar =
  | "pawn"
  | "knight"
  | "bishop"
  | "rook"
  | "queen"
  | "king";

export type PlayerConnectionStatus = "connected" | "disconnected";

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: ChessAvatar;
  connectionStatus: PlayerConnectionStatus;
  isHost: boolean;
  wantsHost: boolean;
  joinedAt: number;
}

export interface LobbyMessage {
  id: string;
  playerId: string;
  playerName: string;
  avatar: ChessAvatar;
  text: string;
  createdAt: number;
}

export interface HostVote {
  id: string;
  currentHostPlayerId: string | null;
  proposedHostPlayerId: string;
  eligiblePlayerIds: string[];
  yesPlayerIds: string[];
  noPlayerIds: string[];
  requiredYesVotes: number;
  createdAt: number;
  expiresAt: number;
}

export interface RoomSnapshot {
  roomId: string;
  roomCode: string;
  status: "lobby" | "playing" | "closed";
  hostPlayerId: string | null;
  players: PublicPlayer[];
  messages: LobbyMessage[];
  activeHostVote: HostVote | null;
  playerCount: number;
  maxPlayers: number;
  gamesAvailable: boolean;
}
```

## Client Events

Phone and TV clients send these events to the server.

```ts
export type ClientEvent =
  | { type: "room.create"; payload: CreateRoomPayload }
  | { type: "room.join"; payload: JoinRoomPayload }
  | { type: "room.reconnect"; payload: ReconnectPayload }
  | { type: "room.leave"; payload: LeaveRoomPayload }
  | { type: "message.send"; payload: SendMessagePayload }
  | { type: "host.request"; payload: HostRequestPayload }
  | { type: "host.vote.cast"; payload: CastHostVotePayload }
  | { type: "host.pass"; payload: PassHostPayload };
```

Payloads:

```ts
export interface CreateRoomPayload {
  displayName?: string;
}

export interface JoinRoomPayload {
  roomCode: string;
  name: string;
  avatar: ChessAvatar;
  wantsHost: boolean;
}

export interface ReconnectPayload {
  roomCode: string;
  playerId: string;
  reconnectToken: string;
}

export interface LeaveRoomPayload {
  roomCode: string;
  playerId: string;
}

export interface SendMessagePayload {
  roomCode: string;
  playerId: string;
  text: string;
}

export interface HostRequestPayload {
  roomCode: string;
  playerId: string;
}

export interface CastHostVotePayload {
  roomCode: string;
  playerId: string;
  voteId: string;
  vote: "yes" | "no";
}

export interface PassHostPayload {
  roomCode: string;
  hostPlayerId: string;
  targetPlayerId?: string;
}
```

## Server Events

The server sends these events to TV and phone clients.

```ts
export type ServerEvent =
  | { type: "room.created"; payload: RoomCreatedPayload }
  | { type: "room.snapshot"; payload: RoomSnapshot }
  | { type: "player.joined"; payload: PublicPlayer }
  | { type: "player.disconnected"; payload: PlayerStatusPayload }
  | { type: "player.reconnected"; payload: PlayerStatusPayload }
  | { type: "message.received"; payload: LobbyMessage }
  | { type: "host.changed"; payload: HostChangedPayload }
  | { type: "host.vote.started"; payload: HostVote }
  | { type: "host.vote.updated"; payload: HostVote }
  | { type: "host.vote.completed"; payload: HostVoteCompletedPayload }
  | { type: "room.closed"; payload: RoomClosedPayload }
  | { type: "error"; payload: ServerErrorPayload };
```

Payloads:

```ts
export interface RoomCreatedPayload {
  roomId: string;
  roomCode: string;
  joinUrl: string;
  expiresAt: number;
}

export interface PlayerStatusPayload {
  roomCode: string;
  playerId: string;
}

export interface HostChangedPayload {
  roomCode: string;
  previousHostPlayerId: string | null;
  nextHostPlayerId: string;
  reason: "initial" | "vote" | "pass" | "disconnect";
}

export interface HostVoteCompletedPayload {
  roomCode: string;
  voteId: string;
  passed: boolean;
  previousHostPlayerId: string | null;
  proposedHostPlayerId: string;
  yesVotes: number;
  noVotes: number;
  requiredYesVotes: number;
}

export interface RoomClosedPayload {
  roomCode: string;
  reason: "tv_disconnected" | "expired" | "server_shutdown";
}

export interface ServerErrorPayload {
  code:
    | "ROOM_NOT_FOUND"
    | "ROOM_FULL"
    | "INVALID_NAME"
    | "INVALID_AVATAR"
    | "MESSAGE_TOO_LONG"
    | "RATE_LIMITED"
    | "NOT_HOST"
    | "VOTE_NOT_FOUND"
    | "NOT_ELIGIBLE"
    | "UNKNOWN";
  message: string;
}
```

## State Broadcast Rule

After any accepted action changes room state, the server should send a fresh `room.snapshot` to relevant clients.

For future games, use separate public TV snapshots and private player snapshots.

